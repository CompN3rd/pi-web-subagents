# @compn3rd/pi-web-subagents

Browser-native controls for a **separately installed** `pi-subagents` extension in
`@jmfederico/pi-web`. This package does not register another subagent tool, copy
the execution engine, or replace Pi Web's tracked subsessions.

## Release status

**0.79.0 is an unpublished development candidate.** The integrated browser/server
build, package tests, and real-browser fixture pass. The patched engine also passes
an isolated Pi 1.2.0 SDK lifecycle smoke. An isolated real PI Web instance has
exercised panel loading, exact-parent peer ping/status, child completion/transcript,
stop with observed exit, and reload of a completed run. Broader acceptance, the
unresolved root-suite failures, and publication setup remain explicit release gates.
Do not remove an existing runtime-discovery workaround based on this package's
version alone. No production installation or daemon restart is performed by the
build or tests.

## Compatibility target

| Component | Pinned target |
| --- | --- |
| Adapter | `@compn3rd/pi-web-subagents@0.79.0` |
| Execution engine (separate installation) | `pi-subagents@0.79.0` |
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
execution engine. An accompanying source change in this repository adds
host-entry-relative SDK discovery to upstream pi-subagents. That change needs
its own release or deliberate installation and real lifecycle validation.

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

From `packages/pi-web-subagents`:

```sh
npm ci --ignore-scripts
npm run typecheck
npm test
npm run build
mkdir -p artifacts
npm pack --ignore-scripts --pack-destination artifacts
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

The repository also contains two opt-in smoke harnesses outside the published
package. They write artifacts to new temporary directories; neither contacts the
existing PI Web instance.

- `test/smoke/pi-web-host-sdk.mjs`: set `PI_WEB_SMOKE_HOST_PACKAGE_ROOT` to an
  installed host package, build the root engine with `npm run build:pkg`, then run
  the script from the repository root. It creates a fresh SDK-host process and
  faux-provider sessions, tests foreground output, detached output/stop and
  observed exits, and validates actual native replies through the adapter
  projection. It is SDK-level, not web-daemon or browser validation. Failure-path
  cleanup is bounded by fixture waits but does not guarantee reaping every
  descendant after an arbitrary hang.
- `test/smoke/pi-web-adapter-browser.mjs`: build the nested adapter first; set
  `PI_WEB_SMOKE_PLAYWRIGHT_ROOT` to a separately installed Playwright package and,
  optionally, `PI_WEB_SMOKE_BROWSER_EXECUTABLE`. It opens a fresh headless browser
  profile on an ephemeral loopback fixture server. It checks the built bundle's
  mounting, escaped output, stop confirmation/focus, scope reset, mobile geometry,
  and unmount cleanup. Its host/peer is fake, not a PI Web daemon.

Current local evidence is Windows/Node 24.20.0, host SDK 1.2.0 and Edge 155.
The real-host validation used local compiled adapter and patched engine paths,
not a clean npm installation. Its parent faux-provider response queue exhausted;
exact-session RPC and the two sequential child lifecycles were still exercised,
but a clean ordinary parent response is not certified. All owned test hosts and
children exited and their endpoints were checked closed.

The root repository's full suites are **not green** in this Windows environment:
the cleaned run reported 9 unit and 9 integration failures, involving unresolved
timeouts/process settlement and temporary-path limits. The focused runtime tests,
root typecheck, and nested adapter suite pass. A source-policy failure in the new
smoke harness was fixed, and the manifest guard passed separately. No baseline
comparison establishes that all remaining failures predate this branch.

Linux CI, federation, long quiet-child wakes, active-child reconnect, and all
control combinations are not implied by these checks. Never replace a missing
gate with an optimistic success claim.

## Version tracking and publication

`npm run detect:upstream` is a bounded, read-only npm check. It enumerates stable
versions above the reviewed baseline, regardless of the `latest` dist-tag, and
reports excluded prereleases separately. Network/metadata failures are errors,
not a claim that no update exists. It is stateless: candidates repeat until a
reviewed baseline changes; publications withdrawn between polls may be missed.

**Automatic update PRs and automatic publication are not enabled.** The initial
release uses matching version `0.79.0`. Exact matching and adapter-only stable
fixes need an explicit policy because npm versions cannot be republished. No
independent version numbering or prerelease policy is silently selected here.

The separate manual `adapter-release.yml` workflow is disabled unless the owner
sets `ADAPTER_PUBLISH_ENABLED=true`. Before enabling it, establish:

1. An authorized GitHub repository and correct package repository metadata.
2. npm scope/package ownership and first-publication bootstrap arrangements.
3. npm trusted publishing bound to that repository, workflow and protected
   `adapter-release` environment.
4. Main-branch protections, required checks and environment reviewers.
5. Passing Windows/Linux CI, packed real-host acceptance, and independent review.

The workflow publishes only the verified scoped tarball built in the same run,
with provenance and lifecycle scripts disabled. It does not publish the root
upstream package. An environment name in YAML alone does not configure approval
protection. No npm credentials or live configuration belong in this repository.

## License

MIT. This adapter interoperates with the separately distributed MIT-licensed
`pi-subagents` project by Nico Bailon. See `LICENSE`; bundled dependencies retain
their license notices in the generated assets.
