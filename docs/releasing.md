# Releasing through GitHub Actions

Package: `@compn3rd/pi-web-subagents` · repository: `CompN3rd/pi-web-subagents`.

## Tag → checks → direct npm publication

Push a matching stable `v<version>` tag; GitHub Actions automatically runs
**Publish npm release** (`adapter-release.yml`). There is no local publish
command, no main-push publication, and no `ADAPTER_PUBLISH_ENABLED` switch.
Manual dispatch is available only on a matching tag for controlled retries.

The workflow rejects branch dispatches, mismatched/prerelease tags, wrong
repository identities and commits outside `origin/main` history. Windows/Linux
CI and the isolated Chromium fake-host smoke run against the tagged SHA. A build
job packs once, verifies exact contents and the pinned engine's registry
integrity, and uploads the tarball. A separate publishing job downloads that
exact artifact by ID, rechecks its SHA-256 and package identity, and invokes
`npm publish` with OIDC/provenance and scripts disabled. It has no checkout,
project installation or package cache, and only `id-token: write` permission.
Actions are pinned to immutable commit SHAs.

The publishing job uses Node 24 and requires npm >=11.5.1 for trusted publishing.
It fails rather than falling back to token authentication. Do not add npm token
secrets, dummy auth tokens or setup-node `registry-url` token setup. Do not log
raw JWTs, environment dumps or npm debug/cache directories.

**A successful publish makes the package public immediately.** There is no npm
stage or separate maintainer approval step. GitHub environment reviewers, if
configured, approve the job before publication. Protect release-tag creation
accordingly; account 2FA can remain enabled with token publishing disallowed.

## Owner configuration

The maintainer enabled direct publishing on npm after approving 0.84.1, which
used the previous staged flow. The agent did not change npm or GitHub settings.
Verify the current configuration when troubleshooting:

1. Protect main and require the Windows/Linux Adapter CI checks, Chromium smoke,
   and review. Restrict release-tag creation/update/deletion to maintainers.
2. Configure GitHub environment **`npm`** to allow release **tags `v*`**, not only
   branches. Configure environment reviewers according to owner policy.
3. Configure npm trusted publishing for these exact, case-sensitive fields:

   | Field | Value |
   | --- | --- |
   | Provider | GitHub Actions |
   | Organization/user | `CompN3rd` |
   | Repository | `pi-web-subagents` |
   | Workflow filename | `adapter-release.yml` |
   | Environment | `npm` |
   | Allowed action | Direct publishing (`npm publish`) |

   Verify trust status/expiry rather than assuming a saved connection is active.
   Direct publishing does not require separate `npm dist-tag` privileges. Keep
   account 2FA enabled and prefer npm's disallow-token policy.
4. The old `ADAPTER_PUBLISH_ENABLED` variable is ignored and can be removed.
   `ADAPTER_UPSTREAM_PROPOSALS_ENABLED` remains an independent opt-in switch.

Reference: [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/).

## Normal release

1. Update versions using this repo's mapping tools, not plain `npm version`:
   `npm run release:version -- patch` for an adapter-only patch, or the reviewed
   upstream proposal workflow for an engine update. Review all three mapping
   files and update release notes.
2. Complete release acceptance, including real-host/engine checks that unit and
   fake-host tests cannot establish. Locally run typecheck, tests, build, pack
   and registry/containment verification as documented in README.
3. Commit and push the reviewed changes to main. Create and push the matching
   annotated tag for the new version. Tag the accepted main commit, not unrelated
   local changes. A main push alone does not publish a release. Never reuse
   `v0.84.1`, which is already published.
4. Watch **Publish npm release** in Actions and approve the GitHub environment if
   configured to require it. Review the verified `adapter-package` artifact.
5. Verify the exact public version, integrity and provenance against the artifact:

   ```sh
   npm view @compn3rd/pi-web-subagents@<version> version dist.integrity dist.attestations
   ```

   Only then create a public GitHub release from the corresponding changelog
   section. Installing the adapter in PI WEB remains a separate maintenance
   operation.

## Failures and retries

A timeout or failed job does not prove that npm accepted nothing. Inspect the
exact public version before rerunning. If it exists, compare its integrity and
provenance with the verified artifact; do not republish or overwrite it.

Manual dispatch must use the tag; branch dispatch intentionally fails validation.
Retrying uses the workflow at the tagged revision, not later fixes on main.
In particular, rerunning `v0.84.1` still uses the old staged workflow. Use a new
version/tag for changed release inputs, unless the owner explicitly approves
moving an unpublished tag. Do not move a published release tag.

Dry-runs and `npm whoami` do not test OIDC authorization. Check the trust identity,
environment, allowed direct-publish action and npm CLI version instead of adding
a token or weakening 2FA. Local checks cannot establish that the next direct
publish will be authorized; that requires a future unpublished release.
The workflow neither installs the adapter/engine nor restarts any daemon.
