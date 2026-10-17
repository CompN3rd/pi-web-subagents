import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve, basename } from "node:path";
import { enumerateStableReleases, fetchRegistryBytes, REGISTRY, verifyIntegrity } from "./registry.mjs";
import { packageRoot, readPackageTarball, tarballName, validatePackedFiles, validateReleaseInputs } from "./release-inputs.mjs";

const args = process.argv.slice(2);
assert.ok(args.length === 0 || (args.length === 2 && ["--tarball", "--packed-only"].includes(args[0])),
  "Usage: verify-release.mjs [--tarball FILE | --packed-only FILE]");
const { upstreamLock } = await validateReleaseInputs();
if (args.length) {
  const filename = resolve(args[1]);
  assert.equal(basename(filename), tarballName, "Only the exact initial scoped adapter tgz is accepted");
  if (args[0] === "--packed-only") {
    const entries = readPackageTarball(await readFile(filename));
    for (const name of ["package.json", "upstream-lock.json", "LICENSE", "README.md"]) {
      assert.deepEqual(entries.get(name), await readFile(new URL(name, packageRoot)), `Packed input changed: ${name}`);
    }
  } else {
    await validatePackedFiles(filename);
  }
}
const packument = JSON.parse((await fetchRegistryBytes(`${REGISTRY}pi-subagents`)).toString("utf8"));
enumerateStableReleases(packument, upstreamLock.upstream);
const bytes = await fetchRegistryBytes(upstreamLock.upstream.tarball);
verifyIntegrity(bytes, upstreamLock.upstream.integrity);
console.log("Release inputs verified: exact initial mapping, npm lock, registry pin and SHA-512 bytes" + (args.length ? ", scoped tarball containment" : ""));
console.log("Integrity is not publisher identity: npm signatures/provenance have NOT been independently verified.");
