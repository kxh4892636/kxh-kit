import { act, render } from "@testing-library/react";
import { useRef, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useScrollVirtualizer } from "./use-scroll-virtualizer";
import { useRowWindow } from "./use-row-window";

interface VirtualizerMocks {
  measureElement: ReturnType<typeof vi.fn>;
  scrollToIndex: ReturnType<typeof vi.fn>;
}

const virtualizerMocks = vi.hoisted(
  (): VirtualizerMocks => ({
    measureElement: vi.fn(),
    scrollToIndex: vi.fn(),
  }),
);

vi.mock(
  "@tanstack/react-virtual",
  (): {
    useVirtualizer: () => {
      getTotalSize: () => number;
      getVirtualItems: () => [];
      measureElement: ReturnType<typeof vi.fn>;
      scrollToIndex: ReturnType<typeof vi.fn>;
    };
  } => ({
    useVirtualizer: () => ({
      getTotalSize: (): number => 0,
      getVirtualItems: (): [] => [],
      measureElement: virtualizerMocks.measureElement,
      scrollToIndex: virtualizerMocks.scrollToIndex,
    }),
  }),
);

let ensureItemMounted: ((itemIndex: number, elementId?: string) => void) | undefined;
let animationFrames: FrameRequestCallback[];

const Fixture = ({ navigationScope }: { navigationScope: string }): ReactNode => {
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const window = useScrollVirtualizer({
    itemCount: 100,
    estimateItemSize: (_itemIndex: number): number => 100,
    anchorRef,
    enabled: true,
    overscan: 2,
    navigationScope,
  });
  ensureItemMounted = window.ensureItemMounted;

  return (
    <main className="overflow-y-auto">
      <div ref={anchorRef} />
    </main>
  );
};

const RowFixture = ({ targetRowIndex }: { targetRowIndex?: number }): ReactNode => {
  const anchorRef = useRef<HTMLDivElement | null>(null);
  useRowWindow({
    rowCount: 1_000,
    estimateRowSize: (_rowIndex: number): number => 20,
    anchorRef,
    targetRowIndex,
    targetElementId: targetRowIndex === undefined ? undefined : `missing-row-${targetRowIndex}`,
  });

  return (
    <main className="overflow-y-auto">
      <div ref={anchorRef} />
    </main>
  );
};

const runNextAnimationFrame = (): void => {
  const callback = animationFrames.shift();
  if (callback) callback(performance.now());
};

describe("useScrollVirtualizer navigation lifecycle", (): void => {
  beforeEach((): void => {
    ensureItemMounted = undefined;
    animationFrames = [];
    virtualizerMocks.measureElement.mockReset();
    virtualizerMocks.scrollToIndex.mockReset();
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback): number => {
      animationFrames.push(callback);
      return animationFrames.length;
    });
  });

  afterEach((): void => {
    vi.unstubAllGlobals();
  });

  it("cancels pending mount retries when the item scope changes or unmounts", (): void => {
    const sharedFilePaths = "src/shared.ts\u0000src/other.ts";
    const view = render(
      <Fixture navigationScope={`repository-a:base-a:target-a\u0000${sharedFilePaths}`} />,
    );

    act((): void => ensureItemMounted?.(90, "missing-file-a"));
    expect(virtualizerMocks.scrollToIndex).toHaveBeenCalledTimes(1);

    view.rerender(
      <Fixture navigationScope={`repository-b:base-b:target-b\u0000${sharedFilePaths}`} />,
    );
    act(runNextAnimationFrame);
    expect(virtualizerMocks.scrollToIndex).toHaveBeenCalledTimes(1);

    act((): void => ensureItemMounted?.(80, "missing-file-b"));
    expect(virtualizerMocks.scrollToIndex).toHaveBeenCalledTimes(2);

    view.unmount();
    act(runNextAnimationFrame);
    expect(virtualizerMocks.scrollToIndex).toHaveBeenCalledTimes(2);
  });

  it("cancels a pending row mount retry when the cursor clears", (): void => {
    const view = render(<RowFixture targetRowIndex={90} />);
    const callsBeforeClear = virtualizerMocks.scrollToIndex.mock.calls.length;
    expect(callsBeforeClear).toBeGreaterThan(0);

    view.rerender(<RowFixture />);
    act(runNextAnimationFrame);

    expect(virtualizerMocks.scrollToIndex).toHaveBeenCalledTimes(callsBeforeClear);
  });
});
