import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SubagentsController,
  selectedScope,
} from "../src/browser/controller.ts";
import { MANAGEMENT_ACTIONS, type JsonObject, type RpcInput, type RpcMethod } from "../src/protocol.ts";
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
test("C8: schedule list provenance survives detail/history reads and clears on exact scope changes", async () => {
  let failList = false;
  let omitList = false;
  const h = await setup(async (input) => {
    if (input.method !== "manage") return reply(input);
    if (failList && input.params?.action === "schedule.list") throw new Error("list unavailable");
    if (omitList && input.params?.action === "schedule.list") return reply(input, { text: "Text-only list" });
    return reply(input, { text: input.params?.action, details: { schedules: input.params?.action === "schedule.history"
      ? { runs: [{ id: "history-1", scheduleId: "s-1", state: "failed" }] }
      : { records: [{ id: "s-1", name: input.params?.action, paused: false }] } } });
  });
  await h.controller.perform("manage", { action: "schedule.list" });
  const records = h.controller.state.scheduleRecords;
  const listAt = h.controller.state.scheduleRecordsAt;
  assert.equal(records?.[0]?.name, "schedule.list");
  for (const action of ["schedule.show", "schedule.history", "schedule.pause"]) {
    await h.clock.advance(100);
    await h.controller.perform("manage", { action, id: "s-1" }, true);
    assert.equal(h.controller.state.scheduleRecords, records);
    assert.equal(h.controller.state.scheduleRecordsAt, listAt);
    assert.equal(h.controller.state.scheduleAction, action);
    assert.equal(h.controller.state.scheduleTarget, "s-1");
    assert.ok(h.controller.state.schedulesAt! > listAt!);
  }
  failList = true;
  await h.controller.perform("manage", { action: "schedule.list" });
  assert.equal(h.controller.state.scheduleRecords, records);
  assert.equal(h.controller.state.scheduleAction, "schedule.pause", "failed read does not relabel cached response");
  failList = false;
  omitList = true;
  await h.controller.perform("manage", { action: "schedule.list" });
  assert.equal(h.controller.state.scheduleRecords, undefined, "new text-only list cannot retain old selectable authority");
  assert.equal(h.controller.state.schedules?.text, "Text-only list");
  h.context.state!.selectedSession!.id = "other-session";
  h.controller.update(h.context);
  assert.equal(h.controller.state.scheduleRecords, undefined);
  assert.equal(h.controller.state.schedulesAt, undefined);
  assert.equal(h.controller.state.scheduleTarget, "");
  h.controller.unmount();
});

test("criterion 3: duplicate root IDs reject all targeted reads and controls before transport", async () => {
  const h = await setup();
  const root = h.controller.state.status!.asyncSnapshot!.runs[0]!;
  h.controller.state.status!.asyncSnapshot!.runs.push({ ...root });
  const before = h.calls.length;
  for (const method of ["status", "stop", "interrupt", "resume", "steer"] as const) {
    await h.controller.perform(method, { id: root.id, ...(["resume", "steer"].includes(method) ? { message: "hello" } : {}) }, true);
    assert.match(h.controller.state.error, /Ambiguous duplicate/);
  }
  assert.equal(h.calls.length, before);
  assert.equal(h.controller.receipts.length, 0);
  h.controller.unmount();
});

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
const exposedMutations: { name: string; method: RpcMethod; params: JsonObject }[] = [
  { name: "agent launch", method: "spawn", params: { agent: "worker", async: true, context: "fork" } },
  ...(["stop", "interrupt", "resume", "steer"] as const).map((method) => ({
    name: method, method, params: { id: "run-1", ...(["resume", "steer"].includes(method) ? { message: "next" } : {}), ...(method === "steer" ? { mode: "follow_up" } : {}) },
  })),
  ...["pause", "resume", "run", "delete"].map((action) => ({ name: `schedule.${action}`, method: "manage" as const, params: { action: `schedule.${action}`, id: "disposable-disabled-demo" } })),
];

