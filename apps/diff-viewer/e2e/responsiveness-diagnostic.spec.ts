import { resolve } from "node:path";

import { expect, test } from "@playwright/test";

import { measureResponsiveness } from "./responsiveness-harness";

const appPath = resolve(__dirname, "..");

test("keeps every virtualization shape within the responsiveness budget", async (): Promise<void> => {
  test.setTimeout(240_000);
  const healthy = await measureResponsiveness(appPath, "healthy");
  const row = await measureResponsiveness(appPath, "row-virtualizer");
  const chunk = await measureResponsiveness(appPath, "chunk-virtualizer");
  const file = await measureResponsiveness(appPath, "file-virtualizer");
  const nested = await measureResponsiveness(appPath, "nested-virtualizers");

  console.log(`RESPONSIVENESS_DIAGNOSTIC=${JSON.stringify({ healthy, row, chunk, file, nested })}`);

  const samples = [healthy, row, chunk, file, nested];
  for (const sample of samples) {
    for (const [metric, value] of Object.entries(sample)) {
      if (typeof value !== "number") continue;
      expect(Number.isFinite(value), `${sample.shape}.${metric}`).toBe(true);
      expect(value, `${sample.shape}.${metric}`).toBeGreaterThanOrEqual(0);
    }
    expect(sample.fileCount).toBeGreaterThan(0);
    expect(sample.trustedWheelProfile.length).toBeGreaterThan(0);
    expect(sample.settleTimedOut, `${sample.shape}.settleTimedOut`).toBe(false);
    expect(sample.idleTaskRatio, `${sample.shape}.idleTaskRatio`).toBeLessThan(0.1);
    expect(sample.idleLongTasks, `${sample.shape}.idleLongTasks`).toBe(0);
    expect(sample.toggleResponseMs, `${sample.shape}.toggleResponseMs`).toBeLessThan(150);
    expect(sample.scrollLongestFrameMs, `${sample.shape}.scrollLongestFrameMs`).toBeLessThan(50);
    expect(sample.scrollLongTasks, `${sample.shape}.scrollLongTasks`).toBe(0);
  }

  for (const sample of [row, chunk, file, nested]) {
    expect(sample.burstSynchronousMs, `${sample.shape}.burstSynchronousMs`).toBeLessThan(
      Math.max(20, healthy.burstSynchronousMs * 10),
    );
    expect(sample.trustedWheelDispatchMs, `${sample.shape}.trustedWheelDispatchMs`).toBeLessThan(
      healthy.trustedWheelDispatchMs * 5,
    );
  }
});
