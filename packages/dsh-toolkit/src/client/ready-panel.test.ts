// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { ReadyPanel, type ReadyPanelProps } from "./ready-panel.js";

const json = (body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

const payload = {
  available: true,
  plan: { domain: "dsh", lifecycle: "active", name: "2026-11-07-示例工作" },
  counts: {
    total: 2,
    pending: 1,
    in_progress: 0,
    waiting: 0,
    needsBlocked: 0,
    completed: 1,
  },
  groups: [
    {
      notes: [
        {
          id: "01",
          title: "基座",
          description: "基座摘要",
          status: "pending",
          blocked_by: [],
        },
      ],
    },
  ],
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ReadyPanel", () => {
  it("renders counts, expands groups and collapses again", async () => {
    const fetchMock = vi.fn(async (_input: string, _init?: RequestInit) => json(payload));
    vi.stubGlobal("fetch", fetchMock);
    render(createElement(ReadyPanel, { sessionId: "s1" }));

    expect(await screen.findByText("Nano Flow")).toBeDefined();
    expect(screen.getByText("1 未完成 · 1 已完成")).toBeDefined();
    expect(screen.getByRole("button").getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("基座")).toBeNull();

    fireEvent.click(screen.getByRole("button"));
    expect(await screen.findByText("基座")).toBeDefined();
    expect(screen.getByText("第 1 组")).toBeDefined();
    expect(screen.getByRole("button").getAttribute("aria-expanded")).toBe("true");
    expect(fetchMock.mock.calls[0]?.[0] ?? "").toContain("nano-flow-ready?sessionId=s1");

    fireEvent.click(screen.getByRole("button"));
    expect(screen.queryByText("基座")).toBeNull();
  });

  it("summarizes waiting notes and renders their glyph", async () => {
    const awaiting = {
      ...payload,
      counts: {
        total: 2,
        pending: 0,
        in_progress: 0,
        waiting: 1,
        needsBlocked: 0,
        completed: 1,
      },
      groups: [
        {
          notes: [
            {
              id: "02",
              title: "等真机",
              description: "代码已完成",
              status: "waiting",
              needs: "review",
              blocked_by: [],
            },
          ],
        },
      ],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json(awaiting)),
    );
    const { container } = render(createElement(ReadyPanel, { sessionId: "s1" }));
    expect(await screen.findByText("1 未完成 · 1 等待确认 · 1 已完成")).toBeDefined();

    fireEvent.click(screen.getByRole("button"));
    expect(await screen.findByText("等真机")).toBeDefined();
    const item = container.querySelector("[data-status='waiting']");
    expect(item).not.toBeNull();
    expect(item?.querySelector(".dshtk-ready-glyph-waiting")).not.toBeNull();
  });

  it("把 waiting + needs=blocked 画成阻塞并单列原因", async () => {
    const blocked = {
      ...payload,
      counts: {
        total: 1,
        pending: 0,
        in_progress: 0,
        waiting: 1,
        needsBlocked: 1,
        completed: 0,
      },
      groups: [
        {
          notes: [
            {
              id: "03",
              title: "等上游接口",
              description: "接口没好",
              status: "waiting",
              needs: "blocked",
              blocked_by: [],
              blocked_reason: "上游接口未发布",
            },
          ],
        },
      ],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json(blocked)),
    );
    const { container } = render(createElement(ReadyPanel, { sessionId: "s1" }));
    expect(await screen.findByText("1 未完成 · 1 阻塞")).toBeDefined();

    fireEvent.click(screen.getByRole("button"));
    expect(await screen.findByText("上游接口未发布")).toBeDefined();
    const item = container.querySelector("[data-status='blocked']");
    expect(item).not.toBeNull();
    expect(item?.querySelector(".dshtk-ready-glyph-blocked")).not.toBeNull();
  });

  it("renders nothing when the host reports the panel unavailable", async () => {
    const fetchMock = vi.fn(async () => json({ available: false, reason: "not-nano-flow" }));
    vi.stubGlobal("fetch", fetchMock);
    const { container } = render(createElement(ReadyPanel, { sessionId: "s1" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(container.querySelector("[data-testid='nano-flow-ready']")).toBeNull();
  });

  it("renders nothing outside the nano-flow preset", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const useSession: NonNullable<ReadyPanelProps["useSession"]> = (selector) =>
      selector({ projectionValues: { agentPreset: "standard" } });
    const { container } = render(createElement(ReadyPanel, { sessionId: "s1", useSession }));
    expect(container.querySelector("[data-testid='nano-flow-ready']")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
