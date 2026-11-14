# Subagents: browser-native parity redesign

**Status: adapter-local design approved; implementation Relay authorized.**

Basis: [`subagents-parity-inventory.md`](subagents-parity-inventory.md), comparing
adapter 0.84.1 / engine 0.84.0 with upstream 0.88.1 and the pinned Pi Web v5 API.
Inventory IDs below provide traceability. This is a product design, not a prescribed
sequence of Relay legs.

## Goal

Make supervising subagents in Pi Web as informative and usable as upstream's TUI:
see what each child is doing, understand its progress and resource use, inspect
its output, recognize requests for attention, and intervene on the correct target.

Do not merely add more JSON to the existing page. Use a **live fleet workspace
plus informative conversation cards**, with public-data limitations stated honestly.
Terminal keybindings and pane-opening mechanics need browser equivalents, not
literal replicas.

## Proposed information architecture

```text
Subagents                       [Refresh] [New run]
Parent conversation / workspace / machine     Updated … / Stale
Reported active: N     Capacity: used/limit     Observed attention: …

[Runs] [Usage] [Schedules] [Capabilities & help]

RUNS: master/detail
┌─────────────────────────────┬──────────────────────────────────────────┐
│ [filter visible runs…]      │ Selected run / child       state         │
│ [All] [Active] [Attention]   │ agent · model · thinking · source*       │
│                             │ elapsed · tools · turns · last activity │
│ Workflow name      running  │ Task / goal*                             │
│ ├ scout            done     │ Progress: “…” · reported 12s ago*       │
│ └ worker           running  │ Tool: read · active for 3s*              │
│   read · 3s · 12 tools      │                                          │
│   Progress: “tests pass…”   │ [Overview] [Output] [Workflow] [Evidence]│
│                             │                                          │
│ Other reported activity    │ Output: [Refresh] [Follow] [Jump to end] │
│ (unlinked/display-only)    │ … bounded text / structured data* …      │
│                             │                                          │
│ Older/recent reported runs │ [Steer ▼] [Interrupt] [Stop run] [Resume]│
└─────────────────────────────┴──────────────────────────────────────────┘
* Only if the source supplies it; no fabricated facts or target identities.
```

The mock-up illustrates organization, not evidence that every illustrated field
is currently supplied. Unknown values and unavailable sections have clear reasons.

On narrow screens, roster → detail is a single-column drill-in with a named Back
button. Selected identity, status and attention remain at the top; actions do not
sit underneath unrelated schedule and accounting forms. Keep the existing host
panel ID, navigation/pinning ownership, shared styles and localization integration.

## 1. Fleet workspace: information visible at a glance

Closes A2, A5–A7, A9–A10, A13, B1; improves A1, A3–A4, A8, A11–A12.

### Roster row

- Primary: meaningful reported label, agent, textual execution state.
- Secondary: reported model/thinking, elapsed time, current tool and duration,
  last activity, turns/tools. A missing timestamp is unknown, not “just now”.
- Progress: show `progressText` beneath task/label and age from
  `progressUpdatedAt`; old engines render without a progress row.
- Task: preserve useful multi-line text in the inspector; one-line preview in
  dense rows. Show existing fleet goals without treating them as authoritative
  child tasks. Redacted/omitted text stays omitted.
- State emphasis: running, queued, attention, failed/rejected, partial,
  paused/stopped and complete all have text, not just colors.
- Nested relationships remain exactly those reported. Host monitor rows are
  explicitly monitors, with provider/role/verdict/reason/staleness, not agents.
- Active/recent grouping and filtering apply to the **reported window**. Display
  cap/omission banners; never label filtered counts as the total engine history.

### Fleet metrics

Expose fleet input/output, cumulative spent, current context window and peak where
reported. Do not invent a utilization percentage without an authoritative context
limit. Keep usage attached to the opaque fleet row unless a public identity link
exists; no matching by name/model/task or summing the fleet and tree together.

Unlinked entries remain visible in a clearly distinct “Other reported activity”
section. They are not dismissed as unimportant just because control identity is
unavailable. They also must not be called additional unique agents: they can overlap
the async tree.

### Freshness

Distinguish snapshot fetch time, child activity time and progress-report time.
Reuse bounded event-driven observation/reconciliation. A visible elapsed clock
must not add network requests or make stale source data look refreshed. Preserve
selection, native disclosure state and focus across reordering and refresh.

## 2. Selected-run and child inspector

Closes B1, B4 and existing-data parts of B5–B6; supports B2–B3 where proven.

- Pin selected scope and target identity in the inspector. Labels can repeat;
  identities cannot be inferred from them.
- Selecting a nested row can always open **read-only snapshot details**. Enable
  targeted child transcript/control only when a fresh authoritative response
  supplies an unambiguous run/index or run/childId binding for that operation.
  Never parse `step:…` or an array position into a control target by assumption.
- Overview presents readable key/value facts, timings, latest progress/activity,
  terminal errors and available result summaries. Evidence holds bounded raw
  projections and receipt correlation for debugging, not the primary UI.
