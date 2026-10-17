import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { appendFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { packageRoot, tarballName, validatePackedFiles, validateReleaseInputs } from "./release-inputs.mjs";

assert.equal(process.argv.length, 2, "Usage: pack-release.mjs");
const { manifest, upstreamLock } = await validateReleaseInputs();
const filename = tarballName(manifest, upstreamLock);
await mkdir(new URL("artifacts/", packageRoot), { recursive: true });
// npm supplies its CLI path to npm run; no shell or interpolated command input.
assert.ok(process.env.npm_execpath, "Run through npm run pack:release");
const result = JSON.parse(execFileSync(process.execPath, [process.env.npm_execpath,
  "pack", "--json", "--ignore-scripts", "--pack-destination", "artifacts"],
{ cwd: fileURLToPath(packageRoot), encoding: "utf8", timeout: 60_000 }));
assert.equal(result.length, 1);
assert.equal(result[0].filename, filename);
await validatePackedFiles(fileURLToPath(new URL(`artifacts/${filename}`, packageRoot)));
if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `filename=${filename}\n`);
console.log(`artifacts/${filename}`);
