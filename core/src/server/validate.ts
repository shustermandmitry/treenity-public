// Write-Barrier — validates node components against their schemas before tree.set()
// Rejects writes with malformed data. AI agents get "compilation errors" instead of garbage in DB.

import { validateNode } from '#comp/validate';
import type { Tree } from '#tree';

export function withValidation(tree: Tree): Tree {
  return {
    ...tree,
    async set(node) {
      const errors = validateNode(node);
      if (errors.length) {
        const msg = errors.map(e => `${e.path}: ${e.message}`).join('; ');
        throw new Error(`Validation: ${msg}`);
      }
      return tree.set(node);
    },
    async patch(path, ops, ctx) {
      return tree.patch(path, ops, ctx);
    },
  };
}
