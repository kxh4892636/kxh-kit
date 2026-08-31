import { promises as fs } from "node:fs";
import { join } from "node:path";

import {
  expect,
  _electron as electron,
  type CDPSession,
  type ElectronApplication,
  type Page,
} from "@playwright/test";

import { createFixtureRepo, runFixtureGit, type FixtureRepo } from "../src/main/fixture-repo";

import { createIsolatedUserData } from "./isolated-user-data";

export type ResponsivenessShape =
  | "healthy"
  | "row-virtualizer"
  | "chunk-virtualizer"
  | "file-virtualizer"
  | "nested-virtualizers";

export interface ResponsivenessSample {
  shape: ResponsivenessShape;
  fileCount: number;
  linesPerFile: number;
  firstVisibleMs: number;
  settleAfterVisibleMs: number;
  settlePeakTaskRatio: number;
  settleTimedOut: boolean;
  idleTaskMs: number;
  idleTaskRatio: number;
  idleLayouts: number;
  idleStyleRecalculations: number;
  idleLongTasks: number;
  idleLongestTaskMs: number;
  toggleResponseMs: number;
  scrollDurationMs: number;
  scrollLongestFrameMs: number;
  scrollTaskMs: number;
  scrollLongTasks: number;
  scrollLongestTaskMs: number;
  burstSynchronousMs: number;
  burstSettledMs: number;
  burstTaskMs: number;
  trustedWheelDispatchMs: number;
  trustedWheelSettledMs: number;
  trustedWheelTaskMs: number;
  trustedWheelProfile: ProfileHotspot[];
}

export interface ProfileHotspot {
  functionName: string;
  url: string;
  samples: number;
}

interface ShapedFixture extends FixtureRepo {
  fileCount: number;
  linesPerFile: number;
}

interface BrowserWorkSample {
  longTasks: number[];
}

interface CpuProfile {
  nodes: Array<{
    id: number;
    callFrame: { functionName: string; url: string };
  }>;
  samples?: number[];
}

interface SettleSample {
  durationMs: number;
  peakTaskRatio: number;
  timedOut: boolean;
}

interface TrustedWheelProfileSample {
  dispatchMs: number;
  settledMs: number;
  taskMs: number;
  profile: ProfileHotspot[];
}

const createLines = (count: number, version: string): string =>
  Array.from(
    { length: count },
    (_value: unknown, index: number): string => `${version} line ${index}`,
  ).join("\n") + "\n";

const createFixtureContent = (
  shape: ResponsivenessShape,
  count: number,
  version: "before" | "after",
): string => {
  if (shape !== "chunk-virtualizer") return createLines(count, version);
  return (
    Array.from({ length: count }, (_value: unknown, index: number): string => {
      if (version === "after" && index % 20 === 0) return `changed line ${index}`;
      return `stable line ${index}`;
    }).join("\n") + "\n"
  );
};

export const createResponsivenessFixture = async (
  shape: ResponsivenessShape,
): Promise<ShapedFixture> => {
  const fixture = await createFixtureRepo();
  try {
    const fileCount = shape === "file-virtualizer" ? 100 : shape === "nested-virtualizers" ? 12 : 1;
    const linesPerFile =
      shape === "row-virtualizer" ||
      shape === "chunk-virtualizer" ||
      shape === "nested-virtualizers"
        ? 1_000
        : 20;
    const directory = join(fixture.repoPath, "performance");
    await fs.mkdir(directory);

    await Promise.all(
      Array.from(
        { length: fileCount },
        (_value: unknown, index: number): Promise<void> =>
          fs.writeFile(
            join(directory, `file-${index}.txt`),
            createFixtureContent(shape, linesPerFile, "before"),
          ),
      ),
    );
    runFixtureGit(fixture.repoPath, ["add", "performance"]);
    runFixtureGit(fixture.repoPath, ["commit", "-m", `add ${shape} performance fixture`]);
    await Promise.all(
      Array.from(
        { length: fileCount },
        (_value: unknown, index: number): Promise<void> =>
          fs.writeFile(
            join(directory, `file-${index}.txt`),
            createFixtureContent(shape, linesPerFile, "after"),
          ),
      ),
    );

    return { ...fixture, fileCount, linesPerFile };
  } catch (error) {
    try {
      await fixture.cleanup();
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], "Responsiveness fixture setup failed");
    }
    throw error;
  }
};

