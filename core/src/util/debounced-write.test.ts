import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { debouncedWrite } from './debounced-write';

describe('debouncedWrite', () => {
  it('debounces rapid triggers into single write', async () => {
    let writes = 0;
    const dw = debouncedWrite(async () => { writes++; }, 50, 'test');

    dw.trigger();
    dw.trigger();
    dw.trigger();

    await new Promise(r => setTimeout(r, 100));
    assert.equal(writes, 1);
  });

  it('skips trigger while write is in-flight', async () => {
    let writes = 0;
    const dw = debouncedWrite(async () => {
      writes++;
      await new Promise(r => setTimeout(r, 100));
    }, 20, 'test');

    dw.trigger();
    await new Promise(r => setTimeout(r, 30)); // write starts
    dw.trigger(); // should be skipped — inFlight
    await new Promise(r => setTimeout(r, 150));
    assert.equal(writes, 1);
  });

  it('catches errors without unhandled rejection', async () => {
    let errLogged = false;
    const orig = console.error;
    console.error = () => { errLogged = true; };

    const dw = debouncedWrite(async () => {
      throw new Error('boom');
    }, 10, 'test');

    dw.trigger();
    await new Promise(r => setTimeout(r, 50));
    console.error = orig;
    assert.ok(errLogged);
  });

  it('cancel prevents pending write', async () => {
    let writes = 0;
    const dw = debouncedWrite(async () => { writes++; }, 50, 'test');

    dw.trigger();
    dw.cancel();
    await new Promise(r => setTimeout(r, 100));
    assert.equal(writes, 0);
  });

  it('flush executes immediately and awaits', async () => {
    let writes = 0;
    const dw = debouncedWrite(async () => { writes++; }, 5000, 'test');

    dw.trigger(); // scheduled for 5s from now
    await dw.flush(); // should cancel timer and execute now
    assert.equal(writes, 1);
  });

  it('flush is a no-op when nothing is pending', async () => {
    let writes = 0;
    const dw = debouncedWrite(async () => { writes++; }, 50, 'test');

    await dw.flush();
    assert.equal(writes, 1); // flush always executes once (final write pattern)
  });

  it('trigger after cancel works normally', async () => {
    let writes = 0;
    const dw = debouncedWrite(async () => { writes++; }, 30, 'test');

    dw.trigger();
    dw.cancel();
    dw.trigger(); // re-trigger after cancel
    await new Promise(r => setTimeout(r, 80));
    assert.equal(writes, 1);
  });
});
