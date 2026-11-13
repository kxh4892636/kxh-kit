// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import type { NotesSnapshot } from "../contract.js";
import { NotesDock } from "./notes-dock.js";

const { fetchNotes } = vi.hoisted(() => ({ fetchNotes: vi.fn() }));

vi.mock("./host-api.js", () => ({ fetchNanoFlowNotes: fetchNotes }));

const snapshot: NotesSnapshot = {
  planName: "2026-11-08-演示",
  planPath: ".agents/domains/dsh/plans/active/2026-11-08-演示",
  notes: [
    { name: "001-进行中", status: "in_progress", description: "进行中的概述" },
    { name: "002-阻塞", status: "blocked", description: "阻塞的概述" },
    { name: "003-待处理", status: "pending", description: "待处理的概述" },
  ],
};

const useProjectionOf =
  (values: Record<string, unknown>) =>
  (key: string): unknown =>
    values[key];

const props = (preset: string): Record<string, unknown> => ({
  sessionId: "session-1",
  useProjection: useProjectionOf({ agentPreset: preset }),
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe("NotesDock", () => {
  it("renders nothing without slot props", () => {
    const { container } = render(createElement(NotesDock, {}));
    expect(container.firstChild).toBeNull();
    expect(fetchNotes).not.toHaveBeenCalled();
  });

  it("does not fetch outside the nano-flow preset", async () => {
    const { container } = render(createElement(NotesDock, props("default")));
    expect(container.firstChild).toBeNull();
    await Promise.resolve();
    expect(fetchNotes).not.toHaveBeenCalled();
  });

  it("renders nothing when the host returns no snapshot", async () => {
    fetchNotes.mockResolvedValue(null);
    render(createElement(NotesDock, props("nano-flow")));
    await waitFor(() => expect(fetchNotes).toHaveBeenCalled());
    expect(screen.queryByTestId("nano-flow-notes-panel")).toBeNull();
  });

  it("lists every unfinished note with the per-status counts", async () => {
    fetchNotes.mockResolvedValue(snapshot);
    render(createElement(NotesDock, props("nano-flow")));
    expect(await screen.findByTestId("nano-flow-notes-panel")).toBeDefined();
    for (const note of snapshot.notes) expect(screen.getByText(note.name)).toBeDefined();
    expect(screen.getByText("1 进行中 · 1 阻塞 · 1 待处理")).toBeDefined();
  });

  it("labels each row with the Chinese status name", async () => {
    fetchNotes.mockResolvedValue(snapshot);
    render(createElement(NotesDock, props("nano-flow")));
    await screen.findByTestId("nano-flow-notes-panel");
    expect(screen.getByText("阻塞")).toBeDefined();
    expect(screen.getByText("待处理")).toBeDefined();
  });

  it("shows description, reason and next step in the row tooltip", async () => {
    fetchNotes.mockResolvedValue({
      ...snapshot,
      notes: [
        {
          name: "001-进行中",
          status: "in_progress",
          description: "进行中的概述",
          nextStep: "继续改代码",
        },
        {
          name: "002-阻塞",
          status: "blocked",
          description: "阻塞的概述",
          reason: "等待用户验收",
          nextStep: "重启后逐项确认",
        },
      ],
    });
    render(createElement(NotesDock, props("nano-flow")));
    await screen.findByTestId("nano-flow-notes-panel");
    // 气泡标签：描述 + 有值时的原因/下一步；锚点是包含状态名与标题的整行。
    const anchorOf = (name: string): Element => {
      const row = screen.getByText(name).closest(".dshtk-notes-row");
      const anchor = row?.parentElement;
      if (anchor === null || anchor === undefined) throw new Error("anchor not found");
      return anchor;
    };
    expect(anchorOf("001-进行中").getAttribute("title")).toBe("进行中的概述\n下一步：继续改代码");
    expect(anchorOf("002-阻塞").getAttribute("title")).toBe(
      "阻塞的概述\n原因：等待用户验收\n下一步：重启后逐项确认",
    );
    expect(anchorOf("002-阻塞").contains(screen.getByText("阻塞"))).toBe(true);
  });

  it("stays visible with an empty state when every note is completed", async () => {
    fetchNotes.mockResolvedValue({ ...snapshot, notes: [] });
    render(createElement(NotesDock, props("nano-flow")));
    const panel = await screen.findByTestId("nano-flow-notes-panel");
    // 默认展开时「全部完成」同时出现在头部计数与空态行，分别断言。
    expect(panel.querySelector(".dshtk-notes-progress")?.textContent).toBe("全部完成");
    expect(screen.getByTestId("nano-flow-notes-empty")).toBeDefined();
  });

  it("starts expanded and collapses on header click", async () => {
    fetchNotes.mockResolvedValue(snapshot);
    render(createElement(NotesDock, props("nano-flow")));
    await screen.findByTestId("nano-flow-notes-panel");
    expect(screen.getByText("001-进行中")).toBeDefined();
    expect(screen.getByText("收起")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: /Note/u }));
    expect(screen.queryByText("001-进行中")).toBeNull();
    expect(screen.getByText("展开")).toBeDefined();
  });

  it("polls the host again after the refresh interval", async () => {
    vi.useFakeTimers();
    fetchNotes.mockResolvedValue(snapshot);
    render(createElement(NotesDock, props("nano-flow")));
    await act(async () => {
      await Promise.resolve();
    });
    expect(fetchNotes).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(fetchNotes).toHaveBeenCalledTimes(2);
  });

  it("falls back to useSession when sessionId is not passed", async () => {
    fetchNotes.mockResolvedValue(snapshot);
    const useSession = <S>(selector: (value: { sessionId: string }) => S): S =>
      selector({ sessionId: "session-from-hook" });
    render(
      createElement(NotesDock, {
        useProjection: useProjectionOf({ agentPreset: "nano-flow" }),
        useSession,
      }),
    );
    await screen.findByTestId("nano-flow-notes-panel");
    expect(fetchNotes).toHaveBeenCalledWith("session-from-hook", expect.anything());
  });
});
