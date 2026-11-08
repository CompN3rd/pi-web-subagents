import {
  LitElement,
  css,
  html,
  nothing,
  type PropertyValues,
  type TemplateResult,
} from "lit";
import { repeat } from "lit/directives/repeat.js";
import { keyed } from "lit/directives/keyed.js";
import { guard } from "lit/directives/guard.js";
import { descendantCount, graphOccurrences } from "./graph.js";
import { englishContent, type PanelContent } from "./localization.js";
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
): TemplateResult {
  const { t } = content;
  // Empty guard dependencies set disclosure defaults once, never overriding native toggles on polls.
  return html`<ul class=${choose ? "tree forest" : "tree branches"}>
    ${repeat(
      graphOccurrences(nodes),
      (entry) => entry.key,
      ({ node }) => {
        const descendants = descendantCount(node);
        return html`<li class=${choose ? "graph-root" : "graph-child"}>
          <article
            class="node-card"
            data-selected=${!!choose && node.id === selected}
          >
            <div class="run-row">
              ${choose
                ? html`<button
                    class="ui-button run"
                    aria-pressed=${node.id === selected}
                    @click=${() => choose(node.id)}
                  >${node.label}</button>`
                : html`<strong>${node.label}</strong>`}
              <span class="pill" data-state=${node.state}>${node.state}</span>
              ${choose && node.id === selected
                ? html`<span class="selected-label">${t("selected")}</span>`
                : nothing}
            </div>
            <div class="meta">
              ${node.kind} · <code>${node.id}</code>${node.model
                ? html` · ${node.model}`
                : nothing}${node.thinking ? html` · ${t("thinking", { value: node.thinking })}` : nothing}${node.agent ? html` · ${node.agent}` : nothing}
            </div>
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
                ${runTree(node.children!, undefined, "", content)}
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
): TemplateResult {
  const { t } = content;
  const fleet = state.status?.fleet;
  const snapshot = state.status?.asyncSnapshot;
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
      ${snapshot
        ? html`<p class="meta">
              ${t("generated", { date: content.date(snapshot.generatedAt) })}
            </p>
            ${snapshot.omitted.runs ||
            snapshot.omitted.children ||
            snapshot.omitted.byteLimitExceeded
              ? html`<p class="warning">
                  ${t("bounded", { runs: content.number(snapshot.omitted.runs), children: content.number(snapshot.omitted.children), bytes: snapshot.omitted.byteLimitExceeded ? t("byteLimit") : "" })}
                </p>`
              : nothing}
            ${runTree(snapshot.runs, choose, selected, content)}${!snapshot.runs.length
              ? html`<p>${t("noRuns")}</p>`
              : nothing}`
        : html`<p>
            ${t("noProjection")}
          </p>`}
      <details class="unlinked-agents">
        <summary>${t("furtherAgents")} · ${fleet ? t("visible", { count: content.number(fleet.entries.length) }) : t("unavailable")}</summary>
      <p class="meta">
        ${t("unlinked")}
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
                    <p>${entry.goal ?? t("noGoal")}</p>
                    <small
                      >${t("tokens", { count: content.number(entry.tokens.total) })} ·
                      ${entry.effort ?? t("noEffort")}</small
                    >
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
  private confirmation: Confirmation | undefined;
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
    const focused = this.shadowRoot?.activeElement;
    this.graphFocus =
      focused instanceof HTMLElement && focused.closest(".graph-root")
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
  }
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
  private choose = (id: string): void => {
    this.sync();
    if (
      this.controller.state.status?.asyncSnapshot?.runs.some((r) => r.id === id)
    ) {
      this.selected = id;
      this.confirmation = undefined;
      this.requestUpdate();
    }
  };
  private hasRun(): boolean {
    return (
      !!this.selected &&
      !!this.controller.state.status?.asyncSnapshot?.runs.some(
        (r) => r.id === this.selected,
      )
    );
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
      ["stop", "interrupt", "resume", "steer"].includes(method) &&
      (!this.hasRun() || params.id !== this.selected)
    )
      return;
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
      this.controller.available
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
    const kind = String(data.get("kind"));
    try {
      const params: JsonObject = {
        [kind]: String(data.get("source")).trim(),
        async: true,
      };
      if (kind === "agent" && data.get("task"))
        params.task = String(data.get("task"));
      if (kind !== "agent" && String(data.get("args")).trim())
        params.args = JSON.parse(String(data.get("args"))) as JsonObject;
      if (data.get("model")) params.model = String(data.get("model"));
      if (data.get("label")) params.label = String(data.get("label"));
      params.context = String(data.get("context"));
      this.operate("spawn", params);
    } catch (error) {
      this.notice = this.content.t("invalidLaunch", { error: String(error) });
      this.requestUpdate();
    }
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
    const selectedRun = state.status?.asyncSnapshot?.runs.find(
      (run) => run.id === this.selected,
    );
    const disabledRun = !selectedRun;
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
      ${keyed(this.formScope, overview(state, this.choose, this.selected, this.content))}
      ${selectedRun ? keyed(JSON.stringify([this.formScope, this.selected]), html`<section aria-labelledby="control-heading">
        <h2 id="control-heading">${selectedRun.label} — ${t("controls")}</h2>
        <p>${t("target")} <code>${this.selected}</code></p>
        <form
          @submit=${(event: Event) => {
            const data = this.form(event);
            this.operate("status", {
              id: this.selected,
              view: "transcript",
              lines: Number(data.get("lines")),
            });
          }}
        >
          <label
            >${t("lines")}
            <input
              name="lines"
              type="number"
              min="1"
              max="500"
              value="80"
              required
          /></label>
          <button class="ui-button"
            ?disabled=${disabledRun ||
            !this.supports("status") ||
            state.refreshing}
          >
            ${t("loadTranscript")}
          </button>
        </form>
        <div class="actions">
          <button class="ui-button"
            ?disabled=${disabledRun || !this.supports("interrupt")}
            @click=${() => this.operate("interrupt", { id: this.selected })}
          >
            ${t("interrupt")}
          </button>
          <button
            class="ui-button danger"
            ?disabled=${disabledRun || !this.supports("stop")}
            @click=${() => this.operate("stop", { id: this.selected })}
          >
            ${t("stop")}
          </button>
        </div>
        <form
          @submit=${(event: Event) => {
            const data = this.form(event);
            const method = String(data.get("action")) as "steer" | "resume";
            this.operate(method, {
              id: this.selected,
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
        ${state.transcript && state.transcriptId === this.selected
          ? html`<h3>${t("targetedOutput")} · ${state.transcriptId}</h3>
              <p class="meta">${t("lastRead")}</p>
              <pre tabindex="0" aria-label=${t("outputLabel")}>
${state.transcript.text}</pre
              >
              ${state.transcript.details
                ? html`<details>
                    <summary>${t("evidence")}</summary>
                    <pre>
${JSON.stringify(state.transcript.details, null, 2)}</pre
                    >
                  </details>`
                : nothing}`
          : nothing}
      </section>`) : nothing}
      <section>
        <h2>${t("launch")}</h2>
        <details>
          <summary>${t("newWork")}</summary>
          <form @submit=${this.launch}>
            <label
              >${t("launchType")}
              <select class="ui-select" name="kind">
                <option value="agent">${t("configuredAgent")}</option>
                <option value="script">${t("script")}</option>
                <option value="workflow">${t("workflow")}</option>
              </select></label
            >
            <label
              >${t("source")}
              <textarea
                name="source"
                rows="2"
                required
                maxlength="32768"
              ></textarea>
            </label>
            <label
              >${t("task")}
              <textarea name="task" rows="3" maxlength="32768"></textarea>
            </label>
            <label
              >${t("args")}
              <textarea name="args" rows="2" placeholder="{}"></textarea>
            </label>
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
              ${t("launchNote")}
            </p>
            <button class="ui-button" ?disabled=${!this.supports("spawn")}>${t("reviewLaunch")}</button>
          </form>
        </details>
      </section>
      <section>
        <h2>${t("schedules")}</h2>
        <button class="ui-button"
          ?disabled=${!this.supports("manage", "schedule.list")}
          @click=${() => this.operate("manage", { action: "schedule.list" })}
        >
          ${t("listSchedules")}
        </button>
        <form
          @submit=${(event: Event) => {
            const data = this.form(event);
            this.operate("manage", {
              action: String(data.get("action")),
              id: String(data.get("id")),
            });
          }}
        >
          <label
            >${t("scheduleId")} <input name="id" required maxlength="64"
          /></label>
          <label
            >${t("scheduleAction")}
            <select class="ui-select" name="action">
              ${MANAGEMENT_ACTIONS.filter((a) => a !== "schedule.list").map(
                (action) =>
                  html`<option
                    value=${action}
                    ?disabled=${!this.controller.supports("manage", action)}
                  >
                    ${action.slice(9)}
                  </option>`,
              )}
            </select></label
          >
          <button class="ui-button" ?disabled=${!this.supports("manage")}>
            ${t("scheduleExecute")}
          </button>
        </form>
        ${state.schedules
          ? html`<p class="meta">
                ${t("scheduleCached")}
              </p>
              <pre tabindex="0" aria-label=${t("scheduleOutput")}>
${state.schedules.text}</pre
              >
              ${state.schedules.details?.schedules
                ? html`<pre>
${JSON.stringify(state.schedules.details.schedules, null, 2)}</pre
                  >`
                : nothing}`
          : html`<p>
              ${t("schedulesNotLoaded")}
            </p>`}
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
              <p>
                ${t("parentChildren", { parent: this.content.cost(state.cost.parent.cost), children: this.content.cost(state.cost.childTotal.cost) })}
              </p>
              <ul>
                ${state.cost.children.map(
                  (child) =>
                    html`<li>
                      ${child.label} · ${this.content.cost(child.usage.cost)}
                      <span class="meta"
                        >${child.runId ??
                        t("noIdentity")}</span
                      >
                    </li>`,
                )}
              </ul>`
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