- Output starts with a targeted bounded read and offers explicit follow mode for
  the selected target. Follow refreshes stop when hidden, unmounted, out of scope
  or turned off. Scroll-away suspends auto-scroll, not the user's inspection;
  “Jump to latest” restores it. No full-fleet transcript polling.
- Retain reliable escaped-text fallback. Use shared host Markdown only for content
  known to be Markdown; do not run a mixed log through a parser and call it a
  structured transcript. Rich tool rows need typed messages with identities,
  inputs/results/status and timestamps.
- Retain omission, redaction, artifact-unavailable and read-error notices.
  Paths in text are not authorization to read/download private files.
- Actions state their actual scope: **Stop entire run**, **Interrupt run**,
  **Steer selected child** only where supported. Workflow drain is absent/disabled
  with explanation until public RPC really implements it; it must not fall back
  to hard stop.
- Show queued/delivered/failed/unknown receipts near the relevant action.
  “Stop requested” is not “stopped”; completion is not process-exit proof.
  Unknown launch outcome offers existing correlation recovery, never automatic retry.

## 3. Conversation parity, using the host v5 API

Closes C1–C2 and supported display parts of C3–C4; improves A1 and foreground
visibility without inventing an extra execution engine.

Register browser `transcriptRenderers` for supported subagent tool entries and
known displayed custom messages. Preserve host frame/default-view controls and
fallback when parsing fails. Use shared presentation primitives between panel and
chat, but keep their data authorities separate.

### Tool cards

- Compact heading: mode, agent/workflow label, execution/result state, reported
  progress, timing, token/cost facts if supplied.
- Expandable task and output, model/thinking/context, tool activity and counts.
- Single/parallel/chain/workflow layouts retain reported grouping and per-child
  outcomes. Render real workflow trace/phase/preflight/acceptance facts when their
  incoming schema is validated; no synthetic full plan from a partial tree.
- A completed `status` **tool call** is not a completed **queried run**. Historical
  cards remain historical; render time is not new status evidence.
- Do not assume wait-tool names are fixed: upstream allows renaming. Handle only
  verified names/payloads and otherwise delegate to the host's generic renderer.
- Render callbacks are repeatable and side-effect free: no RPC mutations,
  auto-launches, supervisor replies or implicit background polling from rendering.

### Notice cards

Use the inventory's complete custom-message family. Distinguish:

- Completion/result, grouped completion and per-workflow-child outcomes.
- Requests for a decision or structured interview versus informational progress.
- Unanswered/blocked reminders and result-delivery/save/reconciliation failures.
- Steering/control attention and acknowledged delivery states.
- Watchdog severity, evidence, recommendation and held/blocked state, not just
  colored raw XML.

Offer a clearly labelled **prepare message for parent** handoff where possible.
It is not a direct reply button. Do not expose hidden custom entries or infer a
live pending queue from historic cards. Actual supervisor answers remain in the
ordinary parent tool workflow until a public exact-request reply API exists.

### Visibility outside the panel

Public v5 session-row labels are a possible browser counterpart to the TUI's
persistent fleet summary. Verify their lifecycle and authoritative data source
before using them; do not add global eager polling for every session. If shipped,
show cached/stale provenance, avoid implying an exact pending-question count, and
respect that labels appear in session lists, not an under-editor/global counter.
Inline cards are required; a shell-level persistent widget remains a host gap if
no suitable supported surface/data source is established.

## 4. Usage, workflow, schedules and launch

### Usage (C5, A9)

An on-demand table for parent, each child, child total and total:
input, output, cache read, cache write, turns, cost. Preserve exact available
values, regional formatting and explicit refresh timestamp. An unresolved-child
count means lower-bound accounting; even zero does not prove completeness when
artifacts/receipts are missing. Do not poll accounting or infer it from Pi's footer.

### Workflow (A11–A13)

Render typed trace entries with phase/key/label/agent/state/duration/reuse and known
run references; distinguish host checks from child work. Show existing host-step
verdict/reason/detail/stale facts as meaningful UI. Rich lane checklists,
preflight/acceptance/review/watchdog state come only from validated tool payloads
or an improved public snapshot. Report capped coverage; no invented percentages.

### Schedules (C8)

Replace manual-ID-first interaction with selectable records and readable details
and history for the seven supported actions. Mutations remain explicit and
confirmed. Keep original text available. Missing schedule/next-run fields remain
unknown. No new schedule creation, recurring job or mission-management system is
part of this redesign; do not conflate upstream schedules with Pi Web Automations.

### Launch and administration (C6–C7)

Put New run in a focused form/dialog, retaining agent/script/workflow, task/args,
context, model and label. Show only relevant fields for the selected mode and a
readable confirmation. Inherit model unless the operator explicitly overrides it.
A searchable agent/model catalog is conditional on a real public catalog route;
free text with accurate help is better than fabricated inventory.

Administration/help explains the installed capability boundary and parent-command
handoff, including disabled slash commands and composer-chip caveats. Never claim
that a TUI system-prompt editor is a working browser configuration editor.

