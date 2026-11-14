import { html, nothing, type TemplateResult } from "lit";
import type { TranscriptMessageRendererInput, TranscriptRendererContribution } from "@jmfederico/pi-web/plugin-api";
import { englishContent, type PanelContent } from "./localization.js";
import { facts, durationBetween } from "./presentation.js";
import { parseTextContent } from "./transcript-schema.js";
import { isNoticeType, noticeSchemas, parseNotice, type Notice, type NoticeType } from "./notices-schema.js";

type Key = Parameters<PanelContent["t"]>[0];
const titles: Record<NoticeType, Key> = {
  subagent_supervisor_request: "supervisorRequest",
  "subagent-supervisor-unanswered": "supervisorUnanswered",
  "subagent-supervisor-blocked": "supervisorBlocked",
  "subagent-notify": "completionNotice",
  "subagent-completion-unanswered": "completionUnanswered",
  "subagent-completion-unhandled": "completionUnhandled",
  "subagent-wait-subscription": "waitNotice",
  "subagent-incremental-child-notify": "workflowChildNotice",
  "subagent-workflow-result-write-failed": "workflowSaveFailed",
  "subagent-auto-resume": "autoResumeFailed",
  subagent_control_notice: "controlNotice",
  subagent_steering_notice: "steeringNotice",
  subagent_watchdog_warning: "watchdogWarning",
  subagent_watchdog_clarification: "watchdogClarification",
};
function noticeDetails(notice: Notice, content: PanelContent): TemplateResult {
  const { t, number } = content;
  const rows = (values: [Key, string | number | boolean | undefined][]) => facts(values.map(([key, value]) => [t(key),
    typeof value === "number" ? number(value) : typeof value === "boolean" ? t(value ? "yes" : "no") : value]));
  const text = (label: Key, value: string | undefined) => value === undefined ? nothing : html`<h4>${t(label)}</h4><pre tabindex="0">${value}</pre>`;
  switch (notice.type) {
    case "subagent_supervisor_request": {
      const d = notice.details;
      const reason: Key = d.reason === "progress_update" ? "supervisorProgress" : d.reason === "interview_request" ? "supervisorInterview" : d.reason === "need_decision" ? "supervisorDecision" : "unknown";
      return html`<p><strong>${t(reason)}</strong></p>${rows([
        ["requestId", d.requestId ?? d.id], ["traceAgent", d.agent], ["traceRun", d.runId], ["childIndex", d.childIndex],
        ["reportedChildTarget", d.childTarget], ["expectsReply", d.expectsReply],
      ])}${text("requestBody", d.requestBody)}`;
    }
    case "subagent-supervisor-unanswered": case "subagent-supervisor-blocked":
      return html`<h4>${t("historicalRequestIds")}</h4><ul>${notice.details.requestIds.map((id) => html`<li>${id}</li>`)}</ul>`;
    case "subagent-notify":
      return html`<ol>${notice.details.runs.map((run) => html`<li><h4>${run.agent}</h4>${rows([
        ["reportedState", run.status], ["traceRun", run.runId], ["workflowLabel", run.workflowRunId], ["sourceLabel", run.source],
        ["elapsed", run.durationMs === undefined ? undefined : durationBetween(0, run.durationMs, content)],
        ["resumeNotice", run.resumeNotice], ["reconciledChild", run.reconciledFromDetachedChild],
      ])}${text("childTask", run.taskInfo)}${run.childRuns ? html`<ul>${run.childRuns.map((child) => html`<li>${rows([["traceKey", child.workflowKey], ["traceRun", child.runId], ["traceAgent", child.agent], ["reportedState", child.status]])}</li>`)}</ul>` : nothing}
      ${run.watchdogBlockers ? html`<h4>${t("watchdogBlockers")}</h4><ul>${run.watchdogBlockers.map((blocker) => html`<li>${rows([["traceAgent", blocker.agent], ["addressed", blocker.addressed], ["stalemate", blocker.stalemate]])}${text("warningSummary", blocker.summary)}</li>`)}</ul>` : nothing}</li>`)}</ol>`;
    case "subagent-wait-subscription":
      return html`${rows([["traceRun", notice.details.runId], ["reportedState", notice.details.outcome], ["subscriptionToken", notice.details.token]])}`;
    case "subagent-incremental-child-notify":
      return html`${rows([["traceKey", notice.details.childKey], ["reportedState", notice.details.outcome]])}`;
    case "subagent_control_notice": {
      const e = notice.details.event;
      return html`${rows([["reportedState", e.type], ["activityState", e.to], ["traceAgent", e.agent], ["traceRun", e.runId],
        ["sourceLabel", notice.details.source], ["reason", e.reason], ["childIndex", e.index], ["currentTool", e.currentTool],
        ["tools", e.toolCount], ["turns", e.turns], ["reportedTokens", e.tokens], ["traceKey", e.workflowKey], ["tracePhase", e.phase],
        ["elapsed", e.elapsedMs === undefined ? undefined : durationBetween(0, e.elapsedMs, content)],
        ["noticeToolDuration", e.currentToolDurationMs === undefined ? undefined : durationBetween(0, e.currentToolDurationMs, content)],
      ])}${text("noticeMessage", e.message)}${text("traceError", e.recentFailureSummary)}`;
    }
    case "subagent_steering_notice":
      return html`${rows([["traceRun", notice.details.runId], ["requestId", notice.details.requestId], ["reportedState", notice.details.state]])}${text("noticeMessage", notice.details.message)}`;
    case "subagent_watchdog_warning": {
      const d = notice.details;
      return html`${rows([["severity", d.severity], ["importance", d.importance], ["category", d.category], ["sourceLabel", d.source],
        ["traceAgent", d.agent], ["traceRun", d.runId], ["reportedState", d.state], ["reportedStale", d.stale],
        ["displayedAt", d.displayedAt], ["stalemateRepeats", d.stalemateRepeats],
      ])}${text("warningSummary", d.summary)}${text("warningEvidence", d.evidence)}${text("recommendedAction", d.recommendedAction)}${text("traceError", d.error)}
      ${d.state === "stalemate" ? html`<p class="error">${t("watchdogHeld")}</p>` : nothing}`;
    }
    default: return html``;
  }
}

