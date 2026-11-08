# PI WEB 1.202611.1 compatibility

Adapter 0.84.1 targets the published `@jmfederico/pi-web@1.202611.1` package.
The reference review also used `/data/projects/pi-web` at `98316bd8`, its
changelog across recent releases, plugin implementation guide, public contracts,
and session-event capability implementation. The exact separately installed
engine remains `pi-subagents@0.84.0`; this is not an engine upgrade.

## Upgrade scope

- Browser and server entrypoints use API v5. The backend accepts only
  host-resolved workspace scopes; machine/project scopes fail without connecting
  to a session. Browser peer helpers retain the selected machine and workspace.
- The browser requires `pi-web/stylesheet-integration@1`. Each activation-local
  Lit component opts into host-owned shared buttons/selects and contributed
  stylesheets, with lifecycle-managed registration. Custom content uses inherited
  palette and font properties instead of a forced native light/dark scheme.
  Shared UI styling remains experimental in PI WEB.
- Labels and explanatory panel text register under
  `plugin:compn3rd.subagents:panel`. The host controls live language, direction,
  date/time and numeric formatting. Costs remain USD independently of regional
  preferences. English source messages are included; no translated language pack
  is bundled. Protocol tokens, upstream output, technical diagnostics, receipts,
  identifiers and staged agent instructions remain verbatim.
- Visibility processing uses the latest IntersectionObserver entry in a batch.
  An obsolete first entry could leave a visible panel paused after rapid
  scrolling/resizing. Hiding or closing a panel still stops observation only,
  never admitted engine work.
- The build allows the audited dependency-free module closure of the public
  server token API. Arbitrary host/private imports and engine bundling remain
  rejected. The resulting browser and server entries remain self-contained.

There are no private application routes, custom networking, core configuration
readers, storage migrations, or new session-control ownership. Navigation IDs,
full session identity, exact request correlation, uncertain mutation receipts,
and no automatic mutation retry are preserved. New host capabilities for
catalogs, session archival and transcript rendering do not require replacing this
RPC adapter.

## Installation and activation

This version no longer targets the old browser v4/server v3 entrypoints. Use
PI WEB 1.202611.1 on the gateway and target machine for the tested baseline.
Install the separately pinned engine as before. Existing SDK-discovery overrides
must not be removed solely because the adapter was updated; see the
[engine audit](upstream-0.84.0.md).

A server-backed plugin update needs a safe target session-daemon restart, then a
browser reload. Restarting interrupts hosted sessions and terminals. Package
publication does not install the plugin or restart services.

## Verification boundary

Local verification uses Node 24.20.0. Typecheck, unit/release tests, build,
package containment and registry integrity verification are separate checks.
The Chromium smoke mounts the built adapter with fake public host services and
RPC responses; it covers native interaction, scope changes, uncertainty,
visibility batching, mobile focus/containment, localization and palette changes,
and cleanup. CI runs it separately from the Windows/Linux unit and packaging
jobs, including before npm publication.

The fake stylesheet/localization services exercise the integration contract, not
the host's complete CSS or translation implementation. No live daemon,
federated-machine transport, provider-backed child execution, installed-engine
SDK discovery, Firefox/WebKit, or production deployment acceptance is implied.
No PI WEB changes or service restarts were needed to prepare this release.
