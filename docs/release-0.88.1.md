# 0.88.1 release acceptance

## Scope and decision

Adapter `@compn3rd/pi-web-subagents@0.88.1` targets browser/server plugin API v5
and the separately installed, unmodified `pi-subagents@0.88.1` engine. The pinned
build host is PI WEB 1.202611.1; live acceptance used PI WEB **1.202611.2**,
Pi **1.5.2**, Windows **Node 24.20.0** and Chromium **156.0.8078.4**.

Independent investigation, implementation and fresh review were followed by
private alpha deployments and actual browser/provider-backed testing. The
maintainer explicitly accepted the native-engine inconsistency below as a
**documented upstream limitation, not an adapter release blocker**, and authorized
publication followed by replacement of the test machine's alpha with the exact
verified released package and a safe restart. No engine patch is included.

The original scoped implementation review is
[`subagents-parity-review-2.md`](subagents-parity-review-2.md). That historical
record's Node-22-only and missing-live-test statements describe its original
point in time; the subsequent evidence summarized here supersedes those gaps
for the tested scenarios. Neither record establishes full upstream feature parity.

## Known upstream limitation: original run after resume

Resume can return a **new run ID**. After that new run completes, stopping its
original paused run can produce all of the following on engine 0.88.1:

- accepted/stopping control receipt;
- exact-original-run executor output and historical notice reporting stopped;
- fresh global snapshots still reporting the original as paused;
- zero reported active children.

This was reproduced against the unmodified engine in two private adapter alpha
iterations. A separate positive-control test showed that a newly interrupted run
that had **not** been resumed could stop with both projections converging.
The limitation is therefore not a claim that every paused-run stop fails.

The installed engine's public source shows the stop/status split: native stop
can persist disk state, while global snapshots project tracked in-memory jobs.
The adapter must not parse English output, reinterpret a process exit, infer
child IDs, or treat an acceptance receipt or historical notice as authority to
rewrite that projection. It displays those sources separately, with timestamps
and provenance guidance. Do not repeatedly resume or stop merely to force the
original roster entry to change. Inspect the returned new ID and exact-root
output, while respecting the engine-reported roster's limits.

## Corrective changes validated

- USD display suppresses binary-addition noise with up to eight ordinary
  fractional places; scientific notation retains tiny nonzero amounts. Original
  accounting data is unchanged and incomplete-accounting caveats remain.
- Static scope/capability explanations are collapsible; freshness, errors,
  omissions and reported-window semantics stay visible. Actual 420px containment
  and keyboard disclosure retention were checked.
- Labels are requests, not guaranteed engine captions. No local caption override
  or guessed launch-to-root authority is introduced.
- Workflow-root guidance explicitly says that exact child transcript targets are
  unavailable. No invented child output buttons or implicit child controls.
- Lost-spawn correlation results are visibly rendered beneath the matching
  unknown receipt even without a selected root. The queried identity, successful
  read time and escaped bounded result are read-only evidence. The original
  transport outcome stays unknown; returned identities do not become controls.

## Validation performed

- Typecheck, **195 unit/release tests**, build, exact package containment and
  pinned registry integrity checks passed on Windows Node **24.20.0**.
- Expanded built-adapter Chromium regression passed without page exceptions.
  This suite uses a **fake public host/peer** and is distinct from live evidence.
- Real PI WEB and real provider-backed demo sessions exercised the exposed
  control families, cumulatively over private alpha.2 and corrective alpha.3:
  - configured-agent, inline-script and workflow-path launches;
  - argument validation, fresh/fork contexts, inherited/explicit model payloads,
    confirmation/cancellation and actual completion;
  - interrupt to paused, saved-contract resume to a separately reported completed
    run, all three steering modes with queued receipts and later completion,
    running stop to stopped, and rejected steering of stopped work without revival;
  - all seven schedule actions on only a dedicated disposable schedule: list,
    show, history, pause, resume, manual run and delete; its manual run completed
    and its definition was removed afterward;
  - refresh, state/query filters, ancestor retention, root/nested selection,
    read-only nested inspectors, keyboard/evidence disclosures, output bounds,
    follow on/off, scroll retention, Jump to latest, hidden/target/scope cleanup;
  - cached/on-demand usage, exact parent navigation, preserved draft/chip helpers
    with **no automatic send**, and host-modal coexistence with a pending adapter
    confirmation (the host cleanup dialog was closed without executing cleanup);
  - conditional lost-spawn recovery using harmless **distinct** no-child scripts:
    real requests reached the backend, then only their successful browser response
    was intentionally dropped. Unknown receipts did not cause retries. Exact
    correlation reads found the completed work; alpha.3 visibly rendered that
    evidence, including literal hostile text without HTML execution or new controls.

Alpha.3 modifies rendering/localization, not controller/server execution; its
new evidence and lifecycle guidance were specifically retested live after
independent review and Node-24 checks. This is not a claim that every scenario
was repeated on every alpha or every mode/context/provider combination tested.

At the final check, the test machine had zero reported active children, no
remaining demo schedules and no follow job. Exact-run reads confirmed stopped
originals and completed resumed runs despite the documented projection mismatch.
The test browser was closed. No browser page exceptions or JavaScript dialogs
occurred. Intentional lost responses, canceled observations, offline registered
remote-machine HTTP failures and a separate notifications fetch failure were
recorded rather than misrepresented as repaired adapter defects.

## Boundaries and deferred work

- Full feature parity remains API-dependent; see the
  [inventory](subagents-parity-inventory.md). No live supervisor inbox/direct
  reply authority, exact nested child controls or complete structured history.
- The live demo did not cover every duplicate/capability-revocation race,
  language/provider, browser, extension-specific dialog or long disconnect
  lifecycle. Deterministic races retain unit/fake-host evidence, not live claims.
- Accounting is a reported cached observation, not independent billing proof.
- Audit findings in the pinned **development host/optional SDK dependency tree**
  remain maintenance work. Build-input closure inspection found the affected
  `undici`, `minimatch`, `fast-uri` and coding-agent implementations absent from
  both shipped bundles. Production-only adapter audits were clean; this says
  nothing about vulnerabilities in separately installed host/engine packages.
- Integrity verification is not publisher identity. The tag release pipeline
  performs fresh Windows/Linux/browser checks, packs once and publishes that
  exact artifact with OIDC/provenance. Public version/integrity/provenance must
  then be checked before the released package replaces the private alpha.

Detailed machine/session-specific evidence and captures are retained locally
under the ignored `artifacts/aura-alpha-polish/` and `artifacts/aura-live-demo/`
directories, not published with the package. Release automation and post-publish
verification follow [`releasing.md`](releasing.md).
