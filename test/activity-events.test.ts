import { test } from "node:test";
import assert from "node:assert/strict";
import { SessionRelay } from "../src/server/relay.ts";
import { SubagentsController } from "../src/browser/controller.ts";
import { FakeBus, host, input, context, dataFor, pingData, tick } from "./fixtures/rpc/fake-bus.ts";
import { FakeClock, panelContext, reply, deferred } from "./browser-fixtures.ts";
import type { RpcInput, JsonValue } from "../src/protocol.ts";

const events = { jobsChanged: "subagent:jobs-changed", asyncStarted: "subagent:async-started" };
function setup() {
  const bus = new FakeBus();
  bus.respond = i => bus.reply(i, i.method === "ping" ? { ...pingData, events } : dataFor(i.method));
  const h = host(bus);
  const relay = new SessionRelay(h.events, new AbortController().signal, { watchMs: 20 });
  const notify = () => {
    for (const fn of bus.listeners.get(events.jobsChanged) ?? []) void fn({ private: "not forwarded" });
  };
  const watch = (signal = new AbortController().signal) => relay.request({ ...context(input(), signal), operation: "wait-for-change" });
  return { bus, relay, notify, watch };
}

test("activity events wake bounded observation without dispatching work; next status bypasses cache", async () => {
  const h = setup();
  try {
    await h.relay.request(context());
    let settled = false;
    const pending = h.watch().then(r => { settled = true; return r; });
    await tick();
    assert.equal(settled, false);
    h.notify();
    const result = await pending;
    assert.ok(!("kind" in result) && result.success);
    assert.equal(JSON.stringify(result).includes("private"), false);
    assert.deepEqual(h.bus.sent.map(i => i.method), ["ping", "status"]);
    await h.relay.request(context());
    assert.equal(h.bus.sent.filter(i => i.method === "status").length, 2);
  } finally { h.relay.dispose(); }
  assert.equal(h.bus.listeners.size, 0);
});

test("events between read and wait are not lost; observation timeout and abort are finite", async () => {
  const h = setup();
  try {
    await h.relay.request(context());
    h.notify();
    await h.watch();
    await h.relay.request(context());
    await h.watch(); // bounded reconciliation even without another event
    await h.relay.request(context());
    const abort = new AbortController();
    const pending = h.watch(abort.signal);
    await tick();
    abort.abort();
    const result = await pending;
    assert.ok("kind" in result && result.code === "closed");
    assert.equal(h.bus.sent.some(i => i.method === "stop"), false);
  } finally { h.relay.dispose(); }
});

test("event during in-flight status prevents stale reply from repopulating cache", async () => {
  const h = setup();
  try {
    await h.relay.request(context(input("ping")));
    let pendingInput: RpcInput | undefined;
    h.bus.respond = i => { pendingInput = i; };
    const pending = h.relay.request(context());
    await tick();
    h.notify();
    h.bus.reply(pendingInput!, { text: "before change" });
    await pending;
    h.bus.respond = i => h.bus.reply(i, { text: "after change" });
    const result = await h.relay.request(context());
    assert.ok(!("kind" in result) && result.success && result.method === "status");
    assert.equal(result.data.text, "after change");
  } finally { h.relay.dispose(); }
});

test("older peers decline activity observation without invoking status or mutations", async () => {
  const h = setup();
  h.bus.respond = i => h.bus.reply(i, dataFor(i.method));
  try {
    const result = await h.watch();
    assert.ok("kind" in result && result.code === "unavailable");
    assert.deepEqual(h.bus.sent.map(i => i.method), ["ping"]);
    assert.equal(h.bus.listeners.size, 0);
  } finally { h.relay.dispose(); }
});

test("watch rejects mutation and targeted inputs before dispatch", async () => {
  const h = setup();
  try {
    for (const value of [input("stop", { id: "run-1" }), input("status", { id: "run-1" })]) {
      const result = await h.relay.request({ ...context(value), operation: "wait-for-change" });
      assert.ok("kind" in result && result.outcome === "not-sent");
    }
    assert.equal(h.bus.sent.length, 0);
  } finally { h.relay.dispose(); }
});

test("browser watches advertised events, refreshes after wake, and cancels observation for explicit controls and hide", async () => {
  const clock = new FakeClock();
  const calls: string[] = [];
  let wake = deferred<JsonValue>();
  let observed: RpcInput | undefined;
  let signal: AbortSignal | undefined;
  const ctx = panelContext();
  ctx.peer!.request = async (operation, raw, options) => {
    const i = raw as unknown as RpcInput;
    calls.push(operation);
    if (operation === "wait-for-change") {
      observed = i;
      signal = options?.signal;
      return wake.promise;
    }
    const result = reply(i);
    if (i.method === "ping") (result as { data: { events: typeof events } }).data.events = events;
    return result as JsonValue;
  };
  let serial = 0;
  const controller = new SubagentsController(() => {}, clock, () => `event-${++serial}`);
  controller.update(ctx);
  controller.mount();
  await tick();
  await clock.advance(250);
  assert.deepEqual(calls, ["rpc", "rpc", "wait-for-change"]);
  assert.equal(controller.state.refreshing, false);
  wake.resolve(reply(observed!, { text: "notification only" }) as JsonValue);
  await tick();
  assert.equal(calls.at(-1), "rpc");
  assert.notEqual(controller.state.status?.text, "notification only");
  wake = deferred<JsonValue>();
  await clock.advance(250);
  const oldSignal = signal!;
  await controller.perform("status", { id: "run-1", view: "transcript" });
  assert.equal(oldSignal.aborted, true);
  await clock.advance(250);
  controller.setVisible(false);
  assert.equal(signal!.aborted, true);
  controller.unmount();
  await tick();
  assert.equal(clock.timers.size, 0);
});
