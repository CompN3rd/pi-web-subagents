import { test } from "node:test";
import assert from "node:assert/strict";
import { SubagentsController } from "../src/browser/controller.ts";
import type { RpcInput } from "../src/protocol.ts";
import { FakeClock, deferred, panelContext, reply, snapshot, tick } from "./browser-fixtures.ts";

const targeted = (input: RpcInput) => input.method === "status" && !!input.params?.id;
async function setup(respond: (input: RpcInput) => Promise<unknown> = async (input) => reply(input, targeted(input) ? { text: "bounded output" } : undefined)) {
  const clock = new FakeClock();
  const calls: { input: RpcInput; signal: AbortSignal }[] = [];
  const context = panelContext(async (input, signal) => { calls.push({ input, signal }); return respond(input); });
  let serial = 0;
  const controller = new SubagentsController(() => {}, clock, () => `output-${++serial}`);
  controller.update(context);
  controller.mount();
  await tick();
  controller.selectOutput("run-1");
  return { controller, clock, calls, context, reads: () => calls.filter(({ input }) => targeted(input)) };
}

test("criterion 4: explicit follow polls only selected bounded output, never cost/mutations; off cancels timer", async () => {
  const h = await setup();
  assert.equal(h.reads().length, 0);
  h.controller.setOutputFollowing(true, 37);
  await tick();
  await h.clock.advance(6000);
  assert.equal(h.reads().length, 4);
  for (const { input } of h.reads()) assert.deepEqual(input.params, { id: "run-1", view: "transcript", lines: 37 });
  assert.ok(h.calls.every(({ input }) => ["ping", "status"].includes(input.method)));
  assert.equal(h.controller.state.transcriptAt, h.clock.now());
  h.controller.setOutputFollowing(false);
  await h.clock.advance(5000);
  assert.equal(h.reads().length, 4);
  assert.equal(h.controller.state.transcript?.text, "bounded output");
  h.controller.unmount();
  assert.equal(h.clock.timers.size, 0);
});

for (const action of ["off", "target", "hidden", "scope", "unmount"] as const) {
  test(`criterion 4: ${action} aborts in-flight output and rejects late result, no implicit resume`, async () => {
    const pending = deferred<unknown>();
    const h = await setup(async (input) => targeted(input) ? pending.promise : reply(input));
    h.controller.setOutputFollowing(true);
    await tick();
    const read = h.reads()[0]!;
    if (action === "off") h.controller.setOutputFollowing(false);
    if (action === "target") h.controller.selectOutput("");
    if (action === "hidden") h.controller.setVisible(false);
    if (action === "scope") h.controller.update({ ...h.context, state: { ...h.context.state, selectedSession: { ...h.context.state!.selectedSession!, id: "session-2" } } });
    if (action === "unmount") h.controller.unmount();
    assert.equal(read.signal.aborted, true);
    pending.resolve(reply(read.input, { text: "late forbidden" }));
    await tick();
    assert.equal(h.controller.state.transcript, undefined);
    assert.equal(h.controller.state.outputFollowing, false);
    assert.equal(h.controller.state.outputLoading, false);
    if (action === "hidden") h.controller.setVisible(true);
    await h.clock.advance(5000);
    assert.equal(h.reads().length, 1);
    h.controller.unmount();
    assert.equal(h.clock.timers.size, 0);
  });
}

test("criterion 4: no overlapping output reads; timeout stops follow without retry and preserves cache", async () => {
  const pending = deferred<unknown>();
  let reads = 0;
  const h = await setup(async (input) => !targeted(input) ? reply(input) : ++reads === 1 ? reply(input, { text: "cached" }) : pending.promise);
  await h.controller.readOutput();
  const at = h.controller.state.transcriptAt;
  h.controller.setOutputFollowing(true);
  await tick();
  await h.controller.readOutput();
  await h.clock.advance(19000);
  assert.equal(h.reads().length, 2);
  await h.clock.advance(1000);
  assert.equal(h.controller.state.outputFollowing, false);
  assert.match(h.controller.state.outputError, /timed out/);
  assert.equal(h.controller.state.transcript?.text, "cached");
  assert.equal(h.controller.state.transcriptAt, at);
  await h.clock.advance(10000);
  assert.equal(h.reads().length, 2);
  h.controller.unmount();
});

for (const change of ["duplicate", "removed", "stale"] as const) {
  test(`criterion 4: refreshed ${change} authority stops selected follow`, async () => {
    let changed = false;
    const h = await setup(async (input) => {
      if (targeted(input)) return reply(input, { text: "cached" });
      if (input.method !== "status" || !changed) return reply(input);
      if (change === "stale") throw new Error("offline");
      const data = snapshot();
      if (change === "removed") data.asyncSnapshot.runs = [];
      else data.asyncSnapshot.runs.push({ ...data.asyncSnapshot.runs[0]! });
      return reply(input, data);
    });
    h.controller.setOutputFollowing(true);
    await tick();
    changed = true;
    await h.controller.refresh();
    assert.equal(h.controller.state.outputFollowing, false);
    const count = h.reads().length;
    await h.clock.advance(5000);
    assert.equal(h.reads().length, count);
    h.controller.unmount();
  });
}

