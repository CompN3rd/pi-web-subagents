import { test } from "node:test";
import assert from "node:assert/strict";
import { html, type TemplateResult } from "lit";
import { toolBody, toolRenderers } from "../src/browser/transcript.ts";
import { parseToolArgs, parseToolDetails, parseTextContent } from "../src/browser/transcript-schema.ts";
import { createContent } from "../src/browser/localization.ts";
import { localizationFixture } from "./host-fixtures.ts";
import { hostile, toolFixture } from "./transcript-fixtures.ts";

function parts(value: unknown): { markup: string; text: string } {
  if (Array.isArray(value)) return value.map(parts).reduce((a, b) => ({ markup: a.markup + b.markup, text: a.text + " " + b.text }), { markup: "", text: "" });
  if (value && typeof value === "object" && "strings" in value && "values" in value) {
    const template = value as TemplateResult;
    const nested = parts(template.values);
    return { markup: template.strings.join("") + nested.markup, text: nested.text };
  }
  return { markup: "", text: typeof value === "string" || typeof value === "number" ? String(value) : "" };
}

test("C1: exact fixed tool resolver delegates renamed waits/unknown tools; fallback does not run downstream", () => {
  const contribution = toolRenderers((body) => body())[0]!;
  assert.equal(contribution.target, "tool");
  if (contribution.target !== "tool") return;
  let delegated = 0;
  const downstream = { render: () => html`core` };
  for (const name of ["bg_wait", "subagent_wait", "renamed_wait", "SUBAGENT", "subagents_enable", "bash"]) {
    assert.equal(contribution.resolve(name, () => { delegated++; return downstream; }), downstream);
  }
  assert.equal(delegated, 6);
  const renderer = contribution.resolve("subagent", () => { throw new Error("should not delegate"); })!;
  assert.equal(renderer.render({ ...toolFixture(), entry: { toolName: "subagent", status: "success", details: { unrecognized: true } } }), undefined);
  assert.ok(renderer.render(toolFixture()));
});

test("C1/A12: supported single, parallel, chain, workflow and management payloads retain supplied grouping/facts", () => {
  for (const mode of ["single", "parallel", "chain", "workflow", "management"]) {
    const input = toolFixture(mode);
    const original = JSON.stringify(input.entry);
    const body = toolBody(input)!;
    const rendered = parts(body());
    assert.match(rendered.text, new RegExp(mode));
    assert.match(rendered.text, /Tool call.*success/);
    assert.match(rendered.text, /Tool-call success is not run success/);
    assert.match(rendered.text, /running/);
    assert.match(rendered.text, /reported child index/i);
    assert.match(rendered.text, /review-required.*checked/i);
    assert.match(rendered.text, /Output save failure.*Disk full/);
    assert.ok(rendered.text.includes(hostile));
    assert.ok(!rendered.markup.includes(hostile));
    assert.doesNotMatch(rendered.markup, /<button|<a\b|@click|unsafeHTML|<script/);
    assert.equal(JSON.stringify(input.entry), original);
    assert.deepEqual(parts(body()), rendered, "repeat rendering is deterministic");
    if (mode === "workflow") {
      assert.match(rendered.text, /Workflow preflight.*partial/);
      assert.match(rendered.text, /not execution, permission or completion proof/);
      assert.match(rendered.text, /Host check.*host.*acceptance/);
      assert.match(rendered.text, /Checks blocked/);
      assert.match(rendered.text, /Historical warning/);
    }
    if (mode === "chain") assert.match(rendered.text, /worker → reviewer/);
  }
});

test("C1: absent optional old payload fields and zeros survive without invented completion or progress", () => {
  const parsed = parseToolDetails({ mode: "single", results: [{ index: 0, agent: "a", task: "t", exitCode: -1 }] })!;
  assert.equal(parsed.results[0]!.exitCode, -1);
  assert.equal(parsed.progress, undefined);
  const input = toolFixture();
  const body = toolBody({ ...input, entry: { toolName: "subagent", status: "running", details: parsed } })!;
  const view = parts(body());
  assert.doesNotMatch(view.text, /completed|100%/i);
  assert.match(view.text, /-1/);
  const details = parseToolDetails(input.entry.details)!;
  assert.equal(details.results[0]!.usage!.input, 0);
  assert.equal(details.results[0]!.usage!.cost, 0.00000012);
});

