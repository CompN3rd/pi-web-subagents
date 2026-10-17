import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";
import { packageRoot, validateReleaseInputs } from "../scripts/release-inputs.mjs";
import { planUpstreamProposal } from "../scripts/propose-upstream.mjs";
import { nextAdapterVersion } from "../scripts/version-policy.mjs";
import { updateMapping, writeMapping } from "../scripts/update-mapping.mjs";

const bytes = Buffer.from("untrusted upstream bytes; never installed or executed");
const integrity = `sha512-${createHash("sha512").update(bytes).digest("base64")}`;
const distribution = (version) => ({ name: "pi-subagents", version,
  tarball: `https://registry.npmjs.org/pi-subagents/-/pi-subagents-${version}.tgz`, integrity });
const base = await validateReleaseInputs();
function inputs(adapter = "0.79.0") {
  const value = structuredClone(base);
  value.manifest.version = value.upstreamLock.adapter.version = value.npmLock.version = value.npmLock.packages[""].version = adapter;
  value.upstreamLock.upstream = distribution("0.79.0");
  value.manifest.peerDependencies["pi-subagents"] = value.npmLock.packages[""].peerDependencies["pi-subagents"] = "0.79.0";
  return value;
}
function registry(versions) {
  const packument = { name: "pi-subagents", "dist-tags": { latest: "0.78.0" }, versions: {} };
  for (const version of ["0.79.0", ...versions]) packument.versions[version] = {
    name: "pi-subagents", version, dist: distribution(version),
  };
  const calls = [];
  return { packument, calls, fetchBytes: async (url) => {
    calls.push(url);
    return url.endsWith(".tgz") ? bytes : Buffer.from(JSON.stringify(packument));
  } };
}

test("nextAdapterVersion implements stable hotfix and upstream mapping policy deterministically", () => {
  assert.equal(nextAdapterVersion("0.79.0"), "0.79.1");
  assert.equal(nextAdapterVersion("0.79.9"), "0.79.10");
  assert.equal(nextAdapterVersion("0.79.1", "0.80.0"), "0.80.0");
  assert.equal(nextAdapterVersion("0.79.2", "0.79.2"), "0.79.3");
  assert.equal(nextAdapterVersion("0.80.4", "0.79.3"), "0.80.5");
  assert.equal(nextAdapterVersion("1.9.9", "1.10.0"), "1.10.0");
  for (const bad of ["1.0.0-rc.1", "01.0.0", "1.0.0+meta", "1.0", "unsafe", "1.0.0\n", "1.0.0\r\n"]) {
    assert.throws(() => nextAdapterVersion(bad));
    assert.throws(() => nextAdapterVersion("1.0.0", bad));
  }
});

