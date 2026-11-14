/** Display-only subset of pi-subagents 0.88.1 Details. Never a control identity.
 * Unknown fields (including messages, paths and arbitrary workflow values) are not traversed.
 * Malformed or oversized selected data declines the entire card to the host view.
 */
type Budget = { text: number; nodes?: number };
type Parser<T> = (value: unknown, budget: Budget) => T;
type Parsed<P> = P extends Parser<infer T> ? T : never;
const invalid = (): never => { throw new Error("Unsupported transcript payload"); };
const text: Parser<string> = (value, budget) => {
  if (typeof value !== "string" || value.length > 16_384 || (budget.text -= value.length) < 0) return invalid();
  return value;
};
const number: Parser<number> = (value) => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : invalid();
const integer: Parser<number> = (value) => typeof value === "number" && Number.isSafeInteger(value) ? value : invalid();
const boolean: Parser<boolean> = (value) => typeof value === "boolean" ? value : invalid();
const optional = <T>(parse: Parser<T>): Parser<T | undefined> => (value, budget) => value === undefined ? undefined : parse(value, budget);
const oneOf = <T extends string>(...values: T[]): Parser<T> => (value) => typeof value === "string" && values.includes(value as T) ? value as T : invalid();
const array = <T>(parse: Parser<T>, max = 32): Parser<T[]> => (value, budget) => {
  if (!Array.isArray(value) || value.length > max) return invalid();
  return Array.from(value, (item) => parse(item, budget));
};
const object = <S extends Record<string, Parser<unknown>>>(shape: S): Parser<{ [K in keyof S]: Parsed<S[K]> }> => (value, budget) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid();
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(shape)) out[key] = shape[key]!((value as Record<string, unknown>)[key], budget);
  return out as { [K in keyof S]: Parsed<S[K]> };
};
/** Shared bounded primitives for independent, display-only transcript schemas. */
export const transcriptValidation = { text, number, integer, boolean, optional, oneOf, array, object };
const s = optional(text), n = optional(number), b = optional(boolean);
const usage = object({ input: n, output: n, cacheRead: n, cacheWrite: n, cost: n, turns: n });
const version: Parser<1> = (value) => value === 1 ? 1 : invalid();
const watchdog = object({
  phase: oneOf("idle", "reviewing", "stale", "failed"), seq: number, lastUpdate: number,
  reason: s, timedOut: b,
  warnings: optional(array(object({
    severity: oneOf("concern", "blocker"), importance: oneOf("low", "medium", "high"),
    category: oneOf("correctness", "missed-constraint", "test-gap", "unsafe-change", "scope-drift", "stale-fact", "loop-risk", "other"),
    summary: text, evidence: text, recommendedAction: text, displayedAt: s,
    addressed: boolean, stalemate: boolean,
  }))),
});
const review = object({
  status: oneOf("not-requested", "review-required", "reviewed", "blockers"),
  findings: optional(array(object({ severity: oneOf("blocker", "non-blocking"), file: s, issue: text, rationale: text }))),
});
// Profile fields are reported declarations, never process measurements. No arbitrary keys.
const safety = object({
  access: s, sandbox: s, approvalPolicy: s, ephemeral: b, authentication: s, permissionMode: s,
  tools: s, mcp: s, settingSources: s, userSettingsTrust: s, sessionPersistence: b,
  mode: s, workspaceTrust: s, sessionReuse: b,
});
const externalAdapter = {
  adapter: optional(object({ id: text, version, executionMode: text })),
  safety: optional(safety),
  safetySource: optional(object({ measured: (value: unknown) => value === false ? false : invalid(), command: s })),
  nonResumableReason: s,
};
const runner = object({
  type: oneOf("external-cli", "external-job"), command: s, args: optional(array(text)),
  promptDelivery: optional(oneOf("stdin", "prompt-file")), provider: s, ...externalAdapter,
});
const progress = object({
  index: optional(integer), agent: s, sessionName: s,
  status: optional(oneOf("pending", "running", "completed", "failed", "detached")),
  task: s, model: s, thinking: s, activityState: s, progressText: s, progressUpdatedAt: n,
  currentTool: s, currentToolArgs: s, currentPath: s,
  toolCount: n, turnCount: n, tokens: n, inputTokens: n, outputTokens: n,
  cacheRead: n, cacheWrite: n, window: n, windowPeak: n, durationMs: n,
  recentOutput: optional(array(text)),
  recentTools: optional(array(object({ tool: text, args: text, endMs: number }))),
  error: s, watchdog: optional(watchdog),
});
const evidence = oneOf("pending", "not-required", "claimed", "attested", "checked", "verified", "rejected");
const acceptance = object({
  status: oneOf("pending", "not-required", "claimed", "attested", "checked", "verified", "rejected", "review-required", "reviewed", "accepted"),
  evidenceStatus: evidence,
  runtimeChecks: optional(array(object({ id: text, status: oneOf("passed", "failed", "not-applicable"), message: text }))),
  parentDecision: optional(object({ status: oneOf("accepted", "rejected"), at: text, reason: s })),
  reviewResult: optional(review),
});
const result = object({
  index: integer, agent: text, task: text, exitCode: integer,
  runId: s, workflowKey: s, sessionName: s, context: optional(oneOf("fresh", "fork")),
  model: s, thinking: s, usage: optional(usage), progress: optional(progress), progressSummary: optional(progress),
  finalOutput: s, error: s, outputState: s, outputPartial: b,
  detached: b, interrupted: b, timedOut: b, stopped: b,
  outputSaveError: s, metadataSaveError: s, acceptance: optional(acceptance),
  review: optional(review), watchdog: optional(watchdog), runner: optional(runner),
});
const trace = object({
  operation: oneOf("run", "status", "steer", "host"), key: text,
  state: oneOf("started", "completed", "failed", "detached", "stopped", "reused", "queued", "delivered", "missed"),
  agent: s, runId: s, phase: s, label: s, durationMs: n, warning: s, error: s, reused: b,
});
const nodeState = oneOf("pending", "running", "completed", "failed", "partial", "paused", "stopped", "detached", "rejected");
const hostStep = object({
  version, kind: oneOf("host-step"), monitorKind: oneOf("command", "ci", "gate"),
  id: text, label: text, state: oneOf("pending", "running", "done", "cancelled", "error"),
  provider: s, role: s, verdict: optional(oneOf("pass", "fail", "inconclusive")), reasonCode: s, detail: s,
  freshness: optional(object({ expectedRef: text, observedRef: s, stale: b })),
});
const workflowChildren = object({
  version, parentToolCallId: text, workflowRunId: text, inventoryComplete: boolean,
  workflowState: oneOf("queued", "running", "completed", "failed", "paused", "stopped"),
  children: array(object({
    childId: text, runId: s, agent: s, sessionName: s, model: s, thinking: s,
    state: oneOf("pending", "running", "completed", "failed", "paused", "stopped", "rejected", "detached"),
    activity: optional(object({ currentTool: s, currentToolStartedAt: n, lastActivityAt: n, durationMs: n, toolCount: n, turnCount: n, tokens: n, inputTokens: n, outputTokens: n })),
  })),
});
const graphNodeFacts = object({
  id: text, kind: oneOf("step", "parallel-group", "dynamic-parallel-group", "agent", "host-step"),
  label: text, status: nodeState, agent: s, phase: s, outputName: s, itemKey: s,
  acceptanceStatus: s, error: s,
  hostStep: optional(hostStep),
});
export type ToolGraphNode = Parsed<typeof graphNodeFacts> & { children?: ToolGraphNode[] };
const graphNodes = (depth: number): Parser<ToolGraphNode[]> => (value, budget) => array((item, shared) => {
  if (depth > 4 || (shared.nodes = (shared.nodes ?? 64) - 1) < 0) return invalid();
  const node = graphNodeFacts(item, shared);
  const children = (item as Record<string, unknown>).children;
  return { ...node, ...(children === undefined ? {} : { children: graphNodes(depth + 1)(children, shared) }) };
})(value, budget);
const graph = object({
  runId: text, mode: oneOf("single", "parallel", "chain", "workflow"), currentNodeId: s,
  phases: array(object({ title: text, nodeIds: array(text) })), nodes: graphNodes(0),
});
const receiptEntry = object({
  key: text, agent: s, latestRunId: s, requestedContext: optional(oneOf("fresh", "fork")),
  resolvedContext: optional(oneOf("fresh", "fork", "mixed")), outputReference: s,
  resumability: object({ state: oneOf("resumable", "not-resumable"), reason: s }),
  continuation: object({ runIds: array(text) }),
  terminalOutcome: optional(object({ state: oneOf("partial"), reason: oneOf("budget_exhausted", "timeout") })),
  lane: optional(object({ version, key: text, mode: optional(oneOf("mutation", "review", "scout", "gate")), sourceRef: s, claims: optional(array(text)), outputPaths: optional(array(text)) })),
  externalAdapter: optional(object(externalAdapter)),
});
// Keyed public receipt entries only; no artifact lookup or general payload traversal.
const receiptEntries: Parser<Array<Parsed<typeof receiptEntry>>> = (value, budget) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid();
  const entries = [];
  for (const key in value) {
    if (!Object.hasOwn(value, key)) return invalid();
    if (entries.length >= 32) return invalid();
    text(key, budget);
    entries.push(receiptEntry((value as Record<string, unknown>)[key], budget));
  }
  return entries;
};
const receipt = object({
  version, workflowRunId: text, state: oneOf("complete", "failed", "paused", "stopped"),
  entries: receiptEntries, workflowResolution: s, hostSteps: optional(array(hostStep)),
  workflowChildren: optional(workflowChildren),
});
const details = object({
  mode: oneOf("single", "parallel", "chain", "workflow", "management"), results: array(result),
  runId: s, asyncId: s, context: optional(oneOf("fresh", "fork", "mixed")), background: b,
  progress: optional(array(progress)), totalSteps: n, currentStepIndex: n,
  totalChildUsage: optional(usage), chainAgents: optional(array(text)),
  preflightWarnings: optional(array(text)), workflowGraph: optional(graph), workflowChildren: optional(workflowChildren),
  preflight: optional(object({
    version: (value: unknown) => value === 1 ? 1 : invalid(), coverage: oneOf("complete", "partial"),
    lanes: array(object({ key: text, mode: s, decision: s, claims: optional(array(text)), expectedOutput: s, independence: s })),
  })),
  workflow: optional(object({
    failureKind: s, stopCause: s, reusedFrom: s,
    trace: array(trace, 64), preflightWarnings: optional(array(text)), receipt: optional(receipt),
  })),
});
/** Host text content only; no Markdown/HTML execution or inference from prose. */
export function parseTextContent(value: unknown): { text: string; truncated: boolean } | undefined {
  try {
    if (typeof value === "string") return { text: value.slice(0, 16_384), truncated: value.length > 16_384 };
    if (!Array.isArray(value) || value.length > 32) return undefined;
    let output = "";
    let length = 0;
    for (const block of value) {
      if (!block || typeof block !== "object" || block.type !== "text" || typeof block.text !== "string") return undefined;
      const prefix = length ? "\n" : "";
      length += prefix.length + block.text.length;
      output = (output + prefix + block.text.slice(0, 16_384)).slice(0, 16_384);
    }
    return { text: output, truncated: length > 16_384 };
  } catch { return undefined; }
}
export type ToolDetails = Parsed<typeof details>;
export type ToolHostStep = Parsed<typeof hostStep>;
export type ToolWorkflowChildren = Parsed<typeof workflowChildren>;
export type ToolWatchdog = Parsed<typeof watchdog>;
export type ToolReview = Parsed<typeof review>;
export type ToolRunner = Parsed<typeof runner>;
export type ToolProgress = Parsed<typeof progress>;
export type ToolResult = Parsed<typeof result>;
export type ToolUsage = Parsed<typeof usage>;
export function parseToolDetails(value: unknown): ToolDetails | undefined {
  try { return details(value, { text: 131_072 }); } catch { return undefined; }
}
const requestedTask = object({ agent: text, task: text });
const requestedStep = object({ agent: s, task: s, parallel: optional(array(requestedTask)) });
const args = object({
  action: s, agent: s, task: s,
  workflow: optional((value: unknown, budget: Budget) => typeof value === "boolean" ? value : text(value, budget)),
  tasks: optional(array(requestedTask)), chain: optional(array(requestedStep)),
});
export type ToolArgs = Parsed<typeof args>;
export function parseToolArgs(value: unknown): ToolArgs | undefined {
  try {
    if (typeof value === "string") {
      if (value.length > 32_768) return undefined;
      value = JSON.parse(value) as unknown;
    }
    const parsed = args(value, { text: 32_768 });
    if (parsed.tasks && (!parsed.tasks.length || parsed.tasks.some((task) => !task.agent))) return undefined;
    if (parsed.chain && (!parsed.chain.length || parsed.chain.some((step) => step.parallel
      ? !!step.agent || !step.parallel.length || step.parallel.some((task) => !task.agent)
      : !step.agent))) return undefined;
    return parsed.action || parsed.agent || parsed.workflow !== undefined || parsed.tasks || parsed.chain ? parsed : undefined;
  } catch { return undefined; }
}
