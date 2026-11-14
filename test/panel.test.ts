import { test } from "node:test";
import assert from "node:assert/strict";
import { html, type TemplateResult } from "lit";
import plugin from "../src/browser.ts";
import {
  SubagentsPanel,
  overview,
  runTree,
  snapshotNotice,
  stageParentMessage,
} from "../src/browser/panel.ts";
import { SubagentsController } from "../src/browser/controller.ts";
import { parseRpcReply, type AsyncNode, type StatusData } from "../src/protocol.ts";
import { graphHostile, graphSnapshot, panelContext, snapshot, tick } from "./browser-fixtures.ts";
import { branchMatches, descendantCount, graphEntries, graphOccurrences, matchesRun } from "../src/browser/graph.ts";
import { repeat } from "lit/directives/repeat.js";
import { keyed } from "lit/directives/keyed.js";
import { guard } from "lit/directives/guard.js";
import { durationBetween, fleetMetrics, nodeFacts, usageTable, workflowTrace } from "../src/browser/presentation.ts";
import { createContent } from "../src/browser/localization.ts";
import { localizationFixture } from "./host-fixtures.ts";
import { launchParams } from "../src/browser/launch.ts";
import { selectableSchedule, scheduleFacts, scheduleHistory } from "../src/browser/schedules.ts";

const directiveType = (value: unknown) => (value as { _$litDirective$: unknown })._$litDirective$;
// Expand only the known directives for template inspection, not DOM assertions.
function directiveValue(value: unknown): unknown {
  if (!value || typeof value !== "object" || !("_$litDirective$" in value)) return value;
  const directive = value as { _$litDirective$: unknown; values: unknown[] };
  if (directive._$litDirective$ === directiveType(repeat([], () => ""))) {
    const items = directive.values[0] as Iterable<unknown>;
    const template = directive.values[2] as (item: unknown, index: number) => unknown;
    return Array.from(items, template);
  }
  if (directive._$litDirective$ === directiveType(guard([], () => ""))) {
    return (directive.values[1] as () => unknown)();
  }
  if (directive._$litDirective$ === directiveType(keyed("", ""))) return directive.values[1];
  throw new Error("Unexpected directive in template test");
}

// Inspect Lit's template contract without claiming DOM/SSR/browser execution.
function parts(value: unknown): { markup: string; text: string } {
  const expanded = directiveValue(value);
  if (expanded !== value) return parts(expanded);
  if (Array.isArray(value))
    return value
      .map(parts)
      .reduce(
        (a, b) => ({ markup: a.markup + b.markup, text: a.text + b.text }),
        { markup: "", text: "" },
      );
  if (
    value &&
    typeof value === "object" &&
    "strings" in value &&
    "values" in value
  ) {
    const template = value as TemplateResult;
    const nested = parts(template.values);
    return {
      markup: template.strings.join("") + nested.markup,
      text: nested.text,
    };
  }
  return {
    markup: "",
    text:
      typeof value === "string" || typeof value === "number"
        ? String(value)
        : "",
  };
}
class TestPanel extends SubagentsPanel {
  template(): TemplateResult {
    return this.render();
  }
}

test("C6: launch confirmation uses only mode-relevant fields and omits blank model overrides", () => {
  const data = new FormData();
  for (const [key, value] of Object.entries({ kind: "agent", source: "worker", task: "task", args: "not json", model: "  ", context: "fresh" })) data.set(key, value);
  assert.deepEqual(launchParams(data), { agent: "worker", task: "task", async: true, context: "fresh" });
  data.set("kind", "workflow");
  assert.throws(() => launchParams(data));
  for (const value of ["[]", "null", "42"]) {
    data.set("args", value);
    assert.throws(() => launchParams(data));
  }
  data.set("args", '{"goal":"<script>literal</script>"}');
  data.set("model", "provider/model");
  assert.deepEqual(launchParams(data), { workflow: "worker", args: { goal: "<script>literal</script>" }, model: "provider/model", async: true, context: "fresh" });
  data.set("kind", "script");
  data.delete("args");
  assert.equal(launchParams(data).args, undefined);
  data.set("kind", "unexpected");
  assert.throws(() => launchParams(data));
});

