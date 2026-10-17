import assert from "node:assert/strict";
import { validateReleaseInputs } from "./release-inputs.mjs";
import { updateMapping, writeMapping } from "./update-mapping.mjs";

assert.deepEqual(process.argv.slice(2), ["patch"], "Usage: npm run release:version -- patch (adapter-only hotfix)");
const inputs = updateMapping(await validateReleaseInputs());
await writeMapping(inputs);
console.log(`Adapter ${inputs.manifest.version}; exact engine mapping unchanged at ${inputs.upstreamLock.upstream.version}`);
