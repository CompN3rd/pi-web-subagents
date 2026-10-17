import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { validateDistribution } from "./registry.mjs";

export const packageRoot = new URL("../", import.meta.url);
export const tarballName = "compn3rd-pi-web-subagents-0.79.0.tgz";
const allowedFiles = [
  "package.json", "README.md", "LICENSE", "upstream-lock.json",
  "dist/browser/index.js", "dist/server.js",
];
export const readJson = async (url) => JSON.parse(await readFile(url, "utf8"));

export function validateManifest(manifest, upstreamLock) {
  assert.equal(manifest.name, "@compn3rd/pi-web-subagents");
  assert.equal(manifest.version, "0.79.0", "Future adapter versions require an owner-approved numbering policy");
  assert.notEqual(manifest.private, true);
  assert.equal(manifest.type, "module");
  assert.equal(manifest.license, "MIT");
  assert.deepEqual(manifest.engines, { node: ">=24" });
  assert.deepEqual(manifest.files, ["dist/", "README.md", "LICENSE", "upstream-lock.json"]);
  assert.deepEqual(manifest.publishConfig, { access: "public", registry: "https://registry.npmjs.org/" });
  assert.deepEqual(manifest.peerDependencies, { "pi-subagents": "0.79.0" });
  assert.deepEqual(manifest.peerDependenciesMeta, { "pi-subagents": { optional: true } });
  assert.deepEqual(manifest.piWeb, { plugins: [{
    id: "compn3rd.subagents", browserRoot: "dist/browser", module: "dist/browser/index.js",
    serverModule: "dist/server.js", machineSpecific: true,
  }] });
  for (const key of ["dependencies", "optionalDependencies", "bundledDependencies", "bundleDependencies", "workspaces", "pi", "bin"]) {
    assert.equal(manifest[key], undefined, `Unexpected runtime/package surface: ${key}`);
  }
  for (const hook of ["preinstall", "install", "postinstall", "prepare", "prepack", "postpack", "prepublish", "prepublishOnly", "publish", "postpublish"]) {
    assert.equal(manifest.scripts?.[hook], undefined, `Release lifecycle hook forbidden: ${hook}`);
  }
  assert.equal(upstreamLock.schemaVersion, 1);
  assert.deepEqual(upstreamLock.adapter, { name: manifest.name, version: manifest.version });
  assert.equal(upstreamLock.upstream.name, "pi-subagents");
  assert.equal(upstreamLock.upstream.version, manifest.peerDependencies["pi-subagents"]);
  validateDistribution(upstreamLock.upstream.version, upstreamLock.upstream);
  assert.deepEqual(upstreamLock.host, {
    name: "@jmfederico/pi-web", version: "1.202610.3", browserApiVersion: 4, serverApiVersion: 3,
  });
  assert.equal(upstreamLock.transport, "separately-installed-pi-subagents-rpc-event-bus");
  assert.equal(manifest.devDependencies[upstreamLock.host.name], upstreamLock.host.version);
  for (const [name, version] of Object.entries(manifest.devDependencies)) {
    assert.match(version, /^\d+\.\d+\.\d+$/, `Development input must be exact: ${name}`);
  }
}

export async function validateReleaseInputs(root = packageRoot) {
  const [manifest, upstreamLock, npmLock] = await Promise.all([
    readJson(new URL("package.json", root)), readJson(new URL("upstream-lock.json", root)), readJson(new URL("package-lock.json", root)),
  ]);
  validateManifest(manifest, upstreamLock);
  assert.equal(npmLock.lockfileVersion, 3);
  assert.equal(npmLock.name, manifest.name);
  assert.equal(npmLock.version, manifest.version);
  for (const key of ["name", "version", "devDependencies", "peerDependencies", "peerDependenciesMeta", "engines"]) {
    assert.deepEqual(npmLock.packages[""][key], manifest[key], `npm lock root mismatch: ${key}`);
  }
  for (const [name, version] of Object.entries(manifest.devDependencies)) {
    assert.equal(npmLock.packages[`node_modules/${name}`]?.version, version, `npm lock dependency mismatch: ${name}`);
  }
  for (const [name, entry] of Object.entries(npmLock.packages)) {
    if (!name) continue;
    assert.notEqual(entry.link, true, `Linked release dependency: ${name}`);
    assert.equal(new URL(entry.resolved).origin, "https://registry.npmjs.org", `Non-registry dependency: ${name}`);
    assert.match(entry.integrity ?? "", /^sha512-/);
    assert.ok(!/(^|\/)node_modules\/pi-subagents($|\/)/.test(name), "Upstream must remain separately installed");
  }
  return { manifest, upstreamLock };
}

// The package has six short filenames: accept only ordinary regular-file tar
// records (plus their directories), not PAX/GNU overrides, links or devices.
export function readPackageTarball(gzip) {
  assert.ok(gzip.length <= 8 * 1024 * 1024, "Packed adapter exceeds 8 MiB");
  const tar = gunzipSync(gzip, { maxOutputLength: 17 * 1024 * 1024 });
  const entries = new Map();
  const seen = new Set();
  let offset = 0;
  let totalSize = 0;
  const text = (buffer) => buffer.toString("utf8").replace(/\0.*$/s, "");
  const octal = (buffer) => {
    const value = text(buffer).trim();
    assert.match(value, /^[0-7]+$/, "Invalid tar numeric field");
    return Number.parseInt(value, 8);
  };
  for (; offset + 512 <= tar.length;) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const checksum = [...header].reduce((sum, byte, i) => sum + (i >= 148 && i < 156 ? 32 : byte), 0);
    assert.equal(octal(header.subarray(148, 156)), checksum, "Invalid tar checksum");
    const prefix = text(header.subarray(345, 500));
    const name = `${prefix ? `${prefix}/` : ""}${text(header.subarray(0, 100))}`;
    assert.ok(!seen.has(name), `Duplicate tar entry: ${name}`);
    seen.add(name);
    const type = header[156];
    const size = octal(header.subarray(124, 136));
    assert.ok(type === 0 || type === 48 || type === 53, `Unsupported tar record: ${name}`);
    offset += 512;
    assert.ok(offset + size <= tar.length, "Truncated tar entry");
    if (type === 53) {
      assert.ok(["package/", "package/dist/", "package/dist/browser/"].includes(name) && size === 0, `Unexpected directory: ${name}`);
    } else {
      assert.ok(allowedFiles.some((file) => name === `package/${file}`), `Unexpected package entry: ${name}`);
      totalSize += size;
      assert.ok(totalSize <= 16 * 1024 * 1024, "Adapter exceeds host package size limit");
      entries.set(name.slice(8), tar.subarray(offset, offset + size));
    }
    offset += Math.ceil(size / 512) * 512;
  }
  assert.ok(tar.length - offset >= 1024 && tar.subarray(offset).every((byte) => byte === 0), "Invalid tar terminator");
  assert.deepEqual([...entries.keys()].sort(), [...allowedFiles].sort(), "Missing package files");
  const manifest = JSON.parse(entries.get("package.json").toString("utf8"));
  const upstreamLock = JSON.parse(entries.get("upstream-lock.json").toString("utf8"));
  validateManifest(manifest, upstreamLock);
  return entries;
}

export async function validatePackedFiles(filename, root = packageRoot) {
  const entries = readPackageTarball(await readFile(filename));
  for (const [name, content] of entries) {
    assert.deepEqual(content, await readFile(new URL(name, root)), `Tarball differs from reviewed build input: ${name}`);
  }
  return entries;
}