test("C8: selectable schedules use unique protocol-valid exact IDs, never labels or positions", () => {
  const records = [{ id: "safe-id", name: "same", paused: false }, { id: "other", name: "same", paused: false }];
  assert.equal(selectableSchedule(records, "safe-id"), true);
  assert.equal(selectableSchedule(records, "same"), false);
  assert.equal(selectableSchedule([...records, records[0]!], "safe-id"), false);
  for (const id of ["", "../unsafe", "a".repeat(65), "<img>"]) assert.equal(selectableSchedule([{ id }], id), false);
  assert.equal(selectableSchedule(undefined, "safe-id"), false);
});

test("C8: schedule facts and exact history are readable escaped evidence with unknown timing", () => {
  const hostile = '<img src=x onerror="evil()">';
  const facts = parts(scheduleFacts({ id: "s-1", name: hostile, paused: false, quiet: true }));
  for (const value of ["s-1", hostile, "No", "Yes", "unknown", "next-run time"]) assert.ok(facts.text.includes(value), value);
  assert.doesNotMatch(facts.markup, /<img|onerror/);
  const history = parts(scheduleHistory([
    { id: "h-1", scheduleId: "s-1", state: "failed", error: hostile, asyncId: "read-only" },
    { id: "h-2", scheduleId: "s-2", state: "must-not-appear" },
  ], "s-1"));
  for (const value of ["h-1", "failed", hostile, "read-only", "unknown"]) assert.ok(history.text.includes(value), value);
  assert.doesNotMatch(history.text, /must-not-appear|h-2/);
  assert.doesNotMatch(history.markup, /<img|<button|onerror/);
  assert.match(parts(scheduleHistory(undefined, "s-1")).text, /No history rows supplied/);
});

test("A11–A13: workflow trace presents reported phases, host operations, reuse, failures and references without controls", () => {
  const hostile = '<img src=x onerror="evil()">';
  const rendered = parts(workflowTrace({
    failureKind: "acceptance", stopCause: "held", reusedFrom: "prior-run",
    trace: [
      { operation: "host-check", key: "gate", phase: "acceptance", label: hostile, state: "failed", durationMs: 0, reused: false },
      { operation: "spawn", key: "worker", phase: "implementation", agent: "worker", runId: "run-reference", state: "complete", durationMs: 12345, reused: true },
      { key: "missing-facts" },
    ],
  }));
  for (const text of ["acceptance", "host-check", "held", "prior-run", "run-reference", "12s", "0s", "Not reused", "Reused", "unknown", hostile]) assert.ok(rendered.text.includes(text), text);
  assert.doesNotMatch(rendered.markup, /<button|<img|onerror/);
  assert.match(rendered.text, /not a complete workflow plan/);
  assert.match(parts(workflowTrace({})).text, /No trace entries supplied/);
  assert.equal(parts(workflowTrace(undefined)).text, "");
});

