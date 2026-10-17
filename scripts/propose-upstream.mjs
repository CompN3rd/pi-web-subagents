import assert from "node:assert/strict";
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { enumerateStableReleases, fetchRegistryBytes, REGISTRY, verifyIntegrity } from "./registry.mjs";
import { packageRoot, validateReleaseInputs } from "./release-inputs.mjs";
import { selectUpstreamCandidate } from "./version-policy.mjs";
import { updateMapping, writeMapping } from "./update-mapping.mjs";

export async function planUpstreamProposal(inputs, fetchBytes = fetchRegistryBytes) {
  const packument = JSON.parse((await fetchBytes(`${REGISTRY}pi-subagents`)).toString("utf8"));
  const report = enumerateStableReleases(packument, inputs.upstreamLock.upstream);
  verifyIntegrity(await fetchBytes(inputs.upstreamLock.upstream.tarball), inputs.upstreamLock.upstream.integrity);
  const selected = selectUpstreamCandidate(report);
  if (selected) verifyIntegrity(await fetchBytes(selected.tarball), selected.integrity);
  const updated = selected ? updateMapping(inputs, selected) : null;
  return {
    report: {
      ...report,
      policy: "Propose only the highest non-deprecated stable version above the reviewed baseline; list all other candidates and exclusions. Never auto merge or execute upstream bytes.",
      selected,
      adapterVersion: updated?.manifest.version ?? inputs.manifest.version,
      integrityVerified: selected ? [report.baseline, selected.version] : [report.baseline],
      publisherIdentityVerified: false,
    },
    updated,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  assert.ok(args.length === 0 || (args.length === 1 && args[0] === "--apply"), "Usage: propose-upstream.mjs [--apply] (default read-only)");
  const { report, updated } = await planUpstreamProposal(await validateReleaseInputs());
  if (args[0] === "--apply") {
    if (updated) await writeMapping(updated);
    await mkdir(new URL("artifacts/", packageRoot), { recursive: true });
    await writeFile(new URL("artifacts/upstream-proposal.json", packageRoot), `${JSON.stringify(report, null, 2)}\n`);
    if (process.env.GITHUB_OUTPUT) {
      await appendFile(process.env.GITHUB_OUTPUT, `candidate=${report.selected?.version ?? ""}\nadapter-version=${report.adapterVersion}\n`);
    }
  }
  console.log(JSON.stringify(report, null, 2));
}
