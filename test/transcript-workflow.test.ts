import { test } from "node:test";
import assert from "node:assert/strict";
import { parseToolDetails } from "../src/browser/transcript-schema.ts";
import { toolBody } from "../src/browser/transcript.ts";
import { toolFixture } from "./transcript-fixtures.ts";

const basic = { mode: "workflow", results: [] };
const node = { id: "node", kind: "agent", label: "Worker", status: "running" };
const graph = { runId: "ref", mode: "workflow", phases: [], nodes: [node] };
const lane = { key: "lane", resumability: { state: "not-resumable", reason: "unknown" }, continuation: { runIds: [] } };
const receipt = { version: 1, workflowRunId: "ref", state: "paused", entries: { lane } };
const child = { index: 0, agent: "worker", task: "Task", exitCode: 0 };
const watchdog = { phase: "idle", seq: 0, lastUpdate: 0, warnings: [] };

test("A11–A13/C1: graph depth, global nodes, per-array caps and cycles fall back as a whole", () => {
  let deep: unknown = node;
  for (let i = 0; i < 4; i++) deep = { ...node, children: [deep] };
  assert.ok(parseToolDetails({ ...basic, workflowGraph: { ...graph, nodes: [deep] } }));
  assert.equal(parseToolDetails({ ...basic, workflowGraph: { ...graph, nodes: [{ ...node, children: [deep] }] } }), undefined);
  const branch = { ...node, children: Array(31).fill(node) };
  assert.ok(parseToolDetails({ ...basic, workflowGraph: { ...graph, nodes: [branch, branch] } }));
  assert.equal(parseToolDetails({ ...basic, workflowGraph: { ...graph, nodes: [branch, branch, node] } }), undefined);
  const cyclic: Record<string, unknown> = { ...node }; cyclic.children = [cyclic];
  for (const nodes of [[cyclic], Array(33).fill(node), [{ ...node, status: "invented" }], [{ ...node, hostStep: {} }], new Array(2)]) {
    assert.equal(parseToolDetails({ ...basic, workflowGraph: { ...graph, nodes } }), undefined);
  }
  assert.equal(parseToolDetails({ ...basic, workflowGraph: { ...graph, phases: [{ title: "p", nodeIds: Array(33).fill("a") }] } }), undefined);
});

test("A12: keyed receipt entries remain display references, bounded and prototype-safe", () => {
  const entries = Object.fromEntries(Array.from({ length: 32 }, (_, i) => [`key-${i}`, lane]));
  const parse = (value: unknown) => parseToolDetails({ ...basic, workflow: { trace: [], receipt: { ...receipt, entries: value } } });
  assert.equal(parse(entries)!.workflow!.receipt!.entries.length, 32);
  assert.equal(parse({ ...entries, more: lane }), undefined);
  assert.equal(parse({ lane: { ...lane, continuation: { runIds: Array(33).fill("ref") } } }), undefined);
  assert.equal(parse({ lane: { ...lane, lane: { version: 2, key: "bad" } } }), undefined);
  assert.equal(parse({ lane: { ...lane, resumability: { state: "approved" } } }), undefined);
  assert.equal(parse({ get lane() { throw new Error("Bad data"); } }), undefined);
  assert.equal(parse(Object.create({ inherited: lane })), undefined);
  const protoName = JSON.parse(JSON.stringify({ entries: [{ ...lane }] })).entries[0];
  const map = Object.create(null); map.__proto__ = protoName;
  assert.equal(parse(map)!.workflow!.receipt!.entries[0]!.key, "lane");
  assert.equal(({} as { polluted?: boolean }).polluted, undefined);
  // Raw artifact-bearing values and general outputs are deliberately not accessed.
  assert.ok(parse({ lane: { ...lane, get acceptanceRecovery() { throw new Error("No artifact access"); } } }));
});

test("C4/C9: review, watchdog and runner fields validate independently and preserve false/zero", () => {
  const parse = (extra: object) => parseToolDetails({ ...basic, results: [{ ...child, ...extra }] });
  const value = parse({ watchdog, runner: { type: "external-cli", safetySource: { measured: false }, safety: { sessionPersistence: false } }, review: { status: "not-requested" } })!;
  assert.equal(value.results[0]!.watchdog!.lastUpdate, 0);
  assert.equal(value.results[0]!.runner!.safetySource!.measured, false);
  assert.equal(value.results[0]!.runner!.safety!.sessionPersistence, false);
  for (const extra of [
    { review: { status: "safe" } }, { review: { status: "blockers", findings: [{ severity: "high", issue: "i", rationale: "r" }] } },
    { review: { status: "reviewed", findings: Array(33).fill({ severity: "blocker", issue: "i", rationale: "r" }) } },
    { watchdog: { ...watchdog, phase: "complete" } }, { watchdog: { ...watchdog, seq: -1 } },
    { watchdog: { ...watchdog, warnings: Array(33).fill({}) } }, { watchdog: { ...watchdog, reason: "x".repeat(16_385) } },
    { runner: { type: "native-pi" } }, { runner: { type: "external-cli", safetySource: { measured: true } } },
    { runner: { type: "external-cli", args: Array(33).fill("arg") } }, { runner: { type: "external-cli", safety: { ephemeral: "true" } } },
  ]) assert.equal(parse(extra), undefined, JSON.stringify(extra).slice(0, 120));
  assert.ok(parse({ runner: { type: "external-job", provider: "job-provider", get options() { throw new Error("Unknown opaque options"); } } }));
  assert.ok(parse({ acceptance: { status: "reviewed", evidenceStatus: "checked", reviewResult: { status: "reviewed", findings: [] } } }));
});

test("A12/C1: shared text budget includes graph, receipt, findings and runner; malformed data declines body", () => {
  const large = "x".repeat(16_384);
  const value = { ...basic, workflowGraph: { ...graph, nodes: Array(9).fill({ ...node, label: large }) } };
  assert.equal(parseToolDetails(value), undefined);
  assert.equal(toolBody({ ...toolFixture(), entry: { toolName: "subagent", status: "success", details: value } }), undefined);
  const parsed = parseToolDetails(toolFixture("workflow").entry.details)!;
  assert.equal(parsed.workflowChildren!.inventoryComplete, false);
  assert.equal(parsed.workflowChildren!.children[0]!.activity!.toolCount, 0);
  assert.equal(parsed.workflow!.receipt!.hostSteps![0]!.verdict, "inconclusive");
  assert.ok(parseToolDetails({ ...basic, workflowChildren: { version: 1, parentToolCallId: "p", workflowRunId: "r", inventoryComplete: true, workflowState: "running", children: [] } }));
  assert.equal(parseToolDetails({ ...basic, workflowChildren: { version: 1, inventoryComplete: "yes" } }), undefined);
});
