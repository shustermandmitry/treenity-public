// Safe timer wrappers — catch async errors to prevent unhandled rejection storms

/**
 * setInterval wrapper that catches async callback errors.
 * Logs failures with label instead of crashing the process.
 */
export function safeInterval(
  fn: () => Promise<void>,
  ms: number,
  label: string,
): ReturnType<typeof setInterval> {
  return setInterval(async () => {
    try {
      await fn();
    } catch (e) {
      console.error(`[${label}] periodic task failed:`, e);
    }
  }, ms);
}

/**
 * setTimeout wrapper that catches async callback errors.
 */
export function safeTimeout(
  fn: () => Promise<void>,
  ms: number,
  label: string,
): ReturnType<typeof setTimeout> {
  return setTimeout(async () => {
    try {
      await fn();
    } catch (e) {
      console.error(`[${label}] deferred task failed:`, e);
    }
  }, ms);
}
