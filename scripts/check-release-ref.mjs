import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { validateReleaseInputs } from "./release-inputs.mjs";

export function validateReleaseRef(manifest, env = process.env) {
  assert.equal(env.GITHUB_REPOSITORY, "CompN3rd/pi-web-subagents", "Wrong release repository");
  assert.match(manifest.version, /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/, "Release requires a stable version");
  assert.equal(env.GITHUB_REF, `refs/tags/v${manifest.version}`, "Run on the matching v<package-version> tag, not a branch");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { manifest } = await validateReleaseInputs();
  validateReleaseRef(manifest);
  console.log(`Validated release tag v${manifest.version}; workflow must also verify main ancestry.`);
}
