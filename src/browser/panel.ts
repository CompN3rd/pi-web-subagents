import {
  LitElement,
  css,
  html,
  nothing,
  type PropertyValues,
  type TemplateResult,
} from "lit";
import { repeat } from "lit/directives/repeat.js";
import { launchParams } from "./launch.js";
import { selectableSchedule, scheduleFacts, scheduleHistory } from "./schedules.js";
import { keyed } from "lit/directives/keyed.js";
import { guard } from "lit/directives/guard.js";
import { branchMatches, descendantCount, graphEntries, graphOccurrences, matchesRun, noFilter, type RunFilter } from "./graph.js";
import { englishContent, type PanelContent } from "./localization.js";
import { durationBetween, fleetMetrics, nodeFacts, usageTable, workflowTrace } from "./presentation.js";
import type {
  PluginSelectionService,
  WorkspacePanelContext,
} from "@jmfederico/pi-web/plugin-api";
import {
  MANAGEMENT_ACTIONS,
  type AsyncNode,
  type JsonObject,
  type RpcMethod,
} from "../protocol.js";
import {
  SubagentsController,
  scopeKey,
  selectedScope,
  type PanelState,
} from "./controller.js";

export function snapshotNotice(state: PanelState, content = englishContent): string {
  if (state.observedAt === undefined) return content.t("noSnapshot");
  return `${content.t(state.stale ? "staleSnapshot" : "lastSnapshot")} · ${content.date(state.observedAt)}`;
}
export function runTree(
  nodes: AsyncNode[],
  choose?: (id: string) => void,
  selected = "",
  content = englishContent,
  snapshotAt?: number,
  path: string[] = [],
  filter: RunFilter = noFilter,
): TemplateResult {
  const { t } = content;
  // Empty guard dependencies set disclosure defaults once, never overriding native toggles on polls.
  return html`<ul class=${path.length === 0 ? "tree forest" : "tree branches"}>
    ${repeat(
      graphOccurrences(nodes),
      (entry) => entry.key,
      ({ node, key }) => {
        const selectionKey = JSON.stringify([...path, key]);
        const descendants = descendantCount(node);
        return html`<li class=${path.length === 0 ? "graph-root" : "graph-child"} ?hidden=${!branchMatches(node, filter)}>
          <article
            class="node-card"
            data-selected=${!!choose && selectionKey === selected}
          >
            <div class="run-row">
              ${choose
                ? html`<button
                    class="ui-button run"
                    aria-pressed=${selectionKey === selected}
                    @click=${() => choose(selectionKey)}
                  >${node.label}</button>`
                : html`<strong>${node.label}</strong>`}
              <span class="pill" data-state=${node.state}>${node.state}</span>
              ${choose && selectionKey === selected
                ? html`<span class="selected-label">${t("selected")}</span>`
                : nothing}
            </div>
            <div class="meta">
              ${node.kind} · <code>${node.id}</code>${node.model
                ? html` · ${node.model}`
                : nothing}${node.thinking ? html` · ${t("thinking", { value: node.thinking })}` : nothing}${node.agent ? html` · ${node.agent}` : nothing}
            </div>
            ${nodeFacts(node, snapshotAt, content)}
            ${node.activity
              ? html`<details class="node-details">
                  <summary>${t("activity")}</summary>
                  <pre class="activity">${JSON.stringify(node.activity, null, 2)}</pre>
                </details>`
              : nothing}
            ${node.hostStep
              ? html`<details class="node-details">
                  <summary>${t("hostStep")}</summary>
                  <pre>${JSON.stringify(node.hostStep, null, 2)}</pre>
                </details>`
              : nothing}
          </article>
          ${descendants
            ? html`<details
                class="branch-disclosure"
                ?open=${guard([], () => descendants <= 8)}
              >
                <summary>
                  ${t(descendants === 1 ? "descendant" : "descendants", { count: content.number(descendants) })}
                </summary>
                ${runTree(node.children!, choose, selected, content, snapshotAt, [...path, key], filter)}
              </details>`
            : nothing}
        </li>`;
      },
    )}
  </ul>`;
}
export function overview(
  state: PanelState,
  choose: (id: string) => void,
  selected: string,
  content = englishContent,
  filter: RunFilter = noFilter,
  filterControls: TemplateResult | typeof nothing = nothing,
): TemplateResult {
  const { t } = content;
  const fleet = state.status?.fleet;
  const snapshot = state.status?.asyncSnapshot;
  const entries = graphEntries(snapshot?.runs ?? []);
  return html`<section aria-labelledby="runs-heading" aria-describedby="graph-description">
      <h2 id="runs-heading" tabindex="-1">
        ${t("runs")}
        <span class="pill"
          >${fleet ? t("reportedActive", { count: content.number(fleet.totalActive) }) : t("unavailable")}</span
        >
      </h2>
      <p class="meta">
        ${t("fleetNote")}
      </p>
      ${fleet
        ? html`${fleet.topLevelAsyncCapacity
              ? fleet.topLevelAsyncCapacity.limit > 0
                ? html`<p>
                    ${t("capacity", { used: content.number(fleet.topLevelAsyncCapacity.used), limit: content.number(fleet.topLevelAsyncCapacity.limit) })}
                  </p>`
                : html`<p>${t("unlimited")}</p>`
              : nothing}
            ${fleet.omitted
              ? html`<p class="warning">
                  ${t("omittedFleet", { count: content.number(fleet.omitted) })}
                </p>`
              : nothing}`
        : html`<p>
            ${t("noFleet")}
          </p>`}
      <p id="graph-description" class="meta">
        ${t("graphNote")}
      </p>
      ${filterControls}
      ${snapshot
        ? html`<p class="meta">
              ${t("generated", { date: content.date(snapshot.generatedAt) })}
              ${t("factsAtSnapshot")}
            </p>
            ${snapshot.omitted.runs ||
            snapshot.omitted.children ||
            snapshot.omitted.byteLimitExceeded
              ? html`<p class="warning">
                  ${t("bounded", { runs: content.number(snapshot.omitted.runs), children: content.number(snapshot.omitted.children), bytes: snapshot.omitted.byteLimitExceeded ? t("byteLimit") : "" })}
                </p>`
              : nothing}
            <p class="meta" role="status">${t("filterCount", { count: content.number(entries.filter(({ node }) => matchesRun(node, filter)).length), total: content.number(entries.length) })}</p>
            ${runTree(snapshot.runs, choose, selected, content, snapshot.generatedAt, [], filter)}${!snapshot.runs.length
              ? html`<p>${t("noRuns")}</p>`
              : nothing}`
        : html`<p>
            ${t("noProjection")}
          </p>`}
      <details class="unlinked-agents">
        <summary>${t("furtherAgents")} · ${fleet ? t("visible", { count: content.number(fleet.entries.length) }) : t("unavailable")}</summary>
      <p class="meta">
        ${t("unlinked")} ${t("fleetAtObservation")}
      </p>
      ${fleet
        ? html`<ul class="fleet">
              ${fleet.entries.map(
                (entry) =>
                  html`<li>
                    <strong>${entry.agent}</strong>
                    <span class="meta"
                      >${entry.role ?? ""} ·
                      ${entry.model ?? t("noModel")}</span
                    >
                    <p class="reported-goal">${entry.goal ?? t("noGoal")}</p>
                    <small>${entry.effort ?? t("noEffort")} ·
                      ${t("elapsed")}: ${durationBetween(entry.startedAt, state.observedAt, content)}</small>
                    ${fleetMetrics(entry.tokens, content)}
                  </li>`,
              )}
            </ul>
            ${!fleet.entries.length
              ? html`<p>${t("noEntries")}</p>`
              : nothing}`
        : html`<p>${t("fleetUnavailable")}</p>`}
      </details>
      ${state.status?.text
        ? html`<details>
            <summary>${t("statusSummary")}</summary>
            <pre>${state.status.text}</pre>
          </details>`
        : nothing}
    </section>`;
}
const supervisorText =
  "Inspect pending supervisor requests using your subagent_supervisor tool and help me answer them. Do not assume this message itself answers any request.";
