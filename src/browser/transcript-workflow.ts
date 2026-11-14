import { html, nothing, type TemplateResult } from "lit";
import { facts, durationBetween } from "./presentation.js";
import type { PanelContent } from "./localization.js";
import type { ToolDetails, ToolGraphNode, ToolHostStep, ToolWorkflowChildren, ToolReview, ToolRunner, ToolWatchdog } from "./transcript-schema.js";

type View = TemplateResult | typeof nothing;
export function reviewView(value: ToolReview | undefined, content: PanelContent): View {
  if (!value) return nothing;
  const { t } = content;
  return html`<section><h4>${t("reportedReview")}</h4><p>${value.status}</p>
    ${value.findings?.length ? html`<ul>${value.findings.map((finding) => html`<li><strong>${finding.severity}: ${finding.issue}</strong>
      ${facts([[t("toolPath"), finding.file], [t("rationale"), finding.rationale]])}</li>`)}</ul>` : nothing}
  </section>`;
}
export function watchdogView(value: ToolWatchdog | undefined, content: PanelContent): View {
  if (!value) return nothing;
  const { t } = content;
  return html`<section><h4>${t("childWatchdog")}</h4>${facts([
    [t("reportedState"), value.phase], [t("reason"), value.reason],
    [t("watchdogSequence"), content.number(value.seq)], [t("reportedEpoch"), content.number(value.lastUpdate)],
    [t("timedOut"), value.timedOut === undefined ? undefined : t(value.timedOut ? "yes" : "no")],
  ])}<p class="meta">${t("watchdogProgressNote")}</p>
  ${value.warnings?.length ? html`<ul>${value.warnings.map((warning) => html`<li><strong>${warning.summary}</strong>${facts([
    [t("severity"), warning.severity], [t("importance"), warning.importance], [t("category"), warning.category],
    [t("warningEvidence"), warning.evidence], [t("recommendedAction"), warning.recommendedAction],
    [t("addressed"), t(warning.addressed ? "yes" : "no")], [t("stalemate"), t(warning.stalemate ? "yes" : "no")],
    [t("displayedAt"), warning.displayedAt],
  ])}</li>`)}</ul>` : nothing}</section>`;
}
// The same provenance accompanies a result runner and a receipt's externalAdapter.
export function runnerView(value: Partial<ToolRunner> | undefined, content: PanelContent): View {
  if (!value) return nothing;
  const { t } = content;
  return html`<details><summary>${t("reportedRunner")}</summary>${facts([
    [t("runnerType"), value.type], [t("provider"), value.provider], [t("runnerCommand"), value.command],
    [t("runnerArguments"), value.args?.join("\n")], [t("promptDelivery"), value.promptDelivery],
    [t("adapterProfile"), value.adapter?.id], [t("executionMode"), value.adapter?.executionMode],
    [t("notResumableReason"), value.nonResumableReason],
    [t("sourceCommand"), value.safetySource?.command],
  ])}<p class="meta">${t("runnerProfileNote")}</p>
  ${value.safety ? html`<h4>${t("adapterProfile")}</h4>${facts(Object.entries(value.safety).map(([key, field]) => [key, typeof field === "boolean" ? t(field ? "yes" : "no") : field]))}` : nothing}
  </details>`;
}
function hostView(host: ToolHostStep, content: PanelContent): TemplateResult {
  const { t } = content;
  return html`<section><h4>${t("graphHostMonitor")}: ${host.label}</h4>${facts([
    [t("traceKey"), host.id], [t("monitorKind"), host.monitorKind], [t("provider"), host.provider], [t("role"), host.role],
    [t("reportedState"), host.state], [t("verdict"), host.verdict], [t("reason"), host.reasonCode], [t("detail"), host.detail],
    [t("reportedStale"), host.freshness?.stale === undefined ? undefined : t(host.freshness.stale ? "yes" : "no")],
    [t("expectedRef"), host.freshness?.expectedRef], [t("observedRef"), host.freshness?.observedRef],
  ])}</section>`;
}
function childrenView(value: ToolWorkflowChildren | undefined, content: PanelContent): View {
  if (!value) return nothing;
  const { t } = content;
  const num = (n: number | undefined) => n === undefined ? undefined : content.number(n);
  return html`<details><summary>${t("workflowChildren")}</summary>${facts([
    [t("traceRun"), value.workflowRunId], [t("parentToolCall"), value.parentToolCallId],
    [t("reportedState"), value.workflowState], [t("inventoryComplete"), t(value.inventoryComplete ? "yes" : "no")],
  ])}<ol>${value.children.map((child) => html`<li><strong>${child.sessionName ?? child.agent ?? child.childId}</strong>${facts([
    [t("childIdentity"), child.childId], [t("traceRun"), child.runId], [t("traceAgent"), child.agent],
    [t("reportedState"), child.state], [t("modelLabel"), child.model], [t("thinkingLabel"), child.thinking],
    [t("currentTool"), child.activity?.currentTool], [t("tools"), num(child.activity?.toolCount)], [t("turns"), num(child.activity?.turnCount)],
    [t("reportedTokens"), num(child.activity?.tokens)], [t("inputTokens"), num(child.activity?.inputTokens)], [t("outputTokens"), num(child.activity?.outputTokens)],
    [t("elapsed"), child.activity?.durationMs === undefined ? undefined : durationBetween(0, child.activity.durationMs, content)],
  ])}</li>`)}</ol></details>`;
}
function graphNode(node: ToolGraphNode, content: PanelContent): TemplateResult {
  const { t } = content;
  const host = node.hostStep;
  return html`<li><strong>${node.label}</strong> <span class="pill">${node.status}</span>${facts([
    [t("traceKey"), node.id], [t("nodeKind"), node.kind], [t("traceAgent"), node.agent], [t("tracePhase"), node.phase],
    [t("acceptance"), node.acceptanceStatus], [t("outputName"), node.outputName], [t("itemKey"), node.itemKey],
  ])}${node.error === undefined ? nothing : html`<p class="error">${node.error}</p>`}
  ${host ? hostView(host, content) : nothing}
  ${node.children?.length ? html`<ol>${node.children.map((child) => graphNode(child, content))}</ol>` : nothing}</li>`;
}
export function workflowView(details: ToolDetails | undefined, content: PanelContent): View {
  const graph = details?.workflowGraph, receipt = details?.workflow?.receipt;
  if (!graph && !receipt && !details?.workflowChildren) return nothing;
  const { t } = content;
  return html`<p class="meta">${t("workflowSubsetNote")}</p>
  ${childrenView(details?.workflowChildren, content)}
  ${graph ? html`<details><summary>${t("reportedGraph")}</summary>${facts([
    [t("traceRun"), graph.runId], [t("modeLabel"), graph.mode], [t("currentNode"), graph.currentNodeId],
  ])}${graph.phases.length ? html`<h4>${t("reportedPhases")}</h4><ul>${graph.phases.map((phase) => html`<li><strong>${phase.title}</strong>: ${phase.nodeIds.join(", ")}</li>`)}</ul>` : nothing}
    <ol>${graph.nodes.map((node) => graphNode(node, content))}</ol></details>` : nothing}
  ${receipt ? html`<details><summary>${t("workflowReceipt")}</summary>${facts([
    [t("traceRun"), receipt.workflowRunId], [t("reportedState"), receipt.state], [t("workflowResolution"), receipt.workflowResolution],
  ])}${receipt.hostSteps?.map((host) => hostView(host, content))}
  ${childrenView(receipt.workflowChildren, content)}<ol>${receipt.entries.map((entry) => html`<li><strong>${entry.key}</strong>${facts([
    [t("traceAgent"), entry.agent], [t("latestRun"), entry.latestRunId],
    [t("requestedContext"), entry.requestedContext], [t("resolvedContext"), entry.resolvedContext],
    [t("resumability"), entry.resumability.state], [t("reason"), entry.resumability.reason],
    [t("continuationRuns"), entry.continuation.runIds.join(", ")], [t("outputReference"), entry.outputReference],
    [t("terminalOutcome"), entry.terminalOutcome?.state], [t("terminalReason"), entry.terminalOutcome?.reason],
    [t("laneKey"), entry.lane?.key], [t("modeLabel"), entry.lane?.mode], [t("sourceRef"), entry.lane?.sourceRef],
    [t("claims"), entry.lane?.claims?.join("\n")], [t("outputPaths"), entry.lane?.outputPaths?.join("\n")],
  ])}${runnerView(entry.externalAdapter, content)}</li>`)}</ol></details>` : nothing}`;
}
