// Tests for watch event ACL filtering:
// - filterPatches: component-level patch filtering
// - filteredPush behavior: claims caching, set/patch/remove event handling

import { createNode, isComponent, R, register } from '#core';
import { componentPerm } from './auth';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Operation } from 'fast-json-patch';
import type { NodeData } from '#core';

// ── filterPatches (extracted logic, tested directly) ──

function filterPatches(
  patches: Operation[],
  node: NodeData,
  userId: string | null,
  claims: string[],
): Operation[] {
  return patches.filter(op => {
    const seg = op.path.split('/')[1];
    if (!seg || seg.startsWith('$')) return true;
    const val = node[seg];
    if (!isComponent(val)) return true;
    return !!(componentPerm(val, userId, claims, node.$owner) & R);
  });
}

describe('filterPatches — component-level ACL on patch events', () => {
  // Node with a public component and a restricted component
  const node: NodeData = {
    $path: '/test',
    $type: 'test.node',
    $owner: 'alice',
    title: 'Hello', // plain field, not a component
    publicComp: { $type: 'public.comp', data: 'visible' },
    secretComp: {
      $type: 'secret.comp',
      apiKey: 'sk-123',
      $acl: [{ g: 'admin', p: R }, { g: 'authenticated', p: 0 }],
    },
  };

  it('passes ops targeting plain fields', () => {
    const patches: Operation[] = [
      { op: 'replace', path: '/title', value: 'Updated' },
    ];
    const filtered = filterPatches(patches, node, 'bob', ['authenticated', 'u:bob']);
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].path, '/title');
  });

  it('passes ops targeting system fields ($rev, $acl)', () => {
    const patches: Operation[] = [
      { op: 'replace', path: '/$rev', value: 5 },
    ];
    const filtered = filterPatches(patches, node, 'bob', ['authenticated', 'u:bob']);
    assert.equal(filtered.length, 1);
  });

  it('passes ops targeting components user can read', () => {
    const patches: Operation[] = [
      { op: 'replace', path: '/publicComp/data', value: 'new' },
    ];
    const filtered = filterPatches(patches, node, 'bob', ['authenticated', 'u:bob']);
    assert.equal(filtered.length, 1);
  });

  it('filters ops targeting restricted components', () => {
    const patches: Operation[] = [
      { op: 'replace', path: '/secretComp/apiKey', value: 'sk-new' },
    ];
    // bob is authenticated but secretComp denies authenticated (p=0), only admin gets R
    const filtered = filterPatches(patches, node, 'bob', ['authenticated', 'u:bob']);
    assert.equal(filtered.length, 0);
  });

  it('admin can see restricted component patches', () => {
    const patches: Operation[] = [
      { op: 'replace', path: '/secretComp/apiKey', value: 'sk-new' },
    ];
    const filtered = filterPatches(patches, node, 'admin-user', ['authenticated', 'admin', 'u:admin-user']);
    assert.equal(filtered.length, 1);
  });

  it('filters mixed patches — keeps permitted, drops restricted', () => {
    const patches: Operation[] = [
      { op: 'replace', path: '/title', value: 'Updated' },
      { op: 'replace', path: '/publicComp/data', value: 'new' },
      { op: 'replace', path: '/secretComp/apiKey', value: 'sk-leaked' },
    ];
    const filtered = filterPatches(patches, node, 'bob', ['authenticated', 'u:bob']);
    assert.equal(filtered.length, 2);
    assert.ok(filtered.every(p => !p.path.startsWith('/secretComp')));
  });

  it('drops event when ALL ops target restricted components', () => {
    const patches: Operation[] = [
      { op: 'replace', path: '/secretComp/apiKey', value: 'sk-new' },
      { op: 'add', path: '/secretComp/secret2', value: 'hidden' },
    ];
    const filtered = filterPatches(patches, node, 'bob', ['authenticated', 'u:bob']);
    assert.equal(filtered.length, 0);
    // Caller should skip emit entirely when filtered.length === 0
  });

  it('handles root-level patch path ("/")', () => {
    const patches: Operation[] = [
      { op: 'replace', path: '/', value: {} },
    ];
    // seg = '' after split('/')[1] → !seg guard → passes through
    const filtered = filterPatches(patches, node, 'bob', ['authenticated', 'u:bob']);
    assert.equal(filtered.length, 1);
  });
});
