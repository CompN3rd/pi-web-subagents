import type {
  PiWebHostPiSessionConnection,
  PiWebHostPiSessionEventsV1,
  PiWebHostPiSessionSelection,
  ServerPluginPeerRequestContext,
} from "@jmfederico/pi-web/server-plugin-api";
import { RPC_METHODS, MANAGEMENT_ACTIONS, type RpcInput, type JsonValue } from "../../../src/protocol.ts";
import { RPC_REPLY_PREFIX } from "../../../src/server/rpc-client.ts";
export const pingData = {
  version: 1,
  methods: [...RPC_METHODS],
  capabilities: { managementActions: [...MANAGEMENT_ACTIONS], nonRecoveringSteer: true },
  events: { asyncComplete: "subagent:async:complete" },
  session: { sessionId: "session-1", sessionFile: "C:/private/session.jsonl", cwd: "C:/private" },
};
export const usage = { input: 1, output: 2, cacheRead: 0, cacheWrite: 0, cost: 0.1, turns: 1 };
export const dataFor = (method: string): unknown =>
  method === "ping"
    ? pingData
    : method === "stop"
      ? {
          runId: "run-1",
          asyncDir: "C:/private/run-1",
          previousState: "running",
          state: "stopping",
          message: "Stop requested",
        }
      : method === "cost"
        ? {
            version: 1,
            parent: usage,
            children: [{ label: "child", agent: "worker", runId: "run-1", sessionFile: "private", usage }],
            childTotal: usage,
            total: usage,
            unresolvedAsyncChildren: 1,
          }
        : { text: "ok", details: { mode: "management", results: [] } };
export class FakeBus implements PiWebHostPiSessionConnection {
  controller = new AbortController();
  signal = this.controller.signal;
  listeners = new Map<string, Set<(data: unknown) => void | Promise<void>>>();
  sent: RpcInput[] = [];
  closed = 0;
  respond: (input: RpcInput) => void = (input) => this.reply(input, dataFor(input.method));
  on(channel: string, fn: (data: unknown) => void | Promise<void>): () => void {
    let set = this.listeners.get(channel);
    if (!set) this.listeners.set(channel, (set = new Set()));
    set.add(fn);
    return () => {
      set!.delete(fn);
      if (!set!.size) this.listeners.delete(channel);
    };
  }
  emit(_channel: string, raw: unknown): void {
    const input = raw as RpcInput;
    this.sent.push(input);
    this.respond(input);
  }
  deliver(requestId: string, raw: unknown): void {
    for (const fn of this.listeners.get(`${RPC_REPLY_PREFIX}${requestId}`) ?? []) void fn(raw);
  }
  reply(input: RpcInput, data: unknown): void {
    this.deliver(input.requestId, {
      version: 1,
      requestId: input.requestId,
      method: input.method,
      success: true,
      data,
    });
  }
  close(): void {
    if (this.signal.aborted) return;
    this.closed++;
    this.controller.abort();
    this.listeners.clear();
  }
}
export function host(bus = new FakeBus()): {
  events: PiWebHostPiSessionEventsV1;
  selections: PiWebHostPiSessionSelection[];
  bus: FakeBus;
} {
  const selections: PiWebHostPiSessionSelection[] = [];
  return {
    bus,
    selections,
    events: {
      version: 1,
      async connect(selection) {
        selections.push(selection);
        return bus;
      },
    },
  };
}
export function input(method: RpcInput["method"] = "status", params?: object, requestId = "request-1"): RpcInput {
  return {
    version: 1,
    sessionId: "session-1",
    requestId,
    method,
    ...(params === undefined ? {} : { params }),
  } as RpcInput;
}
export function context(
  value: RpcInput = input(),
  signal = new AbortController().signal,
): ServerPluginPeerRequestContext {
  return {
    project: { id: "project-1", name: "project", path: "C:/host" },
    workspace: {
      id: "workspace-1",
      projectId: "project-1",
      label: "workspace",
      path: "C:/host/workspace",
      isMain: true,
    },
    operation: "rpc",
    input: value as JsonValue,
    signal,
  };
}
export const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
