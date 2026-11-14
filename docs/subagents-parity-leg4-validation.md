# Subagents parity — leg 4 validation

## Delivered slice

C6 (available-API launch UX) and C8 (supported-data schedules):

- **New run** opens a focused inline form with keyboard focus on its heading; Close
  returns focus to the trigger. It is not a modal or a host-dialog replacement.
- Agent mode has task, while script/workflow have JSON-object arguments. Changing
  mode clears its source/task/arguments instead of repurposing a previous draft.
  Context, label and optional model remain. Blank model sends no override.
  Payloads pass the existing RPC validator *before* showing confirmation.
- Launch confirmation includes readable mode/source/context/model/task alongside
  the exact request. Execution remains the existing explicit confirmed async RPC;
  unknown outcomes are never automatically retried. Catalog/config limitations
  remain explicit, with free text rather than invented options.
- Schedule selection comes from an explicit list, by unique protocol-valid exact
  ID. Duplicate/invalid IDs remain display-only. Reads and mutations revalidate
  selection; disappearance/ambiguity clears selection and pending confirmation.
- Readable record flags, timestamps, policies and run references; exact-schedule
  history with state/times/reason/error. Run references do not become controls.
  Missing values remain unknown; schedule expression/next-run time are not supplied
  by the current public projection. Original text/raw evidence remain available.
- All seven existing actions are exposed. List/show/history are on-demand reads;
  pause/resume/run/delete require explicit confirmation. No schedule create/update
  or Pi Web Automations integration was added.
- The explicit list is cached independently from the latest action response, with
  separate timestamps and exact action/target provenance. Show/history/mutations
  cannot replace the list or supply implicit new targets. New text-only lists
  withdraw the previous structured selection; failed reads retain labelled cache.
  Exact scope changes clear all these caches and form state.
- Schedule facts wrap at narrow widths. Confirmation now pairs its native Canvas
  fallback with CanvasText, fixing an observed low-contrast inherited foreground
  when host theme tokens are absent. Existing host token overrides remain intact.

## Checks

All final checks passed:

| Check | Result |
| --- | --- |
| `npm run typecheck` | Pass |
| `npm test` | **141/141**, no skips |
| `npm run build` | Pass |
| `git diff --check` | Pass |
| Isolated built-adapter browser fixture | Pass, Chromium **156.0.8078.4** |

Command:

```sh
PI_WEB_SMOKE_PLAYWRIGHT_ROOT=/data/projects/pi-web-code-review/node_modules/playwright npm run test:browser
```

New unit assertions cover mode-only payloads, absent/explicit model, invalid
argument shapes and modes, unique/invalid/duplicate schedule IDs, escaped facts,
exact history filtering, preserved list provenance across reads/mutations, failed
read retention, text-only list withdrawal and exact-scope cache clearing.

New browser assertions cover keyboard form opening/focus/closing, mode changes,
invalid JSON-object rejection before confirmation, explicit/inherited model,
readable confirmation, all seven schedule actions, no mutation during review or
cancel, exact selected ID on confirmed changes, list preservation across detail
reads, escaped history and unrelated-row exclusion, ambiguity/removal revoking
confirmation, and selected schedule containment at **375px**. All previous
follow/scroll/duplicate-run/filters/scope/receipts/localization/RTL/theme/visibility/
reduced-motion/cleanup checks still pass.

Screenshots `launch-review.png`, `schedule-history.png` and
`schedule-history-mobile.png` were inspected. Browser artifacts and command logs
are retained locally under `.pi-web/relays/subagents-parity/evidence/leg4-browser/`
and adjacent `leg4-browser.log` / `leg4-tests.log` (not delivery files).

An intermediate typecheck caught a missing type import and optional input-params
narrowing; corrected before the successful checks. Screenshot inspection exposed
the confirmation fallback contrast issue; corrected and the full checks rerun.
No unresolved test failure.

## Validation boundaries / open work

This uses a real browser and built adapter with **fake public host/peer**. No real
schedule, agent run or provider was launched or mutated. No installation, publishing,
engine upgrade or hosting-service restart occurred. The container is Node **22.22.2**;
the package declares >=24, so no Node-24 runtime acceptance is claimed. Live-host
acceptance and overlapping real host-dialog behavior remain untested.

Required inline cards, session-label evaluation, released 0.88.1 artifact mapping,
remaining inventory dispositions and fresh-context final review remain open. This
slice is not full upstream feature parity, and does not close API-blocked catalog,
configuration, child inspection, supervisor reply or workflow-control gaps.