test("criterion 4: switching unique targets rejects late old output without cancelling the new read", async () => {
  const pending = deferred<unknown>();
  const h = await setup(async (input) => input.method === "status" && input.params?.id === "run-1" ? pending.promise : reply(input, targeted(input) ? { text: "new target" } : undefined));
  h.controller.state.status!.asyncSnapshot!.runs.push({ id: "run-2", label: "Second", kind: "subagent", state: "running" });
  h.controller.setOutputFollowing(true);
  await tick();
  const old = h.reads()[0]!;
  h.controller.selectOutput("run-2");
  await h.controller.readOutput();
  pending.resolve(reply(old.input, { text: "old target" }));
  await tick();
  assert.equal(old.signal.aborted, true);
  assert.equal(h.controller.state.transcript?.text, "new target");
  assert.equal(h.controller.state.transcriptId, "run-2");
  assert.equal(h.controller.state.outputFollowing, false);
  h.controller.unmount();
});

test("criterion 4: late explicit correlation read cannot overwrite newer selected output", async () => {
  const pending = deferred<unknown>();
  const h = await setup(async (input) => input.method === "status" && input.params?.id === "rpc-spawn-old" ? pending.promise : reply(input, targeted(input) ? { text: "selected output" } : undefined));
  const recovery = h.controller.perform("status", { id: "rpc-spawn-old" });
  await tick();
  const old = h.reads()[0]!;
  await h.controller.readOutput();
  pending.resolve(reply(old.input, { text: "old recovery" }));
  await recovery;
  assert.equal(h.controller.state.transcriptId, "run-1");
  assert.equal(h.controller.state.transcript?.text, "selected output");
  h.controller.unmount();
});

for (const kind of ["read-error", "malformed"] as const) {
  test(`criterion 4: ${kind} preserves last good output and stops follow without retry`, async () => {
    let reads = 0;
    const h = await setup(async (input) => !targeted(input) ? reply(input) : ++reads === 1 ? reply(input, { text: "cached" }) : reply(input, kind === "read-error" ? { text: "artifact unavailable", isError: true } : { text: 123 }));
    await h.controller.readOutput();
    h.controller.setOutputFollowing(true);
    await tick();
    assert.ok(h.controller.state.outputError);
    assert.equal(h.controller.state.outputFollowing, false);
    assert.equal(h.controller.state.transcript?.text, "cached");
    await h.clock.advance(5000);
    assert.equal(h.reads().length, 2);
    h.controller.unmount();
  });
}

test("criterion 4: nested/missing/duplicate targets and invalid line bounds never reach transport", async () => {
  const h = await setup();
  for (const id of ["step:99", "missing", ""]) {
    h.controller.selectOutput(id);
    h.controller.setOutputFollowing(true);
    await h.controller.readOutput();
  }
  h.controller.selectOutput("run-1");
  for (const lines of [0, 501, NaN, 1.5]) {
    await h.controller.readOutput(lines);
    assert.ok(h.controller.state.outputError);
  }
  h.controller.state.status!.asyncSnapshot!.runs.push({ ...h.controller.state.status!.asyncSnapshot!.runs[0]! });
  await h.controller.readOutput();
  assert.equal(h.reads().length, 0);
  h.controller.unmount();
});

for (const change of ["none", "target", "hidden", "scope"] as const) {
  test(`spawn correlation recovery ${change}: cached evidence never changes outcome, targets or scope`, async () => {
    const pending = deferred<unknown>();
    const h = await setup(async (input) => {
      if (input.method === "spawn") throw new Error("Response lost after admission");
      if (input.method === "status" && input.params?.id?.startsWith("rpc-spawn-")) return pending.promise;
      return reply(input);
    });
    await h.controller.perform("spawn", { script: "return 1", async: true }, true);
    const receipt = h.controller.currentReceipts[0]!;
    h.controller.selectOutput("");
    const recovery = h.controller.recoverSpawn(receipt.requestId);
    await tick();
    const read = h.reads().at(-1)!;
    assert.deepEqual(read.input.params, { id: `rpc-spawn-${receipt.requestId}` });
    if (change === "target") h.controller.selectOutput("run-1");
    if (change === "hidden") h.controller.setVisible(false);
    if (change === "scope") h.controller.update({ ...h.context, state: { ...h.context.state, selectedSession: { ...h.context.state!.selectedSession!, id: "other-session" } } });
    pending.resolve(reply(read.input, { text: "State: complete; returned-id", details: { asyncId: "returned-id" } }));
    await recovery;
    if (change === "none") {
      assert.equal(h.controller.state.transcript?.text, "State: complete; returned-id");
      assert.equal(h.controller.state.transcriptId, `rpc-spawn-${receipt.requestId}`);
      assert.equal(h.controller.state.transcriptAt, h.clock.now());
      assert.ok(!h.controller.state.status?.asyncSnapshot?.runs.some((node) => node.id === "returned-id"));
    } else assert.equal(h.controller.state.transcript, undefined, "obsolete evidence cannot leak across epochs/scopes");
    assert.equal(receipt.state, "unknown");
    await h.clock.advance(5000);
    assert.equal(h.calls.filter(({ input }) => input.method === "spawn").length, 1);
    assert.equal(h.reads().length, 1, "correlation read never auto-follows/retries");
    h.controller.unmount();
  });
}
