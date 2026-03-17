// Debounced async writer — coalesces rapid triggers into periodic writes.
// Handles: debounce timing, inflight guard, try-catch, cleanup.
// Used by: agent/service, cs/service, metatron/service for streaming progress.

export function debouncedWrite(
  fn: () => Promise<void>,
  ms = 2000,
  label = 'debouncedWrite',
): { trigger(): void; flush(): Promise<void>; cancel(): void } {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let inFlight = false;

  async function execute() {
    timer = null;
    if (inFlight) return;
    inFlight = true;
    try {
      await fn();
    } catch (e) {
      console.error(`[${label}] write failed:`, e);
    } finally {
      inFlight = false;
    }
  }

  return {
    trigger() {
      if (timer || inFlight) return;
      timer = setTimeout(execute, ms);
    },

    async flush() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      if (!inFlight) await execute();
    },

    cancel() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    },
  };
}
