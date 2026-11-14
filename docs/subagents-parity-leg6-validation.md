# Relay leg 6 validation — bounded inline tool cards

## Delivered

- Required public v5 `transcript-rendering@1` contribution for the exact fixed
  upstream name `subagent`. All other names, including configurable wait names,
  delegate through `next()`; an unsupported selected entry returns `undefined`
  for the host's generic view. The host retains its frame/default-view controls.
- Independent display-only parser in `src/browser/transcript-schema.ts`, not an
  extension to panel RPC authority. It validates selected fields from the released
  `Details`, `SingleResult`, `AgentProgress`/`ProgressSummary`, `Usage`, preflight,
  acceptance and trace shapes. Unknown additional fields are not traversed.
- Single/parallel/chain/workflow/management mode headings; explicit **tool-call**
  state, not inferred run success. Reported child indices/run IDs remain text,
  never targets. Requested parallel/chain groups are labelled arguments, not
  execution proof; chain ordering and per-child result facts remain distinct.
- Expandable requested/reported tasks and output; reported model/context/thinking,
  tool/argument/path/activity/count/duration/progress facts, recent tools/output,
  token/cache/turn/cost metrics, error/partial/detached/interrupted/stopped facts,
  output/metadata-save failures. No wall-clock freshness, synthetic success,
  percentages, usage joins or pending-request count.
- Bounded workflow preflight lanes/claims/coverage/warnings, acceptance
  status/evidence/runtime checks/parent decision, and reported trace with
  operation/phase/run/duration/reuse/error/warning. Shared trace/fact templates
  also retain panel behavior; trace wording now fits either public source.
- Revision-local Lit card element with host stylesheet/localization controllers;
  native keyboard disclosures, logical CSS, escaped text and shared theme tokens.
  Rendering has no RPC, polling, mutation, staging or asynchronous work. Aborted
  inputs decline; disconnect/default-view replacement releases registrations.

### Bounds and fallback

Selected detail strings: at most 16,384 UTF-16 code units each and 131,072 in total.
Arrays: at most 32 entries, except workflow trace at 64. Argument JSON is limited
to 32,768 characters before parsing; selected argument text has the same total
budget. Nesting is a fixed schema, not arbitrary recursive traversal. Invalid or
oversized selected fields decline the complete custom card rather than silently
truncate identities or summarize an incomplete child list.

Tool text (host `resultText`, string content, or at most 32 text blocks) has an
explicitly labelled 16,384-character preview cap. Non-text content without a
usable `resultText` keeps the generic view. No HTML/Markdown execution, URLs,
private artifact reads or hidden-entry access. Full source stays in the host's
original/default view; selected schemas are deliberately not the full upstream
payload.

### Released evidence

Used the already SHA-512-verified **0.88.1** artifact documented in
[upstream-0.88.1.md](upstream-0.88.1.md), without installing/executing it:

- `src/shared/types.d.ts`: `Details`, `SingleResult`, `AgentProgress`,
  `ProgressSummary`, `Usage`, `WorkflowPreflight`, `AcceptanceLedger`.
- `bundle/chunk-FLNDHNPE.js`: fixed-name tool registration at line 9128 and
  `renderCall`/`renderResult` dispatch.
- `bundle/chunk-5EMPFFO4.js`: `renderSubagentResult` at line 3002, live progress,
  result, task, output and usage consumers.
- `bundle/chunk-N6TAAIB3.js`: `StructuredTask`/`StructuredWorkflowProperties`
  around lines 966–980 (structured mode when workflow scripts are disabled).
- Pinned host `@jmfederico/pi-web@1.202611.1` public declarations/docs for
  `TranscriptToolRendererInput`, resolver/fallback, capability and lifecycle.
  The local standalone transcript-renderer example was used as guidance, not
  bundled host implementation.

`test/transcript-fixtures.ts` contains **synthetic schema-derived fixtures**,
not recorded provider executions. Existing panel fixtures are separate inputs.

## Validation

On **Node 22.22.2**, below the declared Node ≥24 target:

- `npm run typecheck` — passed.
- `npm test` — **149/149 passed**, no skips/cancellations.
- `npm run build`, `npm run pack:release` — passed.
- `npm run verify:release -- --tarball artifacts/compn3rd-pi-web-subagents-0.88.1.tgz`
  — passed mapping/lock/registry SHA-512 and six-file scoped containment.
- `git diff --check` — passed.
- `PI_WEB_SMOKE_PLAYWRIGHT_ROOT=/data/projects/pi-web-code-review/node_modules/playwright npm run test:browser`
  — passed on Chromium **156.0.8078.4**. Built adapter with fake public host/peer:
  fixed-name cards, mixed child outcomes/progress, partial preflight, acceptance,
  host trace, literal hostile strings, status-query success distinct from run
  state, zero RPC from rendering, unknown/malformed/default-view fallback,
  repeat updates/disclosure retention, keyboard activation, 375px RTL/localization
  and dark/light theme containment, stylesheet/localization cleanup. Existing
  follow/scroll/schedule/launch/control/scope/graph/mobile checks also pass.
  No page errors. New mobile screenshots inspected for legibility/containment.

Browser validation caught and fixed a real reactive-property issue: native class
field initialization shadowed Lit's `body` accessor, preventing entry updates.
A `declare` field plus constructor assignment now preserves the accessor; the
browser test changes modes and fallback/default view to cover this regression.
Test harness fixes also account for shadow-root `innerText` and use coherent
light/dark token sets for screenshots (not white text on a leftover light theme).

Final tarball SHA-256:
`62bca61065bea139adfc66335b06e9284605f7117f8ea956053a1f647674ec43`.
Later source or README changes require repacking.
Local packet evidence: `evidence/leg6-checks.log`, `leg6-browser.log`,
`leg6-browser/` (fixture bundle, report and screenshots).

## Remaining scope / limits

This is **not** the real host transcript implementation running under integration
test: resolver/lifecycle/default-view behavior is a public-contract fake. No
isolated real-host, overlapping real host-dialog, Node-24, provider-backed or
engine-runtime acceptance. No installation, publishing, schedule execution,
production deployment or hosting-service restart.

C1's supported core is implemented; full TUI parity is not. Displayed custom
messages (C2–C4), session-row label disposition, and richer supplied workflow
`workflowGraph`/receipt lane/review/watchdog/runner facts still need implementation
or explicit inventory disposition. Structured child history, exact child controls,
supervisor replies, Prompt Audit/redo, detach/drain and other enumerated API
blockers are unchanged. Final fresh-context review has not started.
