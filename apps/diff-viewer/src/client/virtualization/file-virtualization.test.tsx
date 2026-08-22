import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getFileElementId } from "../utils/domUtils";

import { useFileWindow } from "./use-file-window";

const FILE_COUNT = 100;
const FILE_HEIGHT = 120;
const VIEWPORT_HEIGHT = 360;

const installLayoutMock = (): void => {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    const element = this as HTMLElement;
    const scrollContainer = element.tagName === "MAIN" ? element : element.closest("main");
    const height = element.tagName === "MAIN" ? VIEWPORT_HEIGHT : FILE_HEIGHT;
    const top = element.tagName === "MAIN" ? 0 : -(scrollContainer?.scrollTop ?? 0);
    return {
      x: 0,
      y: top,
      top,
      left: 0,
      right: 800,
      bottom: top + height,
      width: 800,
      height,
      toJSON: () => ({}),
    } as DOMRect;
  });
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
    configurable: true,
    get(this: HTMLElement): number {
      return this.tagName === "MAIN" ? VIEWPORT_HEIGHT : FILE_HEIGHT;
    },
  });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", {
    configurable: true,
    get(this: HTMLElement): number {
      return this.tagName === "MAIN" ? VIEWPORT_HEIGHT : 0;
    },
  });
  Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
    configurable: true,
    get(this: HTMLElement): number {
      if (this.tagName !== "MAIN") return 0;
      const measuredFiles = this.querySelectorAll('[data-file-window-item="true"]').length;
      const spacerHeight = Array.from(this.querySelectorAll<HTMLElement>('[aria-hidden="true"]'))
        .map((spacer) => Number.parseFloat(spacer.style.height))
        .filter(Number.isFinite)
        .reduce((total, height) => total + height, 0);
      return measuredFiles * FILE_HEIGHT + spacerHeight;
    },
  });
  vi.spyOn(HTMLElement.prototype, "scrollTo").mockImplementation(function (
    this: HTMLElement,
    options?: ScrollToOptions | number,
    y?: number,
  ): void {
    this.scrollTop = typeof options === "number" ? (y ?? 0) : (options?.top ?? 0);
  });
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe = (): void => {};
      unobserve = (): void => {};
      disconnect = (): void => {};
    },
  );
};

const FileWindowFixture = (): React.ReactNode => {
  const anchorRef = useRef<HTMLDivElement>(null);
  const filePaths = Array.from({ length: FILE_COUNT }, (_, index) => `src/file-${index}.ts`);
  const fileWindow = useFileWindow({ filePaths, anchorRef });

  return (
    <main className="overflow-y-auto">
      <button type="button" onClick={() => fileWindow.ensureFileMounted(filePaths[90]!)}>
        跳到靠后文件
      </button>
      <div ref={anchorRef}>
        {fileWindow.paddingTop > 0 && (
          <div aria-hidden="true" style={{ height: fileWindow.paddingTop }} />
        )}
        {fileWindow.fileIndexes.map((fileIndex) => {
          const filePath = filePaths[fileIndex]!;
          return (
            <section
              key={filePath}
              id={getFileElementId(filePath)}
              data-file-window-item="true"
              data-index={fileIndex}
              ref={fileWindow.measureFile}
            >
              {filePath}
            </section>
          );
        })}
        {fileWindow.paddingBottom > 0 && (
          <div aria-hidden="true" style={{ height: fileWindow.paddingBottom }} />
        )}
      </div>
    </main>
  );
};

describe("文件级虚拟列表", () => {
  beforeEach(installLayoutMock);
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("滚动到底部后卸载远离视口的文件块", async () => {
    const { container } = render(<FileWindowFixture />);
    const scrollContainer = container.querySelector("main")!;

    await waitFor(() => {
      expect(container.querySelector('[data-index="0"]')).not.toBeNull();
    });
    expect(container.querySelectorAll('[data-file-window-item="true"]').length).toBeLessThan(15);

    scrollContainer.scrollTop = FILE_COUNT * 600 - VIEWPORT_HEIGHT;
    fireEvent.scroll(scrollContainer);

    await waitFor(() => {
      expect(container.querySelector(`[data-index="${FILE_COUNT - 1}"]`)).not.toBeNull();
    });
    expect(container.querySelector('[data-index="0"]')).toBeNull();
    expect(container.querySelectorAll('[data-file-window-item="true"]').length).toBeLessThan(15);
  });

  it("导航会先挂载靠后文件再按 DOM id 定位", async () => {
    const { container } = render(<FileWindowFixture />);
    const scrollContainer = container.querySelector("main")!;
    await waitFor(() => {
      expect(container.querySelector('[data-index="0"]')).not.toBeNull();
    });

    fireEvent.click(screen.getByRole("button", { name: "跳到靠后文件" }));
    await waitFor(() => {
      expect(scrollContainer.scrollTop).toBeGreaterThan(0);
    });
    fireEvent.scroll(scrollContainer);

    await waitFor(() => {
      expect(container.querySelector('[data-index="90"]')).not.toBeNull();
    });
    expect(container.querySelector('[data-index="0"]')).toBeNull();
  });
});
