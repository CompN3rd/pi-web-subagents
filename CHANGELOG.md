# Changelog

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
