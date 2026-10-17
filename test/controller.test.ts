import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SubagentsController,
  selectedScope,
} from "../src/browser/controller.ts";
import { MANAGEMENT_ACTIONS, type RpcInput } from "../src/protocol.ts";
import {
  FakeClock,
  deferred,
  panelContext,
  reply,
  snapshot,
  tick,
} from "./browser-fixtures.ts";

async function setup(
  respond: (input: RpcInput, signal: AbortSignal) => Promise<unknown> = async (
    input,
  ) => reply(input),
) {
  const clock = new FakeClock();
  const calls: RpcInput[] = [];
  let serial = 0;
  const signals: AbortSignal[] = [];
  const context = panelContext(async (input, signal) => {
    calls.push(input);
    signals.push(signal);
    return respond(input, signal);
  });
  const controller = new SubagentsController(
    () => {},
    clock,
    () => `request-${++serial}`,
  );
  controller.update(context);
  controller.mount();
  await tick();
  return { controller, clock, calls, context, signals };
}
test("controller exact selection excludes mismatched, archived, pending and missing identities", () => {
  const context = panelContext();
  assert.equal(selectedScope(context)?.sessionId, "session-1");
  for (const patch of [
    { selectedMachine: { ...context.machine, id: "remote" } },
    { selectedProject: { id: "different", name: "Other", path: "/workspace" } },
    { selectedWorkspace: { ...context.workspace, id: "other" } },
    { selectedWorkspace: { ...context.workspace, projectId: "wrong" } },
    { selectedSession: { ...context.state!.selectedSession!, archived: true } },
    { selectedSession: { ...context.state!.selectedSession!, pending: true } },
    { selectedSession: undefined },
  ])
    assert.equal(
      selectedScope(context, { ...context.state, ...patch }),
      undefined,
    );
});
test("controller lifecycle owns refresh; no calls before mount, missing peer is explicit", async () => {
  let calls = 0;
  const context = panelContext(async (input) => {
    calls++;
    return reply(input);
  });
  const controller = new SubagentsController(() => {});
  controller.update(context);
  assert.equal(calls, 0);
  controller.mount();
  await tick();
  assert.equal(calls, 2);
  controller.unmount();
  controller.update({ ...context, peer: undefined });
  assert.match(controller.state.error, /unavailable/);
  assert.equal(controller.available, false);
});
for (const active of [true, false])
  test(`controller synthetic ${active ? "active" : "idle"} rate, one timer, zero cost polls`, async () => {
    const h = await setup(async (input) =>
      reply(input, input.method === "status" ? snapshot(active) : undefined),
    );
    assert.equal(h.calls.length, 2);
    assert.equal(h.clock.timers.size, 1);
    await h.clock.advance(60000);
    assert.equal(
      h.calls.filter((c) => c.method === "status").length,
      active ? 31 : 7,
    );
    assert.equal(h.calls.filter((c) => c.method === "cost").length, 0);
    assert.equal(h.clock.timers.size, 1);
    h.controller.unmount();
    assert.equal(h.clock.timers.size, 0);
  });
test("controller serializes status, bounded timeout releases ignored-abort peer", async () => {
  const wait = deferred<unknown>();
  const h = await setup(async (input) =>
    input.method === "status" ? wait.promise : reply(input),
  );
  await h.controller.refresh();
  await h.controller.refresh();
  await h.controller.perform("status", {
    id: "run-1",
    view: "transcript",
    lines: 80,
  });
  assert.match(h.controller.state.error, /already in flight/);
  assert.equal(h.calls.filter((c) => c.method === "status").length, 1);
  await h.clock.advance(20000);
  assert.equal(h.controller.state.refreshing, false);
  assert.equal(h.controller.state.stale, true);
  assert.match(h.controller.state.error, /timed out/);
  h.controller.unmount();
});
for (const axis of ["machine", "project", "workspace", "session"])
  test(`controller rejects late ${axis} scope response, aborts old request`, async () => {
    const old = deferred<unknown>();
    let first: RpcInput | undefined;
    const h = await setup(async (input) => {
      if (input.method === "status" && !first) {
        first = input;
        return old.promise;
      }
      return reply(input);
    });
    const context = { ...h.context, state: { ...h.context.state! } };
    if (axis === "session")
      context.state.selectedSession = {
        ...context.state.selectedSession!,
        id: "session-2",
      };
    if (axis === "machine") {
      context.machine = { ...context.machine, id: "remote" };
      context.state.selectedMachine = context.machine;
    }
    if (axis === "workspace") {
      context.workspace = { ...context.workspace, id: "workspace-2" };
      context.state.selectedWorkspace = context.workspace;
    }
    if (axis === "project") {
      context.workspace = { ...context.workspace, projectId: "project-2" };
      context.state.selectedWorkspace = context.workspace;
      context.state.selectedProject = {
        ...context.state.selectedProject!,
        id: "project-2",
      };
    }
    h.controller.update(context);
    await tick();
    assert.ok(h.signals[1]!.aborted);
    old.resolve(reply(first!, { text: "obsolete response" }));
    await tick();
    assert.notEqual(h.controller.state.status?.text, "obsolete response");
    assert.equal(h.controller.state.status?.text, "status summary");
    h.controller.unmount();
  });