## 5. Contract changes and unresolved parity dependencies

### Adapter-local work with established public inputs

- Preserve bounded `progressText` and `progressUpdatedAt` in node projections;
  test absence, zero/invalid timestamps, limits and hostile strings.
- Present existing node/fleet/cost/trace fields as described above.
- Add v5 transcript rendering with a separate bounded schema for incoming tool
  and displayed message details, safe fallback and host lifecycle cleanup.
- Correct README's obsolete rich-rendering limitation; distinguish panel RPC,
  parent entry rendering and structured child inspection.
- Evaluate the exact **0.88.1** engine artifact as the released baseline using
  repository mapping/integrity procedures. Do not use main/Unreleased as a release
  dependency. Source mapping is not an installed-engine upgrade or runtime proof.

### Public API additions needed for full parity

| Dependency | Required semantic contract | Inventory |
| --- | --- | --- |
| Child inspection over a supported route | Session-scoped bounded read by authoritative run/child identity; task provenance, resolved model, typed transcript, result, truncation/stale errors; leverage upstream inspect semantics rather than reading private artifacts | A4, B2–B5 |
| Rich live roster projection | Stable inspect/control target separately from display key; foreground/recent/external/source/context; identity-linked usage; workflow lane/gate metadata | A1, A3, A8–A12 |
| Prompt Audit and redo | Exact live child authorization, three prompt views, explicit redo receipt/source relationship | B7–B8 |
| Supervisor inbox/replies | Exact request/child identity, pending state, expiry, explicit reply acknowledgement, interview schema; no steering-as-answer shortcut | C3 |
| Drain and detach | Capability-advertised graceful stop/detach semantics and state transitions; no hard-stop substitution | B7, B9 |
| Catalog/config administration | Scoped agent/model discovery, read-only provenance, validated edits, persistence scope and concurrency protection | C6–C7 |
| Host-wide monitoring / hidden history | Supported compact persistent surface and observation; explicit public access for any hidden entries, not a DOM/private-file workaround | A1, C3, C10 |

These are **requirements for APIs**, not instructions to implement an upstream fork
inside this adapter. None is silently considered closed by a help link. If work
remains adapter-only, the final report must say **public-API parity improvements,
with enumerated full-parity blockers**, not “feature parity achieved”.

## 6. Acceptance criteria

The implementation should carry inventory IDs into tests/evidence and update each
row's disposition. Minimum demonstrable outcomes:

1. A single active child shows tool, tool duration, elapsed time, activity age,
   counts and progress/age without opening JSON; older engine payloads omit new
   fields gracefully. Full task text appears only from an attributable source.
2. A parallel/workflow fixture shows individual child states and nested relationships;
   mixed outcomes and host monitors remain distinct. No guessing targets from labels,
   indices in rendered arrays or opaque fleet keys.
3. Roster/detail selection, focus, expanded sections and scroll position survive
   observation and reordering. Duplicate IDs cannot send ambiguous controls.
4. Output follow is selected-target-only and bounded; manual scroll is respected;
   target/scope change and plugin disposal cancel observation without stopping work.
5. Parent tool and custom-message fixtures render rich cards in the pinned host's
   v5 renderer lifecycle, with generic fallback for unknown/malformed data; no
   mutation from rendering. Status-query success is not run success.
6. Supervisor progress/request/reminder and watchdog warning fixtures are readable;
   no UI pretends a staged parent message answered a child or enumerated all pending
   requests. Hidden entries stay hidden.
7. Usage exposes all supplied token/cache/turn/cost fields, a timestamp and honest
   lower-bound warning. Snapshot/filtered/omitted counts are clearly distinguished.
8. Existing launch/control receipts, timeouts, unknown outcomes, confirmation and
   exact session/machine/workspace authority remain intact. Drain is never simulated.
9. Keyboard-only operation, focus restoration, narrow-screen layout, escaping,
   shared themes, localization/direction and reduced-motion needs have fixture or
   browser evidence. Host dialogs are not obscured by plugin confirmation UI.
10. Typecheck, tests and build pass. Browser-fixture results and isolated real-host
    acceptance are reported separately; unperformed tests are not implied by unit
    coverage. No production installation or hosting-daemon restart is implicit.
11. The updated inventory identifies each closed gap and each remaining concrete
    dependency. A polished panel plus documented blockers is not described as full
    upstream feature parity.

## Approved Relay scope

Implement the redesign in this repository using the supported pinned host APIs
and released upstream contracts, including inline cards, not only panel CSS.
Keep upstream engine separately installed; do not bundle/fork/patch it, use private
routes, or restart services. Evaluate/update the exact released engine mapping
with artifact verification when adopting 0.88.1. Deliver tested public-API parity
improvements and an explicit remaining-dependency inventory.

The operator explicitly approved and requested dispatch of this adapter-local Relay.

**Full parity requiring upstream/host API work is a separate scope decision.**
Approval of this adapter-local scope accepts those enumerated API dependencies as
reported limitations, not as completed features. If full parity with no remaining
gaps is required now, expand the agreed repository/host scope before dispatch.