/** Historical displayed messages only. No live queue, reply authority, polling or transport. */
export function noticeBody(input: TranscriptMessageRendererInput, content = englishContent): (() => TemplateResult) | undefined {
  if (input.signal.aborted || !isNoticeType(input.entry.customType)) return undefined;
  const type = input.entry.customType;
  const output = parseTextContent(input.entry.content);
  if (!output) return undefined;
  const parsed = input.entry.details === undefined ? undefined : parseNotice(type, input.entry.details);
  if (input.entry.details !== undefined && !parsed) return undefined;
  return () => html`<section class="card" dir=${content.localization?.direction ?? "ltr"} aria-label=${content.t(titles[type])}>
    <h3>${content.t(titles[type])}</h3>
    <p class="meta">${content.t("historicalNoticeNote")}</p>
    ${parsed ? noticeDetails(parsed, content) : html`<p class="meta">${content.t("noticeTextOnly")}</p>`}
    ${type.startsWith("subagent-supervisor-") || type === "subagent_supervisor_request" ? html`<p class="meta">${content.t("supervisorHandoffNote", { helper: content.t("supervisorHelp") })}</p>` : nothing}
    <details><summary>${content.t("noticeContent")}</summary><pre tabindex="0">${output.text}</pre></details>
    ${output.truncated ? html`<p class="meta">${content.t("noticeContentCapped")}</p>` : nothing}
  </section>`;
}
export function noticeRenderers(wrap: (body: () => TemplateResult) => TemplateResult, content = englishContent): TranscriptRendererContribution[] {
  return (Object.keys(noticeSchemas) as NoticeType[]).map((customType, index) => ({
    id: `subagent-notice-${index}`, target: "custom-message", customType,
    render(input) {
      if (input.entry.customType !== customType) return undefined;
      const body = noticeBody(input, content);
      return body ? wrap(body) : undefined;
    },
  }));
}
