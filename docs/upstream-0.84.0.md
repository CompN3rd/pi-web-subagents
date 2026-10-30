# Upstream audit: 0.79.0 → 0.84.0

Reviewed npm's nine stable releases above the previous engine pin and the published
0.84.0 changelog, RPC implementation and async status projection. The existing
proposal script verified baseline and candidate SHA-512 tarball bytes; it did not
install or execute the engine. Adapter and optional peer now target 0.84.0. The
host target remains 1.202610.3 (browser API 4/server API 3).

Sources:
- [Published package](https://www.npmjs.com/package/pi-subagents/v/0.84.0)
- [Upstream changelog](https://github.com/nicobailon/pi-subagents/blob/main/CHANGELOG.md)
- [Public extension API](https://github.com/nicobailon/pi-subagents/blob/main/docs/extension-api.md)
- [Workflow sandbox advisory](https://github.com/nicobailon/pi-subagents/security/advisories/GHSA-6v8j-6w28-2w8r)

The source review used the exact npm artifact, not an assumption that GitHub main
matches it. Engine code is neither bundled nor patched by this adapter.

## Release disposition

| Engine release | Relevant changes | Adapter disposition |
| --- | --- | --- |
| 0.79.1 | Embedded-host Pi SDK discovery; workflow child models; lazy supervisor/wait tools; retained child results | Update engine mapping, correct discovery guidance. Model projection was already supported; now also render reported thinking. No engine port. |
| 0.79.2 | Durable completion notices, steering recovery, workflow capacity reclamation, prompt isolation, compacted-session tool recovery | Engine-owned; existing RPC text/errors and receipts preserve the distinction between admission and completion. |
| 0.80.0 | Pi ≥1.2.0; per-child cwd/model in parallel args; slash commands may be disabled; elapsed widget time; Windows/provider fixes | Document minimum Pi version and slash-command fallback. Existing workflow args JSON already passes per-child model/cwd unchanged within bounds. TUI widget is not ported. |
| 0.81.0 | Faster Windows loading; structured-output recovery; tagged notices; provider retry diagnostics; mouse fleet controls | Engine-owned. Diagnostics belong to structured delegation events, not this RPC status contract; do not invent fields. Web panel already has native pointer/keyboard controls. |
| 0.82.0 | Automatic workflow recovery, recovered foreground runs, Rex placement, fleet task labels, stale-run reconciliation | Engine-owned recovery; no adapter auto-launch/resume. Existing targeted status and message-bearing resume remain available. Rex configuration/placement is not a new web launch control. RPC snapshot does not supply the TUI task label; do not infer it. |
| 0.82.1 | Corrupt status files no longer hide unrelated runs; smaller skills; script-loss guidance | Engine-owned. Existing escaped status/transcript text preserves diagnostics. |
| 0.83.0 | Jobs-changed/async-started events; transcript tool inputs; cache/lifecycle/Windows/placement fixes | Implement event-driven refresh and cache invalidation. Existing text transcript renders tool inputs without interpreting them. Other fixes remain engine-owned. |
| 0.83.1 | Exact control IDs; worktree-cleanup resume refusal; mission acceptance; session-ID capability ceilings; frontmatter fixes | Existing adapter requires exact IDs; upstream refusals remain authoritative. No automatic retry, no completion inferred from a receipt. Missions are not exposed by RPC manage. |
| 0.84.0 | Workflow sandbox security fix; finite retention; missing-provider diagnostics | Advance exact peer and integrity to fixed engine. Adapter-only installation cannot remediate the old engine. Retention and provider loading remain engine-owned. |

## Activity observation

The server listens only to the known, advertised `subagent:jobs-changed` and
`subagent:async-started` channels. Payloads are not forwarded. They invalidate a
cached status and wake finite, read-only `wait-for-change` requests. The browser
then explicitly fetches authoritative status; an event is not a result or proof
of completion. A change during a status request prevents that reply from
repopulating the cache. A change between a read and a wait is not lost.

Observation is bounded to 5 seconds (shortened after a slow handshake to stay
below the host's 10-second peer callback deadline), after which a status reconciliation occurs
even if no event arrived. Browser cycles have a 250ms delay to coalesce bursts.
Older peers without the jobs-changed advertisement keep 2s active/10s idle
polling. Transport failures re-negotiate with polling backoff. Manual refresh,
targeted transcript reads, hiding the panel and scope changes cancel observation;
they never stop admitted engine work. Observations share the existing exact
host-authority connections and request/session limits. Costs are not polled.

This is not transcript streaming, durable event replay, or persistent receipts.

## RPC boundaries verified against 0.84.0

The nine RPC methods and seven schedule management actions are unchanged.
`resume` still requires a non-empty message even though the model-facing tool
can resume workflows without one. Top-level `tasks`/`chain` are not enabled by
RPC's execution normalizer; use the existing built-in `parallel` workflow and
JSON args, or a script. `autoResume` is engine configuration, not a spawn field.
Agent editing, missions, placement administration, supervisor replies and
structured-delegation retry diagnostics are not added through private routes.

## Acceptance boundary

Local typechecking, unit/fixture tests, build and package verification are
separate from a real-host test. No production install, daemon restart, remote
machine test, provider-backed child lifecycle, or removal of the SDK override
is implied. Upgrade the separately installed engine in a safe maintenance window;
retain the override until real foreground/detached/stop acceptance passes without it.
