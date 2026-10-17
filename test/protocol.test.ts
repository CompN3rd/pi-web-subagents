import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assertBoundedJson,
  parseRpcInput,
  parseRpcReply,
  isMutation,
  MANAGEMENT_ACTIONS,
  RPC_METHODS,
} from "../src/protocol.ts";
import { input, dataFor } from "./fixtures/rpc/fake-bus.ts";

const params = {
  ping: {},
  status: { id: "run-1", view: "transcript", lines: 80, index: 0 },
  manage: { action: "schedule.list" },
  spawn: { agent: "worker", task: "test" },
  steer: { id: "run-1", message: "next", mode: "follow_up" },
  interrupt: { id: "run-1", index: 0 },
  stop: { id: "run-1", childId: "step:0" },
  resume: { id: "run-1", message: "continue" },
  cost: {},
};
for (const method of RPC_METHODS) {
  test(`protocol ${method}: concrete input/result and unknown-field rejection`, () => {
    const value = input(method, params[method]);
    assert.deepEqual(parseRpcInput(value), value);
    assert.throws(() => parseRpcInput(input(method, { ...params[method], arbitrary: "no" })));
    const reply = parseRpcReply(
      { version: 1, requestId: value.requestId, method, success: true, data: dataFor(method) },
      value,
    );
    assert.ok(!("kind" in reply) && reply.success && reply.method === method);
    assert.ok(!JSON.stringify(reply).includes("private"));
  });
}
test("protocol exact schedule allowlist, required identity and quiet only for run", () => {
  for (const action of MANAGEMENT_ACTIONS) {
    const p = action === "schedule.list" ? { action } : { action, id: "daily" };
    const parsed = parseRpcInput(input("manage", p));
    assert.equal(isMutation(parsed), !["schedule.list", "schedule.show", "schedule.history"].includes(action));
    if (action !== "schedule.list") assert.throws(() => parseRpcInput(input("manage", { action })));
  }
  for (const action of ["config.set", "agent.list", "schedule.create", "mission.list"])
    assert.throws(() => parseRpcInput(input("manage", { action })));
  assert.throws(() => parseRpcInput(input("manage", { action: "schedule.pause", id: "daily", quiet: true })));
});
test("protocol advanced input restrictions and bounds", () => {
  for (const p of [
    { agent: "worker", async: false },
    { workflow: true },
    { script: "x", workflow: "named" },
    { agent: "worker", cwd: "/private" },
    { workflowScript: "old" },
    { agent: "worker", clarify: true },
  ])
    assert.throws(() => parseRpcInput(input("spawn", p)));
  for (const p of [
    { script: "return 1", args: { label: "ok" } },
    { workflow: "./workflow.js", context: "fresh" },
  ])
    assert.doesNotThrow(() => parseRpcInput(input("spawn", p)));
  for (const p of [
    { id: "../run" },
    { dir: "/run" },
    { id: "run", lines: 501, view: "transcript" },
    { index: 0 },
    { view: "transcript" },
  ])
    assert.throws(() => parseRpcInput(input("status", p)));
  assert.throws(() => parseRpcInput({ ...input(), projectId: "spoof" }));
  assert.throws(() => parseRpcInput({ ...input(), requestId: "bad\nid" }));
  assert.throws(() => parseRpcInput(input("steer", { id: "run", message: "x".repeat(16385) })));
  assert.throws(() => assertBoundedJson({ text: "x".repeat(65537) }));
  assert.throws(() => assertBoundedJson({ rows: Array(257).fill(0) }));
  let deep: unknown = {};
  for (let n = 0; n < 18; n++) deep = { deep };
  assert.throws(() => assertBoundedJson(deep));
  const cycle: Record<string, unknown> = {};
  cycle.self = cycle;
  assert.throws(() => assertBoundedJson(cycle));
});
test("protocol validates correlation, versions, session and malformed data", () => {
  const expected = input("ping");
  const reply = { version: 1, requestId: expected.requestId, method: "ping", success: true, data: dataFor("ping") };
  for (const bad of [
    { ...reply, version: 2 },
    { ...reply, requestId: "other" },
    { ...reply, method: "stop" },
    { ...reply, data: { ...(dataFor("ping") as object), session: { sessionId: "wrong" } } },
    { ...reply, data: {} },
  ])
    assert.throws(() => parseRpcReply(bad, expected));
  for (const method of RPC_METHODS) assert.throws(() => parseRpcReply({ ...reply, method, data: {} }, input(method)));
  assert.deepEqual(
    parseRpcReply(
      {
        version: 1,
        requestId: expected.requestId,
        success: false,
        error: { code: "no_active_session", message: "No context" },
      },
      expected,
    ),
    {
      version: 1,
      requestId: expected.requestId,
      method: "ping",
      success: false,
      error: { code: "no_active_session", message: "No context" },
    },
  );
});
test("protocol tool receipts preserve identities, queued delivery and safe projections", () => {
  const value = input("steer", params.steer);
  const data = {
    text: "queued",
    details: {
      runId: "run-1",
      toolCallId: "rpc-spawn-original",
      asyncDir: "private",
      metadata: { secret: "private" },
      results: [{ index: 4, agent: "worker", sessionFile: "private", artifactPaths: { output: "private" } }],
      steering: {
        requestId: "steer-1",
        state: "pending",
        deliveryStatus: "queued",
        sourceRunId: "run-1",
        targets: [{ index: 4, state: "queued" }],
      },
      schedules: {
        records: [{ id: "daily", name: "Daily", paused: false, cwd: "private", target: { workflowScript: "private" } }],
      },
      workflow: { value: { secretPath: "private" }, args: { path: "private" }, trace: [] },
    },
  };
  const reply = parseRpcReply({ version: 1, requestId: value.requestId, success: true, data }, value);
  assert.ok(!("kind" in reply) && reply.success && reply.method === "steer");
  if (!("kind" in reply) && reply.success && reply.method === "steer") {
    assert.equal(reply.data.details?.steering?.deliveryStatus, "queued");
    assert.equal(reply.data.details?.results?.[0]?.index, 4);
    assert.equal(reply.data.details?.toolCallId, "rpc-spawn-original");
  }
  assert.ok(!JSON.stringify(reply).includes("private"));
});
test("protocol bounded fleet/tree and transcript text fallback", () => {
  const value = input();
  const snapshot = {
    kind: "pi-subagents.async-status-snapshot",
    version: 1,
    generatedAt: 1,
    caps: { maxRuns: 20, maxChildrenPerNode: 8, maxDepth: 3, maxStringLength: 160, maxSerializedBytes: 32768 },
    omitted: { runs: 2, children: 3, byteLimitExceeded: false },
    runs: [
      {
        id: "run-1",
        kind: "workflow",
        label: "Run",
        state: "running",
        children: [
          {
            id: "host:check",
            kind: "host-step",
            label: "Check",
            state: "complete",
            hostStep: { state: "complete", report: "/private" },
          },
        ],
      },
    ],
  };
  const data = {
    text: "literal transcript",
    fleet: { version: 1, entries: [], totalActive: 17, omitted: 17 },
    asyncSnapshot: snapshot,
  };
  const reply = parseRpcReply({ version: 1, requestId: value.requestId, success: true, data }, value);
  assert.ok(!JSON.stringify(reply).includes("private"));
  assert.match(JSON.stringify(reply), /literal transcript/);
  assert.throws(() =>
    parseRpcReply(
      {
        version: 1,
        requestId: value.requestId,
        success: true,
        data: { ...data, fleet: { ...data.fleet, entries: Array(17).fill({}) } },
      },
      value,
    ),
  );
});
test("protocol projected replies can be validated again by the browser, including incomplete cost identities", () => {
  for (const method of RPC_METHODS) {
    const expected = input(method, params[method]);
    let data = dataFor(method);
    if (method === "cost")
      data = {
        ...(data as object),
        children: [
          { label: "legacy child", usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, turns: 0 } },
        ],
      };
    const projected = parseRpcReply({ version: 1, requestId: expected.requestId, success: true, data }, expected);
    assert.deepEqual(parseRpcReply(projected, expected), projected);
  }
  const failure = parseRpcReply(
    { version: 1, kind: "relay-error", code: "invalid-payload", outcome: "not-sent", message: "Invalid request" },
    input(),
  );
  assert.ok("kind" in failure && failure.outcome === "not-sent");
});
test("protocol signed exit codes are valid but fractional control indices and malformed observed proof are not", () => {
  const envelope = (details: object) => ({
    version: 1,
    requestId: "request-1",
    success: true,
    data: { text: "status", details },
  });
  assert.doesNotThrow(() => parseRpcReply(envelope({ results: [{ index: 0, exitCode: -1 }] }), input()));
  assert.throws(() => parseRpcReply(envelope({ results: [{ index: 0.5 }] }), input()));
  assert.throws(() =>
    parseRpcReply(
      envelope({ lifecycleStatus: { processTerminal: { version: 1, runId: "run", state: "observed" } } }),
      input(),
    ),
  );
  const projected = parseRpcReply(
    envelope({
      lifecycleStatus: {
        processTerminal: {
          version: 1,
          runId: "run",
          state: "observed",
          observedAt: 123,
          instances: [],
          runnerProcessInstanceId: "private-omitted",
        },
      },
    }),
    input(),
  );
  assert.deepEqual(parseRpcReply(projected, input()), projected);
  assert.ok(!JSON.stringify(projected).includes("private-omitted"));
});
