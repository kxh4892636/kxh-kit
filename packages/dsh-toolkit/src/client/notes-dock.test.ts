// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { NOTES_PROJECTION_KEY, NotesDock, type NotesSnapshot } from "./notes-dock.js";

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

afterEach(() => {
  cleanup();
});

describe("NotesDock", () => {
  it("renders nothing without the projection prop", () => {
    const { container } = render(createElement(NotesDock, {}));
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing outside the nano-flow preset", () => {
    const { container } = render(
      createElement(NotesDock, {
        useProjection: useProjectionOf({
          agentPreset: "default",
          [NOTES_PROJECTION_KEY]: snapshot,
        }),
      }),
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing without a snapshot", () => {
    const { container } = render(
      createElement(NotesDock, {
        useProjection: useProjectionOf({ agentPreset: "nano-flow", [NOTES_PROJECTION_KEY]: null }),
      }),
    );
    expect(container.firstChild).toBeNull();
  });

  it("lists every unfinished note with the per-status counts", () => {
    render(
      createElement(NotesDock, {
        useProjection: useProjectionOf({
          agentPreset: "nano-flow",
          [NOTES_PROJECTION_KEY]: snapshot,
        }),
      }),
    );
    expect(screen.getByTestId("nano-flow-notes-panel")).toBeDefined();
    for (const note of snapshot.notes) expect(screen.getByText(note.name)).toBeDefined();
    expect(screen.getByText("1 进行中 · 1 阻塞 · 1 待处理")).toBeDefined();
  });

  it("shows the note description as the row tooltip", () => {
    render(
      createElement(NotesDock, {
        useProjection: useProjectionOf({
          agentPreset: "nano-flow",
          [NOTES_PROJECTION_KEY]: snapshot,
        }),
      }),
    );
    const tooltip = screen.getByTitle("进行中的概述");
    expect(tooltip.textContent).toBe("001-进行中");
  });

  it("starts expanded and folds on header click", () => {
    render(
      createElement(NotesDock, {
        useProjection: useProjectionOf({
          agentPreset: "nano-flow",
          [NOTES_PROJECTION_KEY]: snapshot,
        }),
      }),
    );
    expect(screen.getByText("001-进行中")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: /Note/u }));
    expect(screen.queryByText("001-进行中")).toBeNull();
  });
});
