# @compn3rd/pi-web-subagents

Browser-native controls for a **separately installed** `pi-subagents` extension in
`@jmfederico/pi-web`. This package does not register another subagent tool, copy
the execution engine, or replace Pi Web's tracked subsessions.

## Release status

**0.79.0 is an unpublished development candidate**, extracted into the standalone
[CompN3rd/pi-web-subagents repository](https://github.com/CompN3rd/pi-web-subagents).
Publishing and upstream proposals are **disabled by default**. The execution
engine is not bundled, forked, or patched by this package.

Earlier browser, SDK lifecycle and isolated real-host evidence belongs to the
reviewed nested adapter source in `pi-subagents` commit `468ddd3d` (imported here
as `6700d02`), with a separately patched engine. It is **not** evidence of a new
standalone real-host test or a clean registry installation. Broader acceptance,
upstream root-suite failures and publication setup remain explicit release gates.
Do not remove an existing runtime-discovery workaround based on this package's
version alone. No production installation or daemon restart is performed by the
build or tests.

## Compatibility target

| Component | Pinned target |
| --- | --- |
| Adapter | `@compn3rd/pi-web-subagents`; exact version in [`package.json`](package.json) |
| Execution engine (separate installation) | Exact `pi-subagents` version/integrity in [`upstream-lock.json`](upstream-lock.json) |
| Web host | `@jmfederico/pi-web@1.202610.3` |
| Host plugin APIs | Browser 4 / server 3 |
| Node | 24 or newer; development validation uses 24.20.0 |

`upstream-lock.json` records the exact upstream npm tarball and SHA-512 integrity.
It identifies release inputs, not a runtime attestation of the active daemon or
proof of publisher identity. A matching package version in a source checkout is
not proof that its APIs match the published host.

This is not a plugin for the Gang-of-Beads or agegr distributions of Pi Web.
Their APIs are different. Do not enable `PI_SUBAGENTS_COMPONENT_UI=1` to try to
make terminal widgets work here.

## Architecture and feature disposition

The browser workspace panel talks to this package's paired server entry. The
server uses Pi Web's public hosted-session event capability to call the existing
`subagents:rpc:v1` protocol. Project and workspace authority come from the host;
the selected conversation is identified by its exact session ID. The adapter
does not scan session directories, read private supervisor mailboxes, or call
private host routes.

The following table records the implemented surface and explicit gaps. Unit and
fixture coverage does not mean every operation has passed real-daemon acceptance;
see the validation boundaries below.

| Upstream surface | Web disposition |
| --- | --- |
| Fleet/live async status | Workspace panel; omissions and stale state must remain visible |
| Run output/transcripts | Explicit targeted status requests; text fallback |
| Single-agent/workflow launch | Existing async RPC; upstream admission and capability limits remain authoritative |
| Steer/interrupt/stop/resume | Explicit controls using authoritative run identities |
| Costs | On-demand report, including unresolved-child lower-bound warning |
| Existing schedules | RPC list/show/history/pause/resume/run/delete only |
| Supervisor questions/replies | Ordinary parent conversation/tool workflow; **no direct reply-card API** |
| Agent/model/config editing | Existing upstream commands/dialogs; not a new web configuration editor |
| Rich inline tool/message rendering | Not exposed by this host API; panel presentation instead |
| TUI widgets, overlays and keybindings | Not ported literally |
| Child-scoped controls | Display only; whole-run controls avoid ambiguous child identities |
| Streaming/watch and persistent receipts | Not implemented; visible polling and up to 20 in-memory receipts |
| Host background-run counter | No equivalent public reporting hook established |
| Pi Web tracked subsessions | Separate built-in system; not adopted as pi-subagents runs |

A supervisor helper can prepare an ordinary message for the parent agent to
inspect pending requests. Preparing a draft is **not sending it or answering a
child**. Review and send it yourself. The parent uses its existing
`subagent_supervisor` tool; the adapter must not invent request IDs or treat
steering as a supervisor reply. Before manually sending `/subagents`, remove all
composer chips: Pi Web treats chip-bearing messages as ordinary prompts, not
slash commands. The administration helper withdraws only this plugin's own
supervisor-help chip; it does not remove another plugin's content.

### Control receipts are not completion

- Steering may be **queued** or **delivered**; neither means the task finished.
- A successful stop receipt can mean **stopping**. Check later status for a
  terminal outcome.
- A transport timeout after dispatch means **outcome unknown**, not rejection.
  Do not automatically repeat a launch or other mutation.
- For a lost launch reply, upstream supports correlation with
  `rpc-spawn-<original-requestId>`. Missing or ambiguous evidence never proves
  that no child started.
- Fleet display keys and arbitrary tree-node IDs are not child control targets.
- Closing the panel, aborting a request, or disposing the plugin must not stop
  admitted agent work.

## Installation after acceptance

Install the upstream engine separately using Pi's package manager. The optional
peer declaration does not install or activate it for you. Build this adapter
before installing a local package: Pi Web does not compile plugin TypeScript.
There is deliberately no install or package lifecycle hook.

Once an accepted release exists, install its exact version through **Settings →
Pi packages** on the intended machine. Confirm **Settings → Pi Web plugins**
shows `compn3rd.subagents`. This package has a server entry, so activation requires
a safe restart of that machine's session daemon and a browser reload.

**A daemon restart interrupts sessions and terminals.** Arrange it outside the
session being used to install or test the package. Reloading the browser, the
web/API process, or Pi extensions is not equivalent to restarting the daemon.
Never restart the daemon hosting an active development session implicitly.

For isolated acceptance, use separate profile/config/data directories, daemon
socket or host/port, and web port. A child process inherits the live instance's
`PI_WEB_*` environment; do not start a second instance with those inherited
addresses or data directory.

### Runtime discovery is a separate fix

The browser/server adapter cannot select the SDK used by the already-installed
execution engine. The reviewed source change in the original `pi-subagents`
checkout adds host-entry-relative SDK discovery. It must be contributed and
released upstream, not carried as an adapter-bundled engine or fork. It needs its
own upstream release or deliberate installation and real lifecycle validation.
This standalone repository contains no engine patch.

The separately installed registry artifact `pi-subagents@0.79.0` reproduced the
detached-discovery failure in the isolated SDK-host fixture. The patched build
passed foreground completion, detached completion, and stop with observed runner
exits on the same Pi 1.2.0 SDK. A patched build whose manifest still says 0.79.0
is **not** that registry artifact.

Keep `PI_SUBAGENTS_PI_CODING_AGENT_PACKAGE_ROOT` in an existing startup script
until the actual installed engine has the fix and foreground/detached execution
has been proven without it. Other Pi Web profile, data, network and shell
variables are unrelated and must not be removed as part of this cleanup.

## Development

From this standalone repository root:

```sh
npm ci --ignore-scripts
npm run typecheck
npm test
npm run build
npm run pack:release
# Use the validated filename printed by pack:release (initially this path):
npm run verify:release -- --tarball artifacts/compn3rd-pi-web-subagents-0.79.0.tgz
```

The browser is bundled with its dependencies into `dist/browser/index.js`.
Only that directory is browser-public. `dist/server.js` bundles the host's small
public capability-token/parser module so a clean installation does not need to
resolve the host as a Node dependency. It does not bundle the host application
or upstream engine.

`npm run test:release` runs packaging fixtures. `npm run verify:release` checks
local pinned inputs and downloads upstream bytes to verify their integrity;
it does not execute or install those bytes. Neither substitutes for a packed
adapter test against the real host and engine.

## Validation boundaries

The opt-in `test/smoke/pi-web-adapter-browser.mjs` harness is copied from the
reviewed nested source; only standalone import paths changed. Build this adapter,
set `PI_WEB_SMOKE_PLAYWRIGHT_ROOT` to a separately installed Playwright package
and optionally `PI_WEB_SMOKE_BROWSER_EXECUTABLE`, then run `npm run test:browser`.
It writes artifacts to a new temporary directory and opens a fresh headless
browser profile on an ephemeral loopback fixture server. It checks mounting,
escaped output, stop confirmation/focus, scope reset, mobile geometry and unmount
cleanup. Its host/peer is fake, **not a PI Web daemon**. The fixture TypeScript is
transpiled by esbuild, not part of the production/typecheck inputs. Playwright is
not installed or downloaded by CI or packaged with the adapter.

The SDK/engine smoke `test/smoke/pi-web-host-sdk.mjs` remains in the original
`pi-subagents` repository; it is not copied here. Earlier evidence there used
Windows/Node 24.20.0, host SDK 1.2.0 and Edge 155. The earlier real-host validation
used local compiled adapter and patched engine paths, not a clean npm
installation. Its parent faux-provider queue exhausted; exact-session RPC and
two sequential child lifecycles were exercised, but a clean ordinary parent
response was not certified. That run reported its owned test hosts and children
exited and endpoints closed. No new standalone real-host result is claimed here.

Separate upstream context: the original `pi-subagents` root suites were **not
green** in the earlier Windows validation:
the cleaned run reported 9 unit and 9 integration failures, involving unresolved
timeouts/process settlement and temporary-path limits. The earlier focused runtime tests,
root typecheck, and nested adapter suite passed. A source-policy failure in the new
smoke harness was fixed, and the manifest guard passed separately. No baseline
comparison established that all remaining failures predated the original branch.

Linux CI, federation, long quiet-child wakes, active-child reconnect, and all
control combinations are not implied by these checks. Never replace a missing
gate with an optimistic success claim.

## Version mapping and upstream proposals

The first adapter version remains **0.79.0**. Thereafter adapter versions are
stable and independent of engine versions:

- Adapter-only hotfix: increment the adapter patch, keeping the exact engine pin.
  Run `npm run release:version -- patch`, review the three mapping files, then run
  all checks. Do not use plain `npm version` (it would leave the mapping stale).
- New stable upstream candidate: use its version if it is greater than the current
  adapter version; otherwise increment the adapter patch. For example, adapter
  `0.79.2` mapping engine `0.79.0` maps engine `0.79.1` as adapter `0.79.3`.
- `package.json` optional exact peer, `upstream-lock.json` (including SHA-512) and
  npm lock root must agree. `package-lock.json` dependency resolutions are kept
  unchanged; the engine remains absent. The tarball name is derived only from a
  validated manifest. No upstream package scripts are ever executed by tracking
  or verification. Prerelease/build-metadata mappings are not supported.

`npm run detect:upstream` is a bounded, read-only npm check listing all stable
versions above the reviewed engine baseline, even if `latest` rolls back.
`npm run propose:upstream` additionally selects the **highest non-deprecated
stable** version and verifies baseline and candidate tarball SHA-512 bytes.
Other candidates, deprecated releases and prerelease/build exclusions remain in
the JSON report; not every intermediate release gets its own PR. Both commands
fail on missing/changed baselines, malformed metadata, network or integrity
errors. Registry reads use HTTPS npm only, no redirects, a 30-second timeout and
32 MiB response limit each. Selection downloads at most two tarballs and never
extracts, installs or executes them. Integrity is not publisher identity or
independent provenance verification. Withdrawn releases between polls may be
missed; polling is stateless.

`npm run propose:upstream -- --apply` writes only the three mapping inputs and
`artifacts/upstream-proposal.json` after successful verification. The weekly/manual
`adapter-upstream.yml` workflow does this only on `main` when the owner sets
`ADAPTER_UPSTREAM_PROPOSALS_ENABLED=true`. It creates a deterministic
`automation/upstream-<engine-version>` branch, runs the same Windows/Linux CI on
its exact commit, then creates/reuses a PR with the candidate report and run link.
There is **no auto merge**. It never force pushes: an existing branch must have
exactly the proposed tree; human edits or a changed main tree stop the run for
owner reconciliation. Existing PRs (including closed/rejected ones) are retained,
not edited/reopened. New candidates can produce separate PRs; owners must close
obsolete ones. A failed validation can leave a branch/report but creates no PR.

**`GITHUB_TOKEN`-created PRs do not trigger normal PR CI.** The proposal workflow
explicitly calls the reusable Windows/Linux CI before PR creation, checking out
the candidate SHA. The linked parent workflow is validation evidence, not a claim
that ordinary PR checks ran or necessarily attach to the PR head. Configure
required PR checks deliberately; if they remain pending, dispatch Adapter CI on
the proposal branch (`gh workflow run adapter-ci.yml --ref <branch>`) and confirm
that the required checks attach to the exact head SHA, or use a reviewed human
commit to trigger normal PR CI. Never bypass branch protections to merge it.

## Publication gates and owner setup

Both automation switches are unset/false until deliberately enabled. An owner
must complete these steps after review and the first push; adding YAML alone
configures none of the GitHub/npm controls:

1. Configure `main` branch protection/rulesets, required Windows/Linux Adapter CI
   checks and independent review. Restrict workflow edits and do not auto merge
   upstream proposals. For proposals, allow Actions to create PRs and scoped
   `contents: write` / `pull-requests: write` workflow permissions, then set only
   `ADAPTER_UPSTREAM_PROPOSALS_ENABLED=true` and test a manual run.
2. Review each upstream source/API change and engine runtime fix. Require packed
   adapter real-host/engine acceptance, foreground/detached/stop validation,
   Windows/Linux CI and disposition of the separate upstream root regressions.
   Registry integrity and unit fixtures alone are not release acceptance.
3. Establish npm scope/package ownership and first-publication bootstrap through
   an owner-approved npm path. This package is not yet published and available
   npm publishing authentication has **not** been established. Trusted publisher
   configuration may require initial package creation; do not add a token fallback
   to this workflow or put tokens in source, artifacts, issues or chat.
4. Bind npm trusted publishing to GitHub owner `CompN3rd`, repository
   `pi-web-subagents`, workflow `adapter-release.yml`, and environment
   `adapter-release`. The pinned Node 24/npm toolchain supports OIDC. Configure
   that GitHub environment with required reviewers and only protected `main`.
5. Only after those gates, set `ADAPTER_PUBLISH_ENABLED=true` and manually run
   Adapter release on main. Future main pushes also trigger it. It independently
   waits for Windows/Linux checks, builds/packs once, verifies bytes/containment,
   requires environment approval, rechecks artifact hash and registry mapping,
   then publishes that same scoped tarball with provenance and scripts disabled.
   It has no credential fallback and never publishes `pi-subagents`. Already
   published npm versions cannot be overwritten: a push/manual run with an
   unchanged published version fails publication; do not approve such a run.

Keep `PI_SUBAGENTS_PI_CODING_AGENT_PACKAGE_ROOT` until the **installed upstream
engine** includes the discovery fix and real lifecycles pass without the override.
Adapter updates cannot satisfy that gate. No live configuration, installations,
GitHub controls, credentials or daemon restarts are changed by this repository's
local validation commands.

## License

MIT. This adapter interoperates with the separately distributed MIT-licensed
`pi-subagents` project by Nico Bailon. See `LICENSE`; bundled dependencies retain
their license notices in the generated assets.
