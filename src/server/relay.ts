import { randomUUID } from "node:crypto";
import type {
  PiWebHostPiSessionConnection,
  PiWebHostPiSessionEventsV1,
  PiWebHostPiSessionSelection,
  ServerPluginPeerRequestContext,
} from "@jmfederico/pi-web/server-plugin-api";
import { isMutation, parseRpcInput, ProtocolError, type PingData, type RpcInput, type RpcReply } from "../protocol.ts";
import { failure, requestRpc } from "./rpc-client.ts";

type Read = { task: Promise<RpcReply>; controller: AbortController; users: number };
type Scope = {
  selection: PiWebHostPiSessionSelection;
  controller: AbortController;
  ready: Promise<PingData | undefined>;
  connection?: PiWebHostPiSessionConnection;
  refs: number;
  idle?: ReturnType<typeof setTimeout>;
  reads: Map<string, Read>;
  status?: Read;
  snapshot?: { at: number; reply: RpcReply };
};
export type RelayOptions = {
  timeoutMs?: number;
  pingTimeoutMs?: number;
  idleMs?: number;
  statusCacheMs?: number;
  connectTimeoutMs?: number;
};

/** One finite connection per exact host authority; no filesystem or execution ownership. */
export class SessionRelay {
  private readonly events: PiWebHostPiSessionEventsV1;
  private readonly controller = new AbortController();
  private readonly scopes = new Map<string, Scope>();
  private readonly mutations = new Set<string>();
  private readonly options: Required<RelayOptions>;
  private requests = 0;
  private readonly detachLifetime: () => void;

  constructor(events: PiWebHostPiSessionEventsV1, lifetime: AbortSignal, options: RelayOptions = {}) {
    this.events = events;
    this.options = {
      timeoutMs: 15_000,
      pingTimeoutMs: 3_000,
      idleMs: 15_000,
      statusCacheMs: 1_000,
      connectTimeoutMs: 3_000,
      ...options,
    };
    const dispose = () => this.dispose();
    lifetime.addEventListener("abort", dispose, { once: true });
    this.detachLifetime = () => lifetime.removeEventListener("abort", dispose);
    if (lifetime.aborted) this.dispose();
  }

  dispose(): void {
    this.controller.abort();
    this.detachLifetime();
    for (const [key, scope] of this.scopes) this.closeScope(key, scope);
  }

  private closeScope(key: string, scope: Scope): void {
    clearTimeout(scope.idle);
    scope.controller.abort();
    scope.connection?.close();
    if (this.scopes.get(key) === scope) this.scopes.delete(key);
  }

  private acquire(key: string, selection: PiWebHostPiSessionSelection): Scope | undefined {
    let scope = this.scopes.get(key);
    if (!scope) {
      if (this.scopes.size >= 32) return undefined;
      scope = {
        selection,
        controller: new AbortController(),
        ready: Promise.resolve(undefined),
        refs: 0,
        reads: new Map(),
      };
      this.scopes.set(key, scope);
      scope.ready = this.connect(key, scope);
    }
    clearTimeout(scope.idle);
    scope.refs++;
    return scope;
  }

  private async connect(key: string, scope: Scope): Promise<PingData | undefined> {
    const signal = AbortSignal.any([this.controller.signal, scope.controller.signal]);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const pending = Promise.resolve()
      .then(() => this.events.connect(scope.selection))
      .then((connection) => {
        if (signal.aborted) {
          connection.close();
          return undefined;
        }
        scope.connection = connection;
        connection.signal.addEventListener("abort", () => this.closeScope(key, scope), { once: true });
        if (connection.signal.aborted) {
          this.closeScope(key, scope);
          return undefined;
        }
        return connection;
      })
      .catch(() => undefined);
    // connect has no cancellation argument; close a late connection without admitting RPC.
    try {
      timer = setTimeout(() => this.closeScope(key, scope), this.options.connectTimeoutMs);
      const connection = await wait(pending, signal);
      clearTimeout(timer);
      if (!connection) return undefined;
      const input: RpcInput = {
        version: 1,
        method: "ping",
        requestId: `adapter-${randomUUID()}`,
        sessionId: scope.selection.sessionId,
      };
      const reply = await requestRpc(connection, input, signal, this.options.pingTimeoutMs);
      if ("kind" in reply || !reply.success || reply.method !== "ping") {
        this.closeScope(key, scope);
        return undefined;
      }
      return reply.data;
    } catch {
      this.closeScope(key, scope);
      return undefined;
    } finally {
      clearTimeout(timer);
    }
  }

  private release(key: string, scope: Scope): void {
    scope.refs--;
    if (scope.refs !== 0 || scope.controller.signal.aborted) return;
    if (!scope.connection) {
      this.closeScope(key, scope);
      return;
    }
    scope.idle = setTimeout(() => this.closeScope(key, scope), this.options.idleMs);
  }

