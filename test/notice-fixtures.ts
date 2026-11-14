import type { TranscriptMessageRendererInput } from "@jmfederico/pi-web/plugin-api";
import { hostile } from "./transcript-fixtures.ts";

/** Released 0.88.1 selected message shapes; no hidden appendEntry data. */
export const noticeFixtures = {
  subagent_supervisor_request: { id: "request-1", requestId: "request-1", agent: "reviewer", runId: "historical-run", childIndex: 0,
    childTarget: "opaque:child", reason: "need_decision", expectsReply: true, requestBody: `May I proceed?\n${hostile}` },
  "subagent-supervisor-unanswered": { requestIds: ["request-1", "request-2"] },
  "subagent-supervisor-blocked": { requestIds: ["request-1"], blocked: true },
  "subagent-notify": { runs: [
    { agent: "worker", status: "completed", runId: "historical-run-1", durationMs: 0, taskInfo: "Task one" },
    { agent: "workflow", status: "paused", runId: "historical-run-2", workflowRunId: "historical-run-2", source: "async",
      resumeNotice: "Not auto-resumed: held", reconciledFromDetachedChild: "detached-ref",
      childRuns: [{ runId: "nested-ref", workflowKey: "review", agent: "reviewer", status: "failed" }],
      watchdogBlockers: [{ agent: "reviewer", summary: "Test gap", addressed: false, stalemate: true }],
    },
  ] },
  "subagent-completion-unanswered": undefined,
  "subagent-completion-unhandled": undefined,
  "subagent-wait-subscription": { token: "wait-token", runId: "historical-run", outcome: "timeout" },
  "subagent-incremental-child-notify": { childKey: "review", outcome: "failed" },
  "subagent-workflow-result-write-failed": undefined,
  "subagent-auto-resume": undefined,
  subagent_control_notice: { source: "async", event: { type: "needs_attention", agent: "worker", runId: "historical-run",
    message: "Repeated tool failure", to: "blocked", reason: "tool_failures", ts: 1234, index: 0,
    currentTool: "bash", currentToolDurationMs: 0, elapsedMs: 1000, toolCount: 2, turns: 1, tokens: 0,
    recentFailureSummary: "Command failed", workflowKey: "implement", phase: "build" } },
  subagent_steering_notice: { runId: "historical-run", requestId: "steer-request", state: "partial", message: "Delivery partially recovered", ts: 1234 },
  subagent_watchdog_warning: { severity: "blocker", importance: "high", summary: "Missing test",
    evidence: `No regression assertion\n${hostile}`, recommendedAction: "Add a regression test", category: "test-gap", source: "child",
    agent: "reviewer", runId: "historical-run", state: "stalemate", stale: false, stalemateRepeats: 3, displayedAt: "2026-07-13T12:00:00Z" },
  subagent_watchdog_clarification: undefined,
};
export function noticeFixture(type: string = "subagent_supervisor_request"): TranscriptMessageRendererInput {
  return { scope: { machineId: "machine", sessionId: "parent" }, signal: new AbortController().signal,
    fail: () => { throw new Error("Unexpected render failure"); }, entry: { customType: type,
      content: `Original parent notice\n${hostile}`,
      details: noticeFixtures[type as keyof typeof noticeFixtures],
    } };
}
