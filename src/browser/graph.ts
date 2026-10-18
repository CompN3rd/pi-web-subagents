import type { AsyncNode } from "../protocol.js";

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
