import { html, nothing, type TemplateResult } from "lit";
import { parseRpcInput, type JsonObject } from "../protocol.js";
import { englishContent, type PanelContent } from "./localization.js";

/** Only exact, unique protocol-valid IDs from an explicit list are selectable. */
export function selectableSchedule(records: JsonObject[] | undefined, id: string): boolean {
  if (!id || records?.filter((record) => record.id === id).length !== 1) return false;
  try {
    parseRpcInput({ version: 1, sessionId: "validation", requestId: "validation", method: "manage", params: { action: "schedule.show", id } });
    return true;
  } catch { return false; }
}

export function scheduleFacts(record: JsonObject, content: PanelContent = englishContent): TemplateResult {
  const { t } = content;
  const fields = [
    ["scheduleId", "id"], ["scheduleName", "name"], ["schedulePaused", "paused"],
    ["scheduleQuiet", "quiet"], ["scheduleSessionOnly", "sessionOnly"],
    ["scheduleCreated", "createdAt"], ["scheduleUpdated", "updatedAt"],
    ["scheduleActiveRun", "activeRunId"], ["scheduleLastRun", "lastRunId"],
    ["scheduleOverlap", "overlap"], ["scheduleCatchUp", "catchUp"],
  ] as const;
  return html`<dl class="facts">${fields.map(([label, key]) => html`<div><dt>${t(label)}</dt><dd>${record[key] === undefined ? t("unknown") : typeof record[key] === "boolean" ? t(record[key] ? "yes" : "no") : String(record[key])}</dd></div>`)}</dl>
    <p class="meta">${t("scheduleUnknownTiming")}</p>`;
}

export function scheduleHistory(runs: JsonObject[] | undefined, id: string, content: PanelContent = englishContent): TemplateResult {
  const { t } = content;
  const matching = runs?.filter((run) => run.scheduleId === id);
  return html`<h3>${t("scheduleHistory")}</h3><p class="meta">${t("scheduleHistoryNote")}</p>
    ${matching?.length ? html`<ul class="schedule-history">${matching.map((run) => html`<li>
      <strong>${String(run.id)}</strong> <span class="pill">${String(run.state)}</span>
      <dl class="facts">${([
        ["schedulePlanned", "plannedAt"], ["scheduleDueReason", "dueReason"],
        ["scheduleStarted", "startedAt"], ["scheduleCompleted", "completedAt"], ["traceRun", "asyncId"],
      ] as const).map(([label, key]) => html`<div><dt>${t(label)}</dt><dd>${run[key] === undefined ? t("unknown") : String(run[key])}</dd></div>`)}</dl>
      ${run.error ? html`<p class="warning">${String(run.error)}</p>` : nothing}
    </li>`)}</ul>` : html`<p>${t("scheduleNoHistory")}</p>`}`;
}
