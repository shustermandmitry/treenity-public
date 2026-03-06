// Test fixture for extract-schemas.test.ts — provides Autostart class after monorepo split.
// The real Autostart moved to mods/autostart/ (outside core/src/), so tests use this stub.

export class Autostart {
  /** Start a service at given path */
  start(data: {
    /** service to start */
    path: string;
  }) {}

  stop(data: { path: string }) {}
}
