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
import { descendantCount, graphOccurrences } from "../src/browser/graph.ts";
import { repeat } from "lit/directives/repeat.js";
import { keyed } from "lit/directives/keyed.js";
import { guard } from "lit/directives/guard.js";

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

test("panel overview reports omitted/unavailable projections; only top-level IDs selectable", () => {
  const controller = new SubagentsController(() => {});
  const empty = parts(overview(controller.state, () => {}, ""));
  assert.match(empty.markup, /Fleet projection unavailable/);
  assert.match(empty.markup, /Async run projection unavailable/);
  controller.state.status = snapshot() as StatusData;
  const content = parts(overview(controller.state, () => {}, "run-1"));
  assert.match(content.markup, /fleet entries omitted/);
  assert.match(content.markup, /Bounded snapshot/);
  const tree = parts(
    runTree(controller.state.status.asyncSnapshot!.runs, () => {}, "run-1"),
  );
  assert.equal((tree.markup.match(/<button/g) ?? []).length, 1);
  assert.ok(!tree.text.includes("opaque-not-a-run"));
});
test("panel does not present zero or missing capacity as a finite zero-slot limit", () => {
  const controller = new SubagentsController(() => {});
  controller.state.status = snapshot(true) as StatusData;
  const fleet = controller.state.status.fleet!;
  fleet.topLevelAsyncCapacity = { used: 0, limit: 0 };
  assert.match(parts(overview(controller.state, () => {}, "")).markup, /no finite limit reported/);
  fleet.topLevelAsyncCapacity = { used: 2, limit: 4 };
  const finite = parts(overview(controller.state, () => {}, ""));
  assert.doesNotMatch(finite.markup, /no finite limit reported/);
  assert.match(finite.markup, /Async capacity/);
  delete fleet.topLevelAsyncCapacity;
  assert.doesNotMatch(parts(overview(controller.state, () => {}, "")).markup, /Async capacity/);
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
    "Stop run",
    "Interrupt run",
  ])
    assert.ok(result.markup.includes(expected), expected);
  assert.match(result.markup, /<label\s*>.*<input/s);
  assert.match(result.markup, /<label\s*>.*<textarea/s);
  assert.ok(
    !result.markup.includes('role="tree"'),
    "native list semantics instead of incomplete tree keyboard widget",
  );
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
  assert.match(result.markup, /Cached calculation at/);
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
test("browser plugin API4 local panel and runtime-qualified action; contribution render pure", async () => {
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
    assert.equal(plugin.apiVersion, 4);
    assert.equal(registered, 1);
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
  assert.equal((content.markup.match(/<button/g) ?? []).length, 20);
});

test("graph forest preserves ancestry, duplicate occurrences and root-only callback targets", () => {
  const data = graphSnapshot();
  const roots = data.asyncSnapshot!.runs;
  const selected: string[] = [];
  const tree = runTree(roots, (id) => selected.push(id), "run-2");
  const content = parts(tree);
  assert.equal(descendantCount(roots[0]!), 10);
  assert.equal((content.markup.match(/<article/g) ?? []).length, 14);
  assert.equal((content.markup.match(/<button/g) ?? []).length, roots.length);
  assert.equal((content.markup.match(/<ul/g) ?? []).length, 4);
  assert.ok(content.text.includes("grandchild"));
  assert.ok(content.text.includes("paused"));
  assert.ok(content.markup.includes("Selected"));
  assert.doesNotMatch(content.markup, /role="(?:tree|treeitem)"|<canvas|unsafeHTML/);
  assert.equal(new Set(graphOccurrences(roots).map((entry) => entry.key)).size, roots.length);
  assert.equal(new Set(graphOccurrences(roots[0]!.children!).map((entry) => entry.key)).size, 8);
  for (const template of templates(tree)) {
    template.strings.forEach((text, index) => {
      if (text.includes("@click=")) (template.values[index] as () => void)();
    });
  }
  assert.deepEqual(selected, roots.map((root) => root.id));
  assert.ok(!selected.includes("step:99"));
  assert.ok(!selected.includes("grandchild"));
  const keys = graphOccurrences(roots).map((entry) => entry.key);
  assert.equal(graphOccurrences([...roots].reverse()).find((entry) => entry.node.id === "run-2")!.key, keys[1]);
});

test("graph disclosure counts all nodes, defaults closed above eight and keeps warnings outside", () => {
  const controller = new SubagentsController(() => {});
  controller.state.status = graphSnapshot();
  const content = parts(overview(controller.state, () => {}, ""));
  assert.match(content.markup, /aria-describedby="graph-description"/);
  assert.match(content.markup, /not execution order/);
  assert.match(content.markup, /relationship unavailable/);
  assert.match(content.markup, /fleet entries omitted/);
  assert.match(content.markup, /Bounded snapshot/);
  assert.ok(content.text.includes("byte limit exceeded"));
  assert.ok(content.text.includes("10"));
  assert.ok(content.text.includes(graphHostile));
  assert.ok(!content.markup.includes(graphHostile));
  assert.ok(content.text.includes("shared-model"));
  assert.ok(content.text.includes("reviewer"));
  assert.ok(content.text.includes("high"));
  assert.match(content.markup, /Host step details/);
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
    assert.equal(disclosure.values[1], count);
    assert.equal((parts(runTree([root], () => {})).markup.match(/<article/g) ?? []).length, count + 1);
  }
});

test("graph preserves unknown versus empty projections, fallbacks and warning-free present snapshots", () => {
  const controller = new SubagentsController(() => {});
  const unavailable = parts(overview(controller.state, () => {}, ""));
  assert.doesNotMatch(unavailable.markup, /No async runs in this snapshot/);
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
  assert.match(content.markup, /No visible fleet entries/);
  assert.match(content.markup, /No async runs in this snapshot/);
  assert.doesNotMatch(content.markup, /projection unavailable|Bounded snapshot|fleet entries omitted/);
});
