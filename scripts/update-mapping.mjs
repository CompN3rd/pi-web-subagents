import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { compareStable, validateDistribution } from "./registry.mjs";
import { packageRoot, validateManifest, validateNpmLock } from "./release-inputs.mjs";
import { nextAdapterVersion } from "./version-policy.mjs";

export function updateMapping(inputs, upstreamCandidate) {
  const { manifest, upstreamLock, npmLock } = structuredClone(inputs);
  validateManifest(manifest, upstreamLock);
  validateNpmLock(manifest, npmLock);
  if (upstreamCandidate) {
    assert.equal(upstreamCandidate.name, "pi-subagents");
    assert.ok(compareStable(upstreamCandidate.version, upstreamLock.upstream.version) > 0, "Candidate must advance the reviewed engine baseline");
    upstreamLock.upstream = validateDistribution(upstreamCandidate.version, upstreamCandidate);
  }
  manifest.version = nextAdapterVersion(manifest.version, upstreamCandidate?.version);
  upstreamLock.adapter.version = manifest.version;
  manifest.peerDependencies["pi-subagents"] = upstreamLock.upstream.version;
  // Optional peer stays absent. Updating only root metadata preserves every
  // reviewed dependency resolution and never invokes npm or upstream scripts.
  npmLock.version = manifest.version;
  npmLock.packages[""].version = manifest.version;
  npmLock.packages[""].peerDependencies = structuredClone(manifest.peerDependencies);
  validateManifest(manifest, upstreamLock);
  validateNpmLock(manifest, npmLock);
  return { manifest, upstreamLock, npmLock };
}

export async function writeMapping(inputs, root = packageRoot) {
  for (const [name, value] of [["package.json", inputs.manifest], ["upstream-lock.json", inputs.upstreamLock], ["package-lock.json", inputs.npmLock]]) {
    await writeFile(new URL(name, root), `${JSON.stringify(value, null, 2)}\n`);
  }
}
