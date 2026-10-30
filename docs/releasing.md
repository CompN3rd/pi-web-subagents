# Releasing through GitHub Actions

Package: `@compn3rd/pi-web-subagents` · repository: `CompN3rd/pi-web-subagents`.

## Tag → checks → npm stage → maintainer approval

This follows the sibling `pi-web-code-review` repository's staged-publishing
model. Push a matching stable `v<version>` tag; GitHub Actions automatically
runs **Stage npm release** (`adapter-release.yml`). There is no local publish
command, no main-push publication, and no `ADAPTER_PUBLISH_ENABLED` switch.
Manual dispatch remains available only on a matching tag for controlled retries.

The workflow rejects branch dispatches, mismatched/prerelease tags, wrong
repository identities and commits outside `origin/main` history. Windows/Linux
CI runs against the tagged SHA. A build job packs once, verifies exact contents
and the pinned engine's registry integrity, and uploads the tarball. A separate
job downloads that exact artifact by ID, rechecks its SHA-256 and package
identity, and invokes `npm stage publish` with OIDC/provenance and scripts disabled.
The staging job has no checkout, project installation or package cache, and only
`id-token: write` permission. Actions are pinned to the same SHAs as the sibling.

Node 24 in the staging job must supply npm >=11.15.0. The workflow fails rather
than silently falling back to direct publishing or token authentication. Do not
add npm token secrets, dummy auth tokens or setup-node `registry-url` token setup.
Do not log raw JWTs, environment dumps or npm debug/cache directories.

**Staged is not published.** An npm maintainer reviews and approves the staged
package with 2FA on npmjs.com. This workflow never automates that approval.

## One-time owner setup

These are instructions, not claims about live settings. No GitHub/npm settings
were changed while preparing this workflow.

1. Protect main and require the Windows/Linux Adapter CI checks and review.
   Restrict release-tag creation/update/deletion to release maintainers.
2. Create/configure GitHub environment **`npm`** and allow release **tags `v*`**,
   not only branches. Configure environment reviewers according to owner policy;
   an optional GitHub approval is separate from mandatory npm 2FA approval.
3. Configure npm trusted publishing for these exact, case-sensitive fields:

   | Field | Value |
   | --- | --- |
   | Provider | GitHub Actions |
   | Organization/user | `CompN3rd` |
   | Repository | `pi-web-subagents` |
   | Workflow filename | `adapter-release.yml` |
   | Environment | `npm` |
   | Allowed action | Stage only (`npm stage publish`) |

   Replace any old trust/environment binding to `adapter-release` restricted to
   main. Do not grant direct publication or dist-tag privileges as a workaround.
   Verify trust status/expiry on npm rather than assuming a saved connection is
   active. Keep account 2FA enabled and prefer npm's disallow-token policy.
4. The old `ADAPTER_PUBLISH_ENABLED` variable is ignored and can be removed.
   `ADAPTER_UPSTREAM_PROPOSALS_ENABLED` remains an independent opt-in switch.

References: [npm staged publishing](https://docs.npmjs.com/staged-publishing/)
and [trusted publishing](https://docs.npmjs.com/trusted-publishers/).

## Normal release

1. Update versions using this repo's mapping tools, not plain `npm version`:
   `npm run release:version -- patch` for an adapter-only patch, or the reviewed
   upstream proposal workflow for an engine update. Review all three mapping
   files and update release notes.
2. Complete release acceptance, including real-host/engine checks that unit and
   fake-host tests cannot establish. Locally run typecheck, tests, build, pack
   and registry/containment verification as documented in README.
3. Commit and push the reviewed changes to main. Create and push the matching
   annotated tag. For the current candidate, once accepted:

   ```sh
   git tag -a v0.84.0 -m "Release 0.84.0"
   git push origin v0.84.0
   ```

   Tag the accepted main commit, not unrelated local changes. A main push alone
   does not create a tag or stage a release.
4. Watch **Stage npm release** in Actions and approve the GitHub environment if
   configured to require it. Review the verified `adapter-package` artifact.
5. Review the stage reported by npm in **Staged Packages** on npmjs.com. Check
   package/version/provenance and compare its tarball integrity with the verified
   artifact. Approve using maintainer 2FA.
6. Verify the public version, integrity and provenance:

   ```sh
   npm view @compn3rd/pi-web-subagents@0.84.0 version dist.integrity
   ```

   Only then mark the release published in documentation or create a public
   GitHub release. Installation in Pi Web is a separate maintenance operation.

## Failures and retries

A timeout or failed job does not prove that npm accepted nothing. Inspect both
the exact public version and pending npm stages before rerunning. Manual dispatch
must use the tag; branch dispatch intentionally fails validation. Retrying uses
the workflow at the tagged revision, not later fixes on main. Use a new version
and tag for fixes, unless the owner explicitly approves moving an unpublished
tag. Never overwrite a published version.

Dry-runs and `npm whoami` do not test OIDC stage authorization. Check the trust
identity, environment, allowed action and npm CLI version instead of adding a
token or weakening 2FA. Successful staging does not certify real-host execution.
The workflow neither installs the adapter/engine nor restarts any daemon.
