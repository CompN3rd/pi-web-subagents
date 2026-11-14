# Relay leg 8 — workflow cards and scoped finish evidence

## Implemented (A11–A13, C1, C4, C9)

The fixed-name public v5 `subagent` renderer now also selects and displays:

- **Workflow graph:** reported nesting, kind, label, state, agent, phase,
  acceptance, named output/item, current-node reference and explicit phase
  membership. Graph host monitors show provider/role/category/state/verdict,
  reason/detail and expected/observed/stale references, separately from agents.
- **Workflow child inventory:** source completeness flag, workflow state,
  parent-call/run/child references, names/models/thinking, states and supplied
  activity/counts/duration/tokens. Inventory completeness is not execution
  completeness. No joining to the panel roster or deriving control identities.
- **Receipt lanes:** historical workflow state/resolution, lane key/mode/source
  reference/claims/output paths, requested versus resolved context, continuation
  and latest run references, resumability/reason, partial terminal outcome and
  output reference. Receipt host monitors and child inventories remain separate
  reported sources, not merged by names. No path access or resume button.
- **Review:** direct result projection (or acceptance ledger review when absent),
  status, blocker/non-blocking findings, file, issue and rationale.
- **Child watchdog:** phase/reason, reported sequence/update epoch, timeout and
  warning severity/importance/category/summary/evidence/recommendation,
  addressed/stalemate/display-time flags. Addressed means a later child assistant
  turn followed the warning, **not verified resolution**. No new live hold,
  configuration or permission authority is inferred.
- **Runner / receipt external adapter:** type/provider, command/args,
  prompt delivery, adapter/mode, source command when reported, non-resumable
  reason and selected profile fields. Always labelled **adapter profile, not
  measured security**; wrapper behavior can differ and missing provenance stays
  unknown. No capability-derived browser controls or measured-safe badge.

Graph, inventory, receipt and runner sections use native keyboard disclosures;
review/watchdog attention remains readable without opening raw JSON. Repeated
input retains disclosures. Existing shared style/localization/theme lifecycle is
unchanged. This is presentation-only code; no RPC, controller, protocol, server,
control-target or mutation changes.

Files: `src/browser/transcript-schema.ts`, `transcript-workflow.ts`,
`transcript.ts`, `localization.ts`; fixtures/tests in `test/transcript*.ts` and
`test/smoke/pi-web-adapter-browser.mjs`.

## Exact released source evidence

Read declarations and executable producers/renderers from leg 5's SHA-512-verified
**0.88.1** artifact, not Unreleased main. See
[`upstream-0.88.1.md`](upstream-0.88.1.md) for durable artifact identities.

- `src/shared/types.d.ts`: `WorkflowGraphSnapshot/Node`, `HostStepNode`,
  `WorkflowChildSummary`, `WorkflowReceipt/Entry/LaneMetadata`, `ReviewProjection`,
  `AcceptanceReviewResult/Ledger`, `ChildWatchdogProgress/WarningSummary`,
  `SingleResult`, `Details`, `ExternalCliRunnerStatus/ReceiptMetadata`,
  `ExternalCliProfileSafety/SafetySource`, `ExternalJobRunnerStatus`.
- `bundle/chunk-5EMPFFO4.js`, `foregroundWorkflowChecklist` and
  `renderWorkflowChatProgress`: graph, preflight, results, review/watchdog,
  receipt-host-step and workflow-child inputs used by the released TUI.
- `bundle/chunk-PCZEQQAQ.js`, receipt builder around line 2576: keyed entries,
  lane/context/resumability, host steps and child summary. The UI reads only an
  incoming receipt, never a persisted receipt file.
- `bundle/chunk-4MVDMA5C.js`, `resolveExternalCliRunnerStatus` /
  `externalCliReceiptMetadata` around lines 193–269: exact profile declarations,
  `measured: false`, source-command absence on remote saved machines and receipt
  provenance. `buildReviewProjection` around line 2240 and watchdog addressed
  update around line 2205 establish review and warning meanings.
- `bundle/chunk-ZJ2BT5TI.js`, watchdog propagation around line 5664 and workflow
  launch details around line 15254: these are incoming tool details, not panel
  snapshot fields. Not every historical status response contains them.

Host contract: installed/pinned `@jmfederico/pi-web@1.202611.1` public v5 types
and full plugin reference, plus the local standalone transcript-renderer example.
No private host implementation is imported or changed.

## Bounds and explicit omitted-field dispositions

Existing text budget remains ≤16,384 characters per selected detail string and
≤131,072 combined. Arrays remain ≤32 (trace ≤64). Graphs add **64 total nodes**,
≤32 per sibling list and depth 0–4; phase/node references do not infer links.
Receipt dictionaries select ≤32 own enumerable entries into an array (not a
prototype-bearing keyed object). Cycles, oversized/malformed selected fields,
unknown enums and invalid measured-source claims decline the **entire card** to
the host's default view. No silent graph truncation or full-plan percentages.
The original text preview retains its visible 16,384-character cap.

| Input not richly interpreted | Disposition / reason |
| --- | --- |
| Arbitrary `workflow.value/args/emits`, outputs, structured outputs and external-job options | Deliberately not traversed: no bounded semantic presentation schema; complete original input stays in the host default view |
| Dynamic graph expansion expressions/source paths, flat indices and unrelated graph metadata | No re-evaluation, inferred DAG or control mapping; reported nodes/relationships and phase membership only |
| Artifact/session/transcript paths, completion child-output artifacts, acceptance recovery files and handoff manifests | No reads/downloads/scans; selected receipt output references are escaped text only, not authorization |
| Process-terminal proofs, capability/permission audit/configuration, hidden request/reply history | Not interpreted as fresh browser authority or safe-process guarantees; full source remains available; live inspection/reply capabilities remain API dependencies |
| More than supported bounds or future payload variants | Generic host view, not a misleading partial rich card |
| Receipt/graph/inventory/result references repeated across sources | Displayed in their own reported sections; not deduplicated, counted as unique work or joined to current panel targets |

