// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import type { ClientContext } from "./contract.js";
import { toolkitClientState } from "./state.js";
import { UndoButton } from "./undo-button.js";

const json = (body: unknown, status = 200): Response => {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
};

interface Harness {
  readonly ctx: ClientContext;
  readonly openSession: ReturnType<typeof vi.fn>;
  readonly requestDraftInitialization: ReturnType<typeof vi.fn>;
  readonly binding: ReturnType<typeof vi.fn>;
}

const harness = (bindingAvailable = true): Harness => {
  const openSession = vi.fn(async () => undefined);
  const requestDraftInitialization = vi.fn(() => "applied" as const);
  const binding = vi.fn(() => {
    if (!bindingAvailable) throw new Error("inactive session");
    return { sessionId: "session-child" };
  });
  const services: Record<string, unknown> = {
    uiWorkspace: { openSession },
    sessions: { binding },
    conversation: { input: { requestDraftInitialization } },
  };
  const ctx: ClientContext = {
    slots: { inject: () => {}, register: () => () => {} },
    get: (key: string) => services[key],
    effect: () => () => {},
  };
  return { ctx, openSession, requestDraftInitialization, binding };
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  toolkitClientState.reset();
});

describe("UndoButton", () => {
  it("asks for confirmation before running the undo", async () => {
    const { ctx, openSession, requestDraftInitialization } = harness();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ available: true, prompt: "上一轮的输入" }))
      .mockResolvedValueOnce(json({ childSessionId: "session-child", prompt: "上一轮的输入" }));
    vi.stubGlobal("fetch", fetchMock);
    render(createElement(UndoButton, { sessionId: "session-source", ctx }));

    const button = await screen.findByRole("button", { name: "撤回上一轮" });
    await waitFor(() => expect(button).toHaveProperty("disabled", false));
    expect(button.className).toBe("dshtk-undo-trigger");
    expect(button.querySelector(".dshtk-undo-trigger-icon svg")).not.toBeNull();
    fireEvent.click(button);
    expect(screen.queryByRole("button", { name: "撤回" })).toBeDefined();

    fireEvent.click(within(screen.getByRole("dialog")).getByText("撤回"));
    await waitFor(() => expect(openSession).toHaveBeenCalledWith("session-child"));
    await waitFor(() =>
      expect(requestDraftInitialization).toHaveBeenCalledWith(expect.anything(), {
        prompt: "上一轮的输入",
        whenDraftExists: "replace",
      }),
    );
  });

  it("does nothing when the confirmation is cancelled", async () => {
    const { ctx, openSession } = harness();
    const fetchMock = vi.fn(async () => json({ available: true, prompt: "x" }));
    vi.stubGlobal("fetch", fetchMock);
    render(createElement(UndoButton, { sessionId: "session-source", ctx }));
    const button = await screen.findByRole("button", { name: "撤回上一轮" });
    await waitFor(() => expect(button).toHaveProperty("disabled", false));
    fireEvent.click(button);
    fireEvent.click(screen.getByText("取消"));
    expect(openSession).not.toHaveBeenCalled();
  });

  it("disables itself when the session has no previous turn", async () => {
    const { ctx } = harness();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json({ available: false, reason: "no-previous-turn" })),
    );
    render(createElement(UndoButton, { sessionId: "session-toolkit-1", ctx }));
    const button = await screen.findByRole("button", { name: "撤回上一轮" });
    await waitFor(() => expect(button).toHaveProperty("disabled", true));
    expect(button.getAttribute("title")).toBe("没有可回退的上一轮");
  });

  it("stays hidden while the undo tool is disabled", async () => {
    const { ctx } = harness();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json({ available: true })),
    );
    toolkitClientState.publish([
      { id: "undo-turn", title: "撤回", description: "desc", enabled: false },
    ]);
    render(createElement(UndoButton, { sessionId: "session-1", ctx }));
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "撤回上一轮" })).toBeNull();
    });
  });

  it("re-probes when the session starts or finishes a turn", async () => {
    const { ctx } = harness();
    let snapshot = { running: false, pendingSubmissions: [] as unknown[] };
    const useSession = <S>(selector: (value: typeof snapshot) => S): S => selector(snapshot);
    let available = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        json(
          available
            ? { available: true, prompt: "第二轮" }
            : { available: false, reason: "no-previous-turn" },
        ),
      ),
    );
    const view = render(createElement(UndoButton, { sessionId: "session-1", ctx, useSession }));
    const button = await screen.findByRole("button", { name: "撤回上一轮" });
    await waitFor(() => expect(button).toHaveProperty("disabled", true));

    // 新一轮开始（running 翻转）后必须重新探测，无需切换会话。
    available = true;
    snapshot = { running: true, pendingSubmissions: [] };
    view.rerender(createElement(UndoButton, { sessionId: "session-1", ctx, useSession }));
    await waitFor(() => expect(button).toHaveProperty("disabled", false));
    expect(button.getAttribute("title")).toBe("撤回上一轮");
  });

  it("retries while the host has not opened the session yet", async () => {
    const { ctx } = harness();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ available: false, reason: "session-not-live" }))
      .mockResolvedValue(json({ available: true, prompt: "late" }));
    vi.stubGlobal("fetch", fetchMock);
    render(createElement(UndoButton, { sessionId: "session-late", ctx }));
    const button = await screen.findByRole("button", { name: "撤回上一轮" });
    await waitFor(() => expect(button).toHaveProperty("disabled", true));
    // 一秒后自动重试并转为可用，用户无需切换会话。
    await waitFor(() => expect(button).toHaveProperty("disabled", false), { timeout: 2500 });
    expect(fetchMock.mock.calls.length).toBeGreaterThan(1);
  });

  it("shows the host error and re-enables the dialog", async () => {
    const { ctx } = harness();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(json({ available: true, prompt: "x" }))
        .mockResolvedValueOnce(json({ error: "internal", message: "撤回失败了" }, 500)),
    );
    render(createElement(UndoButton, { sessionId: "session-1", ctx }));
    const button = await screen.findByRole("button", { name: "撤回上一轮" });
    await waitFor(() => expect(button).toHaveProperty("disabled", false));
    fireEvent.click(button);
    fireEvent.click(within(screen.getByRole("dialog")).getByText("撤回"));
    expect(await screen.findByText(/撤回失败：撤回失败了/u)).toBeDefined();
  });
});
