import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryTree } from '#tree';
import { withRefIndex } from './refs';

describe('withRefIndex', () => {
  it('extracts $ref fields into $refs', async () => {
    const tree = withRefIndex(createMemoryTree());
    await tree.set({
      $path: '/order/1',
      $type: 'cafe.order',
      customer: { $type: 'ref', $ref: '/customers/ivan' },
      items: [{ $type: 'ref', $ref: '/menu/latte' }],
    });

    const node = await tree.get('/order/1');
    assert.ok(node?.$refs);
    assert.equal(node.$refs.length, 2);
    assert.ok(node.$refs.some(r => r.t === '/customers/ivan' && r.f === '#customer'));
    assert.ok(node.$refs.some(r => r.t === '/menu/latte' && r.f === '#items.0'));
  });

  it('preserves standalone refs (no f:)', async () => {
    const tree = withRefIndex(createMemoryTree());
    await tree.set({
      $path: '/factory',
      $type: 'mfg.factory',
      $refs: [{ t: '/suppliers/bob', d: { $type: 'supplies', since: '2025-01' } }],
    });

    const node = await tree.get('/factory');
    assert.ok(node?.$refs);
    assert.equal(node.$refs.length, 1);
    assert.equal(node.$refs[0].t, '/suppliers/bob');
    assert.equal(node.$refs[0].d?.$type, 'supplies');
    assert.equal(node.$refs[0].f, undefined);
  });

  it('merges standalone + derived refs', async () => {
    const tree = withRefIndex(createMemoryTree());
    await tree.set({
      $path: '/order/2',
      $type: 'cafe.order',
      customer: { $type: 'ref', $ref: '/customers/ivan' },
      $refs: [{ t: '/promos/summer', d: { $type: 'applied-promo' } }],
    });

    const node = await tree.get('/order/2');
    assert.ok(node?.$refs);
    assert.equal(node.$refs.length, 2);
    // standalone first, then derived
    assert.equal(node.$refs[0].t, '/promos/summer');
    assert.equal(node.$refs[1].t, '/customers/ivan');
  });

  it('returns undefined $refs when no refs exist', async () => {
    const tree = withRefIndex(createMemoryTree());
    await tree.set({ $path: '/plain', $type: 'dir' });

    const node = await tree.get('/plain');
    assert.equal(node?.$refs, undefined);
  });

  it('scans nested component refs', async () => {
    const tree = withRefIndex(createMemoryTree());
    await tree.set({
      $path: '/node',
      $type: 'test',
      delivery: {
        $type: 'logistics.delivery',
        courier: { $type: 'ref', $ref: '/couriers/alex' },
        warehouse: { $type: 'ref', $ref: '/warehouses/main' },
      },
    });

    const node = await tree.get('/node');
    assert.ok(node?.$refs);
    assert.equal(node.$refs.length, 2);
    assert.ok(node.$refs.some(r => r.t === '/couriers/alex' && r.f === '#delivery.courier'));
    assert.ok(node.$refs.some(r => r.t === '/warehouses/main' && r.f === '#delivery.warehouse'));
  });
});
