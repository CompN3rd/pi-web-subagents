import { compareStable } from "./registry.mjs";

export const releasePolicy = "Stable adapter versions are independent: adapter-only fixes increment patch; a newer upstream maps to its version if greater than the adapter, otherwise adapter patch + 1. Exact engine mapping is recorded separately.";

export function nextAdapterVersion(adapter, upstreamCandidate) {
  compareStable(adapter, adapter);
  if (upstreamCandidate !== undefined && compareStable(upstreamCandidate, adapter) > 0) return upstreamCandidate;
  const [major, minor, patch] = adapter.split(".");
  return `${major}.${minor}.${BigInt(patch) + 1n}`;
}

// Enumeration is sorted numerically; deprecated versions remain visible but are
// never selected automatically. Intermediate releases do not each get a PR.
export function selectUpstreamCandidate(report) {
  return report.candidates.filter((candidate) => candidate.deprecated === null || candidate.deprecated === "").at(-1) ?? null;
}
