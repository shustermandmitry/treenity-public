import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { safeInterval, safeTimeout } from './safe-timers';

describe('safeInterval', () => {
  it('catches async errors without unhandled rejection', async () => {
    let errorLogged = false;
    const origError = console.error;
    console.error = () => { errorLogged = true; };

    const timer = safeInterval(async () => {
      throw new Error('boom');
    }, 10, 'test');

    await new Promise(r => setTimeout(r, 50));
    clearInterval(timer);
    console.error = origError;

    assert.ok(errorLogged, 'should have logged error');
  });

  it('runs fn normally when no error', async () => {
    let count = 0;
    const timer = safeInterval(async () => { count++; }, 10, 'test');
    await new Promise(r => setTimeout(r, 50));
    clearInterval(timer);
    assert.ok(count >= 2, `should have run multiple times, got ${count}`);
  });
});

describe('safeTimeout', () => {
  it('catches async errors without unhandled rejection', async () => {
    let errorLogged = false;
    const origError = console.error;
    console.error = () => { errorLogged = true; };

    safeTimeout(async () => { throw new Error('boom'); }, 10, 'test');
    await new Promise(r => setTimeout(r, 50));
    console.error = origError;

    assert.ok(errorLogged, 'should have logged error');
  });

  it('runs fn normally when no error', async () => {
    let ran = false;
    safeTimeout(async () => { ran = true; }, 10, 'test');
    await new Promise(r => setTimeout(r, 50));
    assert.ok(ran);
  });
});
