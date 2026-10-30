# @compn3rd/pi-web-subagents

Browser-native controls for a **separately installed** `pi-subagents` extension in
`@jmfederico/pi-web`. This package does not register another subagent tool, copy
the execution engine, or replace Pi Web's tracked subsessions.

## Release status

**0.84.0 is an unpublished compatibility candidate**, maintained in the standalone
[CompN3rd/pi-web-subagents repository](https://github.com/CompN3rd/pi-web-subagents).
This update maps the adapter to separately installed `pi-subagents@0.84.0`;
preparation does not publish or install either package. Matching release tags automatically start GitHub Actions verification and npm
staging; npm trust/environment setup and maintainer 2FA approval are still required.
Upstream proposals remain opt-in; live repository settings are not attested here. The execution engine is not bundled, forked, or patched.

New in 0.84.0:

- Event-driven status refresh for engines advertising `subagent:jobs-changed`,
  with bounded 5-second reconciliation and polling fallback for older engines.
- Event-based server cache invalidation, including changes during status reads.
- Reported workflow child thinking levels alongside models.
- Exact engine pin/integrity advanced to 0.84.0, which includes upstream's
  workflow sandbox security fix. Updating this adapter alone does not fix an
  older installed engine. The engine requires Pi 1.2.0 or newer.

See [the release audit](https://github.com/CompN3rd/pi-web-subagents/blob/main/docs/upstream-0.84.0.md) for all nine intervening releases,
features already supported, engine-owned fixes and remaining RPC limitations.

Earlier adapter-only changes in 0.79.2:

- Navigation icon and ordering alongside Automations, with host-managed pinning.
- Connected async run cards using reported nesting, with textual state, native
  disclosures, responsive layout and keyboard/focus preservation.
- One **Agents & runs** overview; unlinked fleet activity is collapsed under
  **Further reported agents**, without inferring relationships or double-counting.
- Contextual **Details & controls** appears only for a selected current run;
  run changes reset message drafts and show only that run's loaded transcript.
- Safe disclosure resets for ambiguous duplicate-ID presentations.

See [CHANGELOG.md](https://github.com/CompN3rd/pi-web-subagents/blob/main/CHANGELOG.md) in the source repository for release notes and
validation limits.

Adapter-only fix in 0.79.1: activation and request IDs now fall back to secure
`crypto.getRandomValues` UUIDs where non-secure HTTP origins lack
`crypto.randomUUID`. This fixes the missing **Open Subagents** action in an
isolated browser reproduction; it does not confirm any particular live URL.
The separate engine mapping remains 0.79.0.

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
| Activity refresh and receipts | Bounded event-driven observation with 5s reconciliation; older engines poll at 2s active/10s idle; up to 20 in-memory receipts (not persistent) |
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

### Navigation and pinning

Subagents uses Pi Web's `workspacePanels` contribution, the same supported
navigation surface as Automations, not a separate global header button. Its
parent-and-children icon identifies the panel; its sort order is 26, immediately
after Automations' 25 when both are available and no other tabs sort between them.
The local panel ID remains `subagents`; **Open Subagents** uses the host's
runtime-qualified ID, including on remote machines.

To make it easy to reach:

1. Select the intended machine, project and workspace. Workspace panels are not
   available without a selected workspace.
2. Open the host's navigation, find **Subagents** among the available tabs, and
   use its **Pin** control to include it in the navigation row. An existing
   explicit pin list can omit a newly installed panel.
3. Select **Subagents**, or run **Open Subagents** from the action palette.
   Select a ready, non-archived parent conversation in that same workspace to
   use session-backed controls; the exact paired server entry must be active.

Pin preferences and responsive layout belong to the host. This plugin cannot
force a permanently visible top-row button, override unpinning, guarantee
adjacency at every screen size, or add an independent global top-bar surface:
browser API v4 has no public contribution or pinning API for that. It does not
modify host DOM, private routes, or stored navigation preferences.

If Subagents is absent from available navigation destinations entirely, check
**Settings → Pi Web plugins** on the selected machine for enablement, activation
or paired-version/restart status, and check browser errors and built assets
before treating it as a pinning issue. Browser-source changes require rebuilding
and reloading; package installation/update can also require the safe target-daemon
restart described above. Unit tests and the browser fixture do not certify live
host navigation, pin persistence, or responsive placement; those require separate
isolated real-host acceptance. No live browser preferences were inspected here.

### Runtime discovery is a separate fix

The browser/server adapter cannot select the SDK used by the already-installed
execution engine. Upstream **0.79.1 released the embedded-host SDK discovery fix**
(PR #2947); it is included in this candidate's 0.84.0 engine target.
This standalone repository contains no engine patch. Keep any existing override
until the installed engine is upgraded and real foreground/detached lifecycles
pass without it; a package mapping is not runtime validation.

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
# Use the validated filename printed by pack:release:
npm run verify:release -- --tarball artifacts/compn3rd-pi-web-subagents-0.84.0.tgz
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

The opt-in `test/smoke/pi-web-adapter-browser.mjs` harness derives from the
reviewed nested source. Build this adapter, set `PI_WEB_SMOKE_PLAYWRIGHT_ROOT` to a separately installed Playwright package
and optionally `PI_WEB_SMOKE_BROWSER_EXECUTABLE`, then run `npm run test:browser`.
It writes artifacts to a new temporary directory and opens a fresh headless
browser profile on a non-secure HTTP fixture origin. All requests are intercepted
and fulfilled locally or aborted; no live host is contacted. It checks activation
and real controller UUIDs without native `randomUUID`, mounting, escaped output,
stop confirmation/focus and correlated receipt, scope reset, mobile geometry and
unmount cleanup. Its host/peer is fake, **not a PI Web daemon**. The fixture
TypeScript is transpiled by esbuild, not part of the production/typecheck inputs.
Playwright is not installed or downloaded by CI or packaged with the adapter.

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

## GitHub Actions releases

Like the sibling code-review plugin, releases are **tag-triggered npm staging**.
There is no local `npm publish` step and no `ADAPTER_PUBLISH_ENABLED` variable gate.
Pushing a stable `v<package-version>` tag automatically starts **Stage npm release**
in `.github/workflows/adapter-release.yml`. Ordinary main pushes run CI, not staging.

The workflow requires the tag's commit to belong to main history and the package,
npm lock and engine mapping to agree. It runs Windows/Linux CI, builds and packs,
verifies the upstream integrity and exact tarball contents, then passes that
artifact by ID and SHA-256 to a separate OIDC-only staging job. The staging job
does not check out source, install project dependencies or run package scripts.
It requires npm >=11.15.0 and uses `npm stage publish`, not direct publication.

**Successful Actions means staged, not public.** Review and approve the stage
on npmjs.com with maintainer 2FA. Manual workflow dispatch is only a retry path
and must target a matching release tag, not main. Check pending stages and the
public package before retrying an uncertain result.

One-time owner setup and the exact release procedure are in
[docs/releasing.md](https://github.com/CompN3rd/pi-web-subagents/blob/main/docs/releasing.md).
The npm trust identity is `CompN3rd/pi-web-subagents`, workflow
`adapter-release.yml`, environment `npm`, with **stage-only** permission.
Configure GitHub's `npm` environment for `v*` tags; do not retain the old
main-only `adapter-release` environment binding. These repository changes do
not configure GitHub/npm settings or prove that trust is active.

Upstream proposal automation is independent and still requires
`ADAPTER_UPSTREAM_PROPOSALS_ENABLED=true`. Never auto-merge those proposals.
Release acceptance still includes packed adapter/engine real-host lifecycles
and disposition of upstream regressions; staging does not establish those gates.

Keep `PI_SUBAGENTS_PI_CODING_AGENT_PACKAGE_ROOT` until the **installed upstream
engine** includes the discovery fix and real lifecycles pass without the override.
No live installation, credentials, GitHub/npm controls or daemon restarts are
changed by preparing the workflow.

## License

MIT. This adapter interoperates with the separately distributed MIT-licensed
`pi-subagents` project by Nico Bailon. See `LICENSE`; bundled dependencies retain
their license notices in the generated assets.

## Community discovery

This package declares `piWeb.plugins` and the `pi-web.dev-plugin`, `pi-package`,
and `pi-web-plugin` npm keywords required by the
[PI WEB community directory](https://pi-web.dev/community-plugins). No separate
registration or submission is needed. Discovery requires publishing a new public
npm version containing this metadata; npm search indexing may take time. Source
changes alone do not update the directory. The compatibility and installation
requirements above still apply.
