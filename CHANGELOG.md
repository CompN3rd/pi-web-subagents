# Changelog

## Unreleased — 0.88.1 candidate

- Redesign the panel as a reported-window fleet/inspector with safe unique-root
  controls, readable progress/timing/monitor facts, selected-only text follow,
  complete-column usage, selectable schedule history and focused launch review.
- Add bounded v5 `subagent` tool cards: tasks/results, progress/output/usage,
  preflight/trace, supplied workflow graph/child inventory/receipt lanes and host
  monitors, acceptance/review findings, watchdog evidence, and runner profiles
  explicitly labelled unmeasured. Historical IDs/paths never become controls.
  Session-row/global counters are not shipped without a suitable fleet data feed.
  Adapter-local implementation awaits fresh-context review; full API parity and
  live-host/Node-24 candidate acceptance are not claimed.

- Add public v5 display-only cards for all 14 released displayed custom-message
  types: grouped outcomes, supervisor decision/interview/progress/reminders,
  steering/control attention, workflow failures and watchdog evidence/actions.
  Historical state is not a live inbox or reply authority; hidden entries remain
  hidden. Bounded validated projections, escaped original text and generic host
  fallback have unit and isolated-browser evidence, not real-host acceptance.

- Prepare adapter/optional engine mapping 0.88.1 using verified exact released
  tarball bytes, without installing or bundling the engine. Host remains
  1.202611.1 (API v5). The bundled RPC bridge is unchanged from 0.84.0; additive
  progress fields are supported by the adapter-local parity redesign.
- Record all five intervening engine releases and public contract boundaries in
  `docs/upstream-0.88.1.md`, including old-run resume incompatibility and the
  absence of per-child model-facing permission hooks on RPC workflow launches.
  Mapping verification is not installed-engine or full-parity acceptance.

- Publish verified release artifacts directly to npm through GitHub Actions
  trusted publishing with provenance, rather than staging for npm 2FA approval.
  Preserve tag/main ancestry guards, Windows/Linux and browser checks, artifact
  identity/hash validation, and token-free publishing isolation.

## 0.84.1

- Target PI WEB 1.202611.1 with browser/server plugin API v5. Keep session RPC
  workspace-scoped and reject machine/project requests before connecting.
- Use host-managed shared controls, contributed stylesheets, palette and font
  properties. Follow live language, regional formatting, time and RTL preferences
  with English fallback; upstream data and protocol diagnostics remain verbatim.
- Keep visible panels observing after batched viewport transitions by using the
  latest IntersectionObserver entry. Preserve drafts and run selection during
  language/theme changes, and release host registrations on unmount.
- Update the audited public server API bundling boundary without admitting
  private host implementations or bundling the execution engine.
- Gate releases on the isolated Chromium interaction smoke alongside existing
  Windows/Linux checks. Keep the separately installed engine pinned to 0.84.0.

Validation on Node 24.20.0: typecheck, 114 tests, build, packed-release
containment/registry integrity verification, and three consecutive Chromium 156
fake-host smoke runs passed. This does not establish live daemon, federation,
provider-backed execution, or installed-engine SDK acceptance.
See [compatibility and verification limits](docs/compatibility-1.202611.1.md).
Publication does not install this plugin, upgrade the engine, or restart services.

## 0.84.0 — unpublished compatibility candidate

### Release automation

- Match the sibling code-review repository's tag-triggered npm staging flow:
  push `v<version>` to run Windows/Linux verification and stage the exact verified
  tarball using OIDC/provenance. Remove the `ADAPTER_PUBLISH_ENABLED` variable gate
  and automatic main-push publication. Manual dispatch is a tag-only retry path.
- Require stable matching package/mapping versions, the expected repository and
  main ancestry. Staging has no source checkout or project dependency install;
  recheck the artifact ID, SHA-256 and package identity before `npm stage publish`.
