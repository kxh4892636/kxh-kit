// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { DEFAULT_NANO_FLOW_SETTINGS } from "../contract.js";
import { ToolkitPanel } from "./panel.js";
import { toolkitClientState } from "./state.js";

const json = (body: unknown, status = 200): Response => {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
};

const settingsResponse = { settings: DEFAULT_NANO_FLOW_SETTINGS };
const isSettings = (input: unknown): boolean => String(input).includes("nano-flow");

const catalog = (nestedSkill: boolean, nanoFlow = false) => ({
  tools: [
    { id: "nested-skill", title: "嵌套 skill 发现", description: "desc", enabled: nestedSkill },
    { id: "undo-turn", title: "撤回", description: "desc", enabled: true },
    { id: "nano-flow", title: "Nano Flow 预设", description: "desc", enabled: nanoFlow },
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
    expect(switches).toHaveLength(3);
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
    expect(container.querySelectorAll("li.dshtk-row-card")).toHaveLength(3);
    expect(container.querySelector("code.dshtk-row-tag")?.textContent).toBe("nested-skill");
    expect(container.querySelector(".dshtk-row-actions button[role='switch']")).not.toBeNull();
    const stylesheet = document.querySelector(
      'style[data-plugin-css="@kxh4892636/dsh-toolkit/toolkit.css"]',
    );
    expect(stylesheet?.textContent).toContain(".dshtk-row-card");
    expect(stylesheet?.textContent).toContain("--dsw-alias-settings-card-fill");
  });

  it("toggles a tool through the host route", async () => {
    const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
      if (isSettings(input)) return json(settingsResponse);
      if (init?.method === "POST") return json(catalog(false));
      return json(catalog(true));
    });
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
      vi.fn(async (input: unknown, init?: RequestInit) => {
        if (isSettings(input)) return json(settingsResponse);
        if (init?.method === "POST") return json({ error: "internal", message: "炸了" }, 500);
        return json(catalog(true));
      }),
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
      vi.fn(async (input: unknown) => (isSettings(input) ? json(settingsResponse) : json({}, 500))),
    );
    render(createElement(ToolkitPanel));
    expect(await screen.findByText(/操作失败/u)).toBeDefined();
  });

  it("shows the settings dropdown only when the Nano Flow switch is on", async () => {
    const posts: unknown[] = [];
    const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
      if (isSettings(input)) {
        if (init?.method === "POST") {
          posts.push(JSON.parse(init.body as string));
          return json(settingsResponse);
        }
        return json(settingsResponse);
      }
      return json(catalog(true, true));
    });
    vi.stubGlobal("fetch", fetchMock);
    render(createElement(ToolkitPanel));
    const toggle = await screen.findByRole("button", { name: "Nano Flow 设置" });
    expect(screen.queryByLabelText("story.md KB")).toBeNull();
    fireEvent.click(toggle);
    const story = (await screen.findByLabelText("story.md KB")) as HTMLInputElement;
    expect(story.value).toBe(String(DEFAULT_NANO_FLOW_SETTINGS.storyMaxBytes / 1024));
    fireEvent.change(story, { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect((posts[0] as { patch: { storyMaxBytes: number } }).patch.storyMaxBytes).toBe(2048);
  });

  it("keeps the rotation threshold decimal and accepts thousands separators", async () => {
    const posts: unknown[] = [];
    const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
      if (isSettings(input)) {
        if (init?.method === "POST") {
          posts.push(JSON.parse(init.body as string));
          return json(settingsResponse);
        }
        return json(settingsResponse);
      }
      return json(catalog(true, true));
    });
    vi.stubGlobal("fetch", fetchMock);
    render(createElement(ToolkitPanel));
    fireEvent.click(await screen.findByRole("button", { name: "Nano Flow 设置" }));
    const rotate = (await screen.findByLabelText("轮转阈值 比例")) as HTMLInputElement;
    expect(rotate.value).toBe(String(DEFAULT_NANO_FLOW_SETTINGS.rotateAt));
    fireEvent.change(rotate, { target: { value: "0.7" } });
    const story = (await screen.findByLabelText("story.md KB")) as HTMLInputElement;
    fireEvent.change(story, { target: { value: "1,000" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(posts).toHaveLength(1));
    const patch = (posts[0] as { patch: { rotateAt: number; storyMaxBytes: number } }).patch;
    expect(patch.rotateAt).toBe(0.7);
    expect(patch.storyMaxBytes).toBe(1024000);
  });

  it("hides the settings toggle when Nano Flow is off", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: unknown) =>
        isSettings(input) ? json(settingsResponse) : json(catalog(true, false)),
      ),
    );
    render(createElement(ToolkitPanel));
    await screen.findByText("Nano Flow 预设");
    expect(screen.queryByRole("button", { name: "Nano Flow 设置" })).toBeNull();
  });
});
