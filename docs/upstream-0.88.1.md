# Released engine audit: 0.84.0 → 0.88.1

Reviewed **2026-11-14**, for the adapter-local parity redesign. The source mapping
now prepares adapter **0.88.1**, optional engine peer **0.88.1**, and unchanged
Pi Web **1.202611.1** (browser/server API v5). This is **not a published release,
installed-engine upgrade, runtime attestation, or completed parity claim**.

## Exact artifact verification

Downloaded the pinned baseline and exact candidate using this repository's
`fetchRegistryBytes`, `enumerateStableReleases`, and `verifyIntegrity` helpers.
Both SHA-512 checks passed against registry metadata; the baseline also matched
the previously reviewed lock. Selected the charter's exact 0.88.1, not a moving
`latest` tag or GitHub main. No package scripts or engine modules were executed.
The repository's `updateMapping`/`writeMapping` helpers updated all three mapping
files without installing the optional peer or changing dependency resolutions.

| Engine | npm tarball | Bytes | SHA-256 (additional local evidence) |
| --- | --- | ---: | --- |
| 0.84.0 | `https://registry.npmjs.org/pi-subagents/-/pi-subagents-0.84.0.tgz` | 2543903 | `f9c038aac95d860c7adb77f02919b5016f410f8670f41a8cb911b56598742a02` |
| 0.88.1 | `https://registry.npmjs.org/pi-subagents/-/pi-subagents-0.88.1.tgz` | 2627516 | `4478ef8087579c1bc2638bb1ad533038af31f0e243439dfdc21f9ae94bdba561` |

Candidate SHA-512 (also in `upstream-lock.json`):

```text
sha512-Yrt0kBT+ChgnmcVzBu2004lwuwmRTHdr1jGUdLd9X7+TAdpLaCILCRFHQhnM9u4fnyOPDLE8wASnedp0nuXc9g==
```

The registry's `gitHead` matches the peeled stable tag commit
`83cf25f86b6a70ab917a7e198d0153bc32309f29`. The published `CHANGELOG.md` has an
empty Unreleased section. Integrity and matching metadata **do not independently
verify publisher identity, npm signatures/provenance, or build reproducibility**.

The tarballs contain bundled JavaScript, not the source `.ts` implementations.
Review used their actual `bundle/*.js` sections delimited by esbuild's source
comments, plus published documentation. Source links below are reading aids,
not a substitution for artifact inspection. Files were extracted into isolated
temporary directories after rejecting links, special files and unsafe paths.

### Reproduction and audit anchors

After building/packing this checkout, `npm run verify:release -- --tarball
artifacts/compn3rd-pi-web-subagents-0.88.1.tgz` rechecks the exact mapping, registry
integrity and adapter containment. The engine remains outside the adapter tarball.

For static comparison, concatenate **all** sections for a source path in each
artifact (a path can appear more than once), ending each at the next source
comment. Do not import the bundles just to inspect them.

| Section | 0.84.0 location | 0.88.1 location | Finding |
| --- | --- | --- | --- |
| `src/extension/rpc.ts` | `chunk-235AWJUQ.js:7134` | `chunk-FLNDHNPE.js:7319` | Byte-identical section, SHA-256 `538010051d655677c9502646bfd31c7848a4ba0792799f1d84cad96459b2d3e5` |
| `src/runs/shared/async-status-projection.ts` | `chunk-L3WFKBEI.js:1161` | `chunk-4ZQBZDF3.js:1129` | Only optional progress text/time added in ordinary and materialized steps |
| `src/extension/public-execution.ts` | `chunk-DZDETGRJ.js:4823` | `chunk-PCZEQQAQ.js:4890` | Added `requireLauncher` shape refusal; no change to this adapter's accepted forms |
| `src/slash/subagent-cost.ts` | `chunk-235AWJUQ.js:3733,3985` | `chunk-FLNDHNPE.js:3906,4158` | Recognizes configured wait name and notified async runs; same report DTO |

## Release dispositions