const readPerformanceMetrics = async (session: CDPSession): Promise<Record<string, number>> => {
  const response = await session.send("Performance.getMetrics");
  return Object.fromEntries(
    response.metrics.map(({ name, value }: { name: string; value: number }): [string, number] => [
      name,
      value,
    ]),
  );
};

const metricDelta = (
  before: Record<string, number>,
  after: Record<string, number>,
  name: string,
): number => {
  const beforeValue = before[name];
  const afterValue = after[name];
  if (beforeValue === undefined || afterValue === undefined) {
    throw new Error(`CDP metric ${name} was not available`);
  }
  return afterValue - beforeValue;
};

const measureUntilSettled = async (session: CDPSession, page: Page): Promise<SettleSample> => {
  const intervalMs = 250;
  const maximumDurationMs = 5_000;
  const requiredQuietIntervals = 3;
  const maximumQuietTaskRatio = 0.1;
  const startedAt = performance.now();
  let previous = await readPerformanceMetrics(session);
  let quietIntervals = 0;
  let peakTaskRatio = 0;

  while (performance.now() - startedAt < maximumDurationMs) {
    await page.waitForTimeout(intervalMs);
    const current = await readPerformanceMetrics(session);
    const taskRatio = (metricDelta(previous, current, "TaskDuration") * 1_000) / intervalMs;
    peakTaskRatio = Math.max(peakTaskRatio, taskRatio);
    quietIntervals = taskRatio < maximumQuietTaskRatio ? quietIntervals + 1 : 0;
    if (quietIntervals >= requiredQuietIntervals) {
      return { durationMs: performance.now() - startedAt, peakTaskRatio, timedOut: false };
    }
    previous = current;
  }

  return { durationMs: performance.now() - startedAt, peakTaskRatio, timedOut: true };
};

const sampleBrowserWork = async (page: Page, durationMs: number): Promise<BrowserWorkSample> =>
  page.evaluate(
    ({ duration }: { duration: number }): Promise<BrowserWorkSample> =>
      new Promise((resolve: (value: BrowserWorkSample) => void): void => {
        const longTasks: number[] = [];
        const observer = new PerformanceObserver((list: PerformanceObserverEntryList): void => {
          for (const entry of list.getEntries()) longTasks.push(entry.duration);
        });
        observer.observe({ entryTypes: ["longtask"] });
        window.setTimeout((): void => {
          observer.disconnect();
          resolve({ longTasks });
        }, duration);
      }),
    { duration: durationMs },
  );

const measureToggleResponse = async (page: Page): Promise<number> => {
  const unifiedButton = page.getByRole("button", { name: "Unified" });
  const splitButton = page.getByRole("button", { name: "Split" });
  const startedAt = performance.now();
  await unifiedButton.click();
  await expect(unifiedButton).toHaveClass(/bg-github-bg-primary/);
  const duration = performance.now() - startedAt;
  await splitButton.click();
  await expect(splitButton).toHaveClass(/bg-github-bg-primary/);
  return duration;
};

const measureScrollResponse = async (
  page: Page,
): Promise<{ durationMs: number; longestFrameMs: number; longTasks: number[] }> =>
  page.evaluate(
    (): Promise<{ durationMs: number; longestFrameMs: number; longTasks: number[] }> => {
      const container = document.querySelector<HTMLElement>("main.overflow-y-auto");
      if (!container) throw new Error("Diff scroll container was not found");
      return new Promise(
        (
          resolve: (value: {
            durationMs: number;
            longestFrameMs: number;
            longTasks: number[];
          }) => void,
        ): void => {
          const frameDurations: number[] = [];
          const longTasks: number[] = [];
          const observer = new PerformanceObserver((list: PerformanceObserverEntryList): void => {
            for (const entry of list.getEntries()) longTasks.push(entry.duration);
          });
          observer.observe({ entryTypes: ["longtask"] });
          let previous = performance.now();
          let remaining = 20;
          const scrollFrame = (now: number): void => {
            frameDurations.push(now - previous);
            previous = now;
            container.scrollTop += Math.max(80, container.clientHeight / 3);
            remaining -= 1;
            if (remaining > 0) {
              requestAnimationFrame(scrollFrame);
              return;
            }
            requestAnimationFrame((settledAt): void => {
              frameDurations.push(settledAt - previous);
              window.setTimeout((): void => {
                for (const entry of observer.takeRecords()) longTasks.push(entry.duration);
                observer.disconnect();
                resolve({
                  durationMs: frameDurations.reduce(
                    (total: number, duration: number): number => total + duration,
                    0,
                  ),
                  longestFrameMs: Math.max(...frameDurations),
                  longTasks,
                });
              }, 0);
            });
          };
          requestAnimationFrame(scrollFrame);
        },
      );
    },
  );

