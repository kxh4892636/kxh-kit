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

  it("shows the note description as the row tooltip", async () => {
    fetchNotes.mockResolvedValue(snapshot);
    render(createElement(NotesDock, props("nano-flow")));
    await screen.findByTestId("nano-flow-notes-panel");
    const tooltip = screen.getByTitle("进行中的概述");
    expect(tooltip.textContent).toBe("001-进行中");
  });

  it("starts expanded and folds on header click", async () => {
    fetchNotes.mockResolvedValue(snapshot);
    render(createElement(NotesDock, props("nano-flow")));
    await screen.findByTestId("nano-flow-notes-panel");
    expect(screen.getByText("001-进行中")).toBeDefined();
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
