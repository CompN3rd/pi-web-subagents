# Subagents parity — leg 3 validation

## Delivered slice

- **B4 / acceptance 4:** opt-in selected-run bounded output follow. Default 80,
  maximum 500 lines. One output request at a time, next scheduled 2 seconds after
  each read completes, with the existing 20-second request deadline. Roster
  observation remains separate; no fleet transcript or cost polling is added.
- Every read revalidates a unique top-level run in the fresh session-scoped
  snapshot. Nested nodes, duplicate roots and missing targets cannot be followed.
  Target/scope changes, hidden/closed panels, follow-off and lost authority abort
  observation and invalidate late replies, not execution. Showing the panel again
  does not implicitly re-enable follow.
- Output remains escaped bounded text. It has a successful-read timestamp,
  explicit following/cached state, manual read, Follow/Stop following and Jump to
  latest. Scroll-away preserves the native output scroll offset across reads and
  status refresh. Jump to latest resumes auto-scroll; scrolling to the end does
  too. No smooth scrolling/animation is introduced.
- Timeout, transport, malformed response and reported read errors stop follow
  without retry and retain the last good output with an error/staleness notice.
  Output reads use an independent cancellation/revision lane; an older explicit
  correlation-recovery read cannot overwrite a newer selected output read.
- **A11–A13:** the already-projected targeted workflow trace is readable: operation,
  key, phase, label, agent, state, duration, reuse and run reference; supplied
  failure kind, stop cause and reused-from facts also appear. References are
  display-only, and host operations are not treated as agents or child controls.
  Missing duration/reuse remains unknown, zero/false are preserved, and no full
  plan, checklist denominator or percentage is fabricated. Raw evidence stays
  available. Rendering is conditional on the response actually supplying trace.
- Shared localized labels, inventory dispositions and README capabilities updated.
  No RPC method, engine mapping, installed engine or host contract changed.

## Checks and actual results

Final checks under **Node 22.22.2** (package declares >=24):

- `npm run typecheck` — pass.
- `npm test` — **137/137 pass**, no skips. The added output controller cases cover
  bounded rate/identity, non-overlap, timeout, cancellation/late replies on all
  lifecycle boundaries, two distinct targets, older recovery reads, malformed and
  execution-error replies, lost/duplicate/stale roots, invalid line counts and
  absence of mutation/cost requests. Template checks cover trace facts/escaping.
- `npm run build` — pass, self-contained entries.
- `git diff --check` — pass.
- `PI_WEB_SMOKE_PLAYWRIGHT_ROOT=/data/projects/pi-web-code-review/node_modules/playwright npm run test:browser`
  — pass in **Chromium 156.0.8078.4** using the built adapter, fake public host and
  peer. No daemon or provider is contacted. New browser assertions exercise actual
  output scroll offset retention across status and output refresh, Jump to latest,
  renewed auto-scroll, exact selected ID/line parameters, hidden cancellation and
  no implicit resume, selection clear, readable trace references and escaped text.
  Reduced-motion emulation is enabled and output scroll behavior is `auto`.
  Existing keyboard/focus/reordering, duplicate/nested safety, 375px layout,
  RTL/theme, receipts, scope and teardown checks still pass, without page errors.
- Output/workflow screenshot visually inspected: readable bounded output and trace,
  hostile strings rendered as text, no control buttons on trace references.

Durable local browser artifacts (packet excluded from delivery commits):
`.pi-web/relays/subagents-parity/evidence/leg3-browser/` contains `result.json`,
`output-workflow.png` and desktop/mobile theme/forced-color screenshots. Unit and
browser command logs are adjacent. The suite's temporary final source directory
was `/tmp/pi-web-adapter-browser-YL46qt`.

## Limits / still open

This is **fixture acceptance, not live-host/provider-backed acceptance**. No
production installation, engine update, scheduled-job mutation, publication or
service restart occurred. Node-24 runtime validation and overlapping real host
permission/dialog testing were not performed. Reduced-motion evidence is Chromium
emulation, not a full assistive-technology audit.

The text read is a bounded replacement window, not retained full history or typed
child messages. Child exact inspect/control mappings and structured streaming
remain public-API dependencies. Full workflow/lane/preflight/acceptance information
is not inferred from a partial trace; independent parent tool payload presentation
remains part of the unfinished inline-card work. Schedules, launch UX, inline cards,
released-engine mapping evaluation, final inventory closure and the fresh-context
final review remain unfinished Relay work.