const measureScrollBurst = async (
  page: Page,
): Promise<{ synchronousMs: number; settledMs: number }> =>
  page.evaluate((): Promise<{ synchronousMs: number; settledMs: number }> => {
    const container = document.querySelector<HTMLElement>("main.overflow-y-auto");
    if (!container) throw new Error("Diff scroll container was not found");
    const startedAt = performance.now();
    const maximum = Math.max(1, container.scrollHeight - container.clientHeight);
    for (let index = 0; index < 24; index += 1) {
      container.scrollTop = index % 2 === 0 ? maximum * 0.2 : maximum * 0.8;
      container.dispatchEvent(new Event("scroll"));
    }
    const synchronousMs = performance.now() - startedAt;
    return new Promise(
      (resolve: (value: { synchronousMs: number; settledMs: number }) => void): void => {
        requestAnimationFrame((): void => {
          requestAnimationFrame((): void => {
            window.setTimeout(
              (): void => resolve({ synchronousMs, settledMs: performance.now() - startedAt }),
              0,
            );
          });
        });
      },
    );
  });

const measureTrustedWheelBurst = async (
  page: Page,
): Promise<{ dispatchMs: number; settledMs: number }> => {
  const container = page.locator("main.overflow-y-auto");
  const bounds = await container.boundingBox();
  if (!bounds) throw new Error("Diff scroll container bounds were not available");
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  const startedAt = performance.now();
  for (let index = 0; index < 12; index += 1) {
    await page.mouse.wheel(0, index % 2 === 0 ? 600 : -600);
  }
  const dispatchMs = performance.now() - startedAt;
  await page.evaluate(
    (): Promise<void> =>
      new Promise((resolve: () => void): void => {
        requestAnimationFrame((): void => {
          requestAnimationFrame((): void => resolve());
        });
      }),
  );
  return { dispatchMs, settledMs: performance.now() - startedAt };
};

const summarizeProfile = (profile: CpuProfile): ProfileHotspot[] => {
  const nodes = new Map<number, { callFrame: { functionName: string; url: string } }>(
    profile.nodes.map(
      (node: {
        id: number;
        callFrame: { functionName: string; url: string };
      }): [number, { callFrame: { functionName: string; url: string } }] => [node.id, node],
    ),
  );
  const sampleCounts = new Map<number, number>();
  for (const nodeId of profile.samples ?? []) {
    sampleCounts.set(nodeId, (sampleCounts.get(nodeId) ?? 0) + 1);
  }
  return [...sampleCounts.entries()]
    .map(([nodeId, samples]: [number, number]): ProfileHotspot => {
      const frame = nodes.get(nodeId)?.callFrame;
      return {
        functionName: frame?.functionName || "(anonymous)",
        url: frame?.url || "",
        samples,
      };
    })
    .sort((left: ProfileHotspot, right: ProfileHotspot): number => right.samples - left.samples)
    .slice(0, 12);
};

const profileTrustedWheelBurst = async (
  session: CDPSession,
  page: Page,
): Promise<TrustedWheelProfileSample> => {
  let profilerEnabled = false;
  let profilerStarted = false;
  let sample: TrustedWheelProfileSample | undefined;
  let operationError: unknown;
  try {
    await session.send("Profiler.enable");
    profilerEnabled = true;
    await session.send("Profiler.start");
    profilerStarted = true;
    const before = await readPerformanceMetrics(session);
    const wheel = await measureTrustedWheelBurst(page);
    const after = await readPerformanceMetrics(session);
    const result = await session.send("Profiler.stop");
    profilerStarted = false;
    sample = {
      dispatchMs: wheel.dispatchMs,
      settledMs: wheel.settledMs,
      taskMs: metricDelta(before, after, "TaskDuration") * 1_000,
      profile: summarizeProfile(result.profile),
    };
  } catch (error) {
    operationError = error;
  }

  const failures = [
    ...(operationError === undefined ? [] : [operationError]),
    ...(await collectCleanupFailures([
      profilerStarted ? session.send("Profiler.stop") : undefined,
    ])),
    ...(await collectCleanupFailures([
      profilerEnabled ? session.send("Profiler.disable") : undefined,
    ])),
  ];
  if (failures.length > 0) throw new AggregateError(failures, "Wheel profiling failed");
  if (!sample) throw new Error("Wheel profiling produced no sample");
  return sample;
};

