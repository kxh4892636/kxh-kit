// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { ToolkitPanel } from "./panel.js";
import { toolkitClientState } from "./state.js";

const json = (body: unknown, status = 200): Response => {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
};

const catalog = (nestedSkill: boolean) => ({
  tools: [
    { id: "nested-skill", title: "嵌套 skill 发现", description: "desc", enabled: nestedSkill },
    { id: "undo-turn", title: "撤回", description: "desc", enabled: true },
  ],
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  toolkitClientState.reset();
});

describe("ToolkitPanel", () => {
  it("lists every tool with its switch and publishes the state", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json(catalog(true))),
    );
    render(createElement(ToolkitPanel));
    expect(await screen.findByText("嵌套 skill 发现")).toBeDefined();
    const switches = screen.getAllByRole("switch");
    expect(switches).toHaveLength(2);
    expect(switches[0]?.getAttribute("aria-checked")).toBe("true");
    expect(toolkitClientState.isEnabled("nested-skill")).toBe(true);
  });

  it("renders the host settings-section structure with the tool id as a tag", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json(catalog(true))),
    );
    const { container } = render(createElement(ToolkitPanel));
    await screen.findByText("嵌套 skill 发现");
    expect(container.querySelector(".dshtk-panel .dshtk-section")).not.toBeNull();
    expect(container.querySelector("h1.dshtk-title")?.textContent).toBe("toolkit");
    expect(container.querySelectorAll("li.dshtk-row-card")).toHaveLength(2);
    expect(container.querySelector("code.dshtk-row-tag")?.textContent).toBe("nested-skill");
    expect(container.querySelector(".dshtk-row-actions button[role='switch']")).not.toBeNull();
    const stylesheet = document.querySelector(
      'style[data-plugin-css="@kxh4892636/dsh-toolkit/toolkit.css"]',
    );
    expect(stylesheet?.textContent).toContain(".dshtk-row-card");
    expect(stylesheet?.textContent).toContain("--dsw-alias-settings-card-fill");
  });

  it("toggles a tool through the host route", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json(catalog(true)))
      .mockResolvedValueOnce(json(catalog(false)));
    vi.stubGlobal("fetch", fetchMock);
    render(createElement(ToolkitPanel));
    const switches = await screen.findAllByRole("switch");
    fireEvent.click(switches[0] as HTMLElement);
    await waitFor(() => {
      expect(toolkitClientState.isEnabled("nested-skill")).toBe(false);
    });
    const posts = fetchMock.mock.calls.filter(
      ([, init]) => (init as RequestInit | undefined)?.method === "POST",
    );
    expect(posts).toHaveLength(1);
  });

  it("shows the host error and keeps the previous state", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(json(catalog(true)))
        .mockResolvedValueOnce(json({ error: "internal", message: "炸了" }, 500)),
    );
    render(createElement(ToolkitPanel));
    const switches = await screen.findAllByRole("switch");
    fireEvent.click(switches[0] as HTMLElement);
    expect(await screen.findByText(/操作失败：炸了/u)).toBeDefined();
    expect(toolkitClientState.isEnabled("nested-skill")).toBe(true);
  });

  it("reports a catalog that cannot be loaded", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json({}, 500)),
    );
    render(createElement(ToolkitPanel));
    expect(await screen.findByText(/操作失败/u)).toBeDefined();
  });
});
