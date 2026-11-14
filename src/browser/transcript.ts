import { LitElement, css, html, nothing, type TemplateResult } from "lit";
import type { TranscriptRendererContribution, TranscriptToolRendererInput } from "@jmfederico/pi-web/plugin-api";
import { englishContent, type PanelContent } from "./localization.js";
import { facts, durationBetween, workflowTrace } from "./presentation.js";
import { parseToolArgs, parseToolDetails, parseTextContent, type ToolProgress, type ToolResult, type ToolUsage, type ToolArgs } from "./transcript-schema.js";

/** No observers, timers, transport, or control callbacks. The host owns the frame and fallback. */
export class TranscriptCard extends LitElement {
  static override properties = { body: { attribute: false } };
  declare body: () => TemplateResult;
  constructor() {
    super();
    this.body = () => html``;
  }
  static override styles = css`
    :host { display: block; min-width: 0; color: var(--pi-text, inherit); font: 13px/1.5 var(--pi-font, system-ui); }
    section { min-width: 0; overflow-wrap: anywhere; }
    .card { padding: 12px; border: 1px solid var(--pi-border, currentColor); border-radius: 8px; background: var(--pi-surface, transparent); }
    h3, h4, p { margin: 0 0 8px; }
    h3 { font-size: 1.1em; } h4 { font-size: 1em; }
    .meta, dt { color: var(--pi-muted, inherit); }
    .facts { display: flex; flex-wrap: wrap; gap: 6px 18px; margin: 8px 0; }
    .facts > div { min-width: 0; } dt { font-size: .9em; } dd { margin: 0; white-space: pre-wrap; }
    .children, ol { padding-inline-start: 22px; }
    li { margin-block: 12px; }
    summary { cursor: pointer; min-height: 36px; display: list-item; align-content: center; }
    summary:focus-visible { outline: 2px solid var(--pi-accent, currentColor); outline-offset: 2px; }
    pre { white-space: pre-wrap; overflow-wrap: anywhere; font: 12px/1.5 var(--pi-mono, monospace); max-height: 360px; overflow: auto; }
    .pill { display: inline-block; padding-inline: 6px; border: 1px solid var(--pi-border, currentColor); border-radius: 4px; }
    .error { border-inline-start: 3px solid var(--pi-danger, currentColor); padding-inline-start: 8px; }
  `;
  protected override render(): TemplateResult { return this.body(); }
}
function disclosure(label: string, text: string | undefined): TemplateResult | typeof nothing {
  return text === undefined ? nothing : html`<details><summary>${label}</summary><pre tabindex="0">${text}</pre></details>`;
}
function usage(value: ToolUsage | undefined, content: PanelContent): TemplateResult | typeof nothing {
  if (!value) return nothing;
  const { t, number } = content;
  return facts([
    [t("inputTokens"), value.input === undefined ? undefined : number(value.input)],
    [t("outputTokens"), value.output === undefined ? undefined : number(value.output)],
    [t("cacheRead"), value.cacheRead === undefined ? undefined : number(value.cacheRead)],
    [t("cacheWrite"), value.cacheWrite === undefined ? undefined : number(value.cacheWrite)],
    [t("turns"), value.turns === undefined ? undefined : number(value.turns)],
    [t("costColumn"), value.cost === undefined ? undefined : content.cost(value.cost)],
  ]);
}
function progress(value: ToolProgress, content: PanelContent): TemplateResult {
  const { t, number } = content;
  const num = (v: number | undefined) => v === undefined ? undefined : number(v);
  return html`${facts([
    [t("reportedState"), value.status], [t("activityState"), value.activityState],
    [t("modelLabel"), value.model], [t("thinkingLabel"), value.thinking],
    [t("elapsed"), value.durationMs === undefined ? undefined : durationBetween(0, value.durationMs, content)],
    [t("currentTool"), value.currentTool], [t("toolArguments"), value.currentToolArgs], [t("toolPath"), value.currentPath],
    [t("tools"), num(value.toolCount)], [t("turns"), num(value.turnCount)],
    [t("reportedTokens"), num(value.tokens)], [t("inputTokens"), num(value.inputTokens)], [t("outputTokens"), num(value.outputTokens)],
    [t("cacheRead"), num(value.cacheRead)], [t("cacheWrite"), num(value.cacheWrite)],
    [t("windowTokens"), num(value.window)], [t("peakTokens"), num(value.windowPeak)],
  ])}
  ${value.progressText === undefined ? nothing : html`<p><strong>${t("progress")}</strong>: ${value.progressText}</p>`}
  ${value.error === undefined ? nothing : html`<p class="error">${value.error}</p>`}
  ${disclosure(t("childTask"), value.task)}
  ${disclosure(t("recentOutput"), value.recentOutput?.join("\n"))}
  ${value.recentTools?.length ? html`<details><summary>${t("recentTools")}</summary><ul>${value.recentTools.map((tool) => html`<li><strong>${tool.tool}</strong><pre>${tool.args}</pre></li>`)}</ul></details>` : nothing}`;
}
function requestedGroups(args: ToolArgs | undefined, content: PanelContent): TemplateResult | typeof nothing {
  if (!args?.tasks && !args?.chain) return nothing;
  const task = (value: { agent: string | undefined; task: string | undefined }) => html`<li><strong>${value.agent}</strong><pre>${value.task ?? content.t("unknown")}</pre></li>`;
  return html`<details><summary>${content.t("requestedGroups")}</summary>
    ${args.tasks ? html`<ul>${args.tasks.map(task)}</ul>` : html`<ol>${args.chain?.map((step) => step.parallel
      ? html`<li><strong>${content.t("requestedParallel")}</strong><ul>${step.parallel.map(task)}</ul></li>` : task(step))}</ol>`}
  </details>`;
}
function child(value: ToolResult, content: PanelContent): TemplateResult {
  const { t } = content;
  return html`<li><h4>${value.sessionName ?? value.agent}</h4>${facts([
    [t("traceAgent"), value.agent], [t("childIndex"), content.number(value.index)],
    [t("traceRun"), value.runId], [t("traceKey"), value.workflowKey],
    [t("contextLabel"), value.context], [t("modelLabel"), value.model], [t("thinkingLabel"), value.thinking],
    [t("exitCode"), content.number(value.exitCode)], [t("outputState"), value.outputState],
  ])}
  ${(["detached", "interrupted", "timedOut", "stopped", "outputPartial"] as const).filter((key) => value[key] === true).map((key) => html`<span class="pill">${t(key)}</span>`)}
  ${usage(value.usage, content)}
  ${value.error === undefined ? nothing : html`<p class="error">${value.error}</p>`}
  ${disclosure(t("childTask"), value.task)}${disclosure(t("childOutput"), value.finalOutput)}
  ${value.progress || value.progressSummary ? progress((value.progress ?? value.progressSummary)!, content) : nothing}
  ${value.outputSaveError === undefined ? nothing : html`<p class="error">${t("outputSaveError")}: ${value.outputSaveError}</p>`}
  ${value.metadataSaveError === undefined ? nothing : html`<p class="error">${t("metadataSaveError")}: ${value.metadataSaveError}</p>`}
  ${value.acceptance ? html`<section><h4>${t("acceptance")}</h4>${facts([
    [t("reportedState"), value.acceptance.status], [t("evidenceStatus"), value.acceptance.evidenceStatus],
    [t("parentDecision"), value.acceptance.parentDecision?.status], [t("reason"), value.acceptance.parentDecision?.reason],
  ])}<ul>${value.acceptance.runtimeChecks?.map((check) => html`<li>${check.id}: ${check.status} — ${check.message}</li>`)}</ul></section>` : nothing}
  </li>`;
}

