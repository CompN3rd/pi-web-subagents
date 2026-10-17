import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";
import { test } from "node:test";
import { packageRoot, readJson, readPackageTarball, tarballName, validateManifest, validateReleaseInputs } from "../scripts/release-inputs.mjs";

const manifest = await readJson(new URL("package.json", packageRoot));
const upstreamLock = await readJson(new URL("upstream-lock.json", packageRoot));
function tarball(extra = [], omit = []) {
  const files = [
    ["package/package.json", JSON.stringify(manifest)],
    ["package/upstream-lock.json", JSON.stringify(upstreamLock)],
    ["package/README.md", "fixture"], ["package/LICENSE", "fixture"],
    ["package/dist/browser/index.js", "export default {}"], ["package/dist/server.js", "export default {}"],
    ...extra,
  ];
  const parts = [];
  for (const [name, content, type = "0"] of files) {
    if (omit.includes(name)) continue;
    const bytes = Buffer.from(content);
    const header = Buffer.alloc(512);
    header.write(name);
    header.write("0000644\0", 100);
    header.write(`${bytes.length.toString(8).padStart(11, "0")}\0`, 124);
    header.fill(32, 148, 156);
    header.write(type, 156);
    header.write("ustar\0", 257);
    header.write(`${[...header].reduce((sum, byte) => sum + byte, 0).toString(8).padStart(6, "0")}\0 `, 148);
    parts.push(header, bytes, Buffer.alloc((512 - bytes.length % 512) % 512));
  }
  return gzipSync(Buffer.concat([...parts, Buffer.alloc(1024)]));
}

test("validateReleaseInputs accepts independent exact package and lock without installing the engine", async () => {
  const result = await validateReleaseInputs();
  assert.equal(result.manifest.version, manifest.version);
  assert.equal(result.upstreamLock.host.browserApiVersion, 4);
});

test("validateManifest rejects mapping mismatch, broad browser root, runtime installs and lifecycle hooks", () => {
  for (const mutate of [
    (value) => { value.version = "1.2.3-beta.1"; },
    (value) => { value.peerDependencies["pi-subagents"] = "^0.79.0"; },
    (value) => { value.repository.url = "git+https://github.com/other/repo.git"; },
    (value) => { value.piWeb.plugins[0].browserRoot = "."; },
    (value) => { value.dependencies = { "pi-subagents": "0.79.0" }; },
    (value) => { value.peerDependenciesMeta["pi-subagents"].optional = false; },
    (value) => { value.scripts.prepare = "node unsafe.mjs"; },
    (value) => { value.devDependencies.lit = "^3.3.3"; },
  ]) {
    const candidate = structuredClone(manifest);
    mutate(candidate);
    assert.throws(() => validateManifest(candidate, upstreamLock));
  }
});

test("validateReleaseInputs rejects mismatched local lock and foreign registry resolution", async () => {
  const directory = await mkdtemp(join(tmpdir(), "adapter-inputs-"));
  const root = pathToFileURL(`${directory}/`);
  try {
    for (const name of ["package.json", "upstream-lock.json", "package-lock.json"]) {
      await writeFile(join(directory, name), await readFile(new URL(name, packageRoot)));
    }
    const lock = await readJson(new URL("package-lock.json", packageRoot));
    lock.packages["node_modules/lit"].version = "0.0.0";
    await writeFile(join(directory, "package-lock.json"), JSON.stringify(lock));
    await assert.rejects(validateReleaseInputs(root), /npm lock dependency mismatch/);
    lock.packages["node_modules/lit"].version = manifest.devDependencies.lit;
    lock.packages["node_modules/lit"].resolved = "https://example.com/lit.tgz";
    await writeFile(join(directory, "package-lock.json"), JSON.stringify(lock));
    await assert.rejects(validateReleaseInputs(root), /Non-registry dependency/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("readPackageTarball accepts only the complete six-file scoped adapter", () => {
  const entries = readPackageTarball(tarball());
  assert.equal(entries.size, 6);
  assert.equal(JSON.parse(entries.get("package.json")).name, "@compn3rd/pi-web-subagents");
});

test("readPackageTarball rejects traversal, links, duplicate records, bundled engine, and missing outputs", () => {
  for (const extra of [
    [["package/../escape", "bad"]], [["/absolute", "bad"]], [["package/dist/server.js", "bad"]],
    [["package/dist/engine.js", "bad"]], [["package/node_modules/pi-subagents/index.js", "bad"]],
    [["package/link", "", "2"]], [["package/extended", "", "x"]],
  ]) assert.throws(() => readPackageTarball(tarball(extra)));
  assert.throws(() => readPackageTarball(tarball([], ["package/dist/server.js"])), /Missing package files/);
  assert.throws(() => readPackageTarball(Buffer.from("not gzip")));
  assert.throws(() => readPackageTarball(Buffer.alloc(8 * 1024 * 1024 + 1)), /exceeds 8 MiB/);
});

test("tarballName derives independent stable adapter version only after manifest validation", () => {
  const candidate = structuredClone(manifest);
  const lock = structuredClone(upstreamLock);
  candidate.version = lock.adapter.version = "0.99.12";
  validateManifest(candidate, lock);
  assert.equal(tarballName(candidate, lock), "compn3rd-pi-web-subagents-0.99.12.tgz");
  for (const version of ["01.2.3", "1.2", "1.2.3-beta.1", "1.2.3+build", "../../escape", "1.2.3;unsafe"]) {
    candidate.version = lock.adapter.version = version;
    assert.throws(() => tarballName(candidate, lock));
  }
  candidate.version = "0.99.13";
  lock.adapter.version = "0.99.12";
  assert.throws(() => tarballName(candidate, lock));
});
