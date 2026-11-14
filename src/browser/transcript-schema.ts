/** Display-only subset of pi-subagents 0.88.1 Details. Never a control identity.
 * Unknown fields (including messages, paths and arbitrary workflow values) are not traversed.
 * Malformed or oversized selected data declines the entire card to the host view.
 */
type Budget = { text: number };
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
const s = optional(text), n = optional(number), b = optional(boolean);
const usage = object({ input: n, output: n, cacheRead: n, cacheWrite: n, cost: n, turns: n });
const progress = object({
  index: optional(integer), agent: s, sessionName: s,
  status: optional(oneOf("pending", "running", "completed", "failed", "detached")),
  task: s, model: s, thinking: s, activityState: s, progressText: s, progressUpdatedAt: n,
  currentTool: s, currentToolArgs: s, currentPath: s,
  toolCount: n, turnCount: n, tokens: n, inputTokens: n, outputTokens: n,
  cacheRead: n, cacheWrite: n, window: n, windowPeak: n, durationMs: n,
  recentOutput: optional(array(text)),
  recentTools: optional(array(object({ tool: text, args: text, endMs: number }))),
  error: s,
});
const evidence = oneOf("pending", "not-required", "claimed", "attested", "checked", "verified", "rejected");
const acceptance = object({
  status: oneOf("pending", "not-required", "claimed", "attested", "checked", "verified", "rejected", "review-required", "reviewed", "accepted"),
  evidenceStatus: evidence,
  runtimeChecks: optional(array(object({ id: text, status: oneOf("passed", "failed", "not-applicable"), message: text }))),
  parentDecision: optional(object({ status: oneOf("accepted", "rejected"), at: text, reason: s })),
});
const result = object({
  index: integer, agent: text, task: text, exitCode: integer,
  runId: s, workflowKey: s, sessionName: s, context: optional(oneOf("fresh", "fork")),
  model: s, thinking: s, usage: optional(usage), progress: optional(progress), progressSummary: optional(progress),
  finalOutput: s, error: s, outputState: s, outputPartial: b,
  detached: b, interrupted: b, timedOut: b, stopped: b,
  outputSaveError: s, metadataSaveError: s, acceptance: optional(acceptance),
});
const trace = object({
  operation: oneOf("run", "status", "steer", "host"), key: text,
  state: oneOf("started", "completed", "failed", "detached", "stopped", "reused", "queued", "delivered", "missed"),
  agent: s, runId: s, phase: s, label: s, durationMs: n, warning: s, error: s, reused: b,
});
const details = object({
  mode: oneOf("single", "parallel", "chain", "workflow", "management"), results: array(result),
  runId: s, asyncId: s, context: optional(oneOf("fresh", "fork", "mixed")), background: b,
  progress: optional(array(progress)), totalSteps: n, currentStepIndex: n,
  totalChildUsage: optional(usage), chainAgents: optional(array(text)),
  preflightWarnings: optional(array(text)),
  preflight: optional(object({
    version: (value: unknown) => value === 1 ? 1 : invalid(), coverage: oneOf("complete", "partial"),
    lanes: array(object({ key: text, mode: s, decision: s, claims: optional(array(text)), expectedOutput: s, independence: s })),
  })),
  workflow: optional(object({
    failureKind: s, stopCause: s, reusedFrom: s,
    trace: array(trace, 64), preflightWarnings: optional(array(text)),
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
