import type { WorkspacePanelContext } from "@jmfederico/pi-web/plugin-api";
import {
  MANAGEMENT_ACTIONS,
  RPC_METHODS,
  type RpcInput,
} from "../src/protocol.ts";
import type { Clock } from "../src/browser/controller.ts";
export const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
export class FakeClock implements Clock {
  value = 1700000000000;
  next = 0;
  timers = new Map<number, { at: number; callback: () => void }>();
  now = (): number => this.value;
  set = (callback: () => void, ms: number): number => {
    const id = ++this.next;
    this.timers.set(id, { at: this.value + ms, callback });
    return id;
  };
  clear = (id: unknown): void => {
    this.timers.delete(id as number);
  };
  async advance(ms: number): Promise<void> {
    const end = this.value + ms;
    while (true) {
      const due = [...this.timers.entries()]
        .filter(([, timer]) => timer.at <= end)
        .sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      this.value = due[1].at;
      this.timers.delete(due[0]);
      due[1].callback();
      await tick();
    }
    this.value = end;
    await tick();
  }
}
export const usage = {
  input: 1,
  output: 2,
  cacheRead: 0,
  cacheWrite: 0,
  cost: 0.1,
  turns: 1,
};
export const snapshot = (active = false) => ({
  text: "status summary",
  fleet: {
    version: 1,
    entries: [
      {
        key: "opaque-not-a-run",
        agent: "worker",
        startedAt: 1,
        tokens: { input: 1, output: 2, total: 3 },
      },
    ],
    totalActive: active ? 1 : 0,
    omitted: 2,
  },
  asyncSnapshot: {
    kind: "pi-subagents.async-status-snapshot",
    version: 1,
    generatedAt: 1700000000000,
    caps: {
      maxRuns: 20,
      maxChildrenPerNode: 8,
      maxDepth: 3,
      maxStringLength: 160,
      maxSerializedBytes: 32768,
    },
    omitted: { runs: 1, children: 2, byteLimitExceeded: true },
    runs: [
      {
        id: "run-1",
        kind: "workflow",
        label: "Review",
        state: active ? "running" : "complete",
        children: [
          { id: "step:99", kind: "step", label: "Child", state: "complete" },
        ],
      },
    ],
  },
});
export function reply(input: RpcInput, data?: unknown): unknown {
  data ??=
    input.method === "ping"
      ? {
          version: 1,
          methods: [...RPC_METHODS],
          capabilities: {
            asyncSpawn: true,
            stop: true,
            resume: true,
            interrupt: true,
            nonRecoveringSteer: true,
            managementActions: [...MANAGEMENT_ACTIONS],
          },
          events: {},
          session: { sessionId: input.sessionId },
        }
      : input.method === "status"
        ? snapshot()
        : input.method === "stop"
          ? {
              runId: "run-1",
              previousState: "running",
              state: "stopping",
              message: "Stop accepted",
            }
          : input.method === "cost"
            ? {
                version: 1,
                parent: usage,
                children: [],
                childTotal: usage,
                total: usage,
                unresolvedAsyncChildren: 2,
              }
            : { text: "Accepted" };
  return {
    version: 1,
    requestId: input.requestId,
    method: input.method,
    success: true,
    data,
  };
}
export function panelContext(
  request: (input: RpcInput, signal: AbortSignal) => Promise<unknown> = async (
    input,
  ) => reply(input),
): WorkspacePanelContext {
  const machine = { id: "machine-1", name: "Machine", kind: "local" };
  const workspace = {
    id: "workspace-1",
    projectId: "project-1",
    path: "/workspace",
    label: "Workspace",
    isMain: true,
  };
  return {
    machine,
    workspace,
    state: {
      selectedMachine: machine,
      selectedProject: { id: "project-1", name: "Project", path: "/project" },
      selectedWorkspace: workspace,
      selectedSession: {
        id: "session-1",
        pending: false,
        archived: false,
        cwd: "/workspace",
      },
    },
    peer: {
      request: async (
        _operation: string,
        value: unknown,
        options: { signal: AbortSignal },
      ) => request(value as RpcInput, options.signal),
    },
    host: { requestRender() {} },
    prompt: { getText: () => "", getSelection: () => null, insertText() {} },
    navigate: async () => {},
    files: {},
    terminal: {},
  } as unknown as WorkspacePanelContext;
}
export function deferred<T>(): {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(error: unknown): void;
} {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
