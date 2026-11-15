import { html, render } from "../../node_modules/lit/index.js";
import { toolFixture } from "../transcript-fixtures.ts";
import { noticeFixture, noticeFixtures } from "../notice-fixtures.ts";
import plugin from "../../dist/browser/index.js";
import {
  panelContext,
  reply,
  snapshot,
  graphSnapshot,
  usage,
} from "../../test/browser-fixtures.ts";
import { localizationFixture, stylesheetFixture } from "../host-fixtures.ts";
// Retain the real observer while allowing deterministic batched-transition tests.
const NativeIntersectionObserver = globalThis.IntersectionObserver;
let observed: { callback: IntersectionObserverCallback; observer: IntersectionObserver; target: Element } | undefined;
globalThis.IntersectionObserver = class extends NativeIntersectionObserver {
  constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
    super(callback, options);
    const observe = this.observe.bind(this);
    this.observe = (target) => {
      observed = { callback, observer: this, target };
      observe(target);
    };
  }
};
const localization = localizationFixture();
const styles = stylesheetFixture();
const calls: any[] = [];
let listener: any;
let fail = false;
let uncertain = false;
let rejectNext = "";
let output: string | undefined;
let schedules = [
  { id: "schedule-1", name: '<img src=x onerror="window.evil=true"> Daily checks', paused: false, quiet: true, lastRunId: "read-only-ref" },
  { id: "schedule-2", name: "Weekly review", paused: true },
];
let status = snapshot(true) as ReturnType<typeof graphSnapshot>;
const context = panelContext(async (input) => {
  calls.push(input);
  if (fail) throw new Error("fixture disconnected");
  if (input.method === rejectNext) {
    rejectNext = "";
    return { version: 1, requestId: input.requestId, method: input.method, success: false,
      error: { code: "invalid_state", message: "Fixture operation rejected" } };
  }
  if (uncertain && input.method === "spawn")
    return {
      version: 1,
      kind: "relay-error",
      requestId: input.requestId,
      code: "timeout",
      outcome: "unknown",
      message: "Fixture uncertain launch; do not repeat",
    };
  if (input.method === "cost") return reply(input, {
    version: 1, parent: { ...usage, cost: 0.0728648 }, children: [],
    childTotal: { ...usage, cost: 0.0876352 }, total: { ...usage, cost: 0.0728648 + 0.0876352 },
    unresolvedAsyncChildren: 0,
  });
  if (input.method === "manage") return reply(input, { text: `Original ${input.params?.action} text`, details: { schedules:
    input.params?.action === "schedule.history" ? { runs: [
      { id: "history-1", scheduleId: input.params.id, state: "failed", error: '<img src=x onerror="window.evil=true"> literal history error', asyncId: "read-only-ref" },
      { id: "unrelated-history", scheduleId: "not-selected", state: "complete" },
    ] } : { records: input.params?.action === "schedule.list" ? schedules : schedules.filter((record) => record.id === input.params?.id) },
  } });
  return reply(
    input,
    input.method === "status"
      ? {
          ...status,
          text: input.params?.id && output !== undefined ? output : '<img src=x onerror="window.evil=true"> literal transcript',
          ...(input.params?.id && output !== undefined ? { details: { workflow: {
            stopCause: "held", trace: [
              { operation: "host-check", key: "gate", phase: "acceptance", label: "Host acceptance check", state: "failed", durationMs: 0, reused: false },
              { operation: "spawn", key: "worker", phase: "implementation", agent: "worker", runId: "reported-reference", state: "complete", durationMs: 12345, reused: true },
            ],
          } } } : {}),
        }
      : undefined,
  );
});
const chips: any[] = [];
const navigation: any[] = [];
const removedChips: string[] = [];
let draft = "";
context.prompt.getText = () => draft;
context.prompt.insertText = (text) => { draft += text; };
context.prompt.removeChip = (id) => { removedChips.push(id); };
context.prompt.setChip = (chip) => chips.push(chip);
context.navigate = async (dest) => {
  navigation.push(dest);
};
const lifetime = new AbortController();
const container = document.createElement("div");
document.body.append(container);
const result = plugin.activate({
  apiVersion: 5,
  localization: localization.service,
  pluginId: "fixture",
  runtimePluginId: "fixture",
  signal: new AbortController().signal,
  lifetimeSignal: lifetime.signal,
  selection: {
    getSnapshot: () => context.state!,
    subscribe(fn) {
      listener = fn;
      return () => {
        listener = undefined;
      };
    },
  },
  html: null as any,
  svg: null as any,
});
result.start({ capabilities: { resolve: () => styles.service }, signal: lifetime.signal });
render(result.contributions.workspacePanels![0]!.render(context), container);
const transcriptContainer = document.createElement("div");
transcriptContainer.id = "transcript-fixture";
let transcriptSignal = new AbortController();
Object.assign(window, {
  fixture: {
    renderTool(kind: string, defaultView = false) {
      transcriptSignal.abort();
      transcriptSignal = new AbortController();
      if (!transcriptContainer.isConnected) document.body.append(transcriptContainer);
      const base = toolFixture(kind === "malformed" || kind === "unknown" ? "single" : kind);
      const input = { ...base, signal: transcriptSignal.signal, entry: { ...base.entry,
        ...(kind === "malformed" ? { details: { mode: "single", results: "bad" } } : {}),
        ...(kind === "unknown" ? { toolName: "renamed_wait" } : {}),
      } };
      const resolver = result.contributions.transcriptRenderers![0]!;
      if (resolver.target !== "tool") throw new Error("Expected tool resolver");
      const template = defaultView ? undefined : resolver.resolve(input.entry.toolName, () => undefined)?.render(input);
      render(html`<div aria-label="Fixture host frame"><p>Host-owned controls remain outside the body</p>${template ?? html`<p>Generic host fallback</p>`}</div>`, transcriptContainer);
    },
    noticeTypes: Object.keys(noticeFixtures),
    renderNotice(type: string, variant?: string, defaultView = false) {
      transcriptSignal.abort();
      transcriptSignal = new AbortController();
      if (!transcriptContainer.isConnected) document.body.append(transcriptContainer);
      const base = noticeFixture(type);
      const input = { ...base, signal: transcriptSignal.signal, entry: { ...base.entry,
        ...(variant === "malformed" ? { details: [] } : {}),
        ...(variant === "legacy" ? { details: undefined } : {}),
        ...(variant === "progress" || variant === "interview" ? { details: { ...noticeFixtures.subagent_supervisor_request,
          reason: variant === "progress" ? "progress_update" : "interview_request", expectsReply: variant !== "progress" } } : {}),
      } };
      const renderer = result.contributions.transcriptRenderers!.find((entry) => entry.target === "custom-message" && entry.customType === type);
      const template = defaultView || renderer?.target !== "custom-message" ? undefined : renderer.render(input);
      render(html`<div aria-label="Fixture host frame"><p>Host-owned controls remain outside the body</p>${template ?? html`<p>Generic host fallback</p>`}</div>`, transcriptContainer);
    },
    removeTool() { transcriptSignal.abort(); render(null, transcriptContainer); transcriptContainer.remove(); },
    actions: result.contributions.actions!.map((action) => action.title),
    calls,
    localization,
    styles,
    chips,
    navigation,
    removedChips,
    setDraft(value: string) { draft = value; },
    get draft() { return draft; },
    context,
    batchVisibility(visible: boolean) {
      if (!observed) throw new Error("Panel did not observe visibility");
      observed.callback([
        { target: observed.target, isIntersecting: !visible },
        { target: observed.target, isIntersecting: visible },
      ] as IntersectionObserverEntry[], observed.observer);
    },
    setGraph(mode: "graph" | "empty" | "unavailable") {
      status = mode === "unavailable" ? {} : graphSnapshot();
      if (mode === "empty") {
        status.fleet!.entries = [];
        status.asyncSnapshot!.runs = [];
      }
    },
    reorder() {
      status.asyncSnapshot!.runs.reverse();
    },
    setBranchDepth(deep: boolean) {
      const root = status.asyncSnapshot!.runs.find((node) => node.id === "run-1")!;
      root.children![0]!.children = deep
        ? graphSnapshot().asyncSnapshot!.runs[0]!.children![0]!.children
        : [];
    },
    duplicateRoot(id: string) {
      const root = status.asyncSnapshot!.runs.find((node) => node.id === id)!;
      status.asyncSnapshot!.runs.push({ ...root, label: `${root.label} duplicate` });
    },
    removeRoot(id: string) {
      status.asyncSnapshot!.runs = status.asyncSnapshot!.runs.filter(
        (root) => root.id !== id,
      );
    },
    setRootLabel(label: string) { status.asyncSnapshot!.runs.find((node) => node.id === "run-1")!.label = label; },
    setOutput(value: string | undefined) { output = value; },
    duplicateSchedule() { schedules.push({ ...schedules[0]! }); },
    removeSchedule(id: string) { schedules = schedules.filter((record) => record.id !== id); },
    setFailure(value: boolean) {
      fail = value;
    },
    setUncertain(value: boolean) {
      uncertain = value;
    },
    rejectNextOperation(method: string) { rejectNext = method; },
    switchSession(id: string) {
      context.state!.selectedSession = {
        ...context.state!.selectedSession!,
        id,
      };
      listener?.(context.state);
    },
    unmount() {
      container.remove();
    },
    dispose() {
      lifetime.abort();
    },
    get subscribed() {
      return !!listener;
    },
  },
});
