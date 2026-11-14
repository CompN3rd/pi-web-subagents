# Relay leg 7 — displayed custom-message cards (C2–C4)

## Implemented surface

`src/browser/notices{,-schema}.ts` adds exact public v5 `custom-message`
contributions for the 14 released `MESSAGE_VIEWS` types. They reuse the
revision-local `TranscriptCard`, shared style/localization controllers and bounded
schema primitives, independently of the panel's control authority.

| Displayed type | Readable presentation |
| --- | --- |
| `subagent_supervisor_request` | Decision / structured interview / informational progress distinction, reported request/run/agent/index/child-target, expected-reply flag, request body |
| `subagent-supervisor-unanswered`, `subagent-supervisor-blocked` | Distinct historical reminder headings and supplied request IDs; never a current pending count |
| `subagent-notify` | Grouped individual reported outcomes, duration/task, workflow/child references, resume/reconciliation disposition and watchdog blockers |
| `subagent-completion-unanswered`, `subagent-completion-unhandled` | Distinct completion-delivery attention headings and original text |
| `subagent-wait-subscription` | Reported run/outcome/token; no assumption about the configurable wait tool name |
| `subagent-incremental-child-notify` | Reported child key/outcome, not a full workflow barrier or completion proof |
| `subagent-workflow-result-write-failed`, `subagent-auto-resume` | Save/auto-resume failure headings and original text |
| `subagent_control_notice` | Attention type, activity, agent/run, reason, tool/duration/counts, workflow key/phase, message/failure summary |
| `subagent_steering_notice` | Historical failed/partial/recovered state, run/request and message; not this panel's delivery receipt |
| `subagent_watchdog_warning` | Severity/importance/category/source, summary, evidence, recommendation, state/stale/error/repetition/display time; stalemate explicitly reports that the watchdog stopped continuing the run |
| `subagent_watchdog_clarification` | Clarification heading and original text |

Every card states historical provenance, contains a keyboard-native original-text
disclosure and leaves the host frame/default-view control alone. Text-only or
legacy entries with absent details do not parse prose/XML into structured facts.
Structured watchdog warnings are readable without interpreting raw XML. Tool
payload review/watchdog/runner/graph expansion is **not** part of this slice.
Completion child-output artifact metadata remains in original text/default view;
no file is opened or downloaded.

Supervisor guidance names the panel's existing **Prepare supervisor-help message**
action (the staged chip is **Inspect supervisor requests**). The transcript input
has scope but no composer/prompt context, so this slice does not bind an unrelated
active-session prompt helper to historical cards. The helper prepares an ordinary
parent message only. There is no reply button, approval, interview answer form,
current inbox, or generated exact-request reply command.

## Exact released sources inspected

All sources below were read from the already SHA-512-verified **0.88.1** tarball
extracted in leg 5, not Unreleased main. Integrity and artifact provenance remain
in [`upstream-0.88.1.md`](upstream-0.88.1.md):

- `src/tui/subagent-messages.js`: all 14 `MESSAGE_VIEWS` and separate hidden
  `ENTRY_VIEWS`; completion/wait/control/steering/request/reminder headlines.
- `src/intercom/supervisor-ui.{js,d.ts}` and `native-supervisor-channel.js`:
  exact custom type, optional fields/reasons and emitted request/reminder details.
- `src/runs/background/notify.{js,d.ts}`: grouped render details omit output
  previews; completions can be hidden; stored pending entries are a separate type.
- `src/runs/background/wait-subscriptions.js`: displayed wait token/run/outcome.
- `src/runs/foreground/subagent-executor.js`: displayed child outcome and
  result-write failure (no structured details for the latter).
- `src/extension/{control-notices,steering-notices}.{js,d.ts}` and
  `src/shared/types.d.ts`: emitted attention/steering payload shapes.
- `src/watchdog/{types.d.ts,render.js}` and `register-main.js`: severity/state
  definitions, stalemate meaning, and text-only clarification message.
- `src/workflows/workflow-auto-resume.js` and `src/extension/index.js`:
  text-only auto-resume failure notice.

Public host declarations: pinned `@jmfederico/pi-web@1.202611.1/plugin-api`.
The public plugin reference and standalone transcript-renderer example were read.
No host private implementation is imported or modified.

## Bounds and safety

- Exact case-sensitive custom types only; no `subagent_supervisor_reply`, pending
  notice entries, hidden-history scan or wildcard registration. Whether a custom
  message is displayed is the host's responsibility; the v5 input supplies only
  displayed entries. Tests do not pretend to prove the actual host visibility gate.
- Selected detail strings: ≤16,384 characters each, ≤131,072 combined; arrays
  ≤32 per field. Unknown fields are not traversed. Invalid/oversized selected
  data and unsupported content decline to the host default view.
- Original text preview ≤16,384 characters, with a visible cap notice; up to 32
  text content blocks. Image/mixed content declines rather than silently omitting it.
- Lit text bindings only. No HTML/Markdown execution, path/URL/control bindings,
  inference of targets from displayed IDs, network operations, time-based status,
  poller, auto-launch, supervisor reply or hidden-entry discovery.
- No scope/controller/server/mutation protocol changes. Existing receipt,
  confirmation and exact-parent authority checks are unchanged.

## Validation

Node **22.22.2** in this container; package requires ≥24. This is not Node-24
runtime acceptance.

- `npm run typecheck`: passed.
- `npm test`: **156/156 passed**, no skips. Seven new notice tests cover the
  complete family, variants, bounded malformed data, aggregate limits, unknown
  fields, getter failures, legacy content, hostile text, abort, localization and
  deterministic no-side-effect rendering. One initial assertion failed because
  its regex did not span multiline evidence; the test was fixed and rerun.
- `npm run build`: passed.
- `npm run pack:release` and registry/containment verification: passed (see packet
  `evidence/leg7-checks.log` for candidate SHA-256 and exact command output).
- `git diff --check`: passed.
- Built-adapter Chromium **156.0.8078.4** fixture: passed all existing regressions
  and new custom-message tests. All 14 exact types mount; decision → progress →
  interview updates work; watchdog evidence/held-state and mixed completion
  outcomes are readable; no injected elements or RPC calls; keyboard disclosure
  remains open across repeated inputs. Unknown/malformed/legacy/default cases,
  375px RTL and light/dark themes, cleanup of styles/localization and no page errors.
  New watchdog dark/RTL and completion light screenshots were visually inspected.

Command:

```sh
PI_WEB_SMOKE_PLAYWRIGHT_ROOT=/data/projects/pi-web-code-review/node_modules/playwright npm run test:browser
```

Durable packet evidence: `evidence/leg7-checks.log`, `leg7-browser.log`,
`leg7-browser/` (result JSON and screenshots). This is a **real browser using the
built adapter and fake public-contract host**, not the real host's renderer
implementation. No live host/provider/engine run, overlapping real extension
dialog check, runtime engine upgrade, schedule mutation, production installation,
publication or daemon restart was performed. Those limitations remain explicit;
C2–C4 supported display improvements are not full upstream feature parity.
