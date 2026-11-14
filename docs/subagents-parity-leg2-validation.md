# Relay leg 2: fleet workspace and safe occurrence selection

## Delivered

- **A2/B1:** side-by-side reported roster and selected inspector; at <=760px,
  single-column drill-in with an accessible Back button and heading focus.
- **A2/A10:** text plus All / Active / Attention / Other-recent filters apply to
  the bounded async snapshot only. Counts are matching nodes, not fleet size or
  engine history. Matching descendants keep their ancestors; native disclosures
  remain user-owned. Filtered rows stay mounted but hidden so native state survives.
- **A11/B2/B5:** every nested occurrence is selectable for read-only snapshot
  details. The inspector presents state, identity, agent/model/thinking and the
  leg-1 fact templates, plus a bounded evidence disclosure. No inferred child
  index, childId, transcript or control binding.
- **B6/criterion 3:** presentation keys and RPC targets are separate. Only a
  unique top-level occurrence in a fresh snapshot enables whole-run operations.
  Duplicate IDs have distinct read-only selection, never a shared control target.
  Confirmation revalidates the current selection/target; controller admission
  independently rejects targeted reads and controls for duplicated root IDs.
  A root becoming ambiguous while confirmation is open revokes selection and the
  confirmation. “Stop entire run” now states the actual action scope.
- Unique keys remain stable across source reordering. Ambiguous duplicate keys
  deliberately reset when group contents/order change. Removal clears selection
  instead of silently resurrecting it later. Scope changes reset filters/drafts.

Attention filtering uses reported failed/rejected/partial/paused/stopped states,
reported attention/waiting activity, and stale host-monitor flags. It is not a
supervisor inbox, exact pending-question count, inferred timeout, or process-exit
proof. Other/recent means the non-active subset of the reported window, not an
additional history query. Unlinked fleet rows remain separate and unfiltered.

## Validation

- `npm run typecheck`: passed.
- `npm test`: **121/121 passed**, no skips. New tests cover occurrence identity,
  nested read-only rendering, filter ancestry and all five duplicated-ID targeted
  operation paths (status/stop/interrupt/resume/steer), with zero transport calls.
- `npm run build`: passed; self-contained adapter outputs generated locally.
- `git diff --check`: passed.
- `PI_WEB_SMOKE_PLAYWRIGHT_ROOT=/data/projects/pi-web-code-review/node_modules/playwright npm run test:browser`:
  passed in isolated Chromium **156.0.8078.4**. Browser evidence includes nested
  and duplicate read-only inspectors, duplicate transition during confirmation,
  zero mutation from selection/filtering, filter/disclosure preservation,
  keyboard navigation, focus on disappearance/reorder, mobile drill-in/Back,
  375px containment, themes/forced colors, RTL/localization/draft retention,
  existing receipt/scope/visibility/unmount behavior, and no page errors.
- Initial tests exposed obsolete root-only/duplicate-selection expectations and
  browser selectors targeting the now-hidden mobile roster. Those assertions
  were replaced with the intended read-only/drill-in behavior; final checks pass.

These are built-adapter/fake-public-peer browser fixtures, **not a live host or
provider-backed acceptance run**. Host modal overlap and reduced-motion emulation
have not been exercised. Commands ran under this container's Node 22.22.2; the
package declares Node >=24, so this is not Node-24 runtime acceptance evidence.
No production installation, engine upgrade, provider execution, scheduled-job
mutation, publication or service restart occurred.

## Still outside this slice

Selected-output follow/scroll lifecycle, readable workflow trace, selectable
schedule history, focused mode-specific launch, required inline renderers,
session-row-label evaluation, and exact released 0.88.1 artifact/mapping work
remain open. Full parity still requires the explicit public-API dependencies in
the inventory. Final Relay review has not started.
