# Relay leg 5 validation — exact released engine mapping

## Delivered

- Independently downloaded and SHA-512 checked exact npm engine **0.84.0** and
  **0.88.1** tarballs against registry distributions and the reviewed baseline.
- Inspected published bundle sections and documentation without executing or
  installing the engine. The RPC bridge section is byte-identical; snapshot
  changes are optional progress fields already handled by leg 1. Cost collection
  improves internally without changing the report DTO.
- Prepared adapter **0.88.1** / optional engine peer **0.88.1** with the repository
  mapping helpers. `package.json`, `package-lock.json` and `upstream-lock.json`
  agree; all non-root dependency resolutions are unchanged and the engine is
  absent from the npm lock and adapter tarball. Host remains **1.202611.1**.
- Added [the exact artifact audit](upstream-0.88.1.md), release-by-release
  dispositions, old-run recovery migration warning and RPC permission-hook
  limitation. Corrected inventory provenance and resolved the two custom-message
  constant values from released bytes. Inline renderer implementation is still
  pending; message names alone are not validated schemas.
- Clarified that a supplied fleet goal is supported, but the 0.88.1 RPC builder
  does not populate candidate goals. No new UI or control authority was added.

## Checks performed

On **Node 22.22.2** (below the declared Node ≥24 target):

- `npm run typecheck` — passed.
- `npm test` — **141/141 passed**, zero skips/cancellations.
- `npm run build` — passed.
- `npm run pack:release` — passed; generated
  `artifacts/compn3rd-pi-web-subagents-0.88.1.tgz`.
- `npm run verify:release -- --tarball artifacts/compn3rd-pi-web-subagents-0.88.1.tgz`
  — exact mapping, lock, registry pin, SHA-512 bytes and six-file adapter
  containment passed. No engine implementation bundled.
- Explicit comparison of pre/post mapping `package-lock.json` non-root records —
  identical; optional engine remains absent.
- `git diff --check` — passed.
- `PI_WEB_SMOKE_PLAYWRIGHT_ROOT=/data/projects/pi-web-code-review/node_modules/playwright npm run test:browser`
  — passed on Chromium **156.0.8078.4**, using the built adapter and fake public
  host/peer. Existing launch, schedules, follow/scroll, scope, receipt, graph,
  escaping, keyboard/focus, mobile, RTL/theme/reduced-motion and cleanup checks
  passed with no page errors. This is regression evidence, not a new renderer
  lifecycle test or a provider/engine integration test. Screenshots were retained;
  no new visual changes or manual visual-acceptance claim in this leg.

The packed candidate's SHA-256 is
`d5de42839dce1a4adf7d98fd19e59eeb330d3c5c73ef963e21268d0a67f3b7ad`.
Later source or README changes require repacking and verification again.

Local Relay evidence is retained under
`.pi-web/relays/subagents-parity/evidence/`: `leg5-checks.log`,
`leg5-browser.log`, `leg5-browser/`, and `leg5-upstream/` (both tarballs, registry
metadata, source-delimited bundle sections, exact diffs and section hashes).
The durable audit document records URLs, hashes, sizes and bundle locations so
verification does not rely on the temporary extraction directory.

## Limits

No Node-24, Windows, isolated real-host, overlapping real host-dialog, remote
machine, SDK override removal, or provider-backed engine acceptance was performed.
The engine was not executed. SHA-512 integrity is not independently verified
publisher identity or provenance. No installed package update, scheduled job,
production deployment, publication, tag push, or hosting-service restart occurred.

The Relay is not finished: inline tool/displayed-message cards, richer supplied
workflow details, session-row-label disposition, remaining acceptance/inventory
closure and independent final review remain. Exact mapping does not close public
API blockers or make existing runtime evidence current.
