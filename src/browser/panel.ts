import {
  LitElement,
  css,
  html,
  nothing,
  type PropertyValues,
  type TemplateResult,
} from "lit";
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

export function snapshotNotice(state: PanelState): string {
  if (state.observedAt === undefined) return "No status snapshot yet.";
  return `${state.stale ? "Stale cached snapshot" : "Last observed snapshot (not a live stream)"} · ${new Date(state.observedAt).toLocaleString()}`;
}
export function runTree(
  nodes: AsyncNode[],
  choose?: (id: string) => void,
  selected = "",
): TemplateResult {
  return html`<ul class="tree">
    ${nodes.map(
      (node) =>
        html`<li>
          <div class="run-row">
            ${choose
              ? html`<button
                  class="run"
                  aria-pressed=${node.id === selected}
                  @click=${() => choose(node.id)}
                >
                  ${node.label}
                </button>`
              : html`<span>${node.label}</span>`}
            <span class="pill" data-state=${node.state}>${node.state}</span>
          </div>
          <div class="meta">
            ${node.kind} · <code>${node.id}</code>${node.model
              ? html` · ${node.model}`
              : nothing}
          </div>
          ${node.activity
            ? html`<pre class="activity">
${JSON.stringify(node.activity, null, 2)}</pre
              >`
            : nothing}
          ${node.children?.length ? runTree(node.children) : nothing}
        </li>`,
    )}
  </ul>`;
}
export function overview(
  state: PanelState,
  choose: (id: string) => void,
  selected: string,
): TemplateResult {
  const fleet = state.status?.fleet;
  const snapshot = state.status?.asyncSnapshot;
  return html`<section aria-labelledby="fleet-heading">
      <h2 id="fleet-heading">
        Fleet
        <span class="pill"
          >${fleet ? `${fleet.totalActive} active` : "unavailable"}</span
        >
      </h2>
      <p class="meta">
        Fleet rows are display-only. Whole-run controls use top-level async run
        IDs below.
      </p>
      ${fleet
        ? html`${fleet.topLevelAsyncCapacity
              ? fleet.topLevelAsyncCapacity.limit > 0
                ? html`<p>
                    Async capacity: ${fleet.topLevelAsyncCapacity.used} /
                    ${fleet.topLevelAsyncCapacity.limit}
                  </p>`
                : html`<p>Async capacity: no finite limit reported.</p>`
              : nothing}
            ${fleet.omitted
              ? html`<p class="warning">
                  ${fleet.omitted} fleet entries omitted.
                </p>`
              : nothing}
            <ul class="fleet">
              ${fleet.entries.map(
                (entry) =>
                  html`<li>
                    <strong>${entry.agent}</strong>
                    <span class="meta"
                      >${entry.role ?? ""} ·
                      ${entry.model ?? "model unavailable"}</span
                    >
                    <p>${entry.goal ?? "No goal provided"}</p>
                    <small
                      >${entry.tokens.total.toLocaleString()} tokens ·
                      ${entry.effort ?? "effort unavailable"}</small
                    >
                  </li>`,
              )}
            </ul>
            ${!fleet.entries.length
              ? html`<p>No visible fleet entries in this snapshot.</p>`
              : nothing}`
        : html`<p>
            Fleet projection unavailable. This is not an empty-fleet result.
          </p>`}
    </section>
    <section aria-labelledby="runs-heading">
      <h2 id="runs-heading">Async runs</h2>
      ${snapshot
        ? html`<p class="meta">
              Generated ${new Date(snapshot.generatedAt).toLocaleString()}.
              Nested steps are display-only; no inferred child indices.
            </p>
            ${snapshot.omitted.runs ||
            snapshot.omitted.children ||
            snapshot.omitted.byteLimitExceeded
              ? html`<p class="warning">
                  Bounded snapshot: ${snapshot.omitted.runs} runs /
                  ${snapshot.omitted.children} children
                  omitted${snapshot.omitted.byteLimitExceeded
                    ? " · byte limit exceeded"
                    : ""}.
                </p>`
              : nothing}
            ${runTree(snapshot.runs, choose, selected)}${!snapshot.runs.length
              ? html`<p>No async runs in this snapshot.</p>`
              : nothing}`
        : html`<p>
            Async run projection unavailable. Controls require an authoritative
            top-level run.
          </p>`}
      ${state.status?.text
        ? html`<details>
            <summary>Status summary</summary>
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
  declare context: WorkspacePanelContext | undefined;
  declare selection: PluginSelectionService | undefined;
  declare lifetime: AbortSignal | undefined;
  readonly controller = new SubagentsController(() => {
    this.requestUpdate();
    this.context?.host.requestRender();
  });
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
      this.intersection = new IntersectionObserver(([entry]) => {
        this.inViewport = entry?.isIntersecting ?? false;
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
  protected override updated(changed: PropertyValues): void {
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
      this.notice = `Invalid launch arguments: ${String(error)}`;
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
    const state = this.controller.state;
    const disabledRun = !this.hasRun();
    return html`<main
      aria-label="Subagents supervision"
      aria-busy=${state.refreshing || state.busy}
    >
      <header>
        <div>
          <p class="eyebrow">DELEGATION · SUPERVISION</p>
          <h1 tabindex="-1">Subagents</h1>
        </div>
        <button
          ?disabled=${!this.controller.available || state.refreshing}
          @click=${() => {
            this.sync();
            void this.controller.refresh();
          }}
        >
          ${state.refreshing ? "Refreshing…" : "Refresh status"}
        </button>
      </header>
      <p class="scope">
        ${state.scope
          ? `${state.scope.machineId} / ${state.scope.projectId} / ${state.scope.workspaceId} / ${state.scope.sessionId}`
          : "No ready conversation selected"}
      </p>
      <p class=${state.stale ? "warning" : "meta"} role="status">
        ${snapshotNotice(state)}
      </p>
      <p class="meta">
        Visible refresh: 2s active / 10s idle. Hidden or closed panels pause
        observation, not execution.
      </p>
      ${state.error
        ? html`<p class="error" role="alert">${state.error}</p>`
        : nothing}
      ${this.notice
        ? html`<p class="notice" role="status">${this.notice}</p>`
        : nothing}
      <details>
        <summary>Capabilities & boundaries</summary>
        <p>
          ${state.ping
            ? `Advertised methods: ${state.ping.methods.join(", ")}`
            : "Capabilities unavailable until a successful handshake."}
        </p>
        ${state.ping
          ? html`<pre>${JSON.stringify(state.ping.capabilities, null, 2)}</pre>`
          : nothing}
        <p>
          Disabled actions require a ready selection and advertised capability.
          Child controls, direct supervisor reply cards, general configuration
          editors, and full transcript streaming are unavailable.
        </p>
      </details>
      ${overview(state, this.choose, this.selected)}
      <section aria-labelledby="control-heading">
        <h2 id="control-heading">Run inspector</h2>
        <p>
          ${this.hasRun()
            ? html`Whole-run target: <code>${this.selected}</code>`
            : "Select a top-level async run above."}
        </p>
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
            >Transcript lines
            <input
              name="lines"
              type="number"
              min="1"
              max="500"
              value="80"
              required
          /></label>
          <button
            ?disabled=${disabledRun ||
            !this.supports("status") ||
            state.refreshing}
          >
            Load transcript
          </button>
        </form>
        <div class="actions">
          <button
            ?disabled=${disabledRun || !this.supports("interrupt")}
            @click=${() => this.operate("interrupt", { id: this.selected })}
          >
            Interrupt run…
          </button>
          <button
            class="danger"
            ?disabled=${disabledRun || !this.supports("stop")}
            @click=${() => this.operate("stop", { id: this.selected })}
          >
            Stop run…
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
            >Message to run
            <textarea
              name="message"
              required
              maxlength="16384"
              rows="3"
              placeholder="A focused instruction or resume message"
            ></textarea>
          </label>
          <div class="actions">
            <label
              >Action
              <select name="action">
                <option value="steer">Steer (never revives)</option>
                <option value="resume">Resume saved contract…</option>
              </select></label
            >
            <label
              >Steering mode
              <select name="mode">
                <option value="auto">Auto</option>
                <option value="steer">Steer</option>
                <option value="follow_up">Follow-up</option>
              </select></label
            >
            <button
              ?disabled=${disabledRun ||
              (!this.supports("steer") && !this.supports("resume"))}
            >
              Review / send message
            </button>
          </div>
        </form>
        <p class="meta">
          Resume uses the saved launch contract. Stop returns “stopping”, not
          terminal proof. Queued or delivered steering is not completion.
        </p>
        ${state.transcript
          ? html`<h3>Targeted output · ${state.transcriptId}</h3>
              <p class="meta">Last explicit read; not a live transcript.</p>
              <pre tabindex="0" aria-label="Targeted run output">
${state.transcript.text}</pre
              >
              ${state.transcript.details
                ? html`<details>
                    <summary>Targeted status evidence</summary>
                    <pre>
${JSON.stringify(state.transcript.details, null, 2)}</pre
                    >
                  </details>`
                : nothing}`
          : nothing}
      </section>
      <section>
        <h2>Launch async work</h2>
        <details>
          <summary>New agent, script, or workflow</summary>
          <form @submit=${this.launch}>
            <label
              >Launch type
              <select name="kind">
                <option value="agent">Configured agent</option>
                <option value="script">Script</option>
                <option value="workflow">Workflow name / path</option>
              </select></label
            >
            <label
              >Agent name, script, or workflow
              <textarea
                name="source"
                rows="2"
                required
                maxlength="32768"
              ></textarea>
            </label>
            <label
              >Agent task (agent only)
              <textarea name="task" rows="3" maxlength="32768"></textarea>
            </label>
            <label
              >Arguments (script/workflow only, JSON object)
              <textarea name="args" rows="2" placeholder="{}"></textarea>
            </label>
            <div class="actions">
              <label
                >Context
                <select name="context">
                  <option value="fresh">Fresh</option>
                  <option value="fork">Fork</option>
                </select></label
              >
              <label
                >Model (optional) <input name="model" maxlength="256" /></label
              ><label
                >Label (optional) <input name="label" maxlength="160"
              /></label>
            </div>
            <p class="meta">
              Async-only. No cwd, output paths, tools, clarification, or other
              advanced parameters. Upstream owns execution.
            </p>
            <button ?disabled=${!this.supports("spawn")}>Review launch…</button>
          </form>
        </details>
      </section>
      <section>
        <h2>Schedules</h2>
        <button
          ?disabled=${!this.supports("manage", "schedule.list")}
          @click=${() => this.operate("manage", { action: "schedule.list" })}
        >
          List schedules
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
            >Exact schedule ID <input name="id" required maxlength="64"
          /></label>
          <label
            >Schedule action
            <select name="action">
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
          <button ?disabled=${!this.supports("manage")}>
            Review / execute schedule action
          </button>
        </form>
        ${state.schedules
          ? html`<p class="meta">
                Last successful schedule output (cached; refresh explicitly).
              </p>
              <pre tabindex="0" aria-label="Schedule output">
${state.schedules.text}</pre
              >
              ${state.schedules.details?.schedules
                ? html`<pre>
${JSON.stringify(state.schedules.details.schedules, null, 2)}</pre
                  >`
                : nothing}`
          : html`<p>
              Schedules not loaded. Creation is available only through upstream
              administration.
            </p>`}
      </section>
      <section>
        <h2>Cost <span class="pill">on demand</span></h2>
        <button
          ?disabled=${!this.supports("cost")}
          @click=${() => {
            this.sync();
            void this.controller.perform("cost");
          }}
        >
          Calculate cost
        </button>
        ${state.cost
          ? html`<p>
                Cached calculation at
                ${new Date(state.costAt!).toLocaleString()} —
                ${state.cost.unresolvedAsyncChildren
                  ? `lower bound; ${state.cost.unresolvedAsyncChildren} unresolved async children`
                  : "no unresolved async children reported"}.
              </p>
              <p class="total">
                $${state.cost.total.cost.toFixed(4)}
                <span class="meta">total reported cost</span>
              </p>
              <p>
                Parent $${state.cost.parent.cost.toFixed(4)} · Children
                $${state.cost.childTotal.cost.toFixed(4)}
              </p>
              <ul>
                ${state.cost.children.map(
                  (child) =>
                    html`<li>
                      ${child.label} · $${child.usage.cost.toFixed(4)}
                      <span class="meta"
                        >${child.runId ??
                        "identity unavailable (display-only)"}</span
                      >
                    </li>`,
                )}
              </ul>`
          : html`<p>
              No cost calculation requested. Cost is never timer-polled.
            </p>`}
      </section>
      <section>
        <h2>Request receipts</h2>
        <p class="meta">
          Last 20 in this mounted panel's memory. Save request IDs before
          leaving. Transport loss never retries a mutation; work may continue.
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
                      <summary>Receipt identities & evidence</summary>
                      <pre>${JSON.stringify(receipt.details, null, 2)}</pre>
                    </details>`
                  : nothing}
                ${receipt.method === "spawn" && receipt.state === "unknown"
                  ? html`<button
                        ?disabled=${!this.supports("status") ||
                        state.refreshing}
                        @click=${() => {
                          this.sync();
                          void this.controller.recoverSpawn(receipt.requestId);
                        }}
                      >
                        Inspect spawn correlation (read only)
                      </button>
                      <p class="meta">
                        Queries rpc-spawn-${receipt.requestId}. Missing evidence
                        is not permission to resend.
                      </p>`
                  : nothing}
              </li>`,
          )}
        </ul>
      </section>
      <section>
        <h2>Parent conversation & administration</h2>
        <p>
          Supervisor pending counts and direct reply cards are unavailable.
          Prepare an ordinary parent message asking its existing tool to inspect
          requests, then review and manually Send. No answered state is
          inferred.
        </p>
        <button
          ?disabled=${!state.scope}
          @click=${() => {
            void this.helper("supervisor");
          }}
        >
          Prepare supervisor-help message
        </button>
        <p>
          General administration fallback: use <code>/subagents</code> in the
          parent composer for configuration, agents, model/thinking selection,
          and schedule creation. This panel implements only schedule RPC
          management; custom editors are unavailable. Remove all composer chips
          before sending /subagents: chips turn it into an ordinary prompt.
        </p>
        <button
          ?disabled=${!state.scope}
          @click=${() => {
            void this.helper("admin");
          }}
        >
          Prepare /subagents command (manual send)
        </button>
      </section>
      ${this.confirmation
        ? html`<section
            class="confirmation"
            role="region"
            aria-label="Confirm operation"
            tabindex="-1"
          >
            <h2>Confirm ${this.confirmation.method}</h2>
            <p>
              This changes work in ${this.controller.state.scope?.sessionId}.
              Review the exact request. Cancellation after sending cannot roll
              it back.
            </p>
            <pre>${JSON.stringify(this.confirmation.params, null, 2)}</pre>
            <button
              class="danger"
              ?disabled=${state.busy || !this.controller.available}
              @click=${this.confirm}
            >
              Confirm ${this.confirmation.method}
            </button>
            <button @click=${this.cancel}>Cancel</button>
          </section>`
        : nothing}
    </main>`;
  }
  static override styles = css`
    :host {
      display: block;
      color: inherit;
      font:
        14px/1.5 system-ui,
        sans-serif;
      color-scheme: light dark;
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
      border-top: 1px solid #8885;
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
    button,
    input,
    textarea,
    select {
      font: inherit;
      border: 1px solid #8888;
      border-radius: 6px;
      padding: 7px 10px;
      color: inherit;
      background: transparent;
    }
    button {
      cursor: pointer;
      min-height: 36px;
    }
    button:hover:not(:disabled) {
      background: #8882;
    }
    button:disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }
    button:focus-visible,
    input:focus-visible,
    textarea:focus-visible,
    select:focus-visible,
    summary:focus-visible,
    pre:focus-visible {
      outline: 3px solid #638ff1;
      outline-offset: 3px;
    }
    .run[aria-pressed="true"] {
      border-color: #638ff1;
      background: #638ff122;
    }
    .danger {
      border-color: #dc756d;
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
      background: #8881;
      border-radius: 6px;
      font:
        12px/1.6 ui-monospace,
        monospace;
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
    .tree .tree {
      padding-left: 16px;
      border-left: 2px solid #8884;
    }
    li {
      margin: 8px 0;
    }
    .fleet > li,
    .receipts > li {
      padding: 12px;
      border: 1px solid #8884;
      border-radius: 8px;
    }
    .receipts code {
      display: block;
      font-size: 12px;
    }
    .pill {
      border: 1px solid #8885;
      border-radius: 20px;
      padding: 2px 8px;
      font-size: 11px;
      font-weight: normal;
    }
    [data-state="running"],
    [data-state="queued"] {
      border-color: #638ff1;
    }
    [data-state="failed"],
    [data-state="rejected"] {
      border-color: #dc756d;
    }
    .warning,
    .error,
    .notice {
      border-left: 3px solid #bf8c36;
      padding: 8px 12px;
      background: #bf8c3610;
    }
    .error {
      border-color: #dc756d;
    }
    .confirmation {
      position: sticky;
      bottom: 8px;
      padding: 18px;
      border: 2px solid #bf8c36;
      background: Canvas;
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
    }
  `;
}
