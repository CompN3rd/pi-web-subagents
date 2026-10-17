import { build } from "esbuild";
import { mkdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const publicServerApi = "@jmfederico/pi-web/server-plugin-api";
const boundary = (browser) => ({
  name: "adapter-package-boundary",
  setup(builder) {
    builder.onResolve({ filter: /^(?:@jmfederico\/pi-web|pi-subagents)(?:\/|$)/ }, ({ path }) => {
      if (browser || (path.startsWith("@jmfederico/pi-web") && path !== publicServerApi)) {
        throw new Error(`Unsupported runtime import: ${path}; browser host contracts are type-only`);
      }
      // The public token/parser module is dependency-free and must travel with
      // the plugin: a globally installed host is not a Node dependency of it.
      return path === publicServerApi ? undefined : { path, external: true };
    });
  },
});

await rm(new URL("../dist/", import.meta.url), { recursive: true, force: true });
await mkdir(new URL("../dist/browser/", import.meta.url), { recursive: true });
for (const browser of [true, false]) {
  const result = await build({
    absWorkingDir: root,
    entryPoints: [browser ? "src/browser.ts" : "src/server.ts"],
    outfile: browser ? "dist/browser/index.js" : "dist/server.js",
    bundle: true,
    format: "esm",
    platform: browser ? "browser" : "node",
    target: browser ? "es2022" : "node24",
    sourcemap: false,
    legalComments: "inline",
    metafile: true,
    plugins: [boundary(browser)],
  });
  for (const input of Object.keys(result.metafile.inputs)) {
    const publicTokenModule = input === "node_modules/@jmfederico/pi-web/dist/server-plugin-api.js";
    if (input.startsWith("../") || (!publicTokenModule && /node_modules\/(?:@jmfederico\/pi-web|pi-subagents)\//.test(input))) {
      throw new Error(`Build crossed adapter boundary: ${input}`);
    }
  }
  if (browser && Object.values(result.metafile.outputs).some((output) => output.imports.length > 0)) {
    throw new Error("Browser bundle must be self-contained (including Lit)");
  }
}
console.log("Built self-contained browser/server entries; only public host capability tokens bundled, not host/engine implementations");