test("controller hidden/unmounted cancels and resumes with fresh handshake", async () => {
  const h = await setup();
  h.controller.setVisible(false);
  assert.equal(h.clock.timers.size, 0);
  assert.equal(h.controller.state.stale, true);
  await h.clock.advance(60000);
  assert.equal(h.calls.length, 2);
  h.controller.setVisible(true);
  await tick();
  assert.equal(h.calls.length, 4);
  h.controller.unmount();
  await h.clock.advance(60000);
  assert.equal(h.calls.length, 4);
});
test("controller handshake and malformed snapshot errors retain explicitly stale cache", async () => {
  let broken = false;
  const h = await setup(async (input) =>
    broken ? { invalid: true } : reply(input),
  );
  broken = true;
  await h.controller.refresh();
  assert.equal(h.controller.state.status?.text, "status summary");
  assert.ok(h.controller.state.stale);
  assert.ok(h.controller.state.error);
  assert.equal(h.controller.state.ping, undefined);
  h.controller.unmount();
  const missing = await setup(async (input) => ({
    version: 1,
    kind: "relay-error",
    requestId: input.requestId,
    code: "unavailable",
    outcome: "not-sent",
    message: "Extension missing",
  }));
  assert.match(missing.controller.state.error, /Extension missing/);
  assert.equal(missing.controller.state.status, undefined);
  missing.controller.unmount();
});
test("controller confirmation required, advanced params rejected, absent capabilities fail closed", async () => {
  const h = await setup();
  await h.controller.perform("spawn", { agent: "worker" });
  assert.match(h.controller.state.error, /confirmation/i);
  assert.equal(h.calls.length, 2);
  await h.controller.perform(
    "spawn",
    { agent: "worker", cwd: "/private" },
    true,
  );
  assert.match(h.controller.state.error, /Unsupported/);
  assert.equal(h.calls.length, 2);
  h.controller.state.ping!.capabilities.nonRecoveringSteer = false;
  await h.controller.perform("steer", { id: "run-1", message: "hi" });
  assert.match(h.controller.state.error, /Capability/);
  assert.equal(h.calls.length, 2);
  h.controller.unmount();
});
test("controller all launch modes and schedule actions; no invented child selectors", async () => {
  const h = await setup();
  for (const params of [
    { agent: "worker", task: "test", async: true },
    { script: "return 1", args: { label: "x" } },
    { workflow: "./flow.ts" },
  ])
    await h.controller.perform("spawn", params, true);
  for (const action of MANAGEMENT_ACTIONS)
    await h.controller.perform(
      "manage",
      action === "schedule.list" ? { action } : { action, id: "daily" },
      true,
    );
  for (const method of ["stop", "interrupt", "resume"] as const)
    await h.controller.perform(
      method,
      { id: "run-1", ...(method === "resume" ? { message: "continue" } : {}) },
      true,
    );
  assert.equal(h.calls.length, 15);
  assert.ok(
    !h.calls.some(
      (c) => c.params && ("index" in c.params || "childId" in c.params),
    ),
  );
  assert.ok(
    h.controller.currentReceipts.some((r) =>
      /Stopping.*Not terminal proof/.test(r.message),
    ),
  );
  h.controller.unmount();
});
for (const deliveryStatus of ["delivered", "queued"] as const)
  test(`controller ${deliveryStatus} steering is not completion`, async () => {
    const h = await setup(async (input) =>
      reply(
        input,
        input.method === "steer"
          ? {
              text: "Steered",
              details: {
                steering: {
                  requestId: input.requestId,
                  state: deliveryStatus === "queued" ? "pending" : "delivered",
                  deliveryStatus,
                  sourceRunId: "run-1",
                  targets: [],
                },
              },
            }
          : undefined,
      ),
    );
    await h.controller.perform("steer", { id: "run-1", message: "next" });
    assert.match(
      h.controller.currentReceipts[0]!.message,
      new RegExp(`${deliveryStatus}.*not completion`),
    );
    h.controller.unmount();
  });
