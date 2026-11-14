import { transcriptValidation as v } from "./transcript-schema.js";

const { text, number, boolean, optional, oneOf, array, object } = v;
const s = optional(text), n = optional(number), b = optional(boolean);
const outcome = oneOf("completed", "failed", "paused", "stopped");
const run = object({ agent: text, status: outcome, runId: s, workflowRunId: s, source: s,
  durationMs: n, taskInfo: s, resumeNotice: s, reconciledFromDetachedChild: s,
  childRuns: optional(array(object({ runId: text, workflowKey: s, agent: s, status: s }))),
  watchdogBlockers: optional(array(object({ agent: text, summary: text, addressed: b, stalemate: b }))),
});
const supervisor = object({ id: s, requestId: s, runId: s, agent: s, childTarget: s, childIndex: n,
  reason: optional(oneOf("need_decision", "interview_request", "progress_update")), expectsReply: b, requestBody: s,
});
const reminder = object({ requestIds: array(text), blocked: b });
const completion = object({ runs: array(run) });
const wait = object({ token: s, runId: text, outcome: text });
const child = object({ childKey: text, outcome });
const control = object({ source: s, event: object({ type: text, agent: text, runId: text, message: text,
  to: s, from: s, reason: s, ts: n, index: n, currentTool: s, currentToolDurationMs: n, elapsedMs: n,
  toolCount: n, turns: n, tokens: n, recentFailureSummary: s, workflowKey: s, phase: s,
}) });
const steering = object({ runId: text, requestId: text, state: oneOf("failed", "partial", "recovered"), message: text, ts: n });
const watchdog = object({ severity: oneOf("concern", "blocker"), importance: oneOf("low", "medium", "high"),
  summary: text, evidence: text, recommendedAction: text, category: s, source: s, agent: s, runId: s,
  state: optional(oneOf("candidate", "confirmed", "displayed", "stale", "failed", "resolved", "stalemate", "suppressed")),
  stale: b, error: s, stalemateRepeats: n, displayedAt: s,
});
// These released notices have only text, not structured render details.
const textOnly = object({});
export const noticeSchemas = {
  subagent_supervisor_request: supervisor,
  "subagent-supervisor-unanswered": reminder,
  "subagent-supervisor-blocked": reminder,
  "subagent-notify": completion,
  "subagent-completion-unanswered": textOnly,
  "subagent-completion-unhandled": textOnly,
  "subagent-wait-subscription": wait,
  "subagent-incremental-child-notify": child,
  "subagent-workflow-result-write-failed": textOnly,
  "subagent-auto-resume": textOnly,
  subagent_control_notice: control,
  subagent_steering_notice: steering,
  subagent_watchdog_warning: watchdog,
  subagent_watchdog_clarification: textOnly,
} as const;
export type NoticeType = keyof typeof noticeSchemas;
export type NoticeDetails<K extends NoticeType> = ReturnType<(typeof noticeSchemas)[K]>;
export type Notice = { [K in NoticeType]: { type: K; details: NoticeDetails<K> } }[NoticeType];
export function parseNotice(type: NoticeType, value: unknown): Notice | undefined {
  const details = parseNoticeDetails(type, value);
  return details ? { type, details } as Notice : undefined;
}
export function isNoticeType(value: string): value is NoticeType {
  return Object.hasOwn(noticeSchemas, value);
}
/** Missing details are valid for legacy/text-only entries, not invented from prose.
 * Supplied malformed selected fields decline the whole card. Unknown fields are not traversed.
 */
export function parseNoticeDetails<K extends NoticeType>(type: K, value: unknown): NoticeDetails<K> | undefined {
  try { return noticeSchemas[type](value, { text: 131_072 }) as NoticeDetails<K>; } catch { return undefined; }
}
