import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { validateReleaseRef } from "../scripts/check-release-ref.mjs";
import { validateReleaseInputs } from "../scripts/release-inputs.mjs";

const env = { GITHUB_REPOSITORY: "CompN3rd/pi-web-subagents", GITHUB_REF: "refs/tags/v0.84.0" };
test("release tag guard accepts only the exact stable package version and owner", () => {
  assert.doesNotThrow(() => validateReleaseRef({ version: "0.84.0" }, env));
  for (const GITHUB_REF of [undefined, "refs/heads/main", "refs/heads/v0.84.0", "refs/tags/v0.83.0", "refs/tags/0.84.0", "refs/tags/v0.84.0-beta.1"]) {
    assert.throws(() => validateReleaseRef({ version: "0.84.0" }, { ...env, GITHUB_REF }));
  }
  assert.throws(() => validateReleaseRef({ version: "0.84.0" }, { ...env, GITHUB_REPOSITORY: "someone/fork" }));
  for (const version of ["0.84.0-beta.1", "0.84.0+build", "00.84.0", "bad"]) {
    assert.throws(() => validateReleaseRef({ version }, { ...env, GITHUB_REF: `refs/tags/v${version}` }));
  }
});

test("current mapping is usable by the tag guard without dependency installation", async () => {
  const { manifest } = await validateReleaseInputs();
  validateReleaseRef(manifest, { ...env, GITHUB_REF: `refs/tags/v${manifest.version}` });
});

test("release workflow stages tag builds with main ancestry and exact artifact verification", async () => {
  const workflow = await readFile(new URL("../.github/workflows/adapter-release.yml", import.meta.url), "utf8");
  assert.match(workflow, /push:\s+tags: \['v\*'\]/);
  assert.doesNotMatch(workflow, /ADAPTER_PUBLISH_ENABLED|branches: \[main\]/);
  assert.match(workflow, /permissions: \{\}/);
  assert.match(workflow, /node scripts\/check-release-ref\.mjs/);
  assert.match(workflow, /git merge-base --is-ancestor HEAD origin\/main/);
  assert.match(workflow, /needs: release-ref/);
  assert.match(workflow, /uses: \.\/\.github\/workflows\/adapter-ci\.yml/);
  assert.match(workflow, /verify-release\.mjs --tarball/);
  assert.match(workflow, /artifact-ids: \$\{\{ needs\.build\.outputs\.artifact-id \}\}/);
  // pack:release itself exports the validated filename to GITHUB_OUTPUT.
  const pack = await readFile(new URL("../scripts/pack-release.mjs", import.meta.url), "utf8");
  assert.match(pack, /appendFile\(process\.env\.GITHUB_OUTPUT, `filename=/);
  assert.match(workflow, /filename: \$\{\{ steps\.packed-input\.outputs\.filename \}\}/);
  const publish = workflow.slice(workflow.indexOf("\n  publish:"));
  assert.match(publish, /environment: npm/);
  assert.match(publish, /id-token: write/);
  assert.doesNotMatch(publish, /contents: write|actions\/checkout|npm ci|cache: npm|registry-url:/);
  assert.match(publish, /sha256sum --check --strict/);
  assert.match(publish, /refs\/tags\/v\$\{pkg.version\}/);
  assert.match(publish, /npm >=11\.15\.0 required/);
  assert.match(publish, /NODE_AUTH_TOKEN/);
  assert.match(publish, /NPM_TOKEN/);
  assert.match(publish, /NPM_ID_TOKEN/);
  assert.match(publish, /ACTIONS_ID_TOKEN_REQUEST_URL/);
  assert.match(publish, /npm stage publish .*--provenance --ignore-scripts --registry=https:\/\/registry\.npmjs\.org\//);
  assert.doesNotMatch(publish, /npm publish|npm stage approve/);
  for (const [, action] of workflow.matchAll(/uses: (actions\/[^\s]+)/g))
    assert.match(action, /@[a-f0-9]{40}$/);
});