test("panel overview reports omitted/unavailable projections; nested snapshots selectable", () => {
  const controller = new SubagentsController(() => {});
  const empty = parts(overview(controller.state, () => {}, ""));
  assert.match(empty.text, /Fleet projection unavailable/);
  assert.match(empty.text, /Async run projection unavailable/);
  controller.state.status = snapshot() as StatusData;
  const content = parts(overview(controller.state, () => {}, "run-1"));
  assert.match(content.text, /fleet entries omitted/);
  assert.match(content.text, /Bounded snapshot/);
  const tree = parts(
    runTree(controller.state.status.asyncSnapshot!.runs, () => {}, "run-1"),
  );
  assert.equal((tree.markup.match(/<button/g) ?? []).length, 2);
  assert.ok(!tree.text.includes("opaque-not-a-run"));
});
test("overview combines the graph and collapsed unlinked activity in one section", () => {
  const controller = new SubagentsController(() => {});
  controller.state.status = snapshot() as StatusData;
  const content = parts(overview(controller.state, () => {}, ""));
  assert.equal((content.markup.match(/<section\b/g) ?? []).length, 1);
  assert.match(content.text, /Agents & runs/);
  assert.match(content.markup, /<details class="unlinked-agents">/);
  assert.match(content.text, /Other reported activity/);
  assert.match(content.text, /fleet entries omitted/);
  assert.match(content.text, /Bounded snapshot/);
});
test("panel does not present zero or missing capacity as a finite zero-slot limit", () => {
  const controller = new SubagentsController(() => {});
  controller.state.status = snapshot(true) as StatusData;
  const fleet = controller.state.status.fleet!;
  fleet.topLevelAsyncCapacity = { used: 0, limit: 0 };
  assert.match(parts(overview(controller.state, () => {}, "")).text, /no finite limit reported/);
  fleet.topLevelAsyncCapacity = { used: 2, limit: 4 };
  const finite = parts(overview(controller.state, () => {}, ""));
  assert.doesNotMatch(finite.text, /no finite limit reported/);
  assert.match(finite.text, /Async capacity/);
  delete fleet.topLevelAsyncCapacity;
  assert.doesNotMatch(parts(overview(controller.state, () => {}, "")).text, /Async capacity/);
});
test("panel untrusted output stays in escaped Lit value slots, never markup", () => {
  const malicious = '<img src=x onerror="alert(1)"><script>evil()</script>';
  const node: AsyncNode = {
    id: malicious,
    model: malicious,
    label: malicious,
    kind: "subagent",
    state: "running",
    activity: { text: malicious },
  };
  const result = parts(runTree([node], () => {}));
  assert.ok(result.text.includes(malicious));
  assert.ok(!result.markup.includes(malicious));
  assert.ok(!result.markup.includes("unsafeHTML"));
});
test("panel template has accessible labels, errors, receipts and full operation surfaces", () => {
  const panel = new TestPanel();
  panel.controller.state.error = "missing extension";
  panel.controller.state.status = snapshot() as StatusData;
  (panel as unknown as { selected: string }).selected = graphEntries(panel.controller.state.status.asyncSnapshot!.runs)[0]!.key;
  const result = parts(panel.template());
  for (const expected of [
    "Subagents supervision",
    'role="alert"',
    'role="status"',
    "Transcript lines",
    "Message to run",
    "Launch async work",
    "Schedules",
    "Calculate cost",
    "Prepare supervisor-help message",
    "manual send",
    "Request receipts",
    "Capabilities & boundaries",
    "Stop entire run",
    "Interrupt run",
  ])
    assert.ok((result.markup + result.text).includes(expected), expected);
  assert.match(result.markup, /<label\s*>.*<input/s);
  assert.match(result.markup, /<label\s*>.*<textarea/s);
  assert.ok(
    !result.markup.includes('role="tree"'),
    "native list semantics instead of incomplete tree keyboard widget",
  );
});
test("run controls require a current root and use its escaped label", () => {
  const panel = new TestPanel();
  assert.ok(!parts(panel.template()).markup.includes('id="control-heading"'));
  panel.controller.state.status = snapshot() as StatusData;
  const root = panel.controller.state.status.asyncSnapshot!.runs[0]!;
  root.label = "<img src=x> Example run";
  (panel as unknown as { selected: string }).selected = graphEntries([root])[0]!.key;
  const content = parts(panel.template());
  assert.match(content.text, /Details & controls/);
  assert.ok(content.text.includes(root.label));
  assert.ok(!content.markup.includes(root.label));
  panel.controller.state.status.asyncSnapshot!.runs = [];
  assert.ok(!parts(panel.template()).markup.includes('id="control-heading"'));
});
test("panel timestamps are explicit cached snapshots and unresolved cost is a lower bound", () => {
  const panel = new TestPanel();
  assert.equal(
    snapshotNotice(panel.controller.state),
    "No status snapshot yet.",
  );
  panel.controller.state.observedAt = 1700000000000;
  panel.controller.state.stale = true;
  assert.match(snapshotNotice(panel.controller.state), /Stale cached snapshot/);
  const usage = {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    cost: 1,
    turns: 1,
  };
  panel.controller.state.cost = {
    version: 1,
    parent: usage,
    children: [],
    childTotal: usage,
    total: usage,
    unresolvedAsyncChildren: 2,
  };
  panel.controller.state.costAt = 1700000000000;
  const result = parts(panel.template());
  assert.match(result.text, /lower bound; 2 unresolved/);
  assert.match(result.text, /Cached calculation at/);
});
test("A5–A7: readable snapshot timing, activity and progress never require JSON or wall-clock time", () => {
  const node: AsyncNode = {
    id: "step:0", kind: "step", label: "worker", state: "running", startedAt: 0,
    updatedAt: 55_000, progressText: "tests pass\nnext: review", progressUpdatedAt: 50_000,
    activity: { state: "waiting-for-supervisor", currentTool: "read", currentToolStartedAt: 58_000,
      lastActivityAt: 59_000, toolCount: 0, turnCount: 3 },
  };
  const content = parts(nodeFacts(node, 60_000));
  for (const value of ["Elapsed", "1m 0s", "Report age at snapshot", "10s", "read", "2s", "1s", "Turns", "Tools", "waiting-for-supervisor", "tests pass\nnext: review"])
    assert.ok(content.text.includes(value), value);
  assert.doesNotMatch(content.markup, /<pre|<details/);
  assert.match(content.markup, /<dt>|<dd>/);
  assert.equal(durationBetween(undefined, 60_000), "unknown");
  assert.equal(durationBetween(0, 0), "0s");
  assert.equal(durationBetween(61_000, 60_000), "unknown");
  assert.equal(durationBetween(-1, 60_000), "unknown");
  assert.equal(durationBetween(0.5, 60_000), "unknown");
  assert.equal(durationBetween(0, Infinity), "unknown");
  assert.equal(durationBetween(0, 3_661_000), "1h 1m");
  delete node.progressUpdatedAt;
  assert.match(parts(nodeFacts(node, 60_000)).text, /Report age at snapshotunknown/);
  node.state = "complete";
  assert.match(parts(nodeFacts(node, 60_000)).text, /Elapsedunknown/);
  node.endedAt = 59_000;
  assert.match(parts(nodeFacts(node, 60_000)).text, /Elapsed59s/);
  delete node.progressText;
  assert.doesNotMatch(parts(nodeFacts(node, 60_000)).text, /Progress report/);
});