  async request(context: ServerPluginPeerRequestContext): Promise<RpcReply> {
    let input: RpcInput;
    try {
      if (context.operation !== "rpc")
        return failure("invalid-payload", "not-sent", "Only the finite rpc operation is supported.");
      input = parseRpcInput(context.input);
    } catch (error) {
      return failure(
        error instanceof ProtocolError ? error.code : "invalid-payload",
        "not-sent",
        "Invalid adapter request.",
      );
    }
    const id = input.requestId;
    if (context.workspace.projectId !== context.project.id || !context.project.id || !context.workspace.id)
      return failure("unavailable", "not-sent", "Host workspace authority mismatch.", id);
    if (context.signal.aborted || this.controller.signal.aborted)
      return failure("closed", "not-sent", "Request cancelled before admission.", id);
    if (this.requests >= 128) return failure("unavailable", "not-sent", "Adapter request capacity reached.", id);
    const selection = { projectId: context.project.id, workspaceId: context.workspace.id, sessionId: input.sessionId };
    const key = JSON.stringify([selection.projectId, selection.workspaceId, selection.sessionId]);
    const mutationKey = JSON.stringify([key, id]);
    const mutation = isMutation(input);
    if (mutation && this.mutations.has(mutationKey))
      return failure(
        "invalid-payload",
        "not-sent",
        "Duplicate active mutation requestId; correlation is not idempotency.",
        id,
      );
    if (mutation) this.mutations.add(mutationKey);
    this.requests++;
    let scope: Scope | undefined;
    try {
      scope = this.acquire(key, selection);
      if (!scope) return failure("unavailable", "not-sent", "Adapter session capacity reached.", id);
      const signal = AbortSignal.any([context.signal, this.controller.signal, scope.controller.signal]);
      const ping = await wait(scope.ready, signal);
      if (context.signal.aborted || this.controller.signal.aborted)
        return failure("closed", "not-sent", "Request cancelled before emit.", id);
      if (!ping || !scope.connection || signal.aborted)
        return failure(
          "unavailable",
          "not-sent",
          "No compatible pi-subagents extension replied to ping in the selected hosted session.",
          id,
        );
      if (input.method === "ping") return { version: 1, requestId: id, method: "ping", success: true, data: ping };
      if (ping.session.sessionId !== input.sessionId)
        return failure("unavailable", "not-sent", "Extension has no matching active session context.", id);
      if (
        !ping.methods.includes(input.method) ||
        (input.method === "manage" && !ping.capabilities.managementActions?.includes(input.params!.action))
      )
        return failure("unavailable", "not-sent", "Method or schedule action is not advertised by this session.", id);
      if (input.method === "steer" && ping.capabilities.nonRecoveringSteer !== true)
        return failure(
          "unavailable",
          "not-sent",
          "Session does not advertise non-recovering steering; exact-target steering is unavailable.",
          id,
        );
      if (mutation) {
        delete scope.snapshot;
        const reply = await requestRpc(scope.connection, input, signal, this.options.timeoutMs);
        delete scope.snapshot;
        return reply;
      }
      return await this.read(scope, input, signal);
    } catch {
      return failure("unavailable", "not-sent", "Selected hosted session is unavailable.", id);
    } finally {
      this.requests--;
      if (mutation) this.mutations.delete(mutationKey);
      if (scope) this.release(key, scope);
    }
  }

  private async read(scope: Scope, input: RpcInput, signal: AbortSignal): Promise<RpcReply> {
    const untargeted = input.method === "status" && Object.keys(input.params ?? {}).length === 0;
    if (untargeted && scope.snapshot && Date.now() - scope.snapshot.at < this.options.statusCacheMs)
      return { ...scope.snapshot.reply, requestId: input.requestId };
    // Canonical key lets independently ordered params share one upstream read.
    const params = Object.entries(input.params ?? {}).sort(([a], [b]) => a.localeCompare(b));
    const key = JSON.stringify([input.method, params]);
    let read = scope.reads.get(key);
    if (!read) {
      if (input.method === "status" && scope.status)
        return failure(
          "unavailable",
          "not-sent",
          "Another status read is in flight; refresh after it completes.",
          input.requestId,
        );
      const controller = new AbortController();
      const sharedSignal = AbortSignal.any([controller.signal, scope.controller.signal, this.controller.signal]);
      read = { task: Promise.resolve(failure("unavailable", "not-sent", "Read not started")), controller, users: 0 };
      scope.reads.set(key, read);
      if (input.method === "status") scope.status = read;
      // Read correlation is transport-local. Mutation IDs, especially spawn, are never rewritten.
      const upstreamInput = { ...input, requestId: `adapter-${randomUUID()}` } as RpcInput;
      const current = read;
      read.task = requestRpc(scope.connection!, upstreamInput, sharedSignal, this.options.timeoutMs)
        .then((reply) => {
          if (untargeted && !("kind" in reply) && reply.success) scope.snapshot = { at: Date.now(), reply };
          return reply;
        })
        .finally(() => {
          if (scope.reads.get(key) === current) scope.reads.delete(key);
          if (scope.status === current) delete scope.status;
        });
    }
    read.users++;
    try {
      const reply = await wait(read.task, signal);
      return reply
        ? { ...reply, requestId: input.requestId }
        : failure("closed", "unknown", "Read observation cancelled after shared emit.", input.requestId);
    } finally {
      read.users--;
      if (!read.users) read.controller.abort();
    }
  }
}

/** Abort only this waiter, not other consumers of a shared connect/read. */
async function wait<T>(task: Promise<T>, signal: AbortSignal): Promise<T | undefined> {
  if (signal.aborted) return undefined;
  let onAbort: (() => void) | undefined;
  try {
    return await Promise.race([
      task,
      new Promise<undefined>((resolve) => {
        onAbort = () => resolve(undefined);
        signal.addEventListener("abort", onAbort, { once: true });
      }),
    ]);
  } finally {
    if (onAbort) signal.removeEventListener("abort", onAbort);
  }
}
