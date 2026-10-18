import { render } from "../../node_modules/lit/index.js";
import plugin from "../../dist/browser/index.js";
import {
  panelContext,
  reply,
  snapshot,
  graphSnapshot,
} from "../../test/browser-fixtures.ts";
const calls: any[] = [];
let listener: any;
let fail = false;
let uncertain = false;
let status = snapshot(true) as ReturnType<typeof graphSnapshot>;
const context = panelContext(async (input) => {
  calls.push(input);
  if (fail) throw new Error("fixture disconnected");
  if (uncertain && input.method === "spawn")
    return {
      version: 1,
      kind: "relay-error",
      requestId: input.requestId,
      code: "timeout",
      outcome: "unknown",
      message: "Fixture uncertain launch; do not repeat",
    };
  return reply(
    input,
    input.method === "status"
      ? {
          ...status,
          text: '<img src=x onerror="window.evil=true"> literal transcript',
        }
      : undefined,
  );
});
const chips: any[] = [];
const navigation: any[] = [];
context.prompt.setChip = (chip) => chips.push(chip);
context.navigate = async (dest) => {
  navigation.push(dest);
};
const lifetime = new AbortController();
const container = document.createElement("div");
document.body.append(container);
const result = plugin.activate({
  apiVersion: 4,
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
render(result.contributions.workspacePanels![0]!.render(context), container);
Object.assign(window, {
  fixture: {
    actions: result.contributions.actions!.map((action) => action.title),
    calls,
    chips,
    navigation,
    context,
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
    removeRoot(id: string) {
      status.asyncSnapshot!.runs = status.asyncSnapshot!.runs.filter(
        (root) => root.id !== id,
      );
    },
    setFailure(value: boolean) {
      fail = value;
    },
    setUncertain(value: boolean) {
      uncertain = value;
    },
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