test("A9/A13: fleet metrics stay unlinked and host monitors have readable escaped facts", () => {
  const metrics = parts(fleetMetrics({ input: 10, output: 20, total: 30, window: 0, windowPeak: 99 }));
  for (const label of ["Input", "Output", "Cumulative spent tokens", "Current context window", "Peak context window", "99"])
    assert.ok(metrics.text.includes(label), label);
  assert.doesNotMatch(metrics.text, /%/);
  assert.match(parts(fleetMetrics({ input: 0, output: 0, total: 0 })).text, /Current context windowunknown/);
  const monitor = parts(nodeFacts({ id: "host:check", label: "check", kind: "host-step", state: "failed",
    hostStep: { provider: "runner", role: "review", state: "held", verdict: "fail", reasonCode: "timeout", detail: graphHostile, stale: true },
  }));
  for (const fact of ["Host monitor (not an agent)", "Provider", "runner", "review", "held", "fail", "timeout", "Reported stale", graphHostile])
    assert.ok(monitor.text.includes(fact), fact);
  assert.ok(!monitor.markup.includes(graphHostile));
  assert.doesNotMatch(monitor.markup, /<button|<pre/);
  const controller = new SubagentsController(() => {});
  controller.state.status = graphSnapshot();
  assert.match(parts(overview(controller.state, () => {}, "")).text, /not additional unique agents/);
});

