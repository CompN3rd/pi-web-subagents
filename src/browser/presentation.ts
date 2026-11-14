import { html, nothing, type TemplateResult } from "lit";
import type { AsyncNode, CostData, Tokens } from "../protocol.js";
import { englishContent, type PanelContent } from "./localization.js";

type Fact = readonly [string, string | undefined];
/** Facts stay escaped text. Unknown is distinct from a reported zero. */
export function facts(rows: Fact[]): TemplateResult {
  return html`<dl class="facts">${rows.filter(([, value]) => value !== undefined).map(
    ([label, value]) => html`<div><dt>${label}</dt><dd>${value}</dd></div>`,
  )}</dl>`;
}
function timestamp(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
/** No wall clock: stable historical snapshots cannot acquire fabricated freshness. */
export function durationBetween(start: unknown, end: unknown, content = englishContent): string {
  if (!timestamp(start) || !timestamp(end) || end < start) return content.t("unknown");
  const seconds = Math.floor((end - start) / 1000);
  if (seconds < 60) return content.t("seconds", { count: content.number(seconds) });
  if (seconds < 3600) return content.t("minutesSeconds", {
    minutes: content.number(Math.floor(seconds / 60)), seconds: content.number(seconds % 60),
  });
  return content.t("hoursMinutes", {
    hours: content.number(Math.floor(seconds / 3600)), minutes: content.number(Math.floor(seconds % 3600 / 60)),
  });
}
export function nodeFacts(node: AsyncNode, snapshotAt?: number, content = englishContent): TemplateResult {
  const { t } = content;
  const activity = node.activity;
  const text = (value: unknown) => typeof value === "string" ? value : undefined;
  const number = (value: unknown) => typeof value === "number" ? content.number(value) : undefined;
  // Terminal/paused rows without an end time do not continue accumulating elapsed time.
  const end = node.endedAt ?? (["running", "queued"].includes(node.state) ? snapshotAt : undefined);
  const monitor = node.hostStep;
  return html`${facts([
    [t("elapsed"), durationBetween(node.startedAt, end, content)],
    [t("updated"), node.updatedAt === undefined ? undefined : durationBetween(node.updatedAt, snapshotAt, content)],
    [t("activityState"), text(activity?.state)],
    [t("currentTool"), text(activity?.currentTool)],
    [t("toolDuration"), activity?.currentTool ? durationBetween(activity.currentToolStartedAt, end, content) : undefined],
    [t("lastActivity"), durationBetween(activity?.lastActivityAt, snapshotAt, content)],
    [t("turns"), number(activity?.turnCount)],
    [t("tools"), number(activity?.toolCount)],
  ])}
  ${node.progressText ? html`<div class="progress-report">
    <strong>${t("progress")}</strong><p>${node.progressText}</p>
    <small>${t("progressAge")}: ${durationBetween(node.progressUpdatedAt, snapshotAt, content)}</small>
  </div>` : nothing}
  ${node.kind === "host-step" ? html`<div class="monitor-facts">
    <strong>${t("hostMonitor")}</strong>
    ${facts([
      [t("monitorKind"), text(monitor?.kind)],
      [t("provider"), text(monitor?.provider)],
      [t("role"), text(monitor?.role)],
      [t("monitorState"), text(monitor?.state)],
      [t("verdict"), text(monitor?.verdict)],
      [t("reason"), text(monitor?.reasonCode)],
      [t("monitorDetail"), text(monitor?.detail)],
      [t("monitorFreshness"), monitor?.stale === undefined ? t("unknown") : t(monitor.stale ? "staleMonitor" : "notStaleMonitor")],
    ])}
  </div>` : nothing}`;
}
export function fleetMetrics(tokens: Tokens, content = englishContent): TemplateResult {
  const { t, number } = content;
  return facts([
    [t("inputTokens"), number(tokens.input)],
    [t("outputTokens"), number(tokens.output)],
    [t("spentTokens"), number(tokens.total)],
    [t("windowTokens"), tokens.window === undefined ? t("unknown") : number(tokens.window)],
    [t("peakTokens"), tokens.windowPeak === undefined ? t("unknown") : number(tokens.windowPeak)],
  ]);
}
/** On-demand accounting only; never merge these identities or totals into the fleet. */
export function usageTable(cost: CostData, content: PanelContent = englishContent): TemplateResult {
  const { t, number } = content;
  const rows = [
    { label: t("parentUsage"), usage: cost.parent },
    ...cost.children.map((child) => ({ ...child, runId: child.runId, label: t("childUsage", { label: child.label }) })),
    { label: t("childrenUsage"), usage: cost.childTotal },
    { label: t("totalUsage"), usage: cost.total },
  ];
  return html`<div class="usage-scroll" role="region" tabindex="0" aria-label=${t("reportedUsage")}>
    <table class="usage-table">
      <caption>${t("reportedUsage")}</caption>
      <thead><tr>${(["usageSubject", "inputTokens", "outputTokens", "cacheRead", "cacheWrite", "turns", "costColumn"] as const).map(
        (key) => html`<th scope="col">${t(key)}</th>`,
      )}</tr></thead>
      <tbody>${rows.map((row) => html`<tr>
        <th scope="row">${row.label}${"runId" in row ? html`<small>${row.runId ?? t("noIdentity")}</small>` : nothing}</th>
        <td>${number(row.usage.input)}</td><td>${number(row.usage.output)}</td>
        <td>${number(row.usage.cacheRead)}</td><td>${number(row.usage.cacheWrite)}</td>
        <td>${number(row.usage.turns)}</td><td>${content.cost(row.usage.cost)}</td>
      </tr>`)}</tbody>
    </table>
  </div><p class="meta">${t("usageCaveat")}</p>`;
}
