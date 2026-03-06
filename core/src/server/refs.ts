// withRefIndex — store combinator that auto-populates $refs on set()
// Scans node fields for { $ref } entries, builds $refs array.
// Standalone refs (no f:) pass through untouched.

import { isRef, type NodeData, type RefEntry } from '#core';
import type { Tree } from '#tree';

/** Deep-scan node for $ref fields, return derived RefEntries */
function extractRefs(node: NodeData): RefEntry[] {
  const refs: RefEntry[] = [];

  function scan(obj: unknown, prefix: string) {
    if (!obj || typeof obj !== 'object') return;
    if (isRef(obj)) {
      refs.push({ t: obj.$ref, f: prefix || undefined });
      return;
    }
    if (Array.isArray(obj)) {
      for (let i = 0; i < obj.length; i++) scan(obj[i], `${prefix}.${i}`);
      return;
    }
    for (const [k, v] of Object.entries(obj)) {
      if (k.startsWith('$')) continue;
      const path = prefix ? `${prefix}.${k}` : `#${k}`;
      scan(v, path);
    }
  }

  for (const [k, v] of Object.entries(node)) {
    if (k.startsWith('$')) continue;
    scan(v, `#${k}`);
  }

  return refs;
}

/** Merge derived refs with standalone refs (those without f:) */
function buildRefs(node: NodeData): RefEntry[] | undefined {
  const derived = extractRefs(node);
  const standalone = node.$refs?.filter(r => !r.f) ?? [];
  const merged = [...standalone, ...derived];
  return merged.length ? merged : undefined;
}

export function withRefIndex(inner: Tree): Tree {
  return {
    ...inner,

    async set(node, ctx) {
      node.$refs = buildRefs(node);
      return inner.set(node, ctx);
    },

    async patch(path, ops, ctx) {
      await inner.patch(path, ops, ctx);
      // Re-extract refs after patch
      const updated = await inner.get(path, ctx);
      if (updated) {
        updated.$refs = buildRefs(updated);
        await inner.set(updated, ctx);
      }
    },
  };
}
