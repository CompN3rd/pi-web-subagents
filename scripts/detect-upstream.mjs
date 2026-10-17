import { enumerateStableReleases, fetchRegistryBytes, REGISTRY } from "./registry.mjs";
import { validateReleaseInputs } from "./release-inputs.mjs";

if (process.argv.length !== 2) throw new Error("Usage: detect-upstream.mjs (read-only; no options)");
const { upstreamLock } = await validateReleaseInputs();
const packument = JSON.parse((await fetchRegistryBytes(`${REGISTRY}pi-subagents`)).toString("utf8"));
console.log(JSON.stringify(enumerateStableReleases(packument, upstreamLock.upstream), null, 2));
