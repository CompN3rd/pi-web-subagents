# Parity redesign — leg 1 validation

Date: 2026-11-14. This is adapter-local fixture evidence, **not live PI WEB or
provider-backed acceptance**, and not a claim of full upstream parity.

## Delivered slice

- **A5:** `AsyncNode` preserves optional progress text (160-character bound) and
  a nonnegative safe-integer report timestamp. Missing fields remain absent.
  Browser/server revalidation retains the projection; private task fields do not
  leak through it. Progress is escaped text, not HTML or a control identity.
- **A6–A7:** readable elapsed time, reported tool/duration, activity/update ages,
  activity state and tool/turn counts. Each age is relative to the upstream
  snapshot generation time, never `Date.now()` during rendering. There is no new
  timer or network request. Terminal/paused rows without an end time do not keep
  accumulating duration. Missing, future-relative or invalid timestamps are
  unknown; a supplied epoch-zero timestamp is not mistaken for absence.
- **A9:** unlinked fleet rows show input/output/cumulative spent/current context
  window/peak, goal and elapsed as of the successful observation. Missing window
  metrics are unknown. Text explicitly warns that fleet and tree can overlap;
  neither identities nor totals are merged. No utilization percentage is invented.
- **A13:** host monitors are explicitly not agents; existing provider, role,
  kind, state, verdict, reason, detail and reported staleness are readable without
  opening JSON. Private report paths/targets are still omitted.
- **C5:** accessible on-demand accounting table: parent, each reported child,
  child total and total; input/output/cache read/cache write/turns/USD cost.
  Preserve the calculation timestamp and unresolved count, plus an explicit
  warning that zero unresolved children is not completeness proof. USD formatting
  no longer rounds every cost to four fractional digits.
- Readable facts live in `src/browser/presentation.ts` for reuse. All labels use
  the existing host-localization registration; shared styles/theme ownership and
  native disclosures remain unchanged. Raw activity/monitor evidence is retained.
- README now correctly distinguishes available v5 parent-entry renderers
  (implementation still pending) from unavailable structured child transcript APIs.

## Executed checks

| Check | Result |
| --- | --- |
| `npm run typecheck` | Pass |
| `npm test` | 118/118 pass, no skips |
| `npm run build` | Pass; self-contained entries, public host tokens only |
| `git diff --check` | Pass |
| `npm run test:browser` with separate Playwright package | Pass, Chromium 156.0.8078.4 |

The browser run used
`PI_WEB_SMOKE_PLAYWRIGHT_ROOT=/data/projects/pi-web-code-review/node_modules/playwright`.
The browser package is not an adapter dependency. Browser requests were intercepted
locally; no live host was contacted. The fixture uses the built adapter and fake
public host/peer services.

Browser artifacts for this run: `/tmp/pi-web-adapter-browser-ytHjrA` (ephemeral).
A copy is saved with the locally excluded Relay packet under
`.pi-web/relays/subagents-parity/evidence/leg1-browser/`.

Additional assertions demonstrate readable progress/12s report age, tool/3s
elapsed and 2s activity age, monitor facts without JSON disclosure, unlinked fleet
metrics, accounting cache/turn columns, and exactly one explicit cost request
across a reconciliation interval. Existing checks also pass: keyboard selection,
focus/disclosure preservation on polling and reordering, scope resets, escaped
hostile strings, confirmations, unknown launch no-retry, hidden/unmount cleanup,
regional formatting/RTL/palette update, 375px containment and dark/light/forced
colors. Mobile screenshot inspected; the existing long-page organization is
still present and is **not** the planned master/detail redesign.

Unit/template checks cover absence, zero, invalid/fractional/unsafe timestamps,
160/161-character progress bounds, hostile strings, browser revalidation,
terminal timing, unknown values, per-child usage rows, missing identity,
sub-four-decimal cost and regional formatting. Template inspection is not DOM
execution; the browser run is listed separately.

## Remaining boundaries

The engine mapping remains **0.84.0**, adapter version **0.84.1**. Released 0.88.1
artifact evaluation/mapping has not been performed in this leg. New progress
fields are exercised via fixtures, not an installed engine. No engine was
installed, bundled, forked or patched. No production deployment, publication,
provider launch, schedule mutation or service restart occurred.

Master/detail organization, nested read-only selection, selected-output follow,
rich inline cards, typed workflow trace display, schedule record browsing and
focused launch UX remain open. Duplicate top-level IDs currently share the old
selection/control behavior; the existing browser fixture even asserts both
rows are selected. This does **not** meet the redesign's duplicate-ID control
criterion and remains required work, not an accepted safety exception.

No isolated real-host acceptance, host-dialog overlap test or new reduced-motion
test was performed. No final Relay review has occurred. The inventory remains
the authority for unresolved public API dependencies and overall parity gaps.
