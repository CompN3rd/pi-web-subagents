import { test } from "node:test";
import assert from "node:assert/strict";
import type { TemplateResult } from "lit";
import { noticeBody, noticeRenderers } from "../src/browser/notices.ts";
import { isNoticeType, noticeSchemas, parseNoticeDetails } from "../src/browser/notices-schema.ts";
import { createContent } from "../src/browser/localization.ts";
import { localizationFixture } from "./host-fixtures.ts";
import { noticeFixture, noticeFixtures } from "./notice-fixtures.ts";
import { hostile } from "./transcript-fixtures.ts";

function parts(value: unknown): { markup: string; text: string } {
  if (Array.isArray(value)) return value.map(parts).reduce((a, b) => ({ markup: a.markup + b.markup, text: a.text + " " + b.text }), { markup: "", text: "" });
  if (value && typeof value === "object" && "strings" in value && "values" in value) {
    const template = value as TemplateResult, nested = parts(template.values);
    return { markup: template.strings.join("") + nested.markup, text: nested.text };
  }
  return { markup: "", text: typeof value === "string" || typeof value === "number" ? String(value) : "" };
}

test("C2–C4: all 14 released displayed types render escaped historical cards without transport or controls", () => {
  assert.deepEqual(Object.keys(noticeSchemas), Object.keys(noticeFixtures));
  const renderers = noticeRenderers((body) => body());
  assert.equal(renderers.length, 14);
  assert.equal(new Set(renderers.map((r) => r.id)).size, 14);
  for (const renderer of renderers) {
    assert.equal(renderer.target, "custom-message");
    if (renderer.target !== "custom-message") continue;
    const input = noticeFixture(renderer.customType);
    const original = JSON.stringify(input.entry);
    const rendered = parts(renderer.render(input));
    assert.match(rendered.text, /Historical displayed notice, not a live status or pending-request inbox/);
    assert.ok(rendered.text.includes(hostile));
    assert.ok(!rendered.markup.includes(hostile));
    assert.doesNotMatch(rendered.markup, /<button|<a\b|@click|unsafeHTML|<script/);
    assert.equal(JSON.stringify(input.entry), original);
    assert.deepEqual(parts(renderer.render(input)), rendered);
    assert.equal(renderer.render(noticeFixture("unknown")), undefined);
  }
  for (const name of ["unknown", "SUBAGENT-NOTIFY", "subagent_supervisor_reply", "subagent-notify-pending", "constructor", "__proto__"]) {
    assert.equal(isNoticeType(name), false);
    assert.equal(noticeBody(noticeFixture(name)), undefined);
  }
});

test("C3: decision, interview, progress and reminders distinguish historical state and do not infer answers", () => {
  const base = noticeFixture();
  for (const [reason, expected] of [["need_decision", "Decision requested"], ["interview_request", "Structured answers requested"], ["progress_update", "Informational progress update"]]) {
    const view = parts(noticeBody({ ...base, entry: { ...base.entry, details: { ...noticeFixtures.subagent_supervisor_request, reason, expectsReply: reason !== "progress_update" } } })!());
    assert.ok(view.text.includes(expected!));
    assert.match(view.text, /does not answer or approve this historical request/);
    assert.match(view.text, /opaque:child/);
    assert.match(view.text, /May I proceed/);
    assert.match(view.text, /Reported child index \(display only\).*0/);
  }
  for (const type of ["subagent-supervisor-unanswered", "subagent-supervisor-blocked"]) {
    const view = parts(noticeBody(noticeFixture(type))!());
    assert.match(view.text, /Request IDs in this historical reminder.*request-1/);
    assert.doesNotMatch(view.text, /1 pending|2 pending|Reply sent/);
  }
});

test("C2: grouped outcomes, child outcome, wait, steering and control facts are readable, not live receipts", () => {
  const expected = {
    "subagent-notify": /worker.*completed.*workflow.*paused.*Not auto-resumed: held.*review.*failed.*Test gap/,
    "subagent-incremental-child-notify": /review.*failed/,
    "subagent-wait-subscription": /historical-run.*timeout.*wait-token/,
    subagent_steering_notice: /historical-run.*steer-request.*partial.*Delivery partially recovered/,
    subagent_control_notice: /needs_attention.*blocked.*worker.*historical-run.*bash.*Repeated tool failure/,
  };
  for (const [type, pattern] of Object.entries(expected)) assert.match(parts(noticeBody(noticeFixture(type))!()).text, pattern);
});