- Owner must configure stage-only npm trust for `adapter-release.yml` and the
  `npm` environment. Maintainer 2FA approval on npm still makes the version public;
  no live settings, tag pushes, staging or publication were performed here.

### Upstream compatibility

- Advance the separately installed engine target from 0.79.0 to 0.84.0, with
  verified npm integrity and matching optional peer/lock mappings. This includes
  upstream's workflow sandbox security fix **only when the engine is upgraded**.
- Add bounded, event-driven activity observation using advertised jobs-changed
  and async-started events. Fetch authoritative status after notifications;
  reconcile every 5 seconds, retaining polling for older engines.
- Invalidate status caches on activity changes, including changes during reads.
  Scope changes, hiding/unmounting and explicit reads cancel observation only.
- Display reported child thinking levels beside models; clarify administration
  fallback when upstream slash commands are disabled.
- Document all nine intervening releases and actual RPC limitations in
  `docs/upstream-0.84.0.md`. Correct discovery guidance: upstream 0.79.1 released
  the embedded-host SDK fix. Retain overrides until installed-engine acceptance.

Validation: typecheck, 112 tests (including release-tag/workflow guards), workflow
YAML parsing, build, packed-release containment/registry
integrity verification, and Chromium 156 fake-host browser smoke passed.
New event lifecycle/race coverage is in the unit fixtures; browser smoke remains
a fake-host regression check, not an engine lifecycle or live-event test.

Host target remains 1.202610.3; engine requires Pi 1.2.0 or newer. No engine code
is bundled. Local validation does not establish real-host lifecycle acceptance,
Linux CI, live installation or publication.

## 0.79.2 — prepared, not published

Adapter-only release. Exact engine mapping remains `pi-subagents@0.79.0`;
web host target remains `@jmfederico/pi-web@1.202610.3` (browser API 4/server API 3).
No engine, protocol, dependency or host-preference changes.

### Added and changed

- Static Subagents navigation icon and order 26, adjacent to Automations' order
  25 when host layout and other tabs permit. Pinning remains user/host managed.
- Dependency-free connected async run cards using only reported nesting, with
  native list/disclosure semantics, textual states and selected-root indication.
- Responsive graph styling, keyboard interaction, focus retention across polls
  and reordering, and scoped disclosure reset.
- Combined **Agents & runs** overview. Unlinked fleet activity is collapsed
  under **Further reported agents**; fleet-to-run links are never inferred.
- Contextual **Details & controls** replaces the permanent Run inspector. It
  appears only for a selected current root and includes its escaped label.
  Message drafts reset when switching targets; loaded output is target-specific.
- Conservative disclosure reset when duplicate-ID presentation groups change,
  without changing authoritative RPC target IDs.

### Validation and limits

Source validation before release preparation: typecheck, build, 103 tests and
Chromium fake-host browser smoke passed. Graph correctness/safety and UI received
independent review; a duplicate-disclosure finding was fixed and re-reviewed.
The later overview/control simplifications also passed source and browser tests.
Release packaging and exact registry-integrity verification are separate gates.

Browser tests use the built adapter with a fake public host/peer, not a live
PI WEB daemon. Live-host pinning, packed adapter/engine lifecycle acceptance and
Windows/Linux exact-release CI remain separate gates. An earlier intermittent
mobile disabled-control failure did not reproduce in subsequent runs; its cause
is unproven. Harness visibility synchronization and diagnostics were improved.

Fleet records do not supply reliable links to async runs; counts are independent
and may describe overlapping activity. Graph edges describe reported nesting,
not execution order. Duplicate root IDs retain upstream control ambiguity.
The upstream runtime-discovery workaround must not be removed on the basis of
this adapter update. No live installation, daemon restart, push or publication
is performed as part of release preparation.

## 0.79.1

- Support activation and request UUID generation on non-secure HTTP origins
  using secure `crypto.getRandomValues` when `crypto.randomUUID` is unavailable.