const collectCleanupFailures = async (
  operations: Array<Promise<unknown> | undefined>,
): Promise<unknown[]> => {
  const outcomes = await Promise.allSettled(
    operations.filter(
      (operation: Promise<unknown> | undefined): operation is Promise<unknown> =>
        operation !== undefined,
    ),
  );
  return outcomes.flatMap((outcome: PromiseSettledResult<unknown>): unknown[] =>
    outcome.status === "rejected" ? [outcome.reason] : [],
  );
};

export const measureResponsiveness = async (
  appPath: string,
  shape: ResponsivenessShape,
): Promise<ResponsivenessSample> => {
  let fixture: ShapedFixture | undefined;
  let userData: Awaited<ReturnType<typeof createIsolatedUserData>> | undefined;
  let app: ElectronApplication | undefined;
  let session: CDPSession | undefined;
  let sample: ResponsivenessSample | undefined;
  let operationFailed = false;
  let operationError: unknown;
  try {
    fixture = await createResponsivenessFixture(shape);
    userData = await createIsolatedUserData();
    const launchedAt = performance.now();
    app = await electron.launch({ args: [appPath, fixture.repoPath], env: userData.env });
    const page = await app.firstWindow();
    await expect(page.getByText(`Files changed (${fixture.fileCount})`)).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.locator('[data-file-path="performance/file-0.txt"]')).toBeVisible();
    const firstVisibleMs = performance.now() - launchedAt;
    session = await page.context().newCDPSession(page);
    await session.send("Performance.enable");

    const settle = await measureUntilSettled(session, page);
    const idleBefore = await readPerformanceMetrics(session);
    const idleDurationMs = 2_000;
    const browserWork = await sampleBrowserWork(page, idleDurationMs);
    const idleAfter = await readPerformanceMetrics(session);
    const idleTaskMs = metricDelta(idleBefore, idleAfter, "TaskDuration") * 1_000;

    const toggleResponseMs = await measureToggleResponse(page);
    const scrollBefore = await readPerformanceMetrics(session);
    const scroll = await measureScrollResponse(page);
    const scrollAfter = await readPerformanceMetrics(session);
    const burstBefore = await readPerformanceMetrics(session);
    const burst = await measureScrollBurst(page);
    const burstAfter = await readPerformanceMetrics(session);
    const trustedWheel = await profileTrustedWheelBurst(session, page);

    sample = {
      shape,
      fileCount: fixture.fileCount,
      linesPerFile: fixture.linesPerFile,
      firstVisibleMs,
      settleAfterVisibleMs: settle.durationMs,
      settlePeakTaskRatio: settle.peakTaskRatio,
      settleTimedOut: settle.timedOut,
      idleTaskMs,
      idleTaskRatio: idleTaskMs / idleDurationMs,
      idleLayouts: metricDelta(idleBefore, idleAfter, "LayoutCount"),
      idleStyleRecalculations: metricDelta(idleBefore, idleAfter, "RecalcStyleCount"),
      idleLongTasks: browserWork.longTasks.length,
      idleLongestTaskMs: Math.max(0, ...browserWork.longTasks),
      toggleResponseMs,
      scrollDurationMs: scroll.durationMs,
      scrollLongestFrameMs: scroll.longestFrameMs,
      scrollTaskMs: metricDelta(scrollBefore, scrollAfter, "TaskDuration") * 1_000,
      scrollLongTasks: scroll.longTasks.length,
      scrollLongestTaskMs: Math.max(0, ...scroll.longTasks),
      burstSynchronousMs: burst.synchronousMs,
      burstSettledMs: burst.settledMs,
      burstTaskMs: metricDelta(burstBefore, burstAfter, "TaskDuration") * 1_000,
      trustedWheelDispatchMs: trustedWheel.dispatchMs,
      trustedWheelSettledMs: trustedWheel.settledMs,
      trustedWheelTaskMs: trustedWheel.taskMs,
      trustedWheelProfile: trustedWheel.profile,
    };
  } catch (error) {
    operationFailed = true;
    operationError = error;
  }

  const failures = [
    ...(operationFailed ? [operationError] : []),
    ...(await collectCleanupFailures([session?.detach()])),
    ...(await collectCleanupFailures([app?.close()])),
    ...(await collectCleanupFailures([fixture?.cleanup(), userData?.cleanup()])),
  ];
  if (failures.length > 0) throw new AggregateError(failures, "Responsiveness measurement failed");
  if (!sample) throw new Error("Responsiveness measurement produced no sample");
  return sample;
};
