import { test } from "node:test";
import assert from "node:assert/strict";
import { SessionRelay } from "../src/server/relay.ts";
import plugin from "../src/server.ts";
import { PI_WEB_HOST_PI_SESSION_EVENTS_CAPABILITY } from "@jmfederico/pi-web/server-plugin-api";
import type {
  ServerPluginActivationContext,
  ServerPluginCapabilityResolver,
} from "@jmfederico/pi-web/server-plugin-api";
import { FakeBus, host, input, context, dataFor, pingData, tick } from "./fixtures/rpc/fake-bus.ts";
import type { JsonValue, RpcInput } from "../src/protocol.ts";

function setup(bus = new FakeBus()) {
  const h = host(bus);
  const lifetime = new AbortController();
  const relay = new SessionRelay(h.events, lifetime.signal, {
    pingTimeoutMs: 10,
    timeoutMs: 30,
    connectTimeoutMs: 20,
    idleMs: 20,
  });
  return { ...h, lifetime, relay };
}
test("server public plugin starts through required capability and health is independent of selected extension", async () => {
  const h = host();
  const lifetime = new AbortController();
  const invocation = new AbortController();
  assert.equal(plugin.apiVersion, 3);
  assert.deepEqual(plugin.requires, [PI_WEB_HOST_PI_SESSION_EVENTS_CAPABILITY]);
  const activation = plugin.activate({
    lifetimeSignal: lifetime.signal,
    signal: invocation.signal,
  } as ServerPluginActivationContext);
  assert.equal(activation.health().status, "unhealthy");
  assert.ok("kind" in (await activation.peer.request(context())));
  activation.start({
    capabilities: {
      resolve(token) {
        assert.equal(token, PI_WEB_HOST_PI_SESSION_EVENTS_CAPABILITY);
        return h.events;
      },
    } as ServerPluginCapabilityResolver,
    signal: invocation.signal,
  });
  invocation.abort(); // Bounded callback lifetime is not plugin lifetime.
  const result = await activation.peer.request(context(input("ping")));
  assert.ok(!("kind" in result) && result.success);
  assert.equal(activation.health().status, "healthy");
  lifetime.abort();
  assert.equal(h.bus.closed, 1);
  assert.equal(activation.health().status, "unhealthy");
  activation.dispose();
});
test("server uses only host project/workspace and selected exact session; wrong authority never connects", async () => {
  const h = setup();
  try {
    await h.relay.request(context());
    assert.deepEqual(h.selections, [{ projectId: "project-1", workspaceId: "workspace-1", sessionId: "session-1" }]);
    const ctx = context();
    const reply = await h.relay.request({ ...ctx, workspace: { ...ctx.workspace, projectId: "wrong" } });
    assert.ok("kind" in reply && reply.outcome === "not-sent");
    assert.equal(h.selections.length, 1);
    const spoof = await h.relay.request({ ...ctx, input: { ...input(), projectId: "spoof" } as JsonValue });
    assert.ok("kind" in spoof);
    assert.equal(h.selections.length, 1);
  } finally {
    h.relay.dispose();
  }
});
test("server pings before dispatch, preserves spawn correlation, and never auto retries", async () => {
  const h = setup();
  try {
    const reply = await h.relay.request(context(input("spawn", { agent: "worker" }, "spawn-original")));
    assert.ok(!("kind" in reply) && reply.success);
    assert.deepEqual(
      h.bus.sent.map((i) => i.method),
      ["ping", "spawn"],
    );
    assert.equal(h.bus.sent[1]?.requestId, "spawn-original");
    const alias = "rpc-spawn-spawn-original";
    await h.relay.request(context(input("status", { id: alias }, "lookup")));
    assert.deepEqual(h.bus.sent[2]?.params, { id: alias });
  } finally {
    h.relay.dispose();
  }
});
test("server missing extension, missing active context, mismatched session and disabled actions fail closed", async () => {
  for (const mode of ["missing", "no-context", "wrong-session", "disabled"] as const) {
    const h = setup();
    h.bus.respond = (i) => {
      if (mode === "missing") return;
      h.bus.reply(i, {
        ...pingData,
        session: mode === "no-context" ? {} : { sessionId: mode === "wrong-session" ? "other" : "session-1" },
        capabilities: { managementActions: [] },
      });
    };
    try {
      const reply = await h.relay.request(context(input("manage", { action: "schedule.run", id: "daily" })));
      assert.ok("kind" in reply && reply.outcome === "not-sent", mode);
      assert.deepEqual(
        h.bus.sent.map((i) => i.method),
        ["ping"],
      );
    } finally {
      h.relay.dispose();
    }
  }
});
test("server two consumers share connect and status; cancelling one does not cancel the other", async () => {
  const h = setup();
  let status: RpcInput | undefined;
  h.bus.respond = (i) => {
    if (i.method === "status") status = i;
    else h.bus.reply(i, dataFor(i.method));
  };
  const a = new AbortController();
  try {
    const first = h.relay.request(context(input("status", {}, "first"), a.signal));
    const second = h.relay.request(context(input("status", {}, "second")));
    await tick();
    a.abort();
    const cancelled = await first;
    assert.ok("kind" in cancelled);
    assert.ok(status);
    h.bus.reply(status, { text: "shared" });
    const reply = await second;
    assert.ok(!("kind" in reply) && reply.success);
    assert.equal(reply.requestId, "second");
    assert.equal(h.selections.length, 1);
    assert.equal(h.bus.sent.filter((i) => i.method === "status").length, 1);
    await h.relay.request(context(input("status", {}, "third")));
    assert.equal(h.bus.sent.filter((i) => i.method === "status").length, 1);
    assert.equal(h.bus.listeners.size, 0);
  } finally {
    h.relay.dispose();
  }
});
test("server bounds status concurrency across different targets and has no timer cost polls", async () => {
  const h = setup();
  h.bus.respond = (i) => {
    if (i.method !== "status") h.bus.reply(i, dataFor(i.method));
  };
  try {
    const pending = h.relay.request(context(input("status", { id: "run-1" }, "one")));
    await tick();
    const other = await h.relay.request(context(input("status", { id: "run-2" }, "two")));
    assert.ok("kind" in other && other.outcome === "not-sent");
    await pending;
    assert.equal(h.bus.sent.filter((i) => i.method === "status").length, 1);
    assert.equal(h.bus.sent.filter((i) => i.method === "cost").length, 0);
  } finally {
    h.relay.dispose();
  }
});
test("server rejects concurrent duplicate mutation IDs and reports ambiguous timeout", async () => {
  const h = setup();
  h.bus.respond = (i) => {
    if (i.method === "ping") h.bus.reply(i, pingData);
  };
  try {
    const value = input("spawn", { agent: "worker" }, "same");
    const pending = h.relay.request(context(value));
    const duplicate = await h.relay.request(context(value));
    assert.ok("kind" in duplicate && duplicate.outcome === "not-sent");
    const reply = await pending;
    assert.ok("kind" in reply && reply.outcome === "unknown");
    assert.equal(h.bus.sent.filter((i) => i.method === "spawn").length, 1);
  } finally {
    h.relay.dispose();
  }
});
test("server lifetime abort cleans listeners/connections and never emits stop", async () => {
  const h = setup();
  h.bus.respond = (i) => {
    if (i.method === "ping") h.bus.reply(i, pingData);
  };
  const pending = h.relay.request(context(input("spawn", { agent: "worker" })));
  await tick();
  h.lifetime.abort();
  const reply = await pending;
  assert.ok("kind" in reply && reply.outcome === "unknown");
  assert.equal(h.bus.listeners.size, 0);
  assert.equal(h.bus.closed, 1);
  assert.ok(!h.bus.sent.some((i) => i.method === "stop"));
  h.relay.dispose();
});
test("server cancelled/expired connect closes late connection without emit", async () => {
  let resolve!: (bus: FakeBus) => void;
  const lifetime = new AbortController();
  const relay = new SessionRelay(
    {
      version: 1,
      connect: () =>
        new Promise((r) => {
          resolve = r;
        }),
    },
    lifetime.signal,
    { connectTimeoutMs: 5, idleMs: 5 },
  );
  const pending = relay.request(context());
  await tick();
  const reply = await pending;
  assert.ok("kind" in reply && reply.outcome === "not-sent");
  const bus = new FakeBus();
  resolve(bus);
  await tick();
  assert.equal(bus.closed, 1);
  assert.equal(bus.sent.length, 0);
  relay.dispose();
});
test("server finite idle expiry and runtime replacement require a fresh ping", async () => {
  const buses: FakeBus[] = [];
  const lifetime = new AbortController();
  const relay = new SessionRelay(
    {
      version: 1,
      async connect() {
        const bus = new FakeBus();
        buses.push(bus);
        return bus;
      },
    },
    lifetime.signal,
    { idleMs: 5 },
  );
  try {
    await relay.request(context());
    buses[0]!.close();
    await relay.request(context());
    assert.equal(buses.length, 2);
    assert.equal(buses[1]!.sent[0]?.method, "ping");
    await new Promise((r) => setTimeout(r, 15));
    assert.equal(buses[1]!.closed, 1);
    await relay.request(context());
    assert.equal(buses.length, 3);
  } finally {
    relay.dispose();
  }
});
test("server every documented method and every schedule action forwards through the finite seam", async () => {
  const h = setup();
  const cases: [RpcInput["method"], object][] = [
    ["ping", {}],
    ["status", {}],
    ["spawn", { script: "return 1" }],
    ["steer", { id: "run-1", message: "next" }],
    ["interrupt", { id: "run-1" }],
    ["stop", { id: "run-1", childId: "step:4" }],
    ["resume", { id: "run-1", message: "continue" }],
    ["cost", {}],
  ];
  for (const action of [
    "schedule.list",
    "schedule.show",
    "schedule.history",
    "schedule.pause",
    "schedule.resume",
    "schedule.run",
    "schedule.delete",
  ])
    cases.push(["manage", action === "schedule.list" ? { action } : { action, id: "daily" }]);
  try {
    for (const [index, [method, params]] of cases.entries()) {
      const reply = await h.relay.request(context(input(method, params, `case-${index}`)));
      assert.ok(!("kind" in reply) && reply.success && reply.method === method, `${method}: ${JSON.stringify(reply)}`);
    }
    assert.equal(h.selections.length, 1);
    assert.equal(h.bus.sent.length, cases.length);
  } finally {
    h.relay.dispose();
  }
});
test("server staggered two-tab polling is bounded by the shared one-second snapshot window", async (t) => {
  const h = setup();
  let now = 10_000;
  t.mock.method(Date, "now", () => now);
  try {
    // 10 seconds, two readers every 200ms: 100 browser reads, ten upstream status calls.
    for (let n = 0; n < 50; n++) {
      await Promise.all([
        h.relay.request(context(input("status", {}, `a-${n}`))),
        h.relay.request(context(input("status", {}, `b-${n}`))),
      ]);
      now += 200;
    }
    assert.equal(h.bus.sent.filter((i) => i.method === "status").length, 10);
    assert.equal(h.bus.sent.filter((i) => i.method === "ping").length, 1);
    assert.equal(h.bus.sent.filter((i) => i.method === "cost").length, 0);
    assert.equal(h.bus.listeners.size, 0);
  } finally {
    h.relay.dispose();
  }
});
test("server abort before connection never reaches host and status payload bounds remain visible", async () => {
  const h = setup();
  const abort = new AbortController();
  abort.abort();
  try {
    const cancelled = await h.relay.request(context(input(), abort.signal));
    assert.ok("kind" in cancelled && cancelled.outcome === "not-sent");
    assert.equal(h.selections.length, 0);
    h.bus.respond = (i) => h.bus.reply(i, i.method === "ping" ? pingData : { text: "x".repeat(65537) });
    const oversized = await h.relay.request(context());
    assert.ok("kind" in oversized && oversized.code === "too-large");
    assert.equal(h.bus.listeners.size, 0);
  } finally {
    h.relay.dispose();
  }
});
test("server refuses steering without the non-recovering exact-target guarantee", async () => {
  const h = setup();
  h.bus.respond = (i) => h.bus.reply(i, { ...pingData, capabilities: {} });
  try {
    const reply = await h.relay.request(context(input("steer", { id: "run-1", message: "next" })));
    assert.ok("kind" in reply && reply.outcome === "not-sent");
    assert.deepEqual(
      h.bus.sent.map((i) => i.method),
      ["ping"],
    );
  } finally {
    h.relay.dispose();
  }
});
test("server cancelling the last connect waiter immediately retires a late connection", async () => {
  let resolve!: (bus: FakeBus) => void;
  const lifetime = new AbortController();
  const caller = new AbortController();
  const relay = new SessionRelay(
    {
      version: 1,
      connect: () =>
        new Promise((r) => {
          resolve = r;
        }),
    },
    lifetime.signal,
  );
  const pending = relay.request(context(input(), caller.signal));
  await tick();
  caller.abort();
  const reply = await pending;
  assert.ok("kind" in reply && reply.outcome === "not-sent");
  const bus = new FakeBus();
  resolve(bus);
  await tick();
  assert.equal(bus.closed, 1);
  assert.equal(bus.sent.length, 0);
  relay.dispose();
});