test("updateMapping preserves engine on hotfix and all dependency resolutions on upstream update", async () => {
  const original = inputs();
  const hotfix = updateMapping(original);
  assert.equal(hotfix.manifest.version, "0.79.1");
  assert.deepEqual(hotfix.upstreamLock.upstream, original.upstreamLock.upstream);
  const updated = updateMapping(hotfix, distribution("0.79.1"));
  assert.equal(updated.manifest.version, "0.79.2");
  assert.equal(updated.manifest.peerDependencies["pi-subagents"], "0.79.1");
  assert.equal(updated.npmLock.packages[""].peerDependencies["pi-subagents"], "0.79.1");
  assert.equal(original.manifest.version, "0.79.0", "Pure mapping must not mutate source inputs");
  for (const [name, entry] of Object.entries(original.npmLock.packages)) {
    if (name) assert.deepEqual(updated.npmLock.packages[name], entry);
  }
  assert.equal(updated.npmLock.packages["node_modules/pi-subagents"], undefined);
  for (const version of ["0.78.9", "0.79.0"]) assert.throws(() => updateMapping(original, distribution(version)), /advance/);
  const directory = await mkdtemp(join(tmpdir(), "adapter-mapping-"));
  const root = pathToFileURL(`${directory}/`);
  try {
    await writeMapping(updated, root);
    assert.deepEqual(await validateReleaseInputs(root), updated);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("planUpstreamProposal selects highest non-deprecated stable despite latest rollback, verifies only bounded inputs and lists exclusions", async () => {
  const fixture = registry(["0.79.2", "0.80.0", "0.79.1", "0.81.0-rc.1", "0.82.0+build"]);
  fixture.packument.versions["0.80.0"].deprecated = "Do not select";
  const original = inputs("0.79.4");
  const plan = await planUpstreamProposal(original, fixture.fetchBytes);
  assert.equal(plan.report.selected.version, "0.79.2");
  assert.equal(plan.report.adapterVersion, "0.79.5");
  assert.deepEqual(plan.report.candidates.map((v) => v.version), ["0.79.1", "0.79.2", "0.80.0"]);
  assert.deepEqual(plan.report.excludedVersions, ["0.81.0-rc.1", "0.82.0+build"]);
  assert.equal(plan.report.publisherIdentityVerified, false);
  assert.equal(fixture.calls.length, 3, "One metadata request plus baseline and selected tarball only");
  assert.deepEqual((await planUpstreamProposal(original, fixture.fetchBytes)), plan);
  assert.equal(original.manifest.version, "0.79.4");
});

test("planUpstreamProposal selects the highest stable release after npm undeprecates it", async () => {
  const fixture = registry(["0.79.2", "0.80.0"]);
  fixture.packument.versions["0.80.0"].deprecated = "";
  const plan = await planUpstreamProposal(inputs(), fixture.fetchBytes);
  assert.equal(plan.report.selected.version, "0.80.0");
  assert.equal(plan.report.adapterVersion, "0.80.0");
  assert.ok(plan.updated);
  assert.equal(fixture.calls.length, 3);
});

test("planUpstreamProposal reports no eligible update honestly and fails closed on changed bytes/network/missing baseline", async () => {
  for (const versions of [[], ["0.80.0"]]) {
    const fixture = registry(versions);
    if (versions.length) fixture.packument.versions["0.80.0"].deprecated = "Do not select";
    const plan = await planUpstreamProposal(inputs(), fixture.fetchBytes);
    assert.equal(plan.updated, null);
    assert.equal(plan.report.selected, null);
    assert.equal(fixture.calls.length, 2);
  }
  const fixture = registry(["0.80.0"]);
  await assert.rejects(planUpstreamProposal(inputs(), async (url) => url.endsWith("0.80.0.tgz") ? Buffer.from("changed") : fixture.fetchBytes(url)), /integrity mismatch/);
  await assert.rejects(planUpstreamProposal(inputs(), async () => { throw new Error("network down"); }), /network down/);
  delete fixture.packument.versions["0.79.0"];
  await assert.rejects(planUpstreamProposal(inputs(), fixture.fetchBytes), /missing/);
});

test("release-version CLI updates only a temporary adapter hotfix mapping and rejects unsupported modes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "adapter-version-cli-"));
  const root = pathToFileURL(`${directory}/`);
  try {
    await cp(new URL("scripts/", packageRoot), join(directory, "scripts"), { recursive: true });
    await writeMapping(inputs(), root);
    const cli = join(directory, "scripts/release-version.mjs");
    assert.throws(() => execFileSync(process.execPath, [cli, "minor"], { stdio: "pipe", timeout: 10_000 }));
    assert.equal((await validateReleaseInputs(root)).manifest.version, "0.79.0");
    const output = execFileSync(process.execPath, [cli, "patch"], { encoding: "utf8", timeout: 10_000 });
    assert.match(output, /Adapter 0.79.1; exact engine mapping unchanged at 0.79.0/);
    const updated = await validateReleaseInputs(root);
    assert.equal(updated.manifest.version, "0.79.1");
    assert.equal(updated.npmLock.packages[""].peerDependencies["pi-subagents"], "0.79.0");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
