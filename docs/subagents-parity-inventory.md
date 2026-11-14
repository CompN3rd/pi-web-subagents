# Subagents UI parity inventory

## Baseline and evidence

Audited 2026-11-14. This is a source/API inventory, not a claim that the installed
browser or daemon has been exercised.

- Adapter: `@compn3rd/pi-web-subagents@0.84.1`, checkout
  `954461199e225e2a5981e5700a5d612b0473acf6`, pinned engine **0.84.0**.
- Latest npm release returned by the registry: **pi-subagents 0.88.1**.
  Registry integrity metadata was read, not independently verified against tarball
  bytes in this audit. A mapping upgrade still requires normal artifact validation.
- Upstream stable tag `v0.88.1` resolves to
  `83cf25f86b6a70ab917a7e198d0153bc32309f29`.
- Linked changelog/main inspected at
  `92e24feab288246ddb2482b59f52a59f702d785a`. The audited TUI directory,
  RPC bridge, async status projection, admin/cost implementations and observability
  documentation have **no diff** between that commit and `v0.88.1`.
  Main's **Unreleased** changes are not part of the released parity baseline.
- Host: the repository's installed/pinned `@jmfederico/pi-web@1.202611.1`
  declarations and documentation, browser/server plugin API v5.
- Local baseline: `npm run typecheck` passes; `npm test` passes **114/114**.
  No provider-backed child, production installation, browser acceptance, or service
  restart was performed.

### Source key

Upstream links below are pinned to the stable source rather than moving `main`:

- **U1 — surfaces and interactions:** [observability](https://github.com/nicobailon/pi-subagents/blob/83cf25f86b6a70ab917a7e198d0153bc32309f29/docs/observability.md).
- **U2 — live tool cards and background widget:** [render.ts](https://github.com/nicobailon/pi-subagents/blob/83cf25f86b6a70ab917a7e198d0153bc32309f29/src/tui/render.ts), especially `reportedProgressRow`, `expandedTaskLines`, `projectAsyncLane`, workflow checklist rendering, `renderWorkflowChatProgress`.
- **U3 — fleet inspector:** [fleet.ts](https://github.com/nicobailon/pi-subagents/blob/83cf25f86b6a70ab917a7e198d0153bc32309f29/src/tui/fleet.ts), especially `collectFleetSnapshot`, `foregroundActiveDetail`, `itemStats`, `structuredHeader`, Prompt Audit and action handling.
- **U4 — conversation rendering:** [fleet-transcript.ts](https://github.com/nicobailon/pi-subagents/blob/83cf25f86b6a70ab917a7e198d0153bc32309f29/src/tui/fleet-transcript.ts), [subagent-messages.ts](https://github.com/nicobailon/pi-subagents/blob/83cf25f86b6a70ab917a7e198d0153bc32309f29/src/tui/subagent-messages.ts).
- **U5 — RPC limits:** [rpc.ts](https://github.com/nicobailon/pi-subagents/blob/83cf25f86b6a70ab917a7e198d0153bc32309f29/src/extension/rpc.ts), [extension API](https://github.com/nicobailon/pi-subagents/blob/83cf25f86b6a70ab917a7e198d0153bc32309f29/docs/extension-api.md#in-process-event-bus-rpc).
- **U6 — bounded live projection:** [async-status-projection.ts](https://github.com/nicobailon/pi-subagents/blob/83cf25f86b6a70ab917a7e198d0153bc32309f29/src/runs/shared/async-status-projection.ts), [fleet-status.ts](https://github.com/nicobailon/pi-subagents/blob/83cf25f86b6a70ab917a7e198d0153bc32309f29/src/tui/fleet-status.ts).
- **U7 — administration and accounting:** [subagents-admin.ts](https://github.com/nicobailon/pi-subagents/blob/83cf25f86b6a70ab917a7e198d0153bc32309f29/src/slash/subagents-admin.ts), [subagent-cost.ts](https://github.com/nicobailon/pi-subagents/blob/83cf25f86b6a70ab917a7e198d0153bc32309f29/src/slash/subagent-cost.ts).
- **U8 — latest changes:** [stable changelog](https://github.com/nicobailon/pi-subagents/blob/83cf25f86b6a70ab917a7e198d0153bc32309f29/CHANGELOG.md), [user-linked changelog](https://github.com/nicobailon/pi-subagents/blob/main/CHANGELOG.md).
- **W1 — existing presentation:** [`src/browser/panel.ts`](../src/browser/panel.ts), `runTree`, `overview`, `SubagentsPanel.render`.
- **W2 — data selection:** [`src/protocol.ts`](../src/protocol.ts), `projectNode`, `projectFleet`, `projectTool`, cost projection.
- **W3 — observation/control:** [`src/browser/controller.ts`](../src/browser/controller.ts), [`src/server/relay.ts`](../src/server/relay.ts).
- **W4 — contribution registration:** [`src/browser.ts`](../src/browser.ts).
- **H1 — pinned host evidence:** `node_modules/@jmfederico/pi-web/docs/plugins.md`
  (Transcript renderers, Render Markdown in a plugin, Session labels, Pi extension dialogs)
  and `dist/plugin-api.d.ts` (`TranscriptRendererContribution`, `TranscriptToolEntry`,
  `PluginContributionsV5`). Inspect these from the pinned package on reproduction.

## Executive finding

The TUI is not just a run tree. It combines **live inline cards, an always-visible
fleet summary, a background widget, a child inspector, rich conversation/tool
rendering, notices, and administration dialogs**. The web package mainly supplies
a vertically stacked control form and async tree. Its richest facts are often
hidden in collapsed sections or raw JSON.

There are three different gaps:

1. **Presentation debt:** usable fields already cross the adapter, but are not
   rendered meaningfully (elapsed time, tool activity, context-window tokens,
   cache usage, host-step verdicts, workflow trace).
2. **Adapter omissions:** public upstream fields or host surfaces are not adopted
   (0.88 progress reports; v5 tool/custom-message renderers).
3. **Real API gaps:** private TUI state and structured child inspection are not
   available through the adapter's supported event-bus route. CSS cannot fix these.

**Important baseline correction (README corrected in leg 1):** the former
statement that rich inline tool/message rendering is unavailable was stale for the pinned host. API v5 explicitly supports
`transcriptRenderers`, including tool entry `args`, `details`, `content`, status,
and displayed custom messages. That does **not** provide arbitrary transcript
history, hidden entries, or a supervisor-reply API.

## Implementation progress

Leg 1 implements the supported-data portion of A5–A7, A9, A13 and C5. See
[`subagents-parity-leg1-validation.md`](subagents-parity-leg1-validation.md) for
checks and boundaries. The original baseline above remains the pre-implementation
audit; engine mapping is still 0.84.0. Leg 2 adds the fleet/master-detail workspace,
reported-window filters, nested read-only inspectors, and duplicate-ID admission
safety (A2, A10–A11, B1–B2, B5–B6). See
[`subagents-parity-leg2-validation.md`](subagents-parity-leg2-validation.md).
Other rows below remain open unless updated.

## Inventory

Legend:
- **Present** = semantic support exists; not a claim of live-host acceptance.
- **Partial** = some information or interaction exists, with specified loss.
- **Missing / UI** = available public data/surface, presentation work needed.
- **Missing / adapter** = bridge/schema/contribution work needed on existing public APIs.
- **Blocked / API** = no suitable public route established; do not fabricate it.

### A. Live overview and background widget

| ID | Upstream displays / does | Current web panel | Gap and disposition | Evidence |
| --- | --- | --- | --- | --- |
| A1 | Persistent compact FleetView near the editor; active-agent count, panes, context-window and cumulative tokens; expands to main + children | Active count only inside panel; navigation action, no chat fleet summary | **Partial.** Add inline entry summaries and investigate a session-row indicator using public v5 labels. A literal under-editor widget/global counter is not established by this host API. Pane totals are not in fleet RPC | U1, U6; W1, W4; H1 |
| A2 | Folded one-line widget, adaptive detail/row layouts, expandable runs, explicit `+N more` | Adaptive roster/inspector, expandable branches, reported-window text/state filters and omission counts | **Implemented / panel organization.** Filtering preserves ancestry and native disclosure state, counts matching reported nodes only. No folded global widget; that host-surface boundary remains A1 | U1, U2; W1 |
| A3 | Foreground live children, recent foreground work, active/recent async children, external display-only jobs | Async tree plus separate collapsed opaque fleet entries | **Partial / API.** Fleet can expose active foreground summary facts, but not their authoritative control identities or the TUI's entire recent/external roster | U3 `collectFleetSnapshot`; U5 `buildFleetStatus`; W1–W2 |
| A4 | Task or workflow label per child; full wrapped task (up to eight lines) for one expanded background child; bounded line for multiple children | Tree labels; optional fleet goal only under “Further reported agents”; launch task is not a selected-run task view | **Partial.** Expose existing fleet goals. Full selected-child task requires attributable detail: async snapshot deliberately has no `task`. Do not join opaque fleet entries to tree nodes by names | U2 `compactTaskText`/`expandedTaskLines`; U5–U6; W1–W2 |
| A5 | Latest `contact_supervisor` progress update and age | Readable progress text and snapshot-relative report age | **Implemented / fixtures validated.** Optional bounded `progressText` and `progressUpdatedAt` survive projection; old payloads omit the row. No engine upgrade or live-host proof implied | U2 `reportedProgressRow`; U6 lines 67–68, step projection; W2 |
| A6 | Elapsed run/child duration, last-activity age, current-tool elapsed time | Readable node elapsed, tool duration, activity/update ages | **Implemented / fixtures validated.** Values use the source snapshot time, not a live wall clock. Terminal rows without an end and missing/inconsistent timestamps remain unknown; supplied zero is preserved | U1–U3; W1–W2 |
| A7 | Current tool, path/argument preview, recent output, turn/tool counts; long-running/needs-attention distinctions | Readable reported tool, tool/turn counts, activity state and age; raw evidence retained | **Partial / supported fields implemented.** Path/arguments and recent output remain absent from the bounded async snapshot; detailed/tool-entry sources need separate validation. No local timeout/attention verdict invented | U2–U3; U6 activity interface; W1–W2 |
| A8 | Agent, model, thinking; fresh/fork/mixed context; foreground/background/source distinction | Agent/model/thinking on tree, effort in fleet; no executed-context/source badges | **Partial.** Preserve model/thinking. Snapshot does not report context. Launch-form choice is not evidence of executed context; display only reported data | U2–U3; W1–W2 |
| A9 | Current context window, window peak when formatted, input/output spent; totals in compact fleet | Unlinked fleet rows show input/output/spent/window/peak and observed elapsed | **Implemented / public fleet fields.** Missing windows are unknown; no invented utilization percentage or fleet/tree combined total. Identity-linked per-node usage and persistent compact surface remain API/UI gaps | U1, U3 `itemStats`, U5; W1–W2 |
| A10 | Queued/running/completed/failed/paused/stopped/rejected/partial; attention and interrupted distinctions | Textual state pills, readable activity, active/attention/other reported-state filtering | **Implemented / supplied states.** Attention is a local filter of reported state/activity/stale-monitor facts, not a pending-request count or liveness diagnosis. Execution, delivery and process proof remain separate | U2–U4; W1–W3 |
| A11 | Nested fanout tree and chain/parallel groups, role/phase labels, current stage and progress | Bounded nested cards with independently selectable read-only inspectors | **Partial / supported nesting implemented.** Parentage and occurrence selection are preserved; richer phases/trace remain A12. No inferred DAG, child control binding or full workflow denominator | U1–U3; W1–W2 |
| A12 | Workflow checklist/phase counts, lane role/state, gate/review/acceptance, next action, workspace/ref/output, blocked/stale/watchdog chips, preflight warnings | Some trace fields survive targeted details but are raw JSON; most fields omitted | **Partial / adapter/API.** Typed trace rendering is feasible; full workflow/preflight/acceptance views need validated tool details or richer public projection, not guesses from labels | U2 `projectAsyncLane`, `renderWorkflowChatProgress`; W2 `projectTool` |
| A13 | Host-owned monitor steps distinguish role/provider, verdict/reason, stale state and report | Readable monitor kind/provider/role/state/verdict/reason/detail/staleness, explicitly not an agent | **Implemented / existing facts.** Link targets/reports remain omitted pending reviewed public identity/path handling; host steps are not child control targets | U6; W1–W2 |

### B. Inspector, transcripts and controls

| ID | Upstream displays / does | Current web panel | Gap and disposition | Evidence |
| --- | --- | --- | --- | --- |
| B1 | Split roster/output inspector; stable selection, pinned identity/stats, live refresh; keyboard and pointer navigation | Side-by-side roster/inspector; narrow-screen drill-in with Back; selected identity/state/facts | **Implemented / fixtures validated.** Unique selection, focus and disclosures survive observation/reordering; disappearing or ambiguous occurrences clear selection. Output follow remains B4 | U1, U3; W1 |
| B2 | Child-specific selection and transcript, including parallel children; recent results | Nested read-only snapshot selection; only unique fresh top-level targets can request whole-run transcript | **Partial / child mapping API dependency.** RPC accepts authoritative `id + index`; stop accepts `id + childId`, but snapshot IDs/labels/row positions provide no validated binding. Duplicates never enable targeted reads or controls | U3, U5; W1–W2 |
| B3 | Structured assistant Markdown and supervisor messages; tool rows with args/status/duration/error; bash output tail and expandable details; syntax-highlighted read output | On-demand escaped text `<pre>`, default 80 lines, up to 500 | **Partial / API.** Host Markdown rendering exists; structured child events do not arrive via current event-bus status. Do not reconstruct typed events by scraping prose. Parent tool entry renderers are a separate available surface | U4; U5; W1; H1 |
| B4 | Live transcript refresh, auto-follow until user scrolls away, manual refresh, pinned header, truncation/warning signals | One manual transcript read, no follow mode | **Missing / UI** for bounded selected-target text refresh and scroll behavior; true structured streaming still API-dependent | U1, U3–U4; W1–W3 |
| B5 | Run/child identity, mode, context, model/thinking, tools, tokens, duration; completed output/session/transcript paths and read errors | Selected-node identity/state, agent/model/thinking, timings, activity/progress/host-monitor facts plus bounded evidence | **Partial / snapshot summary implemented.** Context, identity-linked usage, structured results and artifact access still lack public inputs. Text fallback retained; private artifact traversal prohibited | U3; U1 inspection protocol; W1–W2 |
| B6 | Acknowledged child steering with steer/follow_up/auto; selected child's top-level stop with confirmation | Whole-run steer/follow_up/auto, interrupt, stop, resume, confirmations and correlated receipts | **Present at unique run scope / partial at child scope.** Explicit “Stop entire run”; fresh occurrence/target revalidation at admission and confirmation, duplicate-ID transport guard. Existing receipt semantics retained. No whole-run action labelled child-only | U1, U3, U5; W1–W3 |
| B7 | Foreground detach shortcut/command; external Inspect plugin opening (tmux/Herdr/Ghostty); foreground Prompt Audit/redo controls | No equivalent | **Blocked / API.** Browser inspection can replace terminal pane UX, but detach and Prompt Audit execution need public APIs. Do not spawn terminal inspectors as a workaround | U1, U3; U5 |
| B8 | Prompt Audit: authored task, runtime additions, effective prompt, copy, redo with guidance; source/superseded run IDs | None | **Blocked / API.** TUI reads live foreground control state; neither the nine RPC methods nor the snapshot expose these three prompt views/redo | U3 `promptAuditText`, action handlers; U5 |
| B9 | Workflow stop with `drain: true` through model-facing tool (0.87) | Hard stop only | **Blocked / RPC.** Current upstream event-bus `stopAsyncRun` does not read/pass `drain`; adding a checkbox alone would be dangerously misleading | U8; U5 `stopAsyncRun`; W2 |
| B10 | Inspector yields to permission/select/confirm dialogs and restores selection (0.88.1) | Web native controls; no TUI overlay port | **Web adaptation.** Preserve host dialog ownership, confirmation focus, selections/drafts across refresh; test overlapping dialogs rather than reproducing terminal keybindings | U3 render focus guard; U8; W1 |

### C. Conversation, attention and administration

| ID | Upstream displays / does | Current web plugin | Gap and disposition | Evidence |
| --- | --- | --- | --- | --- |
| C1 | Rich single/parallel/chain/workflow tool cards: task, live output, model/context, tool/token/cost/time metrics, grouped outcomes; compact/expanded forms | No transcript renderer contributions | **Missing / adapter.** Host v5 provides the surface and incoming tool details. Validate bounded schemas and render supplied facts; no tools launched by rendering | U2; W4; H1 |
| C2 | Compact expandable completion, workflow-child, wait, steering, control/attention, auto-resume/result-write failure notices | Host generic messages, no plugin-specific rendering; panel receipts only for its own requests | **Missing / adapter.** Displayed custom-message types can be rendered via v5. Do not confuse notification history with current state or this panel's receipts | U4 `MESSAGE_VIEWS`; W4; H1 |
| C3 | Supervisor decision/interview/progress requests, unanswered/blocked reminders, reply history | “Inspect supervisor requests” stages a parent-message chip only | **Partial.** Rich displayed request/reminder cards are feasible. Direct pending-request inbox/reply is **API-blocked**. Reply `appendEntry` history is not exposed by v5 custom-message rendering | U4 `MESSAGE_VIEWS`/`ENTRY_VIEWS`; W1 `stageParentMessage`; U5; H1 |
| C4 | Watchdog severity, importance, category, evidence, recommendation; held/blocked/reconciliation state and clarification notices | No specialized rendering | **Missing / adapter** for displayed warnings supplied in parent messages/tool details; live watchdog configuration, permission decisions and hidden-entry history remain separate API gaps | U4, `src/watchdog/render.ts`; W4; H1 |
| C5 | Parent, each child, child total, overall total: input/output tokens, cache read/write, turns and cost; unavailable-child warning | Accessible on-demand table with all six fields, timestamp, unresolved count and incompleteness caveat | **Implemented / fixtures validated.** Regional formatting retains sub-four-decimal costs. Zero unresolved children is explicitly not completeness proof; no accounting polling or fleet merging | U7 `formatSubagentCostReport`; W1–W2 |
| C6 | Agent selector with scope/source; model/provider and thinking pickers; system-prompt editor; detailed tools/skills/inheritance/output/override metadata | Free-text agent launch and model input; `/subagents` helper | **Partial / API.** No agent/model/config management in event-bus `manage` (schedules only). Generic select dialogs may work in chat; custom editor does not become a web editor automatically | U7; U5; W1; H1 |
| C7 | `list` with search, at most 30 agents (0.88); guide/doctor and other textual management outcomes | No catalog/search/diagnostic browser; command helper only | **Missing / API** for native panel catalog. Render available textual/tool outcomes, but do not present RPC `manage` as arbitrary command execution | U8; U5; W1 |
| C8 | Schedule/mission management text and results; schedules include operational history | Existing schedule list/show/history/pause/resume/run/delete but IDs entered manually and results raw | **Partial / UI** for supported schedule browsing/history. Mission CRUD and schedule create/update are outside the seven RPC actions. Pi Web Automations is a separate system, not these schedules | U5; W1–W2 |
| C9 | External CLI safety profile labelled “adapter profile, not measured”; runner command provenance in status/receipts (0.86) | Any supplied text remains readable; typed projection has no safety view | **Partial / adapter.** Add only after exact public payload validation; never turn a configured profile into a measured security guarantee | U8; W2 |
| C10 | Session switching asks stay / take work / leave work (0.85); terminal title/status shows work and attention | Web selection resets scope; plugin cannot transfer work or alter host navigation policy | **Host/API boundary.** Preserve exact-session ownership and make scope explicit. Do not reinterpret browser selection as upstream transfer consent | U8; W3; H1 |

### Complete custom-message family to consider

U4 registers: supervisor request (constant `SUPERVISOR_REQUEST_MESSAGE_TYPE`),
`subagent-supervisor-unanswered`, `subagent-supervisor-blocked`, `subagent-notify`,
`subagent-completion-unanswered`, `subagent-completion-unhandled`,
`subagent-wait-subscription`, `subagent-incremental-child-notify`,
`subagent-workflow-result-write-failed`, `subagent-auto-resume`,
`subagent_control_notice`, `subagent_steering_notice`, watchdog warning
(`SUBAGENT_WATCHDOG_WARNING_TYPE`) and `subagent_watchdog_clarification`.
The extension also registers slash-result/text renderers. Resolve constant values
from the selected upstream artifact; do not invent message names. Unknown or
malformed payloads must retain the generic host view. Private `appendEntry`
renderers are **not** displayed custom messages.

## Latest release delta versus this adapter's 0.84.0 engine pin

| Release | UI / behavior relevant to parity | Meaning for redesign |
| --- | --- | --- |
| 0.85.0 | Background-work session handoff choice; fixed-width Herdr count/attention token; per-child permission checks; safer workflow/resume lifecycle | Ownership/permission semantics matter; terminal title and lifecycle policy are not browser UI fields. RPC workflow launches are expressly not covered by all nested permission-hook behavior: do not imply equivalent approvals |
| 0.86.0 | Expanded single-child task preserves line breaks, up to eight lines; CLI safety profile explicitly unmeasured | Task hierarchy must improve; retain safety provenance, not a false “safe” badge |
| 0.87.0 | Graceful workflow drain; exact provider model selection; multi-session shutdown isolation | Drain is not yet in this RPC stop bridge. Model IDs and session isolation must remain exact. Engine fixes require upgrading the separately installed engine |
| 0.88.0 | Latest child progress + age; searchable bounded catalog; waiting excluded from child timeout; truncated model response fails | Progress is a concrete adapter omission. Show upstream failure/wait semantics faithfully, not synthetic local timeout judgments |
| 0.88.1 | Fleet inspector steps aside for dialogs; clean completion no longer transiently reported observer-unavailable | Preserve focus/modal ownership and separate proof from result. Upgrading an adapter cannot supply the engine fixes |
| Unreleased | Herdr local placement, placed-child tool reporting, large-message/startup/acceptance fixes | Track separately; not released acceptance criteria or evidence that 0.88.1 contains them |

## Data seams: what can actually be shipped here

### Existing public data, underused

- Async node timing and activity fields; model/thinking and host-step facts.
- Fleet goal, elapsed age, input/output/total/window/windowPeak, role/effort.
- Cost usage for parent/children/totals: all token/cache/turn fields, not just money.
- Targeted result identity/error/output and workflow trace (currently JSON).
- V5 parent tool-entry and displayed custom-message payloads, independently of
  panel RPC. These need their own bounded, untrusted-input parsers.

### Public data omitted at baseline

- `progressText` / `progressUpdatedAt` on async step nodes in 0.88.x: resolved in
  leg 1's optional bounded projection and readable presentation (fixture evidence).
- Other richer tool details must be audited individually; allowing arbitrary
  nested `details` through is not a safe or necessary parity strategy.

### Different public protocol, not yet a supported adapter route

Upstream `/subagents-inspect-rpc` supplies bounded, correlated, session-scoped
`pi-subagents.inspect-reply` data via an emit-then-retract widget. It can provide
an attributable task, resolved provider/model and child transcript messages,
with explicit omissions and no paths. Its availability in upstream is **not**
evidence that this Pi Web plugin can send that extension command and capture
that widget using its existing public hosted-session event capability.

This is a promising integration requirement, not an implemented RPC method.
Do not enable `PI_SUBAGENTS_COMPONENT_UI=1`: upstream's documentation refers to
other component-capable hosts too; this host does not render terminal widgets.
A clean solution needs a documented host bridge or an upstream event-bus inspect
method with equivalent ownership/bounds, not private routes or filesystem scans.

### Hard limits to report honestly

- Fleet entries have opaque presentation keys, **not** run/control IDs. They
  cannot be safely merged with async rows by agent name, goal, order or model.
- Snapshot bounds: 20 runs, 8 children per node, depth 3, strings 160, 32 KiB.
  Fleet bounds: 16 entries. These are projections, not a complete run ledger.
- Untargeted ready-state status may be only in-memory summary + snapshot. It
  does not include the rich tool-result details seen in an executing chat card.
- Event-bus RPC still has nine methods and seven schedule actions. It has no
  supervisor inbox/reply, catalog/config, Prompt Audit/redo, detach, or drain method.
- Child structured transcript rendering and parent transcript entry rendering
  are **different capabilities**. Success at one does not establish the other.

## Outcome

The proposed redesign is in [`subagents-parity-redesign.md`](subagents-parity-redesign.md).
Full upstream parity is **not currently achieved**, and cannot honestly be promised
by a panel-only visual refresh. The redesign must close public-API gaps and keep
remaining upstream/host dependencies visibly open.
