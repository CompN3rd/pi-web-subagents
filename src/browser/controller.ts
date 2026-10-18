import type {
  PluginSelectionSnapshot,
  WorkspacePanelContext,
} from "@jmfederico/pi-web/plugin-api";
import {
  isMutation,
  parseRpcInput,
  parseRpcReply,
  type CostData,
  type JsonValue,
  type PingData,
  type RpcInput,
  type RpcMethod,
  type RpcReply,
  type StatusData,
  type ToolData,
  type ToolDetails,
} from "../protocol.js";
import { browserUuid } from "./uuid.js";

export interface Scope {
  machineId: string;
  projectId: string;
  workspaceId: string;
  sessionId: string;
}
export const scopeKey = (scope: Scope): string =>
  JSON.stringify([
    scope.machineId,
    scope.projectId,
    scope.workspaceId,
    scope.sessionId,
  ]);
export function selectedScope(
  context: WorkspacePanelContext,
  selection = context.state,
): Scope | undefined {
  const {
    selectedMachine: machine,
    selectedProject: project,
    selectedWorkspace: workspace,
    selectedSession: session,
  } = selection ?? {};
  if (
    !machine ||
    !project ||
    !workspace ||
    !session ||
    session.pending ||
    session.archived ||
    machine.id !== context.machine.id ||
    project.id !== context.workspace.projectId ||
    workspace.id !== context.workspace.id ||
    workspace.projectId !== project.id
  )
    return undefined;
  return {
    machineId: machine.id,
    projectId: project.id,
    workspaceId: workspace.id,
    sessionId: session.id,
  };
}
export interface Clock {
  now(): number;
  set(callback: () => void, ms: number): unknown;
  clear(timer: unknown): void;
}
const clock: Clock = {
  now: Date.now,
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (timer) => clearTimeout(timer as ReturnType<typeof setTimeout>),
};
export interface Receipt {
  scope: string;
  requestId: string;
  method: RpcMethod;
  state: "pending" | "accepted" | "failed" | "unknown" | "not-sent";
  message: string;
  at: number;
  details?: ToolDetails;
}
export interface PanelState {
  scope: Scope | undefined;
  ping: PingData | undefined;
  status: StatusData | undefined;
  observedAt: number | undefined;
  stale: boolean;
  refreshing: boolean;
  busy: boolean;
  error: string;
  transcript: ToolData | undefined;
  transcriptId: string;
  schedules: ToolData | undefined;
  cost: CostData | undefined;
  costAt: number | undefined;
}
const initial = (): PanelState => ({
  scope: undefined,
  ping: undefined,
  status: undefined,
  observedAt: undefined,
  stale: true,
  refreshing: false,
  busy: false,
  error: "Select a ready, non-archived conversation.",
  transcript: undefined,
  transcriptId: "",
  schedules: undefined,
  cost: undefined,
  costAt: undefined,
});
export class SubagentsController {
  state = initial();
  readonly receipts: Receipt[] = [];
  private context: WorkspacePanelContext | undefined;
  private generation = 0;
  private mounted = false;
  private visible = true;
  private timer: unknown;
  private requests = new Set<AbortController>();
  private statusPending = false;
  constructor(
    private readonly changed: () => void,
    private readonly time: Clock = clock,
    private readonly uuid: () => string = browserUuid,
  ) {}
  get currentReceipts(): Receipt[] {
    return this.receipts.filter(
      (r) => this.state.scope && r.scope === scopeKey(this.state.scope),
    );
  }
  get available(): boolean {
    return (
      this.mounted &&
      this.visible &&
      !!this.state.scope &&
      !!this.context?.peer?.request
    );
  }
  supports(method: RpcMethod, action?: string): boolean {
    const ping = this.state.ping;
    if (!this.available || !ping?.methods.includes(method)) return false;
    if (method === "steer" && ping.capabilities.nonRecoveringSteer !== true)
      return false;
    if (method === "spawn" && ping.capabilities.asyncSpawn !== true)
      return false;
    if (
      ["interrupt", "stop", "resume"].includes(method) &&
      ping.capabilities[method] !== true
    )
      return false;
    return (
      !action ||
      !!ping.capabilities.managementActions?.some((value) => value === action)
    );
  }
  update(
    context: WorkspacePanelContext,
    selection?: PluginSelectionSnapshot,
  ): void {
    const scope = selectedScope(context, selection ?? context.state);
    // Public contexts do not promise stable peer object identity across host renders.
    const different =
      JSON.stringify(scope) !== JSON.stringify(this.state.scope) ||
      !!context.peer?.request !== !!this.context?.peer?.request;
    this.context = context;
    if (!different) return;
    this.cancel();
    this.state = initial();
    this.state.scope = scope;
    this.state.error = !scope
      ? "Selection unavailable: choose a ready, non-archived conversation in this workspace."
      : !context.peer?.request
        ? "Package RPC peer unavailable on this machine."
        : "";
    this.changed();
    if (this.available) void this.refresh();
  }
  mount(): void {
    this.mounted = true;
    if (this.available) void this.refresh();
  }
  unmount(): void {
    this.mounted = false;
    this.cancel();
    this.changed();
  }
  setVisible(visible: boolean): void {
    if (visible === this.visible) return;
    this.visible = visible;
    if (!visible) this.cancel();
    else if (this.available) void this.refresh();
    this.changed();
  }
  private cancel(): void {
    this.generation++;
    this.time.clear(this.timer);
    this.timer = undefined;
    for (const request of this.requests) request.abort();
    this.requests.clear();
    for (const receipt of this.currentReceipts)
      if (receipt.state === "pending") {
        receipt.state = "unknown";
        receipt.message =
          "Observation cancelled; outcome unknown. Work may continue. Never automatically retry.";
      }
    this.statusPending = false;
    this.state.refreshing = false;
    this.state.busy = false;
    this.state.stale = true;
    this.state.ping = undefined;
  }
  private schedule(): void {
    this.time.clear(this.timer);
    if (!this.available) return;
    const active =
      (this.state.status?.fleet?.totalActive ?? 0) > 0 ||
      this.state.status?.asyncSnapshot?.runs.some(
        (r) => r.state === "running" || r.state === "queued",
      );
    this.timer = this.time.set(
      () => {
        void this.refresh();
      },
      active ? 2000 : 10000,
    );
  }
  private async request(input: RpcInput): Promise<RpcReply> {
    const peer = this.context?.peer;
    if (!this.available || !peer?.request)
      throw new Error("Selected conversation or package peer unavailable");
    const controller = new AbortController();
    this.requests.add(controller);
    const deadline = this.time.set(() => controller.abort(), 20000);
    let abort: (() => void) | undefined;
    try {
      const cancelled = new Promise<never>((_, reject) => {
        abort = () => reject(new Error("Request cancelled or timed out"));
        controller.signal.addEventListener("abort", abort, { once: true });
      });
      const raw = await Promise.race([
        peer.request("rpc", input as unknown as JsonValue, {
          signal: controller.signal,
        }),
        cancelled,
      ]);
      return parseRpcReply(raw, input);
    } finally {
      if (abort) controller.signal.removeEventListener("abort", abort);
      this.time.clear(deadline);
      this.requests.delete(controller);
    }
  }
  private input(method: RpcMethod, params?: unknown): RpcInput {
    return parseRpcInput({
      version: 1,
      sessionId: this.state.scope?.sessionId,
      requestId: this.uuid(),
      method,
      ...(params === undefined ? {} : { params }),
    });
  }
  private failure(reply: RpcReply): string | undefined {
    if ("kind" in reply)
      return `${reply.code}: ${reply.message} (${reply.outcome})`;
    if (!reply.success) return `${reply.error.code}: ${reply.error.message}`;
    if ("isError" in reply.data && reply.data.isError)
      return `Execution failed: ${reply.data.text}`;
    return undefined;
  }
  async refresh(): Promise<void> {
    if (!this.available || this.statusPending) return;
    this.time.clear(this.timer);
    this.statusPending = true;
    const generation = this.generation;
    this.state.refreshing = true;
    this.changed();
    try {
      if (!this.state.ping) {
        const ping = await this.request(this.input("ping"));
        if (generation !== this.generation) return;
        const failure = this.failure(ping);
        if (failure) throw new Error(failure);
        if (!("kind" in ping) && ping.success && ping.method === "ping")
          this.state.ping = ping.data;
      }
      if (!this.supports("status"))
        throw new Error("Status capability unavailable");
      const reply = await this.request(this.input("status"));
      if (generation !== this.generation) return;
      const failure = this.failure(reply);
      if (failure) throw new Error(failure);
      if (!("kind" in reply) && reply.success && reply.method === "status") {
        this.state.status = reply.data;
        this.state.observedAt = this.time.now();
        this.state.stale = false;
        this.state.error = "";
      }
    } catch (error) {
      if (generation === this.generation) {
        this.state.error = String(error);
        this.state.stale = true;
        this.state.ping = undefined;
      }
    } finally {
      if (generation === this.generation) {
        this.statusPending = false;
        this.state.refreshing = false;
        this.schedule();
        this.changed();
      }
    }
  }
  /** Explicit operations only. Mutations are never retried; confirmed controls use a second UI step. */
  async perform(
    method: RpcMethod,
    params?: unknown,
    confirmed = false,
  ): Promise<void> {
    if (this.state.busy || !this.available) return;
    const generation = this.generation;
    let receipt: Receipt | undefined;
    let acquiredStatus = false;
    try {
      const input = this.input(method, params);
      if (
        !this.supports(
          method,
          input.method === "manage" ? input.params?.action : undefined,
        )
      )
        throw new Error("Capability unavailable for this operation");
      const mutation = isMutation(input);
      if (mutation && method !== "steer" && !confirmed)
        throw new Error("Explicit confirmation required");
      if (method === "status") {
        if (this.statusPending)
          throw new Error(
            "Status request already in flight; wait for it to finish",
          );
        this.statusPending = true;
        acquiredStatus = true;
        this.time.clear(this.timer);
      }
      this.state.busy = true;
      this.state.error = "";
      if (method === "status") {
        this.state.transcript = undefined;
        this.state.transcriptId =
          input.method === "status" ? (input.params?.id ?? "") : "";
      }
      if (mutation) {
        receipt = {
          scope: scopeKey(this.state.scope!),
          method,
          requestId: input.requestId,
          at: this.time.now(),
          state: "pending",
          message:
            "Awaiting receipt. Closing this view does not stop admitted work.",
        };
        this.receipts.unshift(receipt);
        this.receipts.splice(20);
      }
      this.changed();
      const reply = await this.request(input);
      if (generation !== this.generation) return;
      const failure = this.failure(reply);
      if (failure) {
        if (receipt) {
          receipt.state = "kind" in reply ? reply.outcome : "failed";
          receipt.message = failure;
        }
        throw new Error(failure);
      }
      if (!("kind" in reply) && reply.success) {
        if (receipt) {
          receipt.state = "accepted";
          if ("details" in reply.data && reply.data.details)
            receipt.details = reply.data.details;
          receipt.message =
            reply.method === "stop"
              ? `Stopping — ${reply.data.message}. Not terminal proof; refresh status.`
              : "details" in reply.data && reply.data.details?.steering
                ? `${reply.data.details.steering.deliveryStatus} — ${reply.data.text}. Delivery is not completion.`
                : "text" in reply.data
                  ? reply.data.text
                  : "Accepted; inspect status for terminal evidence.";
        }
        if (reply.method === "status") this.state.transcript = reply.data;
        if (reply.method === "manage") this.state.schedules = reply.data;
        if (reply.method === "cost") {
          this.state.cost = reply.data;
          this.state.costAt = this.time.now();
        }
      }
    } catch (error) {
      if (generation === this.generation) {
        this.state.error = String(error);
        if (receipt?.state === "pending") {
          receipt.state = "unknown";
          receipt.message = `${String(error)}. Outcome unknown; do not retry automatically.`;
        }
      }
    } finally {
      if (generation === this.generation) {
        this.state.busy = false;
        if (acquiredStatus) {
          this.statusPending = false;
          this.schedule();
        }
        this.changed();
      }
    }
  }
  recoverSpawn(requestId: string): Promise<void> {
    if (
      !this.currentReceipts.some(
        (r) =>
          r.method === "spawn" &&
          r.state === "unknown" &&
          r.requestId === requestId,
      )
    )
      return Promise.resolve();
    return this.perform("status", { id: `rpc-spawn-${requestId}` });
  }
}