test("C5: usage table preserves all supplied fields, identities, precision and regional formats", () => {
  const usage = { input: 1234, output: 23, cacheRead: 4567, cacheWrite: 89, turns: 0, cost: 0.000012345 };
  const cost = { version: 1 as const, parent: usage, children: [{ label: graphHostile, usage }], childTotal: usage, total: usage, unresolvedAsyncChildren: 0 };
  const fixture = localizationFixture();
  fixture.change("en", "de-DE", {});
  const content = parts(usageTable(cost, createContent(fixture.service)));
  for (const label of ["Parent", "Child total", "Total", "Input", "Output", "Cache read", "Cache write", "Turns", "Cost (USD)", "identity unavailable", "1.234", "4.567", "0,000012345", "zero unresolved"])
    assert.ok(content.text.includes(label), label);
  assert.equal((content.markup.match(/scope="row"/g) ?? []).length, 4);
  assert.match(content.markup, /<caption>/);
  assert.match(content.markup, /tabindex="0"/);
  assert.ok(!content.markup.includes(graphHostile));
  assert.ok(content.text.includes(graphHostile));
});

test("panel rendering does not perform peer IO", async () => {
  let calls = 0;
  const panel = new TestPanel();
  panel.context = panelContext(async () => {
    calls++;
    return null;
  });
  for (let n = 0; n < 100; n++) panel.template();
  await tick();
  assert.equal(calls, 0);
});
test("browser plugin API5 local panel and runtime-qualified action; contribution render pure", async () => {
  const original = globalThis.customElements;
  let registered = 0;
  Object.defineProperty(globalThis, "customElements", {
    configurable: true,
    value: {
      get: () => undefined,
      define: () => {
        registered++;
      },
    },
  });
  try {
    const activation = plugin.activate({
      html,
      runtimePluginId: "remote-runtime",
      lifetimeSignal: new AbortController().signal,
    } as Parameters<typeof plugin.activate>[0]);
    assert.equal(plugin.apiVersion, 5);
    assert.equal(registered, 2);
    assert.equal(activation.contributions.workspacePanels[0]!.id, "subagents");
    let selected = "";
    activation.contributions.actions[0]!.run({
      selectWorkspaceTool: (id: string) => {
        selected = id;
      },
    } as Parameters<(typeof activation.contributions.actions)[0]["run"]>[0]);
    assert.equal(selected, "remote-runtime:subagents");
    let calls = 0;
    const context = panelContext(async () => {
      calls++;
      return null;
    });
    for (let n = 0; n < 10; n++)
      activation.contributions.workspacePanels[0]!.render(context);
    assert.equal(calls, 0);
  } finally {
    Object.defineProperty(globalThis, "customElements", {
      configurable: true,
      value: original,
    });
  }
});
test("supervisor helper stages ordinary chip in exact parent and navigates, never sends or answers", async () => {
  const context = panelContext();
  const calls: unknown[] = [];
  context.prompt.setChip = (chip) => {
    calls.push(chip);
  };
  context.navigate = async (destination) => {
    calls.push(destination);
  };
  const result = await stageParentMessage(context, "supervisor");
  assert.match(result, /manually Send/);
  assert.match(result, /no request has been answered/);
  assert.equal(calls.length, 2);
  assert.match((calls[0] as { text: string }).text, /subagent_supervisor/);
  assert.deepEqual(calls[1], {
    machineId: "machine-1",
    projectId: "project-1",
    workspaceId: "workspace-1",
    sessionId: "session-1",
    view: "chat",
  });
});
test("supervisor then admin withdraws only its own chip and warns about all remaining chips", async () => {
  const context = panelContext();
  const chips = new Map<string, unknown>([
    ["other-plugin", { text: "preserve" }],
  ]);
  let draft = "";
  context.prompt.setChip = (chip) => {
    chips.set(chip.id, chip);
  };
  context.prompt.removeChip = (id) => {
    chips.delete(id);
  };
  context.prompt.getText = () => draft;
  context.prompt.insertText = (text) => {
    draft += text;
  };
  await stageParentMessage(context, "supervisor");
  assert.ok(chips.has("supervisor-help"));
  const notice = await stageParentMessage(context, "admin");
  assert.equal(chips.has("supervisor-help"), false);
  assert.equal(chips.has("other-plugin"), true);
  assert.equal(draft, "/subagents");
  assert.match(notice, /Remove ALL composer chips/);
  assert.match(notice, /ordinary prompt, not a command/);
});
test("composer fallback preserves existing draft and reports unmounted editor honestly", async () => {
  const context = panelContext();
  let inserted = false;
  context.prompt.getText = () => "Existing draft";
  context.prompt.insertText = () => {
    inserted = true;
  };
  await assert.rejects(
    stageParentMessage(context, "admin"),
    /Existing draft preserved/,
  );
  assert.equal(inserted, false);
  context.prompt.getText = () => "";
  assert.match(
    await stageParentMessage(context, "supervisor"),
    /Composer was unmounted/,
  );
  let draft = "";
  context.prompt.getText = () => draft;
  context.prompt.insertText = (text) => {
    draft = text;
  };
  assert.match(await stageParentMessage(context, "admin"), /manually Send/);
  assert.equal(draft, "/subagents");
});
test("supervisor helper rejects stale composer context and archived selection", async () => {
  const context = panelContext();
  let calls = 0;
  context.prompt.setChip = () => {
    calls++;
  };
  await assert.rejects(
    stageParentMessage(context, "supervisor", {
      ...context.state,
      selectedSession: { ...context.state!.selectedSession!, id: "session-2" },
    }),
    /matching composer/,
  );
  context.state!.selectedSession!.archived = true;
  await assert.rejects(
    stageParentMessage(context, "supervisor"),
    /ready exact/,
  );
  assert.equal(calls, 0);
});