test("C4: watchdog severity/evidence/recommendation, stale and failed review remain distinct", () => {
  const input = noticeFixture("subagent_watchdog_warning");
  const view = parts(noticeBody(input)!());
  assert.match(view.text, /blocker.*high.*test-gap.*child/);
  assert.match(view.text, /Missing test.*No regression assertion.*Add a regression test/s);
  assert.match(view.text, /watchdog stopped continuing the run/);
  const failed = parts(noticeBody({ ...input, entry: { ...input.entry, details: { ...noticeFixtures.subagent_watchdog_warning, state: "failed", stale: true, error: "Review failed" } } })!());
  assert.match(failed.text, /Reported state.*failed.*Reported stale.*Yes/);
  assert.match(failed.text, /Review failed/);
  assert.doesNotMatch(failed.text, /watchdog stopped continuing/);
});

test("C2–C4: legacy text-only notices preserve source without parsing prose into facts", () => {
  for (const type of Object.keys(noticeFixtures)) {
    const input = noticeFixture(type);
    const view = parts(noticeBody({ ...input, entry: { ...input.entry, details: undefined, content: "<warning severity=blocker>reported</warning>" } })!());
    assert.match(view.text, /No structured details supplied/);
    assert.ok(view.text.includes("<warning severity=blocker>"));
    assert.ok(!view.markup.includes("<warning"));
  }
});

test("C2–C4: malformed known fields, bounded arrays/text/budget and mixed content fall back", () => {
  const invalid: [keyof typeof noticeSchemas, unknown][] = [
    ["subagent_supervisor_request", { reason: "approve" }], ["subagent_supervisor_request", { childIndex: Infinity }],
    ["subagent_supervisor_request", { requestBody: "x".repeat(16_385) }], ["subagent_supervisor_request", { expectsReply: "yes" }],
    ["subagent-supervisor-unanswered", { requestIds: Array(33).fill("id") }],
    ["subagent-supervisor-blocked", { requestIds: [4] }], ["subagent-notify", { runs: [{ agent: "a", status: "success" }] }],
    ["subagent-notify", { runs: Array(33).fill(noticeFixtures["subagent-notify"].runs[0]) }],
    ["subagent-notify", { runs: Array(9).fill({ agent: "x".repeat(16_384), status: "completed" }) }],
    ["subagent-wait-subscription", { runId: "run", outcome: 42 }],
    ["subagent-incremental-child-notify", { childKey: "child", outcome: "running" }],
    ["subagent_control_notice", { event: { agent: "a" } }],
    ["subagent_steering_notice", { ...noticeFixtures.subagent_steering_notice, state: "delivered" }],
    ["subagent_watchdog_warning", { ...noticeFixtures.subagent_watchdog_warning, severity: "fatal" }],
    ["subagent_watchdog_warning", { ...noticeFixtures.subagent_watchdog_warning, state: "held" }],
  ];
  for (const [type, details] of invalid) {
    const input = noticeFixture(type);
    assert.equal(parseNoticeDetails(type, details), undefined, type);
    assert.equal(noticeBody({ ...input, entry: { ...input.entry, details } }), undefined, type);
  }
  for (const details of [null, [], "raw"]) assert.equal(parseNoticeDetails("subagent-auto-resume", details), undefined);
  assert.ok(parseNoticeDetails("subagent_supervisor_request", { requestBody: "x".repeat(16_384), unknown: { get nested() { throw Error(); } } }));
  assert.equal(parseNoticeDetails("subagent_supervisor_request", { get requestBody() { throw Error(); } }), undefined);
  const base = noticeFixture();
  for (const content of [42, null, [{ type: "image", data: "opaque" }], Array(33).fill({ type: "text", text: "a" })]) {
    assert.equal(noticeBody({ ...base, entry: { ...base.entry, content } }), undefined);
  }
  const controller = new AbortController(); controller.abort();
  assert.equal(noticeBody({ ...base, signal: controller.signal }), undefined);
});

test("C2–C4: visible content cap, localization and RTL use shared lifecycle without current-time claims", () => {
  const localization = localizationFixture(), input = noticeFixture();
  const body = noticeBody({ ...input, entry: { ...input.entry, content: [{ type: "text", text: "x".repeat(20_000) }] } }, createContent(localization.service))!;
  assert.match(parts(body()).text, /Notice preview capped at 16,384/);
  assert.ok(!parts(body()).text.includes("x".repeat(16_385)));
  localization.change("es", "es-ES", { supervisorRequest: "Solicitud de supervisor" }, "rtl");
  assert.match(parts(body()).text, /Solicitud de supervisor/);
  assert.match(parts(body()).text, /rtl/);
});
