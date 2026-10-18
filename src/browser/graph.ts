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
  const occurrences = new Map<string, number>();
  return nodes.map((node) => {
    const occurrence = occurrences.get(node.id) ?? 0;
    occurrences.set(node.id, occurrence + 1);
    return { node, key: JSON.stringify([node.id, occurrence]) };
  });
}