function templates(value: unknown): TemplateResult[] {
  const expanded = directiveValue(value);
  if (expanded !== value) return templates(expanded);
  if (Array.isArray(value)) return value.flatMap(templates);
  if (value && typeof value === "object" && "strings" in value && "values" in value) {
    const template = value as TemplateResult;
    return [template, ...templates(template.values)];
  }
  return [];
}

test("graph fixtures are parser-valid, and a large accepted forest loses no nodes", () => {
  const data = graphSnapshot();
  const identity = { requestId: "graph-fixture", method: "status" as const, sessionId: "session-1" };
  const validate = () => parseRpcReply({ version: 1, requestId: identity.requestId, method: identity.method, success: true, data }, identity);
  assert.doesNotThrow(validate);
  data.asyncSnapshot!.runs = Array.from({ length: 20 }, (_, root) => ({
    id: `root-${root}`, label: "Root", kind: "workflow", state: "running",
    children: Array.from({ length: 8 }, (_, child) => ({
      id: String(child), label: "Child", kind: "step", state: "complete",
    })),
  }));
  assert.doesNotThrow(validate);
  const content = parts(runTree(data.asyncSnapshot!.runs, () => {}));
  assert.equal((content.markup.match(/<article/g) ?? []).length, 180);
  assert.equal((content.markup.match(/<button/g) ?? []).length, 180);
});

test("graph forest preserves ancestry and selects occurrence keys, never inferred targets", () => {
  const data = graphSnapshot();
  const roots = data.asyncSnapshot!.runs;
  const selected: string[] = [];
  const tree = runTree(roots, (id) => selected.push(id), graphEntries(roots).find((entry) => entry.node.id === "run-2")!.key);
  const content = parts(tree);
  assert.equal(descendantCount(roots[0]!), 10);
  assert.equal((content.markup.match(/<article/g) ?? []).length, 16);
  assert.equal((content.markup.match(/<button/g) ?? []).length, 16);
  assert.equal((content.markup.match(/<ul/g) ?? []).length, 6);
  assert.ok(content.text.includes("grandchild"));
  assert.ok(content.text.includes("paused"));
  assert.ok(content.text.includes("Selected"));
  assert.doesNotMatch(content.markup, /role="(?:tree|treeitem)"|<canvas|unsafeHTML/);
  assert.equal(new Set(graphOccurrences(roots).map((entry) => entry.key)).size, roots.length);
  assert.equal(new Set(graphOccurrences(roots[0]!.children!).map((entry) => entry.key)).size, 8);
  for (const template of templates(tree)) {
    template.strings.forEach((text, index) => {
      if (text.includes("@click=")) (template.values[index] as () => void)();
    });
  }
  assert.deepEqual(selected, graphEntries(roots).map((entry) => entry.key));
  assert.ok(!selected.includes("step:99"));
  assert.ok(!selected.includes("grandchild"));
  const keys = graphOccurrences(roots).map((entry) => entry.key);
  assert.equal(graphOccurrences([...roots].reverse()).find((entry) => entry.node.id === "run-2")!.key, keys[1]);
});

