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
import type { AsyncNode, StatusData } from "../src/protocol.ts";
import { panelContext, snapshot, tick } from "./browser-fixtures.ts";

// Inspect Lit's template contract without claiming DOM/SSR/browser execution.
function parts(value: unknown): { markup: string; text: string } {
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
    id: "run-1",
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