/** Only the fixed released tool name is claimed. Renamable wait tools are delegated. */
export function toolRenderers(wrap: (body: () => TemplateResult) => TemplateResult, content = englishContent): TranscriptRendererContribution[] {
  return [{ id: "subagent-tool", target: "tool", resolve(name, next) {
    if (name !== "subagent") return next();
    return { render(input) {
      const body = toolBody(input, content);
      return body ? wrap(body) : undefined;
    } };
  } }];
}
export function toolBody(input: TranscriptToolRendererInput, content = englishContent): (() => TemplateResult) | undefined {
  const { entry, signal } = input;
  if (signal.aborted || entry.toolName !== "subagent") return undefined;
  const args = parseToolArgs(entry.args);
  const details = parseToolDetails(entry.details);
  const inProgress = entry.status === "pending" || entry.status === "running";
  if (!details && (entry.details !== undefined || !inProgress || !args)) return undefined;
  // Invalid supplied arguments retain the host view; partial streaming JSON can retry later.
  if (entry.args !== undefined && !args) return undefined;
  if (entry.resultText !== undefined && typeof entry.resultText !== "string") return undefined;
  const sourceOutput = entry.resultText ?? entry.content;
  const output = sourceOutput === undefined ? undefined : parseTextContent(sourceOutput);
  if (sourceOutput !== undefined && !output) return undefined;
  return () => {
    const { t } = content;
    return html`<section class="card" dir=${content.localization?.direction ?? "ltr"} aria-label=${t("toolCard")}>
      <h3>${t("toolCard")} · ${details?.mode ?? args?.action ?? args?.agent ?? t("unknown")}</h3>
      <p><span class="pill">${t("toolCallState")}: ${entry.status}</span></p>
      <p class="meta">${t("historicalToolNote")}</p>
      ${facts([
        [t("actionLabel"), args?.action], [t("traceRun"), details?.runId ?? details?.asyncId],
        [t("contextLabel"), details?.context],
        [t("backgroundLabel"), details?.background === undefined ? undefined : t(details.background ? "yes" : "no")],
        [t("workflowLabel"), typeof args?.workflow === "string" ? args.workflow : undefined],
        [t("reportedStepIndex"), details?.currentStepIndex === undefined ? undefined : content.number(details.currentStepIndex)],
        [t("reportedTotalSteps"), details?.totalSteps === undefined ? undefined : content.number(details.totalSteps)],
      ])}
      ${disclosure(t("requestedTask"), args?.task)}${requestedGroups(args, content)}
      ${details?.chainAgents ? html`<p>${t("reportedChain")}: ${details.chainAgents.join(" → ")}</p>` : nothing}
      ${details?.progress?.length ? html`<section><h4>${t("reportedProgress")}</h4><ol>${details.progress.map((item) => html`<li><h4>${item.sessionName ?? item.agent ?? t("unknown")}</h4>${progress(item, content)}</li>`)}</ol></section>` : nothing}
      ${details?.results.length ? html`<section><h4>${t("reportedChildren")}</h4><ol class="children">${details.results.map((item) => child(item, content))}</ol></section>` : nothing}
      ${details?.totalChildUsage ? html`<h4>${t("childrenUsage")}</h4>${usage(details.totalChildUsage, content)}` : nothing}
      ${details?.preflight ? html`<section><h4>${t("preflight")}</h4><p>${t("coverage")}: ${details.preflight.coverage}</p><p class="meta">${t("preflightNote")}</p><ol>${details.preflight.lanes.map((lane) => html`<li><strong>${lane.key}</strong>${facts([
        [t("modeLabel"), lane.mode], [t("parentDecision"), lane.decision], [t("expectedOutput"), lane.expectedOutput], [t("independence"), lane.independence],
      ])}<ul>${lane.claims?.map((claim) => html`<li>${claim}</li>`)}</ul></li>`)}</ol></section>` : nothing}
      ${(details?.preflightWarnings || details?.workflow?.preflightWarnings) ? html`<section><h4>${t("preflightWarnings")}</h4><ul>${[...(details.preflightWarnings ?? []), ...(details.workflow?.preflightWarnings ?? [])].map((warning) => html`<li>${warning}</li>`)}</ul></section>` : nothing}
      ${workflowTrace(details?.workflow as Parameters<typeof workflowTrace>[0], content)}
      ${disclosure(t("toolOutput"), output?.text)}
      ${output?.truncated ? html`<p class="meta">${t("toolOutputCapped")}</p>` : nothing}
    </section>`;
  };
}
