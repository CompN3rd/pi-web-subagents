import type { AsyncNode } from "../protocol.js";

export interface GraphEntry {
  node: AsyncNode;
  key: string;
  path: string[];
  /** Only a unique top-level occurrence can identify a whole-run operation. */
  controlId?: string;
}

export function graphEntries(nodes: AsyncNode[], parent: string[] = []): GraphEntry[] {
  return graphOccurrences(nodes).flatMap(({ node, key }) => {
    const path = [...parent, key];
    return [{ node, key: JSON.stringify(path), path,
      ...(parent.length === 0 && nodes.filter((root) => root.id === node.id).length === 1
        ? { controlId: node.id } : {}),
    }, ...graphEntries(node.children ?? [], path)];
  });
}

export type RunFilter = { query: string; state: "all" | "active" | "attention" | "recent" };
export const noFilter: RunFilter = { query: "", state: "all" };
const activeStates = new Set(["running", "queued", "pending", "starting", "waiting"]);
const attentionStates = new Set(["failed", "rejected", "partial", "blocked", "paused", "stopped", "attention", "waiting-for-supervisor"]);
export function matchesRun(node: AsyncNode, filter: RunFilter): boolean {
  const query = filter.query.trim().toLocaleLowerCase();
  const text = [node.id, node.label, node.agent, node.model, node.thinking, node.state,
    node.progressText, node.activity?.state, node.activity?.currentTool].join(" ").toLocaleLowerCase();
  const active = activeStates.has(node.state);
  const attention = attentionStates.has(node.state) || attentionStates.has(String(node.activity?.state)) || node.hostStep?.stale === true;
  return (!query || text.includes(query)) && (filter.state === "all" ||
    (filter.state === "active" && active) || (filter.state === "attention" && attention) ||
    (filter.state === "recent" && !active));
}
export function branchMatches(node: AsyncNode, filter: RunFilter): boolean {
  return matchesRun(node, filter) || (node.children ?? []).some((child) => branchMatches(child, filter));
}

export function descendantCount(node: AsyncNode): number {
  return (node.children ?? []).reduce(
    (count, child) => count + 1 + descendantCount(child),
    0,
  );
}

/** Keys are local to a sibling list: duplicate reported IDs are not unique identities. */
export function graphOccurrences(
  nodes: AsyncNode[],
): { node: AsyncNode; key: string }[] {
  const groups = new Map<string, AsyncNode[]>();
  for (const node of nodes) {
    const group = groups.get(node.id);
    if (group) group.push(node);
    else groups.set(node.id, [node]);
  }
  const presentations = new Map<string, string>();
  for (const [id, group] of groups) {
    // Accepted snapshots are byte/depth bounded. Only ambiguous IDs need a
    // presentation signature: any group content/order change resets native
    // disclosure state rather than migrating it to another occurrence.
    if (group.length > 1) presentations.set(id, JSON.stringify(group));
  }
  const occurrences = new Map<string, number>();
  return nodes.map((node) => {
    const occurrence = occurrences.get(node.id) ?? 0;
    occurrences.set(node.id, occurrence + 1);
    const presentation = presentations.get(node.id);
    return {
      node,
      key: JSON.stringify(presentation === undefined
        ? [node.id, occurrence]
        : [node.id, occurrence, presentation]),
    };
  });
}
