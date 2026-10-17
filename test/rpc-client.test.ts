import { test } from "node:test";
import assert from "node:assert/strict";
import { requestRpc } from "../src/server/rpc-client.ts";
import { FakeBus, input } from "./fixtures/rpc/fake-bus.ts";
import { assertBoundedJson, parseRpcReply, parseRpcInput } from "../src/protocol.ts";

test("native optional undefined fields project to strict browser JSON without losing launch identity", async () => {
  const bus = new FakeBus();
  const value = input("spawn", { agent: "external" });
  const details = { mode: "single", runId: "run-1", asyncId: "run-1", results: [], launchResolvedExtensions: undefined };
  bus.respond = (i) => bus.reply(i, { text: "Started", details });
  assert.ok(Object.hasOwn(details, "launchResolvedExtensions"));
  const reply = await requestRpc(bus, value, new AbortController().signal, 100);
  assert.ok(!("kind" in reply) && reply.success && reply.method === "spawn");
  assert.equal(reply.data.details?.runId, "run-1");
  assertBoundedJson(reply);
  assert.deepEqual(parseRpcReply(reply, value), reply);
  assert.throws(() => parseRpcInput({ ...value, params: { agent: "external", task: undefined } }));
  assert.throws(() => parseRpcReply({ version: 1, requestId: value.requestId, success: true, data: { text: "Started", details } }, value));
});

test("native reply tolerance does not admit undefined arrays, functions, cycles or oversized unknown fields", async () => {
  const cycle: Record<string, unknown> = {};
  cycle.self = cycle;
  for (const unsupported of [[undefined], () => {}, cycle, "x".repeat(65537)]) {
    const bus = new FakeBus();
    bus.respond = (i) => bus.reply(i, { text: "Started", details: { mode: "single", results: [], unsupported } });
    const reply = await requestRpc(bus, input("spawn", { agent: "external" }), new AbortController().signal, 100);
    assert.ok("kind" in reply && reply.outcome === "unknown");
  }
});

test("rpc-client subscribes before synchronous emit and cleans up", async () => {
  const bus = new FakeBus();
  const value = input("spawn", { agent: "worker" }, "original-browser-id");
  const reply = await requestRpc(bus, value, new AbortController().signal, 100);
  assert.ok(!("kind" in reply) && reply.success);
  assert.equal(bus.sent[0]?.requestId, "original-browser-id");
  assert.equal(bus.listeners.size, 0);
  assert.equal(bus.closed, 0);
});
test("rpc-client cancellation before emit is not-sent; after emit is unknown without stop", async () => {
  const bus = new FakeBus();
  const before = new AbortController();
  before.abort();
  const a = await requestRpc(bus, input("stop", { id: "run-1" }), before.signal, 100);
  assert.ok("kind" in a && a.outcome === "not-sent");
  assert.equal(bus.sent.length, 0);
  const after = new AbortController();
  bus.respond = () => after.abort();
  const b = await requestRpc(bus, input("spawn", { agent: "worker" }), after.signal, 100);
  assert.ok("kind" in b && b.outcome === "unknown");
  assert.equal(bus.sent.length, 1);
  assert.equal(bus.listeners.size, 0);
});
test("rpc-client timeout and late replies never retry uncertain mutations", async () => {
  const bus = new FakeBus();
  bus.respond = () => {};
  const value = input("spawn", { agent: "worker" });
  const reply = await requestRpc(bus, value, new AbortController().signal, 5);
  assert.ok("kind" in reply && reply.code === "timeout" && reply.outcome === "unknown");
  bus.reply(value, { text: "late" });
  assert.equal(bus.sent.length, 1);
  assert.equal(bus.listeners.size, 0);
});
test("rpc-client malformed, wrong method/correlation, oversize and throwing emit fail visibly", async () => {
  for (const raw of [
    { version: 2 },
    { version: 1, requestId: "wrong" },
    { version: 1, requestId: "request-1", method: "spawn" },
    { text: "x".repeat(65537) },
  ]) {
    const bus = new FakeBus();
    bus.respond = (i) => bus.deliver(i.requestId, raw);
    const reply = await requestRpc(bus, input(), new AbortController().signal, 100);
    assert.ok("kind" in reply && reply.outcome === "unknown");
    assert.equal(bus.listeners.size, 0);
  }
  const bus = new FakeBus();
  bus.respond = () => {
    throw new Error("after admission");
  };
  const reply = await requestRpc(bus, input("spawn", { agent: "worker" }), new AbortController().signal, 100);
  assert.ok("kind" in reply && reply.outcome === "unknown");
});
test("rpc-client connection replacement ends observation without stopping children", async () => {
  const bus = new FakeBus();
  bus.respond = () => bus.close();
  const reply = await requestRpc(bus, input("spawn", { agent: "worker" }), new AbortController().signal, 100);
  assert.ok("kind" in reply && reply.code === "closed" && reply.outcome === "unknown");
  assert.deepEqual(
    bus.sent.map((i) => i.method),
    ["spawn"],
  );
  assert.equal(bus.listeners.size, 0);
});