for (const failure of ["rejected", "not-sent", "unknown", "malformed", "throw"])
  test(`controller mutation ${failure} never retries or reports empty success`, async () => {
    const h = await setup(async (input) => {
      if (input.method !== "spawn") return reply(input);
      if (failure === "throw") throw new Error("Transport lost");
      if (failure === "malformed") return reply(input, {});
      if (failure === "rejected")
        return {
          version: 1,
          requestId: input.requestId,
          method: input.method,
          success: false,
          error: { code: "invalid_state", message: "Rejected" },
        };
      return {
        version: 1,
        kind: "relay-error",
        requestId: input.requestId,
        code: "timeout",
        outcome: failure,
        message: "Lost",
      };
    });
    await h.controller.perform("spawn", { agent: "worker" }, true);
    const receipt = h.controller.currentReceipts[0]!;
    assert.equal(
      receipt.state,
      failure === "rejected"
        ? "failed"
        : failure === "not-sent"
          ? "not-sent"
          : "unknown",
    );
    assert.ok(h.controller.state.error);
    await h.clock.advance(60000);
    assert.equal(h.calls.filter((c) => c.method === "spawn").length, 1);
    if (receipt.state === "unknown") {
      await h.controller.recoverSpawn(receipt.requestId);
      assert.deepEqual(h.calls.at(-1)?.params, {
        id: `rpc-spawn-${receipt.requestId}`,
      });
      assert.equal(receipt.state, "unknown");
    }
    h.controller.unmount();
  });
test("controller cancellation retains unknown receipt only in exact initiating scope", async () => {
  const wait = deferred<unknown>();
  const h = await setup(async (input) =>
    input.method === "spawn" ? wait.promise : reply(input),
  );
  const pending = h.controller.perform("spawn", { agent: "worker" }, true);
  await tick();
  const context = {
    ...h.context,
    state: {
      ...h.context.state!,
      selectedSession: {
        ...h.context.state!.selectedSession!,
        id: "session-2",
      },
    },
  };
  h.controller.update(context);
  await pending;
  await tick();
  assert.equal(h.controller.currentReceipts.length, 0);
  assert.equal(h.controller.receipts[0]!.state, "unknown");
  h.controller.update(h.context);
  await tick();
  assert.equal(h.controller.currentReceipts[0]!.state, "unknown");
  h.controller.unmount();
  assert.equal(h.clock.timers.size, 0);
});
test("controller targeted transcript and cost are explicit, unresolved lower bound preserved", async () => {
  const h = await setup(async (input) =>
    reply(
      input,
      input.method === "status" && input.params?.id
        ? { text: "<script>untrusted</script>" }
        : undefined,
    ),
  );
  await h.controller.perform("status", {
    id: "run-1",
    view: "transcript",
    lines: 80,
  });
  assert.equal(
    h.controller.state.transcript?.text,
    "<script>untrusted</script>",
  );
  assert.equal(h.controller.state.transcriptId, "run-1");
  await h.controller.perform("cost");
  assert.equal(h.controller.state.cost?.unresolvedAsyncChildren, 2);
  assert.equal(h.controller.state.costAt, h.clock.now());
  await h.clock.advance(60000);
  assert.equal(h.calls.filter((c) => c.method === "cost").length, 1);
  h.controller.unmount();
});

test("controller does not treat fresh host peer wrappers as a scope change", async () => {
  const h = await setup();
  for (let n = 0; n < 100; n++)
    h.controller.update({
      ...h.context,
      peer: { request: h.context.peer!.request! },
    });
  await tick();
  assert.equal(h.calls.length, 2);
  assert.equal(h.controller.state.stale, false);
  assert.equal(h.clock.timers.size, 1);
  h.controller.unmount();
});
