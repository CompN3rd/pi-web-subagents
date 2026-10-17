/** Browser-safe adapter contract. Upstream execution remains separately installed. */
export const RPC_METHODS = [
  "ping",
  "status",
  "manage",
  "spawn",
  "steer",
  "interrupt",
  "stop",
  "resume",
  "cost",
] as const;
export const MANAGEMENT_ACTIONS = [
  "schedule.list",
  "schedule.show",
  "schedule.history",
  "schedule.pause",
  "schedule.resume",
  "schedule.run",
  "schedule.delete",
] as const;
export type RpcMethod = (typeof RPC_METHODS)[number];
export type ManagementAction = (typeof MANAGEMENT_ACTIONS)[number];
export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };
export const LIMITS = {
  requestBytes: 65_536,
  replyBytes: 262_144,
  string: 65_536,
  depth: 16,
  array: 256,
  fields: 64,
} as const;
/** IDs/indices must come from authoritative targeted status, never display row positions. */
export type TargetParams = { id: string; index?: number };
export type SpawnParams = (
  | { agent: string; task?: string; script?: never; workflow?: never; args?: never }
  | { script: string; agent?: never; task?: never; workflow?: never; args?: JsonObject }
  | { workflow: string; agent?: never; task?: never; script?: never; args?: JsonObject }
) & { async?: true; context?: "fresh" | "fork"; model?: string; label?: string };
export type RpcParamsMap = {
  ping: Record<string, never>;
  status: { id?: string; index?: number; view?: "fleet" | "transcript"; lines?: number };
  manage:
    | { action: "schedule.list"; id?: never; quiet?: never }
    | { action: Exclude<ManagementAction, "schedule.list" | "schedule.run">; id: string; quiet?: never }
    | { action: "schedule.run"; id: string; quiet?: boolean };
  spawn: SpawnParams;
  steer: TargetParams & { message: string; mode?: "steer" | "follow_up" | "auto" };
  interrupt: TargetParams;
  stop: { id: string; childId?: string };
  resume: TargetParams & { message: string };
  cost: Record<string, never>;
};
export type RpcInput = {
  [M in RpcMethod]: { version: 1; sessionId: string; requestId: string; method: M; params?: RpcParamsMap[M] };
}[RpcMethod];
export type Tokens = { input: number; output: number; total: number; window?: number; windowPeak?: number };
/** Entries are display-only. An opaque fleet key is never a run/control target. */
export type FleetData = {
  version: 1;
  entries: {
    key: string;
    agent: string;
    role?: string;
    model?: string;
    effort?: string;
    startedAt: number;
    tokens: Tokens;
    goal?: string;
  }[];
  totalActive: number;
  topLevelAsyncCapacity?: { used: number; limit: number };
  omitted: number;
};
/** Only top-level IDs identify async runs; nested IDs are not necessarily stop childIds. */
export type AsyncNode = {
  id: string;
  kind: "subagent" | "workflow" | "step" | "host-step";
  label: string;
  state: "queued" | "running" | "complete" | "failed" | "partial" | "paused" | "stopped" | "rejected";
  startedAt?: number;
  updatedAt?: number;
  endedAt?: number;
  agent?: string;
  model?: string;
  thinking?: string;
  activity?: JsonObject;
  hostStep?: JsonObject;
  children?: AsyncNode[];
};
export type AsyncSnapshot = {
  kind: "pi-subagents.async-status-snapshot";
  version: 1;
  generatedAt: number;
  caps: {
    maxRuns: number;
    maxChildrenPerNode: number;
    maxDepth: number;
    maxStringLength: number;
    maxSerializedBytes: number;
  };
  omitted: { runs: number; children: number; byteLimitExceeded: boolean };
  runs: AsyncNode[];
};
export type PingData = {
  version: 1;
  methods: RpcMethod[];
  capabilities: JsonObject & { managementActions?: ManagementAction[] };
  events: { asyncComplete?: string; childStatus?: string; processTerminal?: string };
  session: { sessionId?: string };
};
export type ToolDetails = {
  mode?: string;
  runId?: string;
  toolCallId?: string;
  asyncId?: string;
  background?: boolean;
  results?: JsonObject[];
  schedules?: { records?: JsonObject[]; runs?: JsonObject[] };
  steering?: {
    requestId: string;
    state: string;
    deliveryStatus: "queued" | "delivered";
    sourceRunId: string;
    replacementRunId?: string;
    targets: JsonObject[];
  };
  lifecycleStatus?: { processTerminal?: JsonObject };
  workflow?: JsonObject;
};
export type ToolData = { text: string; details?: ToolDetails; isError?: boolean };
export type StatusData = ToolData & { fleet?: FleetData; asyncSnapshot?: AsyncSnapshot };
export type StopData = { runId: string; previousState: string; state: "stopping"; message: string; childId?: string };
export type Usage = {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cost: number;
  turns: number;
};
export type CostData = {
  version: 1;
  parent: Usage;
  children: { label: string; agent?: string; runId?: string; usage: Usage }[];
  childTotal: Usage;
  total: Usage;
  unresolvedAsyncChildren: number;
};
export type RpcDataMap = {
  ping: PingData;
  status: StatusData;
  manage: ToolData;
  spawn: ToolData;
  steer: ToolData;
  interrupt: ToolData;
  stop: StopData;
  resume: ToolData;
  cost: CostData;
};
export type RpcSuccess = {
  [M in RpcMethod]: { version: 1; requestId: string; method: M; success: true; data: RpcDataMap[M] };
}[RpcMethod];
export type UpstreamFailure = {
  version: 1;
  requestId: string;
  method: RpcMethod;
  success: false;
  error: { code: string; message: string };
};
export type RelayFailure = {
  version: 1;
  kind: "relay-error";
  requestId?: string;
  code: "unavailable" | "timeout" | "closed" | "invalid-payload" | "too-large";
  outcome: "not-sent" | "unknown";
  message: string;
};
export type RpcReply = RpcSuccess | UpstreamFailure | RelayFailure;
export class ProtocolError extends Error {
  readonly code: "invalid-payload" | "too-large";
  constructor(message: string, code: "invalid-payload" | "too-large" = "invalid-payload") {
    super(message);
    this.code = code;
  }
}
function invalid(message = "Invalid RPC payload"): never {
  throw new ProtocolError(message);
}
function large(): never {
  throw new ProtocolError("RPC payload exceeds adapter bounds", "too-large");
}
export function record(value: unknown): Record<string, unknown> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  )
    invalid();
  return value as Record<string, unknown>;
}
/** Bound before projecting: unknown fields cannot hide arbitrarily large/private structures. */
export function assertBoundedJson(value: unknown, maxBytes: number = LIMITS.replyBytes): void {
  assertBoundedValue(value, maxBytes, false);
}
function assertBoundedValue(value: unknown, maxBytes: number, nativeReply: boolean): void {
  let nodes = 0;
  const seen = new Set<object>();
  const visit = (v: unknown, depth: number): void => {
    if (++nodes > 16_384 || depth > LIMITS.depth) large();
    if (v === null || typeof v === "boolean") return;
    if (typeof v === "number") {
      if (!Number.isFinite(v)) invalid();
      return;
    }
    if (typeof v === "string") {
      if (v.length > LIMITS.string) large();
      return;
    }
    if (typeof v !== "object" || !v || seen.has(v)) invalid();
    seen.add(v);
    if (Array.isArray(v)) {
      if (v.length > LIMITS.array) large();
      for (const item of v) visit(item, depth + 1);
    } else {
      const r = record(v);
      const keys = Object.keys(r);
      if (keys.length > LIMITS.fields) large();
      for (const key of keys) {
        if (key.length > 256 || ["__proto__", "constructor", "prototype"].includes(key)) invalid();
        // Native pi.events replies are not JSON-round-tripped. Optional own
        // undefined fields mean absent; arrays and browser inputs stay strict.
        if (nativeReply && r[key] === undefined) continue;
        visit(r[key], depth + 1);
      }
    }
    seen.delete(v);
  };
  visit(value, 0);
  if (new TextEncoder().encode(JSON.stringify(value)).length > maxBytes) large();
}
function str(v: unknown, max = 4096, empty = false): string {
  if (typeof v !== "string" || v.length > max || (!empty && !v.trim()) || v.includes("\0")) invalid();
  return v;
}
function num(v: unknown): number {
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0) invalid();
  return v;
}
function count(v: unknown, max = Number.MAX_SAFE_INTEGER): number {
  const n = num(v);
  if (!Number.isSafeInteger(n) || n > max) invalid();
  return n;
}
function bool(v: unknown): boolean {
  if (typeof v !== "boolean") invalid();
  return v;
}
function one<T extends string>(v: unknown, allowed: readonly T[]): T {
  if (typeof v !== "string" || !allowed.includes(v as T)) invalid();
  return v as T;
}
function list(v: unknown, max: number = LIMITS.array): unknown[] {
  if (!Array.isArray(v)) invalid();
  if (v.length > max) large();
  return v;
}
function exact(r: Record<string, unknown>, keys: string[]): void {
  if (Object.keys(r).some((k) => !keys.includes(k))) invalid("Unsupported RPC field");
}
function identity(v: unknown, max = 256): string {
  const s = str(v, max);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(s) || s.includes("..")) invalid("Expected an opaque ID, not a path");
  return s;
}
export function parseRpcInput(raw: unknown): RpcInput {
  assertBoundedJson(raw, LIMITS.requestBytes);
  const r = record(raw);
  exact(r, ["version", "sessionId", "requestId", "method", "params"]);
  if (r.version !== 1) invalid("Unsupported RPC version");
  identity(r.sessionId, 512);
  identity(r.requestId, 128);
  const method = one(r.method, RPC_METHODS);
  const p = r.params === undefined ? {} : record(r.params);
  switch (method) {
    case "ping":
    case "cost":
      exact(p, []);
      break;
    case "status":
      exact(p, ["id", "index", "view", "lines"]);
      if (p.id !== undefined) identity(p.id);
      if (p.index !== undefined) {
        count(p.index, 65535);
        if (!p.id) invalid("Child index requires run id");
      }
      if (p.view !== undefined) one(p.view, ["fleet", "transcript"]);
      if (p.lines !== undefined && (count(p.lines, 500) < 1 || p.view !== "transcript")) invalid();
      if (p.view === "transcript" && !p.id) invalid("Transcript requires run id");
      break;
    case "manage": {
      exact(p, ["action", "id", "quiet"]);
      const action = one(p.action, MANAGEMENT_ACTIONS);
      if (action === "schedule.list") {
        if (p.id !== undefined) invalid();
      } else identity(p.id, 64);
      if (p.quiet !== undefined) {
        if (action !== "schedule.run") invalid();
        bool(p.quiet);
      }
      break;
    }
    case "spawn":
      exact(p, ["agent", "task", "script", "workflow", "args", "async", "context", "model", "label"]);
      if ([p.agent, p.script, p.workflow].filter((v) => v !== undefined).length !== 1)
        invalid("Choose one agent, script, or workflow");
      if (p.agent !== undefined) {
        str(p.agent, 128);
        if (p.args !== undefined) invalid();
      }
      if (p.task !== undefined) {
        if (!p.agent) invalid();
        str(p.task, 32768);
      }
      if (p.script !== undefined) str(p.script, 32768);
      if (p.workflow !== undefined) str(p.workflow, 512);
      if (p.args !== undefined) {
        record(p.args);
        assertBoundedJson(p.args, 16384);
      }
      if (p.async !== undefined && p.async !== true) invalid("Spawn is async-only");
      if (p.context !== undefined) one(p.context, ["fresh", "fork"]);
      if (p.model !== undefined) str(p.model, 256);
      if (p.label !== undefined) str(p.label, 160);
      break;
    case "stop":
      exact(p, ["id", "childId"]);
      identity(p.id);
      if (p.childId !== undefined) identity(p.childId);
      break;
    case "steer":
    case "interrupt":
    case "resume":
      exact(
        p,
        method === "interrupt"
          ? ["id", "index"]
          : method === "resume"
            ? ["id", "index", "message"]
            : ["id", "index", "message", "mode"],
      );
      identity(p.id);
      if (p.index !== undefined) count(p.index, 65535);
      if (method !== "interrupt") str(p.message, 16384);
      if (p.mode !== undefined) one(p.mode, ["steer", "follow_up", "auto"]);
  }
  return JSON.parse(JSON.stringify(raw)) as RpcInput;
}
export function isMutation(input: RpcInput): boolean {
  return (
    !["ping", "status", "cost"].includes(input.method) &&
    !(
      input.method === "manage" &&
      ["schedule.list", "schedule.show", "schedule.history"].includes(input.params?.action ?? "")
    )
  );
}
// Explicit per-object projections, never recursively copy arbitrary details/metadata.
type Field = "string" | "number" | "integer" | "count" | "boolean";
function fields(raw: unknown, schema: Record<string, Field>, required: string[] = []): JsonObject {
  const r = record(raw);
  const out: JsonObject = {};
  for (const [key, type] of Object.entries(schema)) {
    if (r[key] === undefined) {
      if (required.includes(key)) invalid();
      continue;
    }
    if (type === "count") out[key] = count(r[key]);
    else if (type === "integer") {
      if (typeof r[key] !== "number" || !Number.isSafeInteger(r[key])) invalid();
      out[key] = r[key] as number;
    } else out[key] = type === "string" ? str(r[key], 65536, true) : type === "number" ? num(r[key]) : bool(r[key]);
  }
  return out;
}
function usage(raw: unknown): Usage {
  return fields(
    raw,
    { input: "number", output: "number", cacheRead: "number", cacheWrite: "number", cost: "number", turns: "number" },
    ["input", "output", "cacheRead", "cacheWrite", "cost", "turns"],
  ) as Usage;
}
function projectPing(raw: unknown): PingData {
  const r = record(raw);
  if (r.version !== 1) invalid();
  const c = record(r.capabilities);
  const capabilities = fields(c, {
    status: "boolean",
    asyncSpawn: "boolean",
    steer: "boolean",
    nonRecoveringSteer: "boolean",
    interrupt: "boolean",
    stop: "boolean",
    resume: "boolean",
  });
  if (c.managementActions !== undefined)
    capabilities.managementActions = list(c.managementActions, 7).map((v) => one(v, MANAGEMENT_ACTIONS));
  for (const key of ["fleetStatus", "cost", "processTerminalProof", "asyncStatusSnapshot", "statusProjection"]) {
    if (c[key] !== undefined)
      capabilities[key] = fields(
        c[key],
        {
          version: "number",
          kind: "string",
          lifecycleArtifactVersion: "number",
          untargeted: "string",
          targeted: "string",
        },
        ["version"],
      );
  }
  const events = fields(r.events, { asyncComplete: "string", childStatus: "string", processTerminal: "string" });
  const session = fields(r.session, { sessionId: "string" });
  return {
    version: 1,
    methods: list(r.methods, 9).map((v) => one(v, RPC_METHODS)),
    capabilities,
    events,
    session,
  } as PingData;
}
function projectFleet(raw: unknown): FleetData {
  const r = record(raw);
  if (r.version !== 1) invalid();
  const entries = list(r.entries, 16).map((v) => {
    const e = record(v);
    for (const [key, max] of Object.entries({ key: 128, agent: 96, role: 96, model: 128, effort: 128, goal: 512 })) {
      if (e[key] !== undefined) str(e[key], max);
    }
    return {
      ...fields(
        e,
        {
          key: "string",
          agent: "string",
          role: "string",
          model: "string",
          effort: "string",
          goal: "string",
          startedAt: "count",
        },
        ["key", "agent", "startedAt"],
      ),
      tokens: fields(
        e.tokens,
        { input: "count", output: "count", total: "count", window: "count", windowPeak: "count" },
        ["input", "output", "total"],
      ),
    };
  });
  return {
    version: 1,
    entries,
    totalActive: count(r.totalActive),
    omitted: count(r.omitted),
    ...(r.topLevelAsyncCapacity === undefined
      ? {}
      : {
          topLevelAsyncCapacity: fields(r.topLevelAsyncCapacity, { used: "number", limit: "number" }, [
            "used",
            "limit",
          ]),
        }),
  } as FleetData;
}
function projectNode(raw: unknown, depth: number): AsyncNode {
  if (depth > 3) large();
  const r = record(raw);
  const out = fields(
    r,
    {
      id: "string",
      label: "string",
      startedAt: "number",
      updatedAt: "number",
      endedAt: "number",
      agent: "string",
      model: "string",
      thinking: "string",
    },
    ["id", "label"],
  );
  for (const value of Object.values(out)) if (typeof value === "string" && value.length > 160) large();
  out.kind = one(r.kind, ["subagent", "workflow", "step", "host-step"]);
  out.state = one(r.state, ["queued", "running", "complete", "failed", "partial", "paused", "stopped", "rejected"]);
  if (r.activity !== undefined)
    out.activity = fields(r.activity, {
      state: "string",
      currentTool: "string",
      lastActivityAt: "number",
      currentToolStartedAt: "number",
      turnCount: "number",
      toolCount: "number",
    });
  if (r.hostStep !== undefined)
    out.hostStep = fields(r.hostStep, {
      kind: "string",
      provider: "string",
      role: "string",
      state: "string",
      verdict: "string",
      reasonCode: "string",
      detail: "string",
      stale: "boolean",
    });
  if (r.children !== undefined) out.children = list(r.children, 8).map((v) => projectNode(v, depth + 1));
  return out as AsyncNode;
}
function projectSnapshot(raw: unknown): AsyncSnapshot {
  assertBoundedJson(raw, 32768);
  const r = record(raw);
  if (r.kind !== "pi-subagents.async-status-snapshot" || r.version !== 1) invalid();
  return {
    kind: r.kind,
    version: 1,
    generatedAt: count(r.generatedAt),
    caps: fields(
      r.caps,
      {
        maxRuns: "number",
        maxChildrenPerNode: "number",
        maxDepth: "number",
        maxStringLength: "number",
        maxSerializedBytes: "number",
      },
      ["maxRuns", "maxChildrenPerNode", "maxDepth", "maxStringLength", "maxSerializedBytes"],
    ),
    omitted: fields(r.omitted, { runs: "number", children: "number", byteLimitExceeded: "boolean" }, [
      "runs",
      "children",
      "byteLimitExceeded",
    ]),
    runs: list(r.runs, 20).map((v) => projectNode(v, 0)),
  } as AsyncSnapshot;
}
function projectTool(raw: unknown): ToolData {
  const r = record(raw);
  const out: ToolData = { text: str(r.text, LIMITS.string, true) };
  if (r.isError !== undefined) out.isError = bool(r.isError);
  if (r.details !== undefined) {
    const d = record(r.details);
    const details: ToolDetails = fields(d, {
      mode: "string",
      runId: "string",
      toolCallId: "string",
      asyncId: "string",
      background: "boolean",
    });
    if (d.results !== undefined)
      details.results = list(d.results).map((v) =>
        fields(v, {
          index: "count",
          workflowKey: "string",
          runId: "string",
          agent: "string",
          exitCode: "integer",
          model: "string",
          thinking: "string",
          stopped: "boolean",
          interrupted: "boolean",
          timedOut: "boolean",
          finalOutput: "string",
          error: "string",
        }),
      );
    if (d.steering !== undefined) {
      const s = record(d.steering);
      details.steering = {
        requestId: str(s.requestId),
        state: one(s.state, ["delivered", "scheduled", "pending", "partial", "recovered", "failed"]),
        deliveryStatus: one(s.deliveryStatus, ["queued", "delivered"]),
        sourceRunId: str(s.sourceRunId),
        ...(s.replacementRunId === undefined ? {} : { replacementRunId: str(s.replacementRunId) }),
        targets: list(s.targets).map((v) => {
          const t = record(v);
          return {
            ...fields(t, {
              reason: "string",
              replacementRunId: "string",
              deliveredAt: "number",
              lateDeliveredAt: "number",
            }),
            index: count(t.index),
            state: one(t.state, [
              "scheduled",
              "pending",
              "routed",
              "queued",
              "delivered",
              "late",
              "failed",
              "recovered",
            ]),
          };
        }),
      };
    }
    if (d.schedules !== undefined) {
      const s = record(d.schedules);
      details.schedules = {};
      if (s.records !== undefined)
        details.schedules.records = list(s.records).map((v) =>
          fields(
            v,
            {
              id: "string",
              name: "string",
              paused: "boolean",
              quiet: "boolean",
              sessionOnly: "boolean",
              createdAt: "string",
              updatedAt: "string",
              activeRunId: "string",
              lastRunId: "string",
              overlap: "string",
              catchUp: "string",
            },
            ["id", "name", "paused"],
          ),
        );
      if (s.runs !== undefined)
        details.schedules.runs = list(s.runs).map((v) =>
          fields(
            v,
            {
              id: "string",
              scheduleId: "string",
              plannedAt: "string",
              dueReason: "string",
              state: "string",
              startedAt: "string",
              completedAt: "string",
              asyncId: "string",
              error: "string",
            },
            ["id", "scheduleId", "state"],
          ),
        );
    }
    if (d.lifecycleStatus !== undefined) {
      const l = record(d.lifecycleStatus);
      details.lifecycleStatus = {};
      if (l.processTerminal !== undefined) {
        const p = record(l.processTerminal);
        if (p.version !== 1) invalid();
        if (p.state === "observed") count(p.observedAt);
        details.lifecycleStatus.processTerminal = {
          ...fields(
            p,
            {
              runId: "string",
              childIndex: "count",
              observedAt: "number",
              reason: "string",
              resumeDisposition: "string",
            },
            ["runId"],
          ),
          version: 1,
          state: one(p.state, ["pending", "not-started", "observed", "unknown"]),
        };
      }
    }
    if (d.workflow !== undefined) {
      const w = record(d.workflow);
      details.workflow = fields(w, { failureKind: "string", stopCause: "string", reusedFrom: "string" });
      if (w.trace !== undefined)
        details.workflow.trace = list(w.trace).map((v) =>
          fields(v, {
            operation: "string",
            key: "string",
            state: "string",
            agent: "string",
            runId: "string",
            phase: "string",
            label: "string",
            durationMs: "number",
            reused: "boolean",
          }),
        );
    }
    out.details = details;
  }
  return out;
}
type ReplyIdentity = Pick<RpcInput, "method" | "requestId" | "sessionId">;
export function parseRpcReply(raw: unknown, expected: ReplyIdentity): RpcReply {
  return projectRpcReply(raw, expected, false);
}
/** Only the server's native event boundary accepts optional undefined fields. */
export function parseNativeRpcReply(raw: unknown, expected: ReplyIdentity): RpcReply {
  return projectRpcReply(raw, expected, true);
}
function projectRpcReply(raw: unknown, expected: ReplyIdentity, nativeReply: boolean): RpcReply {
  assertBoundedValue(raw, LIMITS.replyBytes, nativeReply);
  const r = record(raw);
  if (r.version !== 1) invalid("Unsupported RPC reply version");
  if (r.kind === "relay-error") {
    if (r.requestId !== undefined && r.requestId !== expected.requestId) invalid("Mismatched RPC correlation");
    exact(r, ["version", "kind", "requestId", "code", "outcome", "message"]);
    return {
      version: 1,
      kind: "relay-error",
      requestId: expected.requestId,
      code: one(r.code, ["unavailable", "timeout", "closed", "invalid-payload", "too-large"]),
      outcome: one(r.outcome, ["not-sent", "unknown"]),
      message: str(r.message),
    };
  }
  if (r.requestId !== expected.requestId) invalid("Mismatched RPC correlation");
  if (r.method !== undefined && r.method !== expected.method) invalid("Mismatched RPC method");
  if (r.success === false) {
    const e = record(r.error);
    return {
      version: 1,
      requestId: expected.requestId,
      method: expected.method,
      success: false,
      error: {
        code: one(e.code, [
          "invalid_request",
          "invalid_params",
          "unsupported_version",
          "unsupported_method",
          "no_active_session",
          "execution_failed",
          "not_found",
          "invalid_state",
        ]),
        message: str(e.message, LIMITS.string, true),
      },
    };
  }
  if (r.success !== true) invalid();
  let data: RpcDataMap[RpcMethod];
  switch (expected.method) {
    case "ping":
      data = projectPing(r.data);
      if (data.session.sessionId !== undefined && data.session.sessionId !== expected.sessionId)
        invalid("Mismatched active session");
      break;
    case "status": {
      const d = record(r.data);
      data = {
        ...projectTool(d),
        ...(d.fleet === undefined ? {} : { fleet: projectFleet(d.fleet) }),
        ...(d.asyncSnapshot === undefined ? {} : { asyncSnapshot: projectSnapshot(d.asyncSnapshot) }),
      };
      break;
    }
    case "stop": {
      const d = record(r.data);
      data = {
        runId: str(d.runId),
        previousState: str(d.previousState),
        state: one(d.state, ["stopping"]),
        message: str(d.message),
        ...(d.childId === undefined ? {} : { childId: str(d.childId) }),
      };
      break;
    }
    case "cost": {
      const d = record(r.data);
      if (d.version !== 1) invalid();
      data = {
        version: 1,
        parent: usage(d.parent),
        children: list(d.children).map((v) => {
          const c = record(v);
          return {
            label: str(c.label),
            ...(c.agent === undefined ? {} : { agent: str(c.agent) }),
            ...(c.runId === undefined ? {} : { runId: str(c.runId) }),
            usage: usage(c.usage),
          };
        }),
        childTotal: usage(d.childTotal),
        total: usage(d.total),
        unresolvedAsyncChildren: count(d.unresolvedAsyncChildren),
      };
      break;
    }
    default:
      data = projectTool(r.data);
  }
  return { version: 1, requestId: expected.requestId, method: expected.method, success: true, data } as RpcSuccess;
}