test("A2/B1: nested and duplicate occurrences are readable but never control targets", () => {
  const panel = new TestPanel();
  panel.controller.state.status = graphSnapshot();
  const roots = panel.controller.state.status.asyncSnapshot!.runs;
  const entries = graphEntries(roots);
  assert.equal(new Set(entries.map((entry) => entry.key)).size, entries.length);
  assert.deepEqual(entries.filter((entry) => entry.controlId).map((entry) => entry.controlId), ["run-1", "run-2"]);
  for (const entry of entries.filter((entry) => !entry.controlId)) {
    (panel as unknown as { selected: string }).selected = entry.key;
    const content = parts(panel.template());
    assert.match(content.text, /Read-only snapshot/);
    assert.ok(content.text.includes(entry.node.label));
    assert.ok(!content.text.includes("Load transcript"));
    assert.ok(!content.text.includes("Stop entire run"));
  }
  const before = graphEntries(roots).find((entry) => entry.node.id === "grandchild")!;
  roots.reverse();
  assert.equal(graphEntries(roots).find((entry) => entry.node.id === "grandchild")!.key, before.key);
});

test("A2: filters match reported facts and keep ancestry without fabricating history", () => {
  const roots = graphSnapshot().asyncSnapshot!.runs;
  const query = { query: "grandchild", state: "all" as const };
  assert.equal(matchesRun(roots[0]!, query), false);
  assert.equal(branchMatches(roots[0]!, query), true);
  assert.equal(branchMatches(roots[1]!, query), false);
  assert.equal(matchesRun({ ...roots[0]!, state: "running" }, { query: "", state: "active" }), true);
  assert.equal(matchesRun({ ...roots[0]!, state: "failed" }, { query: "", state: "attention" }), true);
  assert.equal(matchesRun({ ...roots[0]!, state: "complete", activity: undefined }, { query: "", state: "attention" }), false);
  assert.equal(matchesRun({ ...roots[0]!, state: "complete" }, { query: "", state: "recent" }), true);
});

test("A2/A10 R1: released attention activity matches and preserves running ancestry", () => {
  const filter = { query: "", state: "attention" as const };
  const child: AsyncNode = {
    id: "step:attention", kind: "step", label: "Needs review", state: "running",
    activity: { state: "needs_attention" },
  };
  const root: AsyncNode = {
    id: "workflow", kind: "workflow", label: "Running workflow", state: "running",
    activity: { state: "active_long_running" }, children: [child],
  };
  assert.equal(matchesRun(child, filter), true);
  assert.equal(matchesRun(root, filter), false, "ordinary long-running activity is not attention");
  assert.equal(branchMatches(root, filter), true, "retain non-matching ancestry");
  assert.equal(branchMatches(root, { ...filter, query: "Needs review" }), true);
  assert.equal(branchMatches(root, { ...filter, query: "absent" }), false);
  const ordinary = { ...child, activity: { state: "active_long_running" } };
  assert.equal(matchesRun(ordinary, filter), false);
  assert.equal(branchMatches({ ...root, children: [ordinary] }, filter), false);
});