for (const operation of exposedMutations) {
  test(`controller ${operation.name}: confirmation and revoked capability never reach transport`, async () => {
    const h = await setup();
    const before = h.calls.length;
    if (operation.method !== "steer") {
      await h.controller.perform(operation.method, operation.params);
      assert.match(h.controller.state.error, /confirmation/i);
      assert.equal(h.calls.length, before);
    }
    const capability = operation.method === "spawn" ? "asyncSpawn" : operation.method === "steer" ? "nonRecoveringSteer" : operation.method;
    if (operation.method !== "manage") {
      h.controller.state.ping!.capabilities[capability] = false;
      await h.controller.perform(operation.method, operation.params, true);
      assert.match(h.controller.state.error, /Capability/);
      assert.equal(h.calls.length, before);
      h.controller.state.ping!.capabilities[capability] = true;
    }
    if (operation.method === "manage") h.controller.state.ping!.capabilities.managementActions = [];
    else h.controller.state.ping!.methods = h.controller.state.ping!.methods.filter((method) => method !== operation.method);
    await h.controller.perform(operation.method, operation.params, true);
    assert.match(h.controller.state.error, /Capability/);
    assert.equal(h.calls.length, before);
    assert.equal(h.controller.receipts.length, 0);
    h.controller.unmount();
  });

  test(`controller ${operation.name}: rejection is failed, cancellation is unknown, neither retries`, async () => {
    for (const outcome of ["rejected", "cancelled"] as const) {
      const late = deferred<unknown>();
      let admitted: RpcInput | undefined;
      const h = await setup(async (input) => {
        if (input.method !== operation.method) return reply(input);
        admitted = input;
        return outcome === "cancelled" ? late.promise : {
          version: 1, requestId: input.requestId, method: input.method, success: false,
          error: { code: "invalid_state", message: "Not admitted in this state" },
        };
      });
      const pending = h.controller.perform(operation.method, operation.params, true);
      await tick();
      if (outcome === "cancelled") {
        assert.equal(h.controller.state.busy, true);
        const count = h.calls.length;
        await h.controller.perform(operation.method, operation.params, true);
        assert.equal(h.calls.length, count, "busy mutation cannot be double-submitted");
        h.controller.setVisible(false);
        assert.equal(h.signals.at(-1)!.aborted, true);
      }
      await pending;
      assert.equal(h.controller.currentReceipts[0]!.state, outcome === "cancelled" ? "unknown" : "failed");
      if (outcome === "cancelled") {
        late.resolve(reply(admitted!));
        await tick();
        assert.equal(h.controller.currentReceipts[0]!.state, "unknown", "late success cannot rewrite cancelled observation");
        h.controller.setVisible(true);
        await tick();
      }
      await h.clock.advance(30000);
      assert.equal(h.calls.filter((input) => input.method === operation.method).length, 1);
      assert.equal(h.controller.state.busy, false);
      h.controller.unmount();
      assert.equal(h.clock.timers.size, 0);
    }
  });
}

for (const action of ["cost", "schedule.list", "schedule.show", "schedule.history"]) {
  test(`controller ${action}: failed on-demand read preserves cache and never creates a mutation receipt`, async () => {
    const method = action === "cost" ? "cost" : "manage";
    const params = action === "cost" ? undefined : { action, ...(action === "schedule.list" ? {} : { id: "disabled-demo" }) };
    let fail = false;
    const h = await setup(async (input) => {
      if (input.method === method && fail) throw new Error("On-demand read unavailable");
      return reply(input);
    });
    await h.controller.perform(method, params);
    const cached = method === "cost" ? h.controller.state.cost : h.controller.state.schedules;
    const cachedAt = method === "cost" ? h.controller.state.costAt : h.controller.state.schedulesAt;
    assert.ok(cached);
    fail = true;
    await h.controller.perform(method, params);
    assert.match(h.controller.state.error, /On-demand read unavailable/);
    assert.equal(method === "cost" ? h.controller.state.cost : h.controller.state.schedules, cached);
    assert.equal(method === "cost" ? h.controller.state.costAt : h.controller.state.schedulesAt, cachedAt);
    await h.clock.advance(30000);
    assert.equal(h.calls.filter((input) => input.method === method).length, 2);
    assert.equal(h.controller.receipts.length, 0);
    h.controller.unmount();
  });
}

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

for (const stoppedText of ["State: stopped", "État ciblé : arrêté — texte fourni"]) {
  test(`lifecycle provenance keeps paused snapshot separate from resume identity and targeted output: ${stoppedText}`, async () => {
    const global = snapshot();
    global.fleet.totalActive = 0;
    global.asyncSnapshot.runs[0]!.state = "paused";
    global.asyncSnapshot.runs[0]!.children[0]!.state = "paused";
    const h = await setup(async (input) => {
      if (input.method === "status") return reply(input, input.params?.id ? { ...global, text: stoppedText } : global);
      if (input.method === "resume") return reply(input, { text: "New reported run: resumed-id", details: { asyncId: "resumed-id" } });
      return reply(input);
    });
    await h.controller.perform("resume", { id: "run-1", message: "continue saved contract" }, true);
    assert.equal(h.controller.currentReceipts[0]!.details?.asyncId, "resumed-id");
    assert.equal(h.controller.state.status!.asyncSnapshot!.runs[0]!.id, "run-1");
    assert.equal(h.controller.state.status!.asyncSnapshot!.runs[0]!.state, "paused");
    await h.controller.perform("stop", { id: "run-1" }, true);
    h.controller.selectOutput("run-1");
    await h.controller.readOutput();
    for (let poll = 0; poll < 2; poll++) {
      global.asyncSnapshot.generatedAt++;
      await h.controller.refresh();
    }
    assert.equal(h.controller.state.status!.asyncSnapshot!.runs[0]!.state, "paused");
    assert.equal(h.controller.state.status!.asyncSnapshot!.runs[0]!.children![0]!.state, "paused");
    assert.equal(h.controller.state.status!.fleet!.totalActive, 0);
    assert.equal(h.controller.state.transcript?.text, stoppedText);
    assert.equal(h.controller.state.transcriptId, "run-1");
    assert.match(h.controller.currentReceipts[0]!.message, /Not terminal proof/);
    assert.equal(h.calls.filter((call) => call.method === "resume").length, 1);
    assert.equal(h.calls.filter((call) => call.method === "stop").length, 1);
    h.controller.unmount();
  });
}