| Release | Relevant released changes | Adapter disposition |
| --- | --- | --- |
| 0.85.0 | Session-switch ownership choice; stricter resume provenance; workflow child permission hooks; Node sandbox hardening; RPC-started runs included in costs; configurable wait-tool name | Keep exact session/scope and receipt semantics. Cost UI already accepts the unchanged report. Do not guess renamed tool identities. Engine upgrade is a separate maintenance operation with the migration warning below. No new browser launch or permission authority. |
| 0.86.0 | Expanded single-child task; external CLI safety explicitly unmeasured; structured output and tool-selection fixes | Snapshot still has no attributable task. Text safety diagnostics remain literal; richer safety metadata needs its own bounded renderer schema. Never show an inferred security guarantee. Engine fixes are not adapter implementation. |
| 0.87.0 | Workflow drain; exact provider model selection; multi-session shutdown isolation; wait ownership fixes | Blank model still inherits; explicit IDs stay exact. Drain is **not in RPC stop**, despite the model-facing tool feature. No engine lifecycle fix claimed from the adapter update. |
| 0.88.0 | Progress/age; bounded searchable catalog; supervisor-wait timeout accounting; truncated output fails; fork cleanup; bundled undici security fixes | Leg 1's optional progress projection covers the additive DTO fields. Catalog remains absent from RPC manage. Display upstream errors/state, not local inferred timeout or success. Dependency fixes require the separate engine upgrade. |
| 0.88.1 | Inspector yields to dialogs; MCP startup fixes; clean-exit reconciliation; rewritten workflow tasks honored; compaction wake fixes | Native host dialog ownership must be retained; engine-owned fixes need runtime acceptance. No change to adapter RPC methods or controls. |

Sources: the [stable changelog](https://github.com/nicobailon/pi-subagents/blob/83cf25f86b6a70ab917a7e198d0153bc32309f29/CHANGELOG.md),
[RPC bridge](https://github.com/nicobailon/pi-subagents/blob/83cf25f86b6a70ab917a7e198d0153bc32309f29/src/extension/rpc.ts),
and [extension API](https://github.com/nicobailon/pi-subagents/blob/83cf25f86b6a70ab917a7e198d0153bc32309f29/docs/extension-api.md).

### Upgrade cautions, not new adapter controls

- **Old-run resume:** 0.85 introduced recovery records outside run-writable folders.
  Upstream warns that runs started before that update cannot be resumed or
  auto-resumed. It suggests explicit workflow relaunch with `reuseFrom` or new
  single runs. The adapter does **not** retry, relaunch, or migrate them. Any new
  execution requires a separate deliberate operator action; missing evidence is
  not proof that no run exists.
- **Permission boundary:** upstream explicitly excludes RPC launches, schedule
  ticks, auto-resume and some other workflows from the model-facing nested
  `subagent_launch` permission hook. The browser's launch confirmation is intent
  confirmation, **not** equivalent per-child permission approval or a sandbox.
  Existing capability ceilings and engine validation still apply.
- **SDK/runtime:** published documentation still requires Pi ≥1.2.0. Keep existing
  runtime-discovery overrides until foreground/detached/stop lifecycles pass with
  the separately installed engine. Neither integrity verification nor a version
  bump proves those lifecycles.

## Public contract conclusions

The nine RPC methods and seven schedule actions are unchanged. Async-only spawn,
non-recovering steer, nonempty-message resume, exact ownership checks and
`state: "stopping"` admission semantics remain. Stop neither reads nor forwards
`drain`; a drain checkbox would be misleading. Top-level `tasks`/`chain` remain
outside RPC's normalization mode; script/named `parallel` workflow and args are
the existing alternatives.

Snapshot bounds remain 20 roots, 8 children, depth 3, 160-character strings and
32 KiB, with omission evidence. `progressText` / `progressUpdatedAt` are optional
step fields. No new task, child-control binding, source/context or identity-linked
usage fields were added. Fleet keys remain opaque and limited to 16 displayed
entries; the optional goal field exists but `buildFleetStatus` does not currently
populate candidate goals. Supporting a supplied goal is not proof of live task
availability.

The accounting implementation now discovers RPC-started runs through displayed
completion records and recognizes configured wait-tool names. This improves
coverage, not completeness proof; unresolved/missing artifact warnings stay.

For the still-pending inline cards, the exact artifact resolves supervisor
request type to `subagent_supervisor_request` (`chunk-CYKNHFXB.js:29`) and watchdog
warning type to `subagent_watchdog_warning` (`chunk-4MVDMA5C.js:2055`). The
`MESSAGE_VIEWS` and `ENTRY_VIEWS` tables are separate
(`chunk-FLNDHNPE.js:6995–7016`); hidden `appendEntry` history must not be exposed as
if it were a displayed custom message. Merely knowing these names is not payload
validation or an implemented renderer.

Full-parity API dependencies in the [inventory](subagents-parity-inventory.md)
remain open: structured child inspect/control bindings, supervisor inbox/replies,
Prompt Audit/redo, detach/drain, catalogs/config, and host persistent surfaces or
hidden history. The exact engine mapping does not close them.

## Validation boundary

See [leg 5 validation](subagents-parity-leg5-validation.md) for actual checks.
No installed engine change, upstream execution, provider-backed lifecycle,
production deployment, publication, schedule mutation, or hosting-daemon restart
was performed. Local checks used Node 22.22.2, below the declared Node ≥24 target;
they are not Node-24 runtime acceptance.