test("graphOccurrences resets ambiguous duplicate presentations on reorder or content changes only", () => {
  const roots = graphSnapshot().asyncSnapshot!.runs;
  const keys = (nodes: AsyncNode[]) => graphOccurrences(nodes).map((entry) => entry.key);
  const original = keys(roots);
  assert.deepEqual(keys(structuredClone(roots)), original, "unchanged polls retain keys");
  assert.equal(original[0], JSON.stringify(["run-1", 0]), "unique ID key is unchanged");
  const reversed = graphOccurrences([...roots].reverse());
  for (const entry of reversed) {
    const previous = original[roots.findIndex((node) => node === entry.node)];
    if (entry.node.id === "duplicate") {
      assert.ok(!original.includes(entry.key), "no duplicate DOM is reused after reorder");
    } else assert.equal(entry.key, previous);
  }
  for (const change of [
    (node: AsyncNode) => { node.activity!.text = "updated activity"; },
    (node: AsyncNode) => { node.children![0]!.label = "updated branch"; },
  ]) {
    const changed = structuredClone(roots);
    change(changed[2]!);
    const updated = keys(changed);
    assert.deepEqual(updated.slice(0, 2), original.slice(0, 2));
    assert.ok(updated.slice(2).every((key) => !original.includes(key)), "reset whole ambiguous group");
  }
  const unique = structuredClone(roots[0]!);
  unique.activity!.turnCount = 4;
  unique.children!.reverse();
  assert.equal(keys([unique])[0], original[0], "unique content changes do not remount");
  const identical = [roots[2]!, structuredClone(roots[2]!)];
  assert.equal(new Set(keys(identical)).size, 2, "identical duplicate occurrences still have distinct keys");
});

test("graph disclosure counts all nodes, defaults closed above eight and keeps warnings outside", () => {
  const controller = new SubagentsController(() => {});
  controller.state.status = graphSnapshot();
  const content = parts(overview(controller.state, () => {}, ""));
  assert.match(content.markup, /aria-describedby="graph-description"/);
  assert.match(content.text, /not execution order/);
  assert.match(content.text, /Fleet entries have no reported run relationship/);
  assert.match(content.text, /fleet entries omitted/);
  assert.match(content.text, /Bounded snapshot/);
  assert.ok(content.text.includes("byte limit exceeded"));
  assert.ok(content.text.includes("10"));
  assert.ok(content.text.includes(graphHostile));
  assert.ok(!content.markup.includes(graphHostile));
  assert.ok(content.text.includes("shared-model"));
  assert.ok(content.text.includes("reviewer"));
  assert.ok(content.text.includes("high"));
  assert.match(content.text, /Host step details/);
  for (const count of [8, 9]) {
    const root: AsyncNode = {
      id: "root", label: "root", kind: "workflow", state: "running",
      children: [{ id: "child", label: "child", kind: "step", state: "running",
        children: Array.from({ length: count - 1 }, (_, i) => ({
          id: String(i), label: String(i), kind: "step", state: "complete",
        })),
      }],
    };
    const disclosure = templates(runTree([root], () => {})).find((template) => template.strings[0]!.includes('class="branch-disclosure"'))!;
    assert.equal(directiveValue(disclosure.values[0]), count <= 8);
    assert.match(String(disclosure.values[1]), new RegExp(`^${count} reported descendants$`));
    assert.equal((parts(runTree([root], () => {})).markup.match(/<article/g) ?? []).length, count + 1);
  }
});

test("graph preserves unknown versus empty projections, fallbacks and warning-free present snapshots", () => {
  const controller = new SubagentsController(() => {});
  const unavailable = parts(overview(controller.state, () => {}, ""));
  assert.doesNotMatch(unavailable.text, /No async runs in this snapshot/);
  controller.state.status = snapshot() as StatusData;
  let content = parts(overview(controller.state, () => {}, ""));
  assert.ok(content.text.includes("model unavailable"));
  assert.ok(content.text.includes("effort unavailable"));
  assert.ok(content.text.includes("No goal provided"));
  controller.state.status.fleet!.entries = [];
  controller.state.status.fleet!.omitted = 0;
  controller.state.status.asyncSnapshot!.runs = [];
  controller.state.status.asyncSnapshot!.omitted = { runs: 0, children: 0, byteLimitExceeded: false };
  content = parts(overview(controller.state, () => {}, ""));
  assert.match(content.text, /No visible fleet entries/);
  assert.match(content.text, /No async runs in this snapshot/);
  assert.doesNotMatch(content.text, /projection unavailable|Bounded snapshot|fleet entries omitted/);
});