test("C1: malformed recognized fields, bounded strings/arrays and cumulative budget decline to generic view", () => {
  const basic = { mode: "single", results: [] };
  for (const value of [null, [], {}, { mode: "new-mode", results: [] }, { ...basic, results: [{}] },
    { ...basic, runId: 42 }, { ...basic, background: "yes" }, { ...basic, results: Array(33).fill({}) },
    { ...basic, runId: "x".repeat(16_385) }, { ...basic, totalSteps: Infinity },
    { ...basic, progress: [{ durationMs: -1 }] }, { ...basic, workflow: { trace: Array(65).fill({}) } },
    { ...basic, preflight: { version: 2, coverage: "complete", lanes: [] } },
    { ...basic, preflightWarnings: Array(9).fill("x".repeat(16_384)) },
  ]) assert.equal(parseToolDetails(value), undefined, JSON.stringify(value)?.slice(0, 100));
  assert.ok(parseToolDetails({ ...basic, runId: "x".repeat(16_384) }));
  const unvisited = { ...basic, workflowGraph: { get huge() { throw new Error("Do not traverse unknown data"); } } };
  assert.ok(parseToolDetails(unvisited));
  assert.equal(parseToolDetails({ ...basic, get runId() { throw new Error("Bad input"); } }), undefined);
  assert.equal(parseToolArgs("x".repeat(32_769)), undefined);
  assert.equal(parseToolArgs('{"agent":'), undefined);
  assert.equal(parseToolArgs({ agent: "a", task: 42 }), undefined);
});

test("C1: incomplete tool calls require validated arguments, errors without known details remain generic", () => {
  const base = toolFixture();
  for (const status of ["pending", "running"] as const) {
    assert.ok(toolBody({ ...base, entry: { toolName: "subagent", status, args: '{"agent":"worker","task":"t"}' } }));
    assert.equal(toolBody({ ...base, entry: { toolName: "subagent", status, args: {} } }), undefined);
    assert.equal(toolBody({ ...base, entry: { toolName: "subagent", status, args: { agent: "a" }, details: {} } }), undefined);
  }
  for (const status of ["error", "success"] as const) assert.equal(toolBody({ ...base, entry: { toolName: "subagent", status, args: { action: "status" } } }), undefined);
  const controller = new AbortController(); controller.abort();
  assert.equal(toolBody({ ...base, signal: controller.signal }), undefined);
});

test("C1: structured parallel and chain arguments preserve requested grouping, not outcome proof", () => {
  const input = toolFixture();
  const tasks = [{ agent: "worker", task: "A" }, { agent: "reviewer", task: "B" }];
  for (const args of [{ tasks }, { chain: [{ agent: "first" }, { parallel: tasks }] }]) {
    const body = toolBody({ ...input, entry: { ...input.entry, args } })!;
    assert.match(parts(body()).text, /Requested groups \(arguments, not execution proof\)/);
    assert.match(parts(body()).text, /worker/);
  }
  for (const args of [{ tasks: [] }, { tasks: [{}] }, { chain: [{}] }, { chain: [{ parallel: [] }] }, { chain: [{ agent: "a", parallel: tasks }] }]) assert.equal(parseToolArgs(args), undefined);
});

test("C1: host text blocks are bounded and non-text content keeps the original host view", () => {
  assert.deepEqual(parseTextContent([{ type: "text", text: "one" }, { type: "text", text: "two" }]), { text: "one\ntwo", truncated: false });
  assert.deepEqual(parseTextContent(""), { text: "", truncated: false });
  assert.equal(parseTextContent([{ type: "image", data: "opaque" }]), undefined);
  assert.equal(parseTextContent(Array(33).fill({ type: "text", text: "a" })), undefined);
  assert.equal(parseTextContent([{ type: "text", text: "x".repeat(20_000) }])!.text.length, 16_384);
  assert.equal(parseTextContent([{ type: "text", text: "x".repeat(20_000) }])!.truncated, true);
  const input = toolFixture();
  const entry = { ...input.entry, resultText: undefined, content: [{ type: "text", text: hostile }] };
  assert.ok(parts(toolBody({ ...input, entry })!()).text.includes(hostile));
  assert.equal(toolBody({ ...input, entry: { ...entry, content: [{ type: "image", data: "opaque" }] } }), undefined);
});

test("C1: output cap is visible and localized bodies update without querying or wall-clock freshness", () => {
  const localization = localizationFixture();
  const input = toolFixture();
  const body = toolBody({ ...input, entry: { ...input.entry, resultText: "x".repeat(20_000) } }, createContent(localization.service))!;
  const initial = parts(body());
  assert.match(initial.text, /Output preview capped at 16,384/);
  assert.ok(!initial.text.includes("x".repeat(16_385)));
  localization.change("es", "es-ES", { toolCard: "Herramienta de subagente" });
  assert.match(parts(body()).text, /Herramienta de subagente/);
});
