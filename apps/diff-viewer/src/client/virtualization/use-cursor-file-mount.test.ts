import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useCursorFileMount } from "./use-cursor-file-mount";

describe("cursor 文件挂载编排", () => {
  it("同一 cursor 文件离窗后不重放 ensure", () => {
    const ensureFileMounted = vi.fn();
    const { rerender } = renderHook(
      ({ mounted, targetPath }: { mounted: boolean; targetPath: string }) =>
        useCursorFileMount({
          target: { key: `1:${targetPath}`, filePath: targetPath },
          windowReady: true,
          mounted,
          ensureFileMounted,
        }),
      { initialProps: { mounted: false, targetPath: "src/old.ts" } },
    );

    expect(ensureFileMounted).toHaveBeenCalledTimes(1);
    rerender({ mounted: true, targetPath: "src/old.ts" });
    rerender({ mounted: false, targetPath: "src/old.ts" });
    expect(ensureFileMounted).toHaveBeenCalledTimes(1);

    rerender({ mounted: false, targetPath: "src/new.ts" });
    expect(ensureFileMounted).toHaveBeenCalledTimes(2);
    expect(ensureFileMounted).toHaveBeenLastCalledWith("src/new.ts");
  });

  it("等待文件窗口就绪后再执行首次 ensure", () => {
    const ensureFileMounted = vi.fn();
    const target = { key: "1:src/late.ts", filePath: "src/late.ts" };
    const { rerender } = renderHook(
      ({ windowReady }: { windowReady: boolean }) =>
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
