# Subagents parity — independent final review, attempt 1

**Result: changes required.** One concrete in-scope blocker, R1 below.
Reviewed implementation: `c2b3e18ee3c43b0dd61b531de9466b29f3b0faa8`, cumulatively
from `954461199e225e2a5981e5700a5d612b0473acf6`. This fresh Relay context did not
implement any of legs 1–8 and made no implementation corrections during review.
Review budget used: **1 of 3 attempts**.

## R1 — Attention filter hides the released needs-attention activity

**Priority: P2.** `src/browser/graph.ts:25–30` defines the attention states but
omits `needs_attention`. `matchesRun` tests `node.activity.state` against this
set, so a running child explicitly marked by the engine as needing attention
fails the Attention filter. `branchMatches` then hides its running ancestor if
no other descendant matches. This defeats the approved attention-triage view
(A2/A7/A10; redesign sections 1 and 6), not an optional visual enhancement.

Released-source evidence (SHA-512-verified 0.88.1 artifact; identity recorded in
[`upstream-0.88.1.md`](upstream-0.88.1.md)):

- `src/shared/types.d.ts:294`: `ActivityState = "active_long_running" | "needs_attention"`.
- `bundle/chunk-4ZQBZDF3.js:1204–1218`, `activityFor`: projects
  `source.activityState` unchanged into `activity.state`.
- Same bundle, `projectStep` at 1238 onward: uses that activity on the public
  async snapshot child. This is an available released RPC value, not an API gap.

Reproduction, run from the checkout:

```sh
node --import tsx .pi-web/relays/subagents-parity/evidence/leg9/attention-repro.ts
```

Fixture: a running workflow containing a running step whose
`activity.state` is `needs_attention`. Actual results are `childMatches: false`
and `ancestorVisible: false`; both must be true. The saved assertion fails with
exit 1 on the reviewed implementation. Existing filter tests only assert a
failed execution state; the larger browser fixture's activity uses
`waiting-for-supervisor`, not this released enum.

Required resolution: the released attention value must match the Attention view
and retain its ancestry, with regression evidence. Ordinary
`active_long_running` activity alone must not be reclassified as attention.
No new control authority, pending-request count, or local liveness diagnosis is
needed. The correction and post-correction independent review remain outstanding.

## Whole-result review coverage and dispositions

- **Scope and release mapping:** inspected cumulative changes, charter/design,
  inventory A1–C10, README and exact-artifact audit. Adapter/optional peer is
  0.88.1; host remains pinned; no execution engine is bundled or patched.
  Registry integrity/containment verification was rerun successfully. Engine
  installation, publisher identity and runtime behavior are not inferred.
- **Panel facts, usage, workflows:** readable source-relative timings/progress,
  reported-window/omission labels, separate opaque fleet usage, complete
  on-demand cost columns and supplied trace/monitor views are present. R1 is
  the sole blocker found in this area; supplied facts are otherwise kept
  separate from unavailable task/child/usage identities.
- **Identity and controls:** inspected occurrence keys, unique-root admission,
  stale checks, confirmation revalidation and controller duplicate-ID guard.
  Nested and ambiguous rows are read-only; no child identity is guessed. Whole
  run stop/interrupt labels and unknown-outcome receipts remain distinct from
  terminal/process proof. Server authority enforcement is unchanged.
- **Selected output:** inspected one-at-a-time reads, 1–500 line validation,
  successful-read timestamp, epoch rejection of late results, 20-second deadline,
  follow cancellation on hide/disposal/target/scope/authority loss, explicit retry
  after failure, and separate recovery lane. Controller and browser regressions
  cover scroll-away/Jump behavior and no mutation on observation cancellation.
- **Launch/schedules:** focused mode fields, inherited model, JSON-object args,
  exact cached schedule ID selection, duplicate rejection and explicit mutation
  confirmations are present. No schedule creation/Automations integration or
  fabricated next-run time was added. All seven actions use existing RPC.
- **Inline cards:** checked public v5 registration/default fallback/lifecycle
  contract, separate bounded schemas, fixed tool name and all 14 displayed
  notice registrations; compared selected workflow/receipt/review/watchdog/runner
  fields with released declarations and producers. Lit text bindings, budgets
  and unknown-field non-traversal preserve safe fallback. Rendering has no
  transport/control/polling side effects. Historical request/control/outcome
  facts do not become current inbox state or browser control identity.
- **Usability:** reran built-browser fixtures for keyboard disclosures/focus,
  reorder retention, mobile drill-in, RTL/localization, themes, literal hostile
  strings, reduced motion, scroll behavior and cleanup. Simulated host-native
  modal overlap passes; this is not actual extension-dialog acceptance.
- **Accepted limitations:** structured child inspect/exact child targets,
  supervisor inbox/reply, Prompt Audit/redo, detach/drain, catalogs/config,
  persistent monitoring and hidden history remain API-dependent. Conditional
  session labels were correctly not shipped without a fleet source. Arbitrary
  payload/artifact/proof omissions are documented, not falsely implemented.
  These settled scope limitations are not new review blockers.

No other evidence-backed in-scope blocker was found. Subsequent review should
carry these dispositions forward and examine the concrete correction and changed
evidence, rather than restart an expanding audit.

## Independently rerun validation

- `npm run typecheck`: passed.
- `npm test`: **160/160 passed**, no skips. This does **not** cover R1.
- `npm run build`, `npm run pack:release`, `git diff --check`: passed.
- `npm run verify:release -- --tarball artifacts/compn3rd-pi-web-subagents-0.88.1.tgz`:
  passed exact mapping, registry SHA-512 bytes and packed containment.
- Packed SHA-256: `e2facbe21ec76ace62a562071a02b907e828f464e6c8f075ee003c1a24e99cbc`.
- `PI_WEB_SMOKE_PLAYWRIGHT_ROOT=/data/projects/pi-web-code-review/node_modules/playwright npm run test:browser`:
  passed in Chromium **156.0.8078.4**, no page errors. Built adapter with a
  **fake public-contract host**, not a live host/engine test.
- R1 standalone regression reproduction: **failed as expected**, exit 1.

Durable packet evidence: `evidence/leg9/{checks,release,browser,attention-repro}.log`,
`attention-repro.ts`, and `browser/` (browser result, screenshots, fixture bundle).

Checks ran on Node **22.22.2**, below declared ≥24. No Node-24 candidate acceptance,
real host renderer/extension-dialog acceptance, provider-backed execution,
production installation, publication, actual schedule mutation, or hosting-service
restart was performed. These remain explicitly reported validation limitations,
not claims derived from unit/fixture success.