This closes the remaining **bounded presentation** work, not every possible field
in upstream's extensible tool details and not full upstream feature parity.

## Session-row label investigation (A1)

Pinned `SessionLabelContext` is a detached row snapshot, including unselected and
archived sessions; `SessionLabelContribution.items/visible` are synchronous and
side-effect-free (`dist/plugin-api.d.ts` around lines 874–901). The public plugin
reference locates labels only in the session list, not the editor/global shell.
Published public session metadata could be a suitable durable source, but no
upstream fleet metadata publisher/schema or row-level observation feed was
established in the verified release. Its `pi-web-session-liveness` integration is
not such a browser fleet-data contract.

**Disposition: do not ship a row label in this redesign.** The design explicitly
made this conditional on lifecycle and authoritative source. Reusing only an
opened panel's cache would provide a browser-local stale hint, not a persistent
fleet summary; it is optional and not represented as closure. Opening connections
or polling every row, scraping transcript cards, scanning metadata files, or
inferring counts from session names would violate the data/scope boundaries.
Inline summaries are implemented. A persistent compact shell summary and reliable
cross-session fleet feed remain host/upstream dependencies. The public label
surface itself is **not** claimed unavailable.

## Validation

- `npm run typecheck`: passed.
- `npm test`: **160/160 passed**, no skips. Four new workflow tests cover graph
  depth/total-node/sibling/phase caps and cycles, receipt dictionary/prototype/getter
  cases, shared text budgets, invalid enums, legacy absence, zero/false values,
  review/watchdog/runner shapes and ignored opaque data. Existing rendering tests
  now assert graph/receipt/review/watchdog/profile provenance and inert paths.
- `npm run build`, `npm run pack:release`, exact engine registry SHA-512 and packed
  containment verification, `git diff --check`: passed (packet logs).
- Built-adapter Chromium **156.0.8078.4** fixture passes prior regressions plus
  graph/receipt/runner/inventory keyboard opening and repeat-render retention,
  review/watchdog facts, literal hostile values, narrow RTL/light/dark layout,
  zero inline RPC, cleanup and no page errors. Workflow light and dark/RTL
  screenshots were visually inspected.
- A simulated host-owned **native modal** is focusable/clickable while the
  adapter's pending confirmation remains intact; the host choice neither submits
  nor discards the mutation, and adapter Cancel restores initiator focus. This
  tests stacking/focus ownership, **not real extension-dialog integration**.

Browser command:

```sh
PI_WEB_SMOKE_PLAYWRIGHT_ROOT=/data/projects/pi-web-code-review/node_modules/playwright npm run test:browser
```

Packet evidence: `evidence/leg8-checks.log`, `leg8-browser.log`, `leg8-browser/`.
Node is **22.22.2**, whereas the package declares ≥24. No candidate Node-24 runtime
acceptance, live host renderer/provider/engine execution, real host-dialog overlap,
production installation, publication, scheduled job, or daemon restart occurred.
A real browser with a **fake public-contract host** is not a real host test.

## Approved-design acceptance matrix

This is the implementer's readiness assessment, **not the independent final review**.

| Criterion | Evidence / honest remaining boundary |
| --- | --- |
| 1. Active-child facts/progress/task attribution | Leg 1 projection/timing fixtures; legs 6/8 inline facts. Old fields optional; panel full attributable task remains inspect-API dependent |
| 2. Nested/mixed workflow, monitors, no guessed targets | Legs 2/3 and 8 graph/receipt/inventory fixtures; duplicate/nested rows remain read-only |
| 3. Selection/focus/disclosures/scroll | Leg 2 roster regression and legs 3/6–8 browser follow/disclosure cases; ambiguous identity resets rather than rebinds |
| 4. Bounded selected-only follow / cleanup | Leg 3 controller and browser fixtures, still passing; 80 default / 500 max; abort/reject obsolete results |
| 5. Parent tool/custom cards, fallback, no render mutations | Legs 6–8 unit and built-browser public-v5-contract fixture; actual pinned-host renderer implementation unperformed |
| 6. Supervisor/watchdog meaning and hidden entries | Legs 7/8 fixtures; no current inbox/count/reply API, hidden entry types not claimed |
| 7. Usage and count provenance | Leg 1 table/projection and leg 2 reported-window fixtures; lower-bound warnings, no fleet/tree merging |
| 8. Receipts, confirmation, scope, unknown outcomes | Existing full suite plus legs 2–4 browser regressions; no protocol/control changes in inline work; drain remains blocked |
| 9. Keyboard/focus/narrow/theme/escaping/localization/motion/dialog ownership | Browser fixtures across legs 2–8; simulated native host modal added in leg 8. Real host extension-dialog overlap unperformed |
| 10. Checks and honest runtime separation | 160 tests, typecheck/build/pack/integrity/browser pass; Node-24/live-host/provider acceptance explicitly unperformed |
| 11. Traceable inventory and no full-parity claim | Updated inventory A1–C10 and README; concrete upstream/host dependencies remain open |

Adapter-local implementation is ready for a fresh-context final review. Scope is
**public-API parity improvements, with enumerated full-parity blockers**. Engine
mapping is not an installed-engine upgrade; deployment remains unauthorized.
