// Optimistic prediction tests — predictOptimistic updates cache for sync methods

import { registerType } from '@treenity/core/comp';
import assert from 'node:assert';
import { beforeEach, describe, it } from 'node:test';
import * as cache from './cache';
import { predictOptimistic } from './hooks';

class Counter {
  count = 0;

  increment() {
    this.count++;
  }

  setCount(data: { count: number }) {
    this.count = data.count;
  }

  async asyncAction() {
    // Simulates server-only async method
    await Promise.resolve();
    this.count = 999;
  }

  broken() {
    throw new Error('intentional failure');
  }
}

registerType('test.counter', Counter);

describe('predictOptimistic', () => {
  beforeEach(() => {
    cache.clear();
  });

  it('sync method updates cache immediately', () => {
    cache.put({ $path: '/c', $type: 'test.counter', count: 5 } as any);

    predictOptimistic('/c', Counter, undefined, Counter.prototype.increment, undefined);

    const node = cache.get('/c');
    assert.strictEqual((node as any).count, 6);
  });

  it('sync method with data updates cache', () => {
    cache.put({ $path: '/c', $type: 'test.counter', count: 0 } as any);

    predictOptimistic('/c', Counter, undefined, Counter.prototype.setCount, { count: 42 });

    const node = cache.get('/c');
    assert.strictEqual((node as any).count, 42);
  });

  it('does not mutate original cached node', () => {
    cache.put({ $path: '/c', $type: 'test.counter', count: 10 } as any);
    const before = cache.get('/c');

    predictOptimistic('/c', Counter, undefined, Counter.prototype.increment, undefined);

    const after = cache.get('/c');
    assert.notStrictEqual(before, after);
  });

  it('skips async methods', () => {
    cache.put({ $path: '/c', $type: 'test.counter', count: 0 } as any);

    predictOptimistic('/c', Counter, undefined, Counter.prototype.asyncAction, undefined);

    const node = cache.get('/c');
    assert.strictEqual((node as any).count, 0);
  });

  it('skips when path not in cache', () => {
    predictOptimistic('/missing', Counter, undefined, Counter.prototype.increment, undefined);

    assert.strictEqual(cache.get('/missing'), undefined);
  });

  it('swallows method errors without updating cache', () => {
    cache.put({ $path: '/c', $type: 'test.counter', count: 5 } as any);

    predictOptimistic('/c', Counter, undefined, Counter.prototype.broken, undefined);

    const node = cache.get('/c');
    assert.strictEqual((node as any).count, 5);
  });

  it('skips when component type not found on node', () => {
    cache.put({ $path: '/c', $type: 'unknown.type', count: 5 } as any);

    predictOptimistic('/c', Counter, undefined, Counter.prototype.increment, undefined);

    const node = cache.get('/c');
    assert.strictEqual((node as any).count, 5);
  });

  it('works with named component key', () => {
    cache.put({
      $path: '/n',
      $type: 'dir',
      stats: { $type: 'test.counter', count: 3 },
    } as any);

    predictOptimistic('/n', Counter, 'stats', Counter.prototype.increment, undefined);

    const node = cache.get('/n') as any;
    assert.strictEqual(node.stats.count, 4);
  });
});
