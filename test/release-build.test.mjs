import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import { test } from "node:test";

const exec = promisify(execFile);
const root = new URL("../", import.meta.url);

test("build bundles Lit and public capability tokens for clean installs, and rejects browser/private host runtime imports", async () => {
  const directory = await mkdtemp(join(tmpdir(), "adapter-build-"));
  try {
    await mkdir(join(directory, "scripts"));
    await mkdir(join(directory, "src"));
    await cp(new URL("scripts/build.mjs", root), join(directory, "scripts/build.mjs"));
    await mkdir(join(directory, "node_modules"));
    for (const name of ["esbuild", "@esbuild", "lit", "lit-html", "lit-element", "@lit"]) {
      await cp(new URL(`node_modules/${name}`, root), join(directory, "node_modules", name), { recursive: true });
    }
    const host = join(directory, "node_modules/@jmfederico/pi-web");
    await mkdir(join(host, "dist"), { recursive: true });
    await cp(new URL("node_modules/@jmfederico/pi-web/package.json", root), join(host, "package.json"));
    await cp(new URL("node_modules/@jmfederico/pi-web/dist/server-plugin-api.js", root), join(host, "dist/server-plugin-api.js"));
    await writeFile(join(directory, "package.json"), '{"type":"module"}');
    await writeFile(join(directory, "src/browser.ts"), 'import { html } from "lit"; export const render = () => html`<p>fixture</p>`;');
    await writeFile(join(directory, "src/server.ts"), 'import * as host from "@jmfederico/pi-web/server-plugin-api"; export const api = host;');
    const result = await exec(process.execPath, [join(directory, "scripts/build.mjs")]);
    assert.match(result.stdout, /only public host capability tokens bundled/);
    const browser = await readFile(join(directory, "dist/browser/index.js"), "utf8");
    assert.ok(browser.includes("lit-html"), "Lit implementation must be bundled");
    assert.doesNotMatch(browser, /from ["']lit["']/);
    const server = await readFile(join(directory, "dist/server.js"), "utf8");
    assert.doesNotMatch(server, /from ["']@jmfederico\/pi-web/);
    const consumer = await mkdtemp(join(tmpdir(), "adapter-clean-consumer-"));
    try {
      await cp(join(directory, "dist/server.js"), join(consumer, "server.mjs"));
      const imported = await exec(process.execPath, ["--input-type=module", "-e",
        `const {api} = await import(${JSON.stringify(pathToFileURL(join(consumer, "server.mjs")).href)}); if (api.PI_WEB_HOST_PI_SESSION_EVENTS_CAPABILITY.version !== 1) throw new Error('missing capability'); console.log('clean import passed');`]);
      assert.match(imported.stdout, /clean import passed/);
    } finally {
      await rm(consumer, { recursive: true, force: true });
    }
    for (const specifier of ["@jmfederico/pi-web/plugin-api", "pi-subagents"]) {
      await writeFile(join(directory, "src/browser.ts"), `import * as unsupported from "${specifier}"; export { unsupported };`);
      await assert.rejects(exec(process.execPath, [join(directory, "scripts/build.mjs")]), /Unsupported runtime import/);
    }
    await writeFile(join(directory, "src/browser.ts"), "export const value = 1;");
    await writeFile(join(directory, "src/server.ts"), 'import * as privateApi from "@jmfederico/pi-web/dist/server.js"; export { privateApi };');
    await assert.rejects(exec(process.execPath, [join(directory, "scripts/build.mjs")]), /Unsupported runtime import/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