/** Stage an ordinary message, never a supervisor answer or an automatic send. */
export async function stageParentMessage(
  context: WorkspacePanelContext,
  kind: "supervisor" | "admin",
  selection = context.state,
): Promise<string> {
  const scope = selectedScope(context, selection);
  if (!scope || context.state?.selectedSession?.id !== scope.sessionId)
    throw new Error(
      "A ready exact parent conversation and matching composer context are required",
    );
  const text = kind === "supervisor" ? supervisorText : "/subagents";
  if (kind === "supervisor" && context.prompt.setChip) {
    context.prompt.setChip({
      id: "supervisor-help",
      label: "Inspect supervisor requests",
      text,
    });
    await context.navigate({ ...scope, view: "chat" });
    return "Ordinary parent message staged as a chip. Review and manually Send in chat; no request has been answered.";
  }
  if (context.prompt.getText())
    throw new Error(
      "Existing draft preserved. Open the parent chat and add the suggested text manually.",
    );
  // Chips turn slash text into an ordinary prompt. Withdraw only our own
  // supervisor intent; other plugins' chips remain user-owned.
  if (kind === "admin") context.prompt.removeChip?.("supervisor-help");
  // Insert only into the captured composer. It can be unmounted; do not claim staging without reading it back.
  context.prompt.insertText(text);
  const inserted = context.prompt.getText().includes(text);
  await context.navigate({ ...scope, view: "chat" });
  const chipWarning =
    kind === "admin"
      ? " Remove ALL composer chips before sending /subagents; with chips it is an ordinary prompt, not a command."
      : "";
  return (
    (inserted
      ? "Draft prepared. Review and manually Send in chat; nothing was executed or answered."
      : `Composer was unmounted. Paste in the parent chat and manually Send: ${text}`) +
    chipWarning
  );
}
interface Confirmation {
  method: RpcMethod;
  params: JsonObject;
  scope: string;
  origin?: HTMLElement;
}
export class SubagentsPanel extends LitElement {
  static override properties = {
    context: { attribute: false },
    selection: { attribute: false },
    lifetime: { attribute: false },
  };
  content: PanelContent = englishContent;
  declare context: WorkspacePanelContext | undefined;
  declare selection: PluginSelectionService | undefined;
  declare lifetime: AbortSignal | undefined;
  readonly controller = new SubagentsController(() => {
    this.requestUpdate();
    this.context?.host.requestRender();
  });
  private graphFocus: HTMLElement | undefined;
  private offSelection: (() => void) | undefined;
  private listenedLifetime: AbortSignal | undefined;
  private selected = "";
  private autoScrollOutput = true;
  private renderedOutput: PanelState["transcript"];
  private outputLines = 80;
  private filter: RunFilter = { ...noFilter };
  private confirmation: Confirmation | undefined;
  private selectedSchedule = "";
  private launchOpen = false;
  private launchKind = "agent";
  private notice = "";
  private formScope = "";
  private active = false;
  private inViewport = true;
  private intersection: IntersectionObserver | undefined;
  private readonly visibility = (): void =>
    this.controller.setVisible(
      document.visibilityState !== "hidden" && this.inViewport,
    );
  private readonly stopped = (): void => {
    this.active = false;
    this.controller.unmount();
    this.offSelection?.();
    this.offSelection = undefined;
    document.removeEventListener("visibilitychange", this.visibility);
    this.intersection?.disconnect();
    this.intersection = undefined;
  };
  override connectedCallback(): void {
    super.connectedCallback();
    this.active = true;
    document.addEventListener("visibilitychange", this.visibility);
    if (typeof IntersectionObserver !== "undefined") {
      this.inViewport = false;
      this.intersection = new IntersectionObserver((entries) => {
        // Rapid scrolling/resizing can batch several transitions for this root.
        // The first entry can be obsolete with no later callback to correct it.
        const entry = entries.at(-1);
        if (!entry) return;
        this.inViewport = entry.isIntersecting;
        this.visibility();
      });
      this.intersection.observe(this);
    }
    this.visibility();
    this.bind();
    // Host property bindings settle after connection; never refresh a reconnected old scope first.
    void this.updateComplete.then(() => {
      if (this.active) {
        this.sync();
        this.controller.mount();
      }
    });
  }
  override disconnectedCallback(): void {
    this.stopped();
    this.listenedLifetime?.removeEventListener("abort", this.stopped);
    super.disconnectedCallback();
  }
  protected override willUpdate(): void {
    if (this.selected && !this.selectedEntry()) {
      this.selected = "";
      this.confirmation = undefined;
    }
    if (this.selectedSchedule && !selectableSchedule(this.controller.state.scheduleRecords, this.selectedSchedule)) {
      this.selectedSchedule = "";
      if (this.confirmation?.method === "manage") this.confirmation = undefined;
    }
    this.controller.selectOutput(this.selectedEntry()?.controlId ?? "");
    const focused = this.shadowRoot?.activeElement;
    this.graphFocus =
      focused instanceof HTMLElement && (focused.closest(".graph-root") || focused.closest(".inspector"))
        ? focused
        : undefined;
  }
  protected override updated(changed: PropertyValues): void {
    // Keyed cards preserve DOM/disclosures; moving a focused card can still blur it.
    const focused = this.graphFocus;
    this.graphFocus = undefined;
    if (focused && this.shadowRoot?.activeElement !== focused) {
      if (focused.isConnected) focused.focus();
      else this.renderRoot.querySelector<HTMLElement>("#runs-heading")?.focus();
    }
    if (changed.has("selection") || changed.has("lifetime")) this.bind();
    if (changed.has("context")) this.sync();
    const output = this.controller.state.transcript;
    if (output !== this.renderedOutput) {
      this.renderedOutput = output;
      if (this.autoScrollOutput) this.scrollOutputToEnd();
    }
  }
  private scrollOutputToEnd(): void {
    const output = this.renderRoot.querySelector<HTMLElement>(".targeted-output");
    if (output) output.scrollTop = output.scrollHeight;
  }
  private jumpToLatest = (): void => {
    this.autoScrollOutput = true;
    this.scrollOutputToEnd();
    this.requestUpdate();
  };
  private bind(): void {
    this.offSelection?.();
    this.offSelection = undefined;
    this.listenedLifetime?.removeEventListener("abort", this.stopped);
    this.listenedLifetime = this.lifetime;
    if (!this.active) return;
    if (this.lifetime?.aborted) {
      this.stopped();
      return;
    }
    this.lifetime?.addEventListener("abort", this.stopped, { once: true });
    this.offSelection = this.selection?.subscribe(() => this.sync());
    this.sync();
  }
  private sync(): void {
    if (!this.context || !this.active) return;
    this.controller.update(this.context, this.selection?.getSnapshot());
    const scope = this.controller.state.scope;
    const key = scope ? scopeKey(scope) : "";
    if (key !== this.formScope) {
      this.formScope = key;
      this.selected = "";
      this.autoScrollOutput = true;
      this.outputLines = 80;
      this.filter = { ...noFilter };
      this.selectedSchedule = "";
      this.launchOpen = false;
      this.launchKind = "agent";
      this.confirmation = undefined;
      this.notice = "";
      // Uncontrolled form drafts must never migrate into a different conversation.
      this.renderRoot.querySelectorAll("form").forEach((form) => form.reset());
      this.requestUpdate();
    }
  }
  private supports(method: RpcMethod, action?: string): boolean {
    return (
      !this.controller.state.busy && this.controller.supports(method, action)
    );
  }
  private selectedEntry() {
    return graphEntries(this.controller.state.status?.asyncSnapshot?.runs ?? []).find((entry) => entry.key === this.selected);
  }
  private choose = (key: string): void => {
    this.sync();
    if (graphEntries(this.controller.state.status?.asyncSnapshot?.runs ?? []).some((entry) => entry.key === key)) {
      if (this.selected !== key) this.autoScrollOutput = true;
      this.selected = key;
      this.controller.selectOutput(this.selectedEntry()?.controlId ?? "");
      this.confirmation = undefined;
      this.requestUpdate();
      void this.updateComplete.then(() => this.renderRoot.querySelector<HTMLElement>("#control-heading")?.focus());
    }
  };
  private back = (): void => {
    this.selected = "";
    this.controller.selectOutput("");
    this.confirmation = undefined;
    this.requestUpdate();
    void this.updateComplete.then(() => this.renderRoot.querySelector<HTMLElement>("#runs-heading")?.focus());
  };
  private hasRun(id: unknown): boolean {
    const target = this.selectedEntry()?.controlId;
    return !this.controller.state.stale && !!target && target === id;
  }
  private operate(method: RpcMethod, params: JsonObject): void {
    const initiatingScope = this.formScope;
    this.sync();
    if (
      initiatingScope !== this.formScope ||
      !this.controller.available ||
      this.controller.state.busy
    )
      return;
    if (
      (["stop", "interrupt", "resume", "steer"].includes(method) || (method === "status" && !!params.id)) &&
      !this.hasRun(params.id)
    )
      return;
    if (method === "manage" && params.action !== "schedule.list" &&
      (params.id !== this.selectedSchedule || !selectableSchedule(this.controller.state.scheduleRecords, this.selectedSchedule))) return;
    const needsConfirmation =
      ["spawn", "stop", "interrupt", "resume"].includes(method) ||
      (method === "manage" &&
        !["schedule.list", "schedule.show", "schedule.history"].includes(
          String(params.action),
        ));
    if (needsConfirmation) {
      this.confirmation = {
        method,
        params,
        scope: this.formScope,
        ...(this.shadowRoot?.activeElement instanceof HTMLElement
          ? { origin: this.shadowRoot.activeElement }
          : {}),
      };
      this.requestUpdate();
      void this.updateComplete.then(() =>
        this.renderRoot.querySelector<HTMLElement>(".confirmation")?.focus(),
      );
    } else void this.controller.perform(method, params);
  }
  private restoreConfirmationFocus(pending: Confirmation | undefined): void {
    void this.updateComplete.then(() => {
      if (!pending || !this.isConnected || pending.scope !== this.formScope)
        return;
      const origin = pending.origin;
      if (origin?.isConnected && !origin.matches(":disabled")) origin.focus();
      else this.renderRoot.querySelector<HTMLElement>("h1")?.focus();
    });
  }
  private cancel = (): void => {
    const pending = this.confirmation;
    this.confirmation = undefined;
    this.requestUpdate();
    this.restoreConfirmationFocus(pending);
  };
  private confirm = (): void => {
    const pending = this.confirmation;
    this.sync();
    this.confirmation = undefined;
    this.requestUpdate();
    if (
      pending &&
      pending.scope === this.formScope &&
      this.controller.available &&
      (!["stop", "interrupt", "resume", "steer"].includes(pending.method) || this.hasRun(pending.params.id)) &&
      (pending.method !== "manage" || (pending.params.id === this.selectedSchedule && selectableSchedule(this.controller.state.scheduleRecords, this.selectedSchedule)))
    )
      void this.controller.perform(pending.method, pending.params, true);
    this.restoreConfirmationFocus(pending);
  };
  private form(event: Event): FormData {
    event.preventDefault();
    return new FormData(event.currentTarget as HTMLFormElement);
  }
  private launch = (event: Event): void => {
    const data = this.form(event);
    try {
      const params = launchParams(data);
      this.notice = "";
      this.operate("spawn", params);
    } catch (error) {
      this.notice = this.content.t("invalidLaunch", { error: String(error) });
      this.requestUpdate();
    }
  };
  private toggleLaunch = (): void => {
    this.sync();
    this.launchOpen = !this.launchOpen;
    this.requestUpdate();
    void this.updateComplete.then(() => this.renderRoot.querySelector<HTMLElement>(this.launchOpen ? "#launch-heading" : "#new-run")?.focus());
  };
  private helper = async (kind: "supervisor" | "admin"): Promise<void> => {
    const initiatingScope = this.formScope;
    this.sync();
    const context = this.context;
    const scope = this.formScope;
    if (!context || initiatingScope !== scope) return;
    try {
      const message = await stageParentMessage(
        context,
        kind,
        this.selection?.getSnapshot() ?? context.state,
      );
      if (scope === this.formScope) this.notice = message;
    } catch (error) {
      if (scope === this.formScope) this.notice = String(error);
    }
    this.requestUpdate();
  };
  protected override render(): TemplateResult {
    const { t } = this.content;
    const state = this.controller.state;
    const entry = this.selectedEntry();
    const selectedRun = entry?.node;
    const target = entry?.controlId;
    const disabledRun = !target || state.stale;
    return html`<main
      aria-label=${t("supervision")}
      dir=${this.content.localization?.direction ?? "ltr"}
      aria-busy=${state.refreshing || state.busy}
    >
      <header>
        <div>
          <p class="eyebrow">${t("eyebrow")}</p>
          <h1 tabindex="-1">${t("title")}</h1>
        </div>
        <button class="ui-button"
          ?disabled=${!this.controller.available || state.refreshing}
          @click=${() => {
            this.sync();
            void this.controller.refresh();
          }}
        >
          ${t(state.refreshing ? "refreshing" : "refresh")}
        </button>
        <button id="new-run" class="ui-button" aria-expanded=${this.launchOpen} aria-controls="launch-form" @click=${this.toggleLaunch}>${t("newRun")}</button>
      </header>
      <p class="scope">
        ${state.scope
          ? `${state.scope.machineId} / ${state.scope.projectId} / ${state.scope.workspaceId} / ${state.scope.sessionId}`
          : t("noSelection")}
      </p>
      <p class=${state.stale ? "warning" : "meta"} role="status">
        ${snapshotNotice(state, this.content)}
      </p>
      <p class="meta">
        ${state.ping?.events.jobsChanged === "subagent:jobs-changed"
          ? t("events")
          : t("polling")} ${t("hidden")}
      </p>
      ${state.error
        ? html`<p class="error" role="alert">${state.error}</p>`
        : nothing}
      ${this.notice
        ? html`<p class="notice" role="status">${this.notice}</p>`
        : nothing}
      <details>
        <summary>${t("capabilities")}</summary>
        <p>
          ${state.ping
            ? t("methods", { methods: state.ping.methods.join(", ") })
            : t("noCapabilities")}
        </p>
        ${state.ping
          ? html`<pre>${JSON.stringify(state.ping.capabilities, null, 2)}</pre>`
          : nothing}
        <p>
          ${t("boundaries")}
        </p>
      </details>
      <div class="fleet-workspace" data-inspecting=${!!selectedRun}>
      <div class="roster">
      ${keyed(this.formScope, overview(state, this.choose, this.selected, this.content, this.filter, html`
        <div class="filters">
          <label>${t("filterRuns")}<input type="search" .value=${this.filter.query} @input=${(event: Event) => {
            this.filter = { ...this.filter, query: (event.target as HTMLInputElement).value };
            this.requestUpdate();
          }} /></label>
          <label>${t("filterState")}<select class="ui-select" .value=${this.filter.state} @change=${(event: Event) => {
            this.filter = { ...this.filter, state: (event.target as HTMLSelectElement).value as RunFilter["state"] };
            this.requestUpdate();
          }}><option value="all">${t("allRuns")}</option><option value="active">${t("activeRuns")}</option><option value="attention">${t("attentionRuns")}</option><option value="recent">${t("recentRuns")}</option></select></label>
        </div>`))}
      </div>
      ${selectedRun ? keyed(JSON.stringify([this.formScope, this.selected]), html`<section class="inspector" aria-labelledby="control-heading">
        <button class="ui-button" @click=${this.back}>${t("backToRuns")}</button>
        <h2 id="control-heading" tabindex="-1">${selectedRun.label} — ${t("controls")}</h2>
        <p><span class="pill" data-state=${selectedRun.state}>${selectedRun.state}</span> · ${selectedRun.kind} · <code>${selectedRun.id}</code></p>
        <p class="meta">${[selectedRun.agent, selectedRun.model, selectedRun.thinking].filter(Boolean).join(" · ")}</p>
        ${nodeFacts(selectedRun, state.status?.asyncSnapshot?.generatedAt, this.content)}
        <details><summary>${t("snapshotEvidence")}</summary><pre>${JSON.stringify(selectedRun, null, 2)}</pre></details>
        ${target ? html`<p>${t("target")} <code>${target}</code></p>
        <form
          @submit=${(event: Event) => {
            const data = this.form(event);
            this.sync();
            if (this.hasRun(target)) {
              this.outputLines = Number(data.get("lines"));
              void this.controller.readOutput(this.outputLines);
            }
          }}
        >
          <label
            >${t("lines")}
            <input
              name="lines"
              type="number"
              min="1"
              max="500"
              .value=${String(this.outputLines)}
              @change=${(event: Event) => { this.outputLines = Number((event.target as HTMLInputElement).value); }}
              required
          /></label>
          <button class="ui-button"
            ?disabled=${disabledRun ||
            !this.supports("status") ||
            state.outputLoading}
          >
            ${t("loadTranscript")}
          </button>
        </form>
        <div class="actions output-actions">
          <button class="ui-button" aria-pressed=${state.outputFollowing}
            ?disabled=${!state.outputFollowing && (disabledRun || !this.supports("status"))}
            @click=${() => {
              this.sync();
              if (state.outputFollowing || this.hasRun(target)) this.controller.setOutputFollowing(!state.outputFollowing, this.outputLines);
            }}>${t(state.outputFollowing ? "stopFollowing" : "followOutput")}</button>
          <button class="ui-button" ?disabled=${!state.transcript || state.transcriptId !== target}
            @click=${this.jumpToLatest}>${t("jumpToLatest")}</button>
        </div>
        <p class="meta">${t("followNote")} ${!this.autoScrollOutput ? t("scrollPaused") : ""}</p>
        ${state.outputError ? html`<p class="error" role="alert">${t("outputReadError", { error: state.outputError })}</p>` : nothing}
        <div class="actions">
          <button class="ui-button"
            ?disabled=${disabledRun || !this.supports("interrupt")}
            @click=${() => this.operate("interrupt", { id: target })}
          >
            ${t("interrupt")}
          </button>
          <button
            class="ui-button danger"
            ?disabled=${disabledRun || !this.supports("stop")}
            @click=${() => this.operate("stop", { id: target })}
          >
            ${t("stop")}
          </button>
        </div>
        <form
          @submit=${(event: Event) => {
            const data = this.form(event);
            const method = String(data.get("action")) as "steer" | "resume";
            this.operate(method, {
              id: target,
              message: String(data.get("message")),
              ...(method === "steer" ? { mode: String(data.get("mode")) } : {}),
            });
          }}
        >
          <label
            >${t("message")}
            <textarea
              name="message"
              required
              maxlength="16384"
              rows="3"
              placeholder=${t("messagePlaceholder")}
            ></textarea>
          </label>
          <div class="actions">
            <label
              >${t("action")}
              <select class="ui-select" name="action">
                <option value="steer">${t("steerNever")}</option>
                <option value="resume">${t("resume")}</option>
              </select></label
            >
            <label
              >${t("steeringMode")}
              <select class="ui-select" name="mode">
                <option value="auto">${t("auto")}</option>
                <option value="steer">${t("steer")}</option>
                <option value="follow_up">${t("followUp")}</option>
              </select></label
            >
            <button class="ui-button"
              ?disabled=${disabledRun ||
              (!this.supports("steer") && !this.supports("resume"))}
            >
              ${t("send")}
            </button>
          </div>
        </form>
        <p class="meta">
          ${t("controlNote")}
        </p>
        ${state.transcript && state.transcriptId === target
          ? html`<h3>${t("targetedOutput")} · ${state.transcriptId}</h3>
              <p class="meta">${t("lastRead")} ${state.transcriptAt === undefined ? "" : this.content.date(state.transcriptAt)} · ${t(state.outputFollowing ? "following" : "notFollowing")}</p>
              <pre class="targeted-output" tabindex="0" aria-label=${t("outputLabel")}
                @scroll=${(event: Event) => {
                  const output = event.currentTarget as HTMLElement;
                  const atEnd = output.scrollHeight - output.clientHeight - output.scrollTop <= 24;
                  if (this.autoScrollOutput !== atEnd) {
                    this.autoScrollOutput = atEnd;
                    this.requestUpdate();
                  }
                }}>${state.transcript.text}</pre
              >
              ${workflowTrace(state.transcript.details?.workflow, this.content)}
              ${state.transcript.details
                ? html`<details>
                    <summary>${t("evidence")}</summary>
                    <pre>
${JSON.stringify(state.transcript.details, null, 2)}</pre
                    >
                  </details>`
                : nothing}`
          : nothing}
        ` : html`<p class="warning">${t("readOnlyNode")}</p>`}
      </section>`) : html`<section class="inspector"><p>${t("chooseRun")}</p></section>`}
      </div>
      <section id="launch-form" ?hidden=${!this.launchOpen} aria-labelledby="launch-heading">
        <h2 id="launch-heading" tabindex="-1">${t("launch")}</h2>
        <button class="ui-button" @click=${this.toggleLaunch}>${t("closeLaunch")}</button>
          <form @submit=${this.launch}>
            <label
              >${t("launchType")}
              <select class="ui-select" name="kind" .value=${this.launchKind} @change=${(event: Event) => {
                this.launchKind = (event.target as HTMLSelectElement).value;
                this.confirmation = undefined;
                this.requestUpdate();
              }}>
                <option value="agent">${t("configuredAgent")}</option>
                <option value="script">${t("script")}</option>
                <option value="workflow">${t("workflow")}</option>
              </select></label
            >
            ${keyed(this.launchKind, html`<label>
              ${t(this.launchKind === "agent" ? "configuredAgent" : this.launchKind === "script" ? "script" : "workflow")}
              <textarea name="source" rows="2" required maxlength="32768"></textarea>
            </label>
            ${this.launchKind === "agent" ? html`<label>${t("task")}<textarea name="task" rows="3" maxlength="32768"></textarea></label>`
              : html`<label>${t("args")}<textarea name="args" rows="2" maxlength="32768" placeholder="{}"></textarea></label>`}`)}
            <div class="actions">
              <label
                >${t("context")}
                <select class="ui-select" name="context">
                  <option value="fresh">${t("fresh")}</option>
                  <option value="fork">${t("fork")}</option>
                </select></label
              >
              <label
                >${t("model")} <input name="model" maxlength="256" /></label
              ><label
                >${t("label")} <input name="label" maxlength="160"
              /></label>
            </div>
            <p class="meta">
              ${t("launchNote")} ${t("launchCatalogNote")}
            </p>
            <button class="ui-button" ?disabled=${!this.supports("spawn")}>${t("reviewLaunch")}</button>
          </form>
      </section>
      <section id="schedules-section">
        <h2>${t("schedules")}</h2>
        <button class="ui-button"
          ?disabled=${!this.supports("manage", "schedule.list")}
          @click=${() => this.operate("manage", { action: "schedule.list" })}
        >
          ${t("listSchedules")}
        </button>
        <p class="meta">${t("scheduleListNote")}</p>
        ${state.scheduleRecordsAt === undefined ? nothing : html`<p class="meta">${t("scheduleListAt", { date: this.content.date(state.scheduleRecordsAt) })}</p>`}
        ${state.scheduleRecords ? html`<ul class="schedule-list">${state.scheduleRecords.map((record) => html`<li>
          <button class="ui-button" aria-pressed=${record.id === this.selectedSchedule}
            ?disabled=${!selectableSchedule(state.scheduleRecords, String(record.id))}
            @click=${() => {
              const scope = this.formScope;
              this.sync();
              if (scope !== this.formScope || !selectableSchedule(this.controller.state.scheduleRecords, String(record.id))) return;
              this.selectedSchedule = String(record.id);
              this.confirmation = undefined;
              this.requestUpdate();
              void this.updateComplete.then(() => this.renderRoot.querySelector<HTMLElement>("#schedule-heading")?.focus());
            }}>${String(record.name)} · ${String(record.id)}</button>
          <span class="pill">${t(record.paused ? "schedulePausedState" : "scheduleEnabledState")}</span>
        </li>`)}</ul>${state.scheduleRecords.length ? nothing : html`<p>${t("scheduleEmpty")}</p>`}` : html`<p>${t("schedulesNotLoaded")}</p>`}
        ${this.selectedSchedule ? html`<article class="schedule-detail">
          <h3 id="schedule-heading" tabindex="-1">${t("scheduleSelected")} · ${this.selectedSchedule}</h3>
          ${scheduleFacts(state.scheduleRecords!.find((record) => record.id === this.selectedSchedule)!, this.content)}
          <div class="actions">${MANAGEMENT_ACTIONS.filter((action) => action !== "schedule.list").map((action) => html`<button
            class="ui-button" ?disabled=${!this.supports("manage", action)}
            @click=${() => this.operate("manage", { action, id: this.selectedSchedule })}
          >${t(action === "schedule.show" ? "scheduleShow" : action === "schedule.history" ? "scheduleHistory" : action === "schedule.pause" ? "schedulePause" : action === "schedule.resume" ? "scheduleResume" : action === "schedule.run" ? "scheduleRun" : "scheduleDelete")}</button>`)}</div>
          ${state.scheduleTarget === this.selectedSchedule && state.scheduleAction === "schedule.show"
            ? (state.schedules?.details?.schedules?.records ?? []).filter((record) => record.id === this.selectedSchedule).map((record) => html`<h4>${t("scheduleShowResult")}</h4>${scheduleFacts(record, this.content)}`) : nothing}
          ${state.scheduleTarget === this.selectedSchedule && state.scheduleAction === "schedule.history"
            ? scheduleHistory(state.schedules?.details?.schedules?.runs, this.selectedSchedule, this.content) : nothing}
        </article>` : html`<p>${t("scheduleChoose")}</p>`}
        ${state.schedules ? html`<p class="meta">${t("scheduleCached")} ${state.scheduleAction} · ${state.scheduleTarget} · ${state.schedulesAt === undefined ? "" : this.content.date(state.schedulesAt)}</p>
          <details><summary>${t("scheduleOutput")}</summary><pre tabindex="0">${state.schedules.text}</pre>
            ${state.schedules.details?.schedules ? html`<pre>${JSON.stringify(state.schedules.details.schedules, null, 2)}</pre>` : nothing}
          </details>` : nothing}
      </section>
      <section>
        <h2>${t("cost")} <span class="pill">${t("onDemand")}</span></h2>
        <button class="ui-button"
          ?disabled=${!this.supports("cost")}
          @click=${() => {
            this.sync();
            void this.controller.perform("cost");
          }}
        >
          ${t("calculate")}
        </button>
        ${state.cost
          ? html`<p>
                ${t("cachedCost", { date: this.content.date(state.costAt!), status: state.cost.unresolvedAsyncChildren ? t("lowerBound", { count: this.content.number(state.cost.unresolvedAsyncChildren) }) : t("noUnresolved") })}
              </p>
              <p class="total">
                ${this.content.cost(state.cost.total.cost)}
                <span class="meta">${t("totalCost")}</span>
              </p>
              ${usageTable(state.cost, this.content)}`
          : html`<p>
              ${t("noCost")}
            </p>`}
      </section>
      <section>
        <h2>${t("receipts")}</h2>
        <p class="meta">
          ${t("receiptsNote")}
        </p>
        <ul class="receipts">
          ${this.controller.currentReceipts.map(
            (receipt) =>
              html`<li>
                <strong>${receipt.method} · ${receipt.state}</strong
                ><code>${receipt.requestId}</code>
                <p>${receipt.message}</p>
                ${receipt.details
                  ? html`<details>
                      <summary>${t("receiptEvidence")}</summary>
                      <pre>${JSON.stringify(receipt.details, null, 2)}</pre>
                    </details>`
                  : nothing}
                ${receipt.method === "spawn" && receipt.state === "unknown"
                  ? html`<button class="ui-button"
                        ?disabled=${!this.supports("status") ||
                        state.refreshing}
                        @click=${() => {
                          this.sync();
                          void this.controller.recoverSpawn(receipt.requestId);
                        }}
                      >
                        ${t("inspectSpawn")}
                      </button>
                      <p class="meta">
                        ${t("correlationNote", { id: `rpc-spawn-${receipt.requestId}` })}
                      </p>`
                  : nothing}
              </li>`,
          )}
        </ul>
      </section>
      <section>
        <h2>${t("administration")}</h2>
        <p>
          ${t("supervisorNote")}
        </p>
        <button class="ui-button"
          ?disabled=${!state.scope}
          @click=${() => {
            void this.helper("supervisor");
          }}
        >
          ${t("supervisorHelp")}
        </button>
        <p>
          ${t("adminNote")}
        </p>
        <button class="ui-button"
          ?disabled=${!state.scope}
          @click=${() => {
            void this.helper("admin");
          }}
        >
          ${t("prepareCommand")}
        </button>
      </section>
      ${this.confirmation
        ? html`<section
            class="confirmation"
            role="region"
            aria-label=${t("confirmLabel")}
            tabindex="-1"
          >
            <h2>${t("confirm", { method: this.confirmation.method })}</h2>
            <p>
              ${t("confirmNote", { session: this.controller.state.scope?.sessionId ?? "" })}
            </p>
            ${this.confirmation.method === "spawn" ? html`<dl class="facts">
              <div><dt>${t("launchType")}</dt><dd>${this.confirmation.params.agent !== undefined ? t("configuredAgent") : this.confirmation.params.script !== undefined ? t("script") : t("workflow")}</dd></div>
              <div><dt>${t("source")}</dt><dd>${String(this.confirmation.params.agent ?? this.confirmation.params.script ?? this.confirmation.params.workflow)}</dd></div>
              <div><dt>${t("context")}</dt><dd>${String(this.confirmation.params.context)}</dd></div>
              <div><dt>${t("model")}</dt><dd>${this.confirmation.params.model ?? t("inheritModel")}</dd></div>
              ${this.confirmation.params.task ? html`<div><dt>${t("task")}</dt><dd class="reported-goal">${String(this.confirmation.params.task)}</dd></div>` : nothing}
            </dl>` : this.confirmation.method === "manage" ? html`<p>${t("scheduleAction")}: ${String(this.confirmation.params.action)} · ${t("scheduleId")}: <code>${String(this.confirmation.params.id)}</code></p>` : nothing}
            <pre>${JSON.stringify(this.confirmation.params, null, 2)}</pre>
            <button
              class="ui-button danger"
              ?disabled=${state.busy || !this.controller.available}
              @click=${this.confirm}
            >
              ${t("confirm", { method: this.confirmation.method })}
            </button>
            <button class="ui-button" @click=${this.cancel}>${t("cancel")}</button>
          </section>`
        : nothing}
    </main>`;
  }
  static override styles = css`
    :host {
      display: block;
      color: var(--pi-text, inherit);
      font: 14px/1.5 var(--pi-font, system-ui, sans-serif);
    }
    * {
      box-sizing: border-box;
    }
    main {
      max-width: 1000px;
      margin: auto;
      padding: 20px;
    }
    header,
    .actions,
    .run-row {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
    }
    header {
      justify-content: space-between;
    }
    h1 {
      font-size: 26px;
      margin: 0;
      letter-spacing: -0.03em;
    }
    h2 {
      font-size: 17px;
      margin: 0 0 12px;
    }
    h3 {
      font-size: 14px;
    }
    .eyebrow {
      font-size: 10px;
      letter-spacing: 0.14em;
      margin: 0;
      opacity: 0.7;
    }
    section {
      border-top: 1px solid var(--pi-border, #8885);
      margin-top: 22px;
      padding-top: 18px;
    }
    p {
      margin: 8px 0;
    }
    .meta,
    small,
    .scope {
      opacity: 0.75;
      font-size: 12px;
    }
    .scope,
    code {
      overflow-wrap: anywhere;
    }
    input,
    textarea {
      font: inherit;
      border: 1px solid var(--pi-border, #8888);
      border-radius: 6px;
      padding: 7px 10px;
      color: var(--pi-text, inherit);
      background: var(--pi-surface, transparent);
    }
    button:focus-visible,
    input:focus-visible,
    textarea:focus-visible,
    select:focus-visible,
    summary:focus-visible,
    pre:focus-visible {
      outline: 3px solid var(--pi-accent, Highlight);
      outline-offset: 3px;
    }
    .run[aria-pressed="true"] {
      border-color: var(--pi-accent, Highlight);
      background: color-mix(in srgb, var(--pi-accent, Highlight) 13%, transparent);
    }
    .danger {
      border-color: var(--pi-danger, #dc756d);
    }
    label {
      display: flex;
      flex-direction: column;
      gap: 4px;
      margin: 10px 0;
    }
    textarea {
      width: 100%;
      resize: vertical;
    }
    input {
      min-width: 0;
      max-width: 100%;
    }
    form {
      margin: 12px 0;
    }
    .actions > label {
      flex: 1;
      min-width: 120px;
    }
    summary {
      cursor: pointer;
      padding: 8px 0;
    }
    pre {
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      max-height: 420px;
      overflow: auto;
      padding: 12px;
      background: var(--pi-surface, #8881);
      border-radius: 6px;
      font: 12px/1.6 var(--pi-mono, ui-monospace, monospace);
    }
    .targeted-output { overflow-anchor: none; scroll-behavior: auto; }
    .workflow-trace li { padding-block: 8px; border-bottom: 1px solid var(--pi-border, #8885); overflow-wrap: anywhere; }
    .facts {
      display: flex;
      flex-wrap: wrap;
      gap: 6px 18px;
      margin: 10px 0;
      font-size: 12px;
    }
    .schedule-detail .facts {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(min(100%, 180px), 1fr));
    }
    .schedule-list { padding-inline-start: 20px; }
    .schedule-list li { margin-block: 8px; overflow-wrap: anywhere; }
    .schedule-list button { white-space: normal; overflow-wrap: anywhere; max-inline-size: 100%; text-align: start; }
    .schedule-history { padding-inline-start: 20px; }
    .schedule-history li { border-inline-start: 2px solid var(--pi-border, #8885); padding-inline-start: 12px; margin-block: 12px; }
    .facts > div { min-inline-size: 0; }
    .facts dt { opacity: 0.75; }
    .facts dd { margin: 0; overflow-wrap: anywhere; }
    .progress-report, .monitor-facts {
      border-inline-start: 3px solid var(--pi-accent, Highlight);
      padding-inline-start: 10px;
      margin-block: 10px;
    }
    .monitor-facts { border-color: var(--pi-warning, #bf8c36); }
    .progress-report p, .reported-goal { white-space: pre-wrap; }
    .usage-scroll { overflow-x: auto; }
    .usage-scroll:focus-visible {
      outline: 3px solid var(--pi-accent, Highlight);
      outline-offset: 3px;
    }
    .usage-table { border-collapse: collapse; inline-size: 100%; font-size: 12px; }
    .usage-table caption { text-align: start; font-weight: bold; padding-block: 8px; }
    .usage-table th, .usage-table td {
      text-align: end;
      padding: 8px;
      border-bottom: 1px solid var(--pi-border, #8885);
      font-variant-numeric: tabular-nums;
    }
    .usage-table th:first-child { text-align: start; overflow-wrap: anywhere; min-inline-size: 120px; }
    .usage-table small { display: block; font-weight: normal; }
    .activity {
      max-height: 100px;
      margin: 4px 0;
    }
    .tree,
    .fleet,
    .receipts {
      list-style: none;
      padding: 0;
    }
    [hidden] { display: none !important; }
    .fleet-workspace { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 20px; align-items: start; }
    .roster, .inspector { min-inline-size: 0; }
    .filters { display: flex; flex-wrap: wrap; gap: 12px; }
    .filters label { flex: 1; min-inline-size: 120px; }
    .fleet-workspace .forest { grid-template-columns: minmax(0, 1fr); }
    @media (max-width: 760px) {
      .fleet-workspace { grid-template-columns: minmax(0, 1fr); }
      .fleet-workspace[data-inspecting="true"] .roster { display: none; }
      .fleet-workspace[data-inspecting="false"] .inspector { display: none; }
    }
    .forest,
    .fleet {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(min(100%, 340px), 1fr));
      gap: 16px;
      align-items: start;
    }
    .forest li,
    .fleet li {
      min-inline-size: 0;
      margin: 0;
      overflow-wrap: anywhere;
    }
    .node-card {
      padding: 12px;
      border: 1px solid var(--pi-border, #8886);
      border-radius: 8px;
      background: var(--pi-surface, #8881);
      min-inline-size: 0;
    }
    .graph-root > .node-card {
      border-width: 2px;
    }
    .node-card[data-selected="true"] {
      border-color: var(--pi-accent, Highlight);
      background: color-mix(in srgb, var(--pi-accent, Highlight) 7%, transparent);
    }
    .selected-label {
      font-size: 12px;
      font-weight: bold;
    }
    .run {
      min-block-size: 44px;
      text-align: start;
      max-inline-size: 100%;
      overflow-wrap: anywhere;
    }
    .run-row strong {
      min-inline-size: 0;
    }
    .branch-disclosure {
      margin-inline-start: 14px;
    }
    .branch-disclosure > summary,
    .node-details > summary {
      min-block-size: 44px;
      font-size: 12px;
    }
    .branches {
      margin: 0;
      padding-inline-start: 18px;
      border-inline-start: 1px solid var(--pi-border, #8888);
    }
    .branches > li {
      position: relative;
      padding-block: 6px;
    }
    .branches > li::before {
      content: "";
      position: absolute;
      inset-inline-start: -18px;
      inset-block-start: 26px;
      inline-size: 18px;
      border-block-start: 1px solid var(--pi-border, #8888);
    }
    @media (forced-colors: active) {
      .node-card[data-selected="true"] {
        border-color: Highlight;
      }
      .branches,
      .branches > li::before {
        border-color: CanvasText;
      }
    }
    li {
      margin: 8px 0;
    }
    .fleet > li,
    .receipts > li {
      padding: 12px;
      border: 1px solid var(--pi-border, #8884);
      border-radius: 8px;
    }
    .receipts code {
      display: block;
      font-size: 12px;
    }
    .pill {
      border: 1px solid var(--pi-border, #8885);
      border-radius: 20px;
      padding: 2px 8px;
      font-size: 11px;
      font-weight: normal;
    }
    [data-state="running"],
    [data-state="queued"] {
      border-color: var(--pi-accent, Highlight);
    }
    [data-state="failed"],
    [data-state="rejected"] {
      border-color: var(--pi-danger, #dc756d);
    }
    .warning,
    .error,
    .notice {
      border-inline-start: 3px solid var(--pi-warning, #bf8c36);
      padding: 8px 12px;
      background: color-mix(in srgb, var(--pi-warning, #bf8c36) 6%, transparent);
    }
    .error {
      border-color: var(--pi-danger, #dc756d);
    }
    .confirmation {
      position: sticky;
      bottom: 8px;
      padding: 18px;
      border: 2px solid var(--pi-warning, #bf8c36);
      background: var(--pi-surface, Canvas);
      color: var(--pi-text, CanvasText);
      box-shadow: 0 4px 24px #0003;
      border-radius: 10px;
    }
    .confirmation pre {
      max-height: 180px;
    }
    .total {
      font-size: 22px;
    }
    @media (max-width: 480px) {
      main {
        padding: 12px;
      }
      .actions {
        gap: 6px;
      }
      .forest,
      .fleet {
        grid-template-columns: minmax(0, 1fr);
      }
      .branch-disclosure {
        margin-inline-start: 4px;
      }
      .branches {
        padding-inline-start: 10px;
      }
      .branches > li::before {
        inset-inline-start: -10px;
        inline-size: 10px;
      }
      .node-card {
        padding: 8px;
      }
    }
  `;
}
