import { describe, expect, it } from "vitest";
import { terminateWorker } from "../../src/features/export/export-worker";

// The export-worker module instantiates `new Worker(...)` at first use.
// In jsdom, `Worker` is undefined, so we cannot exercise the full
// startExport flow here. Instead we verify the externally observable
// pieces: terminateWorker is safe to call when no worker exists, and
// calling it multiple times does not throw.

describe("export-worker singleton", () => {
  it("terminateWorker is idempotent when no worker exists", () => {
    terminateWorker();
    terminateWorker();
    expect(() => terminateWorker()).not.toThrow();
  });

  it("terminateWorker does not throw on a fresh module import", () => {
    // Importing the module should NOT have spawned a worker (it's lazy).
    expect(typeof terminateWorker).toBe("function");
    expect(() => terminateWorker()).not.toThrow();
  });
});