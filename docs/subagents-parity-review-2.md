# Subagents parity — independent final review, attempt 2

**Result: approved for the agreed adapter-local scope. No remaining concrete
in-scope blocker.** Reviewed implementation:
`a591775d094aaef6e4973844353958e8c1d90332`. Review budget used: **2 of 3 attempts**.
This fresh Relay leg did not implement the correction and made no implementation
changes during review.

## R1 disposition — closed

Inspected the entire correction relative to review attempt 1, including
`src/browser/graph.ts`, unit tests, browser fixtures and browser assertions.
The only production change adds the exact released `needs_attention` value to
the Attention set. `matchesRun` now includes that reported activity and
`branchMatches` retains its non-matching ancestors. Ordinary
`active_long_running` remains excluded unless another reported fact independently
qualifies. Query intersection is unchanged. No authority, identity, control, RPC,
observation or pending-request inference changed.

Independently reran the original failing reproduction from leg 9: both
`childMatches` and `ancestorVisible` are **true**, exit 0. Unit coverage also
asserts the non-attention parent, query intersection, and negative ordinary
long-running child/branch. The built-browser regression retains exactly one
matching running child and ancestor, excludes ordinary long-running activity,
and verifies filtering performs no mutation RPC. The root-scoped activity-details
locator correctly accommodates the additional child disclosure.

## Whole-result disposition

Carry forward the supported whole-result review and accepted limitations in
[`subagents-parity-review-1.md`](subagents-parity-review-1.md). Checked the
correction against the charter and redesign acceptance criteria; it closes that
review's sole blocker without changing scope or undermining those dispositions.
The broader browser regressions still pass. No further implementation correction
or review is required for this result. The Relay's adapter-local finish line is
met; **full upstream feature parity is not achieved**.

Structured child inspection/exact targets, live supervisor inbox/replies, Prompt
Audit/redo, detach/drain, catalog/config editing, persistent host monitoring and
hidden history remain API-dependent. Historical cards do not supply these APIs.
The inventory remains the row-by-row record of supported subsets and open gaps.

## Independently rerun evidence

- Original R1 reproduction: passed, exit 0.
- `npm run typecheck`: passed.
- `npm test`: **161/161 passed**, no skips.
- `npm run build`, `npm run pack:release`, `git diff --check`: passed.
- `npm run verify:release -- --tarball artifacts/compn3rd-pi-web-subagents-0.88.1.tgz`:
  passed exact mapping, registry SHA-512 bytes and packed containment. Integrity
  does not independently verify publisher identity/signatures/provenance.
- Packed SHA-256:
  `9d82a9d8bcadc5117cf5b71be08372ec7183c8a94773e36447bac15e1a10e3a4`.
  This is the reviewed implementation artifact, before review-only README edits.
- `PI_WEB_SMOKE_PLAYWRIGHT_ROOT=/data/projects/pi-web-code-review/node_modules/playwright npm run test:browser`:
  passed in Chromium **156.0.8078.4**, no page errors. This is a built-adapter,
  **fake public-contract host** fixture, not live host acceptance.

Durable packet evidence: `evidence/leg11/{checks,browser,release}.log` and
`evidence/leg11/browser/` (result, screenshots and fixture bundle).

Checks ran on Node **22.22.2**, below declared ≥24. Node-24 candidate acceptance,
actual host renderer/extension-dialog acceptance and provider-backed execution
remain unperformed, not inferred from these results. No deployment, publication,
engine installation, actual schedule mutation or hosting-service restart occurred.
Approval closes the agreed implementation/review gate, not these explicitly
reported runtime limitations or the full-parity API dependencies.
