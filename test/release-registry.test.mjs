import assert from "node:assert/strict";
import { test } from "node:test";
import { enumerateStableReleases, fetchRegistryBytes, verifyIntegrity } from "../scripts/registry.mjs";
import { packageRoot, readJson } from "../scripts/release-inputs.mjs";

const { upstream: pinned } = await readJson(new URL("upstream-lock.json", packageRoot));
const distribution = (version) => ({
  name: "pi-subagents", version,
  dist: { tarball: `https://registry.npmjs.org/pi-subagents/-/pi-subagents-${version}.tgz`, integrity: pinned.integrity },
});
const fixture = () => ({
  name: "pi-subagents", "dist-tags": { latest: "0.78.0" },
  versions: Object.fromEntries(["0.79.2", "0.79.0", "0.80.0-beta.1", "0.78.0", "0.79.1"].map((v) => [v, distribution(v)])),
});

test("enumerateStableReleases returns every new stable version despite tag rollback, deterministically without mutation", () => {
  const input = fixture();
  input.versions["0.79.1"].deprecated = "Needs review; do not skip";
  const before = structuredClone(input);
  const first = enumerateStableReleases(input, pinned);
  assert.deepEqual(first.candidates.map((entry) => entry.version), ["0.79.1", "0.79.2"]);
  assert.equal(first.candidates[0].deprecated, "Needs review; do not skip");
  assert.deepEqual(first.excludedVersions, ["0.80.0-beta.1"]);
  assert.deepEqual(enumerateStableReleases(input, pinned), first, "Repeat polling must not consume or lose candidates");
  assert.deepEqual(input, before);
});

test("enumerateStableReleases rejects missing or changed baseline and malformed candidates", () => {
  const missing = fixture();
  delete missing.versions[pinned.version];
  assert.throws(() => enumerateStableReleases(missing, pinned), /missing/);
  const changed = fixture();
  changed.versions[pinned.version].dist.integrity = `sha512-${"A".repeat(86)}==`;
  assert.throws(() => enumerateStableReleases(changed, pinned), /changed/);
  const url = fixture();
  url.versions["0.79.1"].dist.tarball = "https://example.com/payload.tgz";
  assert.throws(() => enumerateStableReleases(url, pinned), /Invalid registry distribution/);
  const hostile = fixture();
  hostile.versions["0.79.1; echo unsafe"] = distribution("0.79.1; echo unsafe");
  assert.throws(() => enumerateStableReleases(hostile, pinned), /Invalid registry version/);
});

test("enumerateStableReleases reports genuine no-update and orders numeric versions", () => {
  assert.deepEqual(enumerateStableReleases({ name: "pi-subagents", versions: { [pinned.version]: distribution(pinned.version) } }, pinned).candidates, []);
  const input = fixture();
  input.versions["0.79.10"] = distribution("0.79.10");
  assert.deepEqual(enumerateStableReleases(input, pinned).candidates.map((v) => v.version), ["0.79.1", "0.79.2", "0.79.10"]);
});

test("fetchRegistryBytes fails on HTTP errors, network errors, oversized bodies, foreign URLs and redirects", async () => {
  for (const status of [404, 429, 500]) {
    await assert.rejects(fetchRegistryBytes(pinned.tarball, { fetchImpl: async () => new Response("failure", { status }) }), new RegExp(`HTTP ${status}`));
  }
  await assert.rejects(fetchRegistryBytes(pinned.tarball, { fetchImpl: async () => { throw new Error("network down"); } }), /network down/);
  await assert.rejects(fetchRegistryBytes(pinned.tarball, { maxBytes: 3, fetchImpl: async () => new Response("large") }), /exceeds/);
  await assert.rejects(fetchRegistryBytes("https://example.com/file"), /Only the HTTPS npm registry/);
  await assert.rejects(fetchRegistryBytes("https://user@registry.npmjs.org/file"), /Only the HTTPS npm registry/);
  await assert.rejects(fetchRegistryBytes(pinned.tarball, { fetchImpl: async (_url, options) => {
    assert.equal(options.redirect, "error");
    assert.ok(options.signal instanceof AbortSignal);
    return new Response(null, { status: 302 });
  } }), /HTTP 302/);
});

test("fetchRegistryBytes reads bounded bytes; verifyIntegrity rejects changed bytes", async () => {
  const bytes = await fetchRegistryBytes(pinned.tarball, { fetchImpl: async () => new Response("fixture") });
  assert.equal(bytes.toString(), "fixture");
  assert.throws(() => verifyIntegrity(bytes, pinned.integrity), /SHA-512 integrity mismatch/);
  const { createHash } = await import("node:crypto");
  verifyIntegrity(bytes, `sha512-${createHash("sha512").update(bytes).digest("base64")}`);
});
