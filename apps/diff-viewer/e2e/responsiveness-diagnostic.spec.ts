import { resolve } from "node:path";

import { expect, test } from "@playwright/test";

import { measureResponsiveness } from "./responsiveness-harness";

const appPath = resolve(__dirname, "..");

test("records responsiveness profiles for each virtualization shape", async (): Promise<void> => {
  test.setTimeout(240_000);
  const healthy = await measureResponsiveness(appPath, "healthy");
  const row = await measureResponsiveness(appPath, "row-virtualizer");
  const chunk = await measureResponsiveness(appPath, "chunk-virtualizer");
  const file = await measureResponsiveness(appPath, "file-virtualizer");
  const nested = await measureResponsiveness(appPath, "nested-virtualizers");

  console.log(`RESPONSIVENESS_DIAGNOSTIC=${JSON.stringify({ healthy, row, chunk, file, nested })}`);

  for (const sample of [healthy, row, chunk, file, nested]) {
    for (const [metric, value] of Object.entries(sample)) {
      if (typeof value !== "number") continue;
      expect(Number.isFinite(value), `${sample.shape}.${metric}`).toBe(true);
      expect(value, `${sample.shape}.${metric}`).toBeGreaterThanOrEqual(0);
    }
    expect(sample.fileCount).toBeGreaterThan(0);
    expect(sample.trustedWheelProfile.length).toBeGreaterThan(0);
  }
});
