import { createHash } from "node:crypto";

export const REGISTRY = "https://registry.npmjs.org/";
// Absolute end, unlike $, also rejects a trailing newline in output/branch inputs.
const stablePattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?![\s\S])/;
const versionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?![\s\S])/;
export function compareStable(a, b) {
  if (!stablePattern.test(a) || !stablePattern.test(b)) throw new Error("Expected stable x.y.z versions");
  const left = a.split(".").map(BigInt);
  const right = b.split(".").map(BigInt);
  for (let i = 0; i < 3; i++) {
    if (left[i] !== right[i]) return left[i] < right[i] ? -1 : 1;
  }
  return 0;
}

export function validateDistribution(version, dist) {
  if (!stablePattern.test(version)) throw new Error(`Invalid stable version: ${version}`);
  const tarball = `${REGISTRY}pi-subagents/-/pi-subagents-${version}.tgz`;
  if (dist?.tarball !== tarball || !/^sha512-[A-Za-z0-9+/]{86}==$/.test(dist?.integrity ?? "")) {
    throw new Error(`Invalid registry distribution for ${version}`);
  }
  return { name: "pi-subagents", version, tarball, integrity: dist.integrity };
}

// No redirects, credentials, retries-as-success, or unbounded registry reads.
export async function fetchRegistryBytes(url, { fetchImpl = fetch, maxBytes = 32 * 1024 * 1024, timeoutMs = 30_000 } = {}) {
  const parsed = new URL(url);
  if (parsed.origin !== new URL(REGISTRY).origin || parsed.username || parsed.password || parsed.hash) {
    throw new Error("Only the HTTPS npm registry is allowed");
  }
  const response = await fetchImpl(url, { redirect: "error", signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw new Error(`Registry HTTP ${response.status}: ${url}`);
  if (!response.body) throw new Error("Registry response has no body");
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw new Error(`Registry response exceeds ${maxBytes} bytes`);
      chunks.push(Buffer.from(value));
    }
  } finally {
    await reader.cancel();
  }
  return Buffer.concat(chunks);
}

export function verifyIntegrity(bytes, integrity) {
  if (`sha512-${createHash("sha512").update(bytes).digest("base64")}` !== integrity) {
    throw new Error("Upstream tarball SHA-512 integrity mismatch");
  }
}

export function enumerateStableReleases(packument, pinned) {
  if (packument?.name !== "pi-subagents" || !packument.versions || typeof packument.versions !== "object" || Array.isArray(packument.versions)) {
    throw new Error("Invalid pi-subagents packument");
  }
  const baseline = packument.versions[pinned.version];
  if (!baseline) throw new Error(`Pinned upstream ${pinned.version} is missing from registry`);
  const current = validateDistribution(pinned.version, baseline.dist);
  if (current.integrity !== pinned.integrity || current.tarball !== pinned.tarball) {
    throw new Error("Pinned upstream registry distribution changed");
  }
  const candidates = [];
  const excludedVersions = [];
  for (const [version, entry] of Object.entries(packument.versions)) {
    const prerelease = version.split("+")[0].split("-").slice(1).join("-");
    const leadingZero = prerelease.split(".").some((id) => /^0\d+$/.test(id));
    if (!versionPattern.test(version) || leadingZero || entry?.version !== version || entry?.name !== "pi-subagents") {
      throw new Error(`Invalid registry version entry: ${version}`);
    }
    if (!stablePattern.test(version)) {
      excludedVersions.push(version);
      continue;
    }
    if (compareStable(version, pinned.version) > 0) {
      candidates.push({ ...validateDistribution(version, entry.dist), deprecated: entry.deprecated ?? null });
    }
  }
  candidates.sort((a, b) => compareStable(a.version, b.version));
  return {
    baseline: pinned.version,
    candidates,
    excludedVersions: excludedVersions.sort(),
    policy: "Read-only stable candidates after the reviewed baseline; no version selection, mutation, or publication. Every poll repeats all candidates until the reviewed baseline changes. Prerelease/build-metadata versions are listed separately.",
  };
}
