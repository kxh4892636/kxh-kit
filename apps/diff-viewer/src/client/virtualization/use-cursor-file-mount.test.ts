import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useCursorFileMount } from "./use-cursor-file-mount";

describe("cursor 文件挂载编排", (): void => {
  it("同一 cursor 文件离窗后不重放 ensure", (): void => {
    const ensureFileMounted = vi.fn<(filePath: string) => void>();
    const { rerender } = renderHook(
      ({
        mounted,
        targetKey,
        targetPath,
      }: {
        mounted: boolean;
        targetKey: string;
        targetPath: string;
      }): void =>
        useCursorFileMount({
          target: { key: targetKey, filePath: targetPath },
          windowReady: true,
          mounted,
          ensureFileMounted,
        }),
      {
        initialProps: {
          mounted: false,
          targetKey: "1:src/old.ts:line-1",
          targetPath: "src/old.ts",
        },
      },
    );

    expect(ensureFileMounted).toHaveBeenCalledTimes(1);
    rerender({ mounted: true, targetKey: "1:src/old.ts:line-1", targetPath: "src/old.ts" });
    rerender({ mounted: false, targetKey: "1:src/old.ts:line-1", targetPath: "src/old.ts" });
    expect(ensureFileMounted).toHaveBeenCalledTimes(1);

    rerender({ mounted: false, targetKey: "1:src/old.ts:line-2", targetPath: "src/old.ts" });
    expect(ensureFileMounted).toHaveBeenCalledTimes(2);
    expect(ensureFileMounted).toHaveBeenLastCalledWith("src/old.ts");

    rerender({ mounted: false, targetKey: "1:src/new.ts:line-1", targetPath: "src/new.ts" });
    expect(ensureFileMounted).toHaveBeenCalledTimes(3);
    expect(ensureFileMounted).toHaveBeenLastCalledWith("src/new.ts");
  });

  it("等待文件窗口就绪后再执行首次 ensure", (): void => {
    const ensureFileMounted = vi.fn<(filePath: string) => void>();
    const target = { key: "1:src/late.ts", filePath: "src/late.ts" };
    const { rerender } = renderHook(
      ({ windowReady }: { windowReady: boolean }): void =>
        useCursorFileMount({
          target,
          windowReady,
          mounted: false,
          ensureFileMounted,
        }),
      { initialProps: { windowReady: false } },
    );

    expect(ensureFileMounted).not.toHaveBeenCalled();
    rerender({ windowReady: true });
    expect(ensureFileMounted).toHaveBeenCalledOnce();
  });
});
