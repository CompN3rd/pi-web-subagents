# Subagents parity — leg 10 correction validation

## Review R1 correction

Added the exact released `needs_attention` activity value to the Attention filter
in `src/browser/graph.ts`. No control, schema, transport or polling behavior changed.
Running children carrying that value now match; `branchMatches` retains their
non-matching running ancestors. Ordinary `active_long_running` activity alone
still does not count as attention.

Regression coverage:

- `test/panel.test.ts`: direct child match, non-attention parent, retained ancestry,
  query intersection, and negative child/branch coverage for `active_long_running`.
  The new test failed before the source correction (exit 1) and passes afterward.
- `test/browser-fixtures.ts`: the running root uses released `active_long_running`;
  a running child uses released `needs_attention`.
- `test/smoke/pi-web-adapter-browser.mjs`: the built adapter's Attention view plus
  `needs_attention` query retains exactly one root and one child; querying ordinary
  long-running activity yields no Attention branch. Filtering performs no mutation
  RPC. Existing graph/disclosure/control regressions continue to pass.
- The independent review's saved standalone reproduction now reports both
  `childMatches: true` and `ancestorVisible: true` (exit 0).

The original review remains historical evidence in
[`subagents-parity-review-1.md`](subagents-parity-review-1.md). This correction is
not independent approval; fresh post-correction review is pending, with **1/3**
review attempts used. Prior whole-result dispositions and accepted API limitations
stand; this leg did not expand the audit or the approved scope.

## Checks

- `npm run typecheck`: passed.
- `npm test`: **161/161 passed**, no skips.
- `npm run build`, `npm run pack:release`, `git diff --check`: passed.
- `npm run verify:release -- --tarball artifacts/compn3rd-pi-web-subagents-0.88.1.tgz`:
  passed exact mapping, registry SHA-512 bytes and packed containment.
- Packed SHA-256: `9d82a9d8bcadc5117cf5b71be08372ec7183c8a94773e36447bac15e1a10e3a4`.
- `PI_WEB_SMOKE_PLAYWRIGHT_ROOT=/data/projects/pi-web-code-review/node_modules/playwright npm run test:browser`:
  passed in Chromium **156.0.8078.4**, no page errors. The first run exposed an
  ambiguous test locator because the new child activity added a second disclosure;
  scoping that click to the root article fixed the test. Two subsequent runs passed.

Packet evidence: `evidence/leg10/{red,checks,release,browser-initial,browser}.log`
and `evidence/leg10/browser/` (final browser result, screenshots and fixture bundle).

Runtime limits are unchanged: Node **22.22.2**, below declared ≥24; built adapter
with a **fake public-contract host**, not actual host renderer/extension-dialog
or provider-backed acceptance. No deployment, publishing, engine installation,
schedule mutation or hosting-service restart occurred. Full parity remains
API-dependent as recorded in the inventory; fixture success does not close those
gaps or establish live-runtime acceptance.
