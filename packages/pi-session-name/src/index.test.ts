import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vite-plus/test";
import piSessionName, { type SessionNameOptions } from "./index.ts";

type Handler = (...args: unknown[]) => unknown;

const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

const fakeModel = { provider: "test", id: "test-model" };

interface CompleteCall {
  readonly model: unknown;
  readonly prompt: string;
  readonly options: Record<string, unknown>;
}

interface Harness {
  readonly handlers: Map<string, Handler>;
  readonly setCalls: string[];
  sessionName(): string | undefined;
  forceName(name: string | undefined): void;
  fire(event: unknown, ctx: ExtensionContext): unknown;
}

const setup = (options: SessionNameOptions = {}): Harness => {
  const handlers = new Map<string, Handler>();
  const setCalls: string[] = [];
  let currentName: string | undefined;
  const pi = {
    on: (event: string, handler: Handler) => {
      handlers.set(event, handler);
    },
    getSessionName: () => currentName,
    setSessionName: (name: string) => {
      currentName = name;
      setCalls.push(name);
    },
  } as unknown as ExtensionAPI;
  piSessionName(pi, options);
  return {
    handlers,
    setCalls,
    sessionName: () => currentName,
    forceName: (name) => {
      currentName = name;
    },
    fire: (event, ctx) => handlers.get("input")?.(event, ctx),
  };
};

interface CtxOptions {
  readonly model?: unknown;
  readonly hasAuth?: boolean;
  readonly complete?: (model: unknown, context: unknown, options: unknown) => Promise<unknown>;
  readonly branch?: readonly unknown[];
  readonly sessionId?: string;
}

const makeCtx = (options: CtxOptions = {}): { ctx: ExtensionContext; calls: CompleteCall[] } => {
  const calls: CompleteCall[] = [];
  const complete = options.complete ?? (async () => ({ content: [] }));
  const ctx = {
    model: options.model,
    modelRegistry: {
      hasConfiguredAuth: () => options.hasAuth ?? true,
      complete: (model: unknown, context: unknown, callOptions: unknown) => {
        const content = (context as { messages: { content: { text: string }[] }[] }).messages[0]
          ?.content;
        calls.push({
          model,
          prompt: content?.[0]?.text ?? "",
          options: callOptions as Record<string, unknown>,
        });
        return complete(model, context, callOptions);
      },
    },
    sessionManager: {
      getBranch: () => options.branch ?? [],
      getSessionId: () => options.sessionId ?? "test-session",
    },
  } as unknown as ExtensionContext;
  return { ctx, calls };
};

const modelReply =
  (text: string): (() => Promise<unknown>) =>
  async () => ({ content: [{ type: "text", text }] });

describe("piSessionName", () => {
  it("names the session from the model reply without blocking the turn", async () => {
    const harness = setup();
    const { ctx, calls } = makeCtx({ model: fakeModel, complete: modelReply('"修复登录超时"') });
    const result = harness.fire({ text: "帮我修复登录超时的问题", source: "interactive" }, ctx);
    expect(result).toEqual({ action: "continue" });
    expect(harness.setCalls).toHaveLength(0);
    await settle();
    expect(harness.setCalls).toEqual(["修复登录超时"]);
    expect(harness.sessionName()).toBe("修复登录超时");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.model).toBe(fakeModel);
    expect(calls[0]?.prompt).toContain("帮我修复登录超时的问题");
    expect(calls[0]?.prompt).toContain("不超过 21 个字");
    expect(calls[0]?.options["maxTokens"]).toBe(256);
    expect(calls[0]?.options["timeoutMs"]).toBe(5_000);
    expect(calls[0]?.options["sessionId"]).toBe("test-session");
  });

  it("falls back to a deterministic title without a model", async () => {
    const harness = setup();
    const { ctx, calls } = makeCtx();
    harness.fire({ text: "帮我看看这个报错", source: "interactive" }, ctx);
    await settle();
    expect(harness.setCalls).toEqual(["帮我看看这个报错"]);
    expect(calls).toHaveLength(0);
  });

  it("uses the model reply after filtering out an invoked skill block", async () => {
    const harness = setup();
    const { ctx, calls } = makeCtx({ model: fakeModel, complete: modelReply("拉取skill调用") });
    const raw =
      '<skill name="ecom-x-flow" location="/skills/ecom-x-flow/SKILL.md">\n流程正文\n</skill>' +
      " 升级 pi-session-name 的命名输入";
    harness.fire({ text: raw, source: "interactive" }, ctx);
    await settle();
    expect(harness.setCalls).toEqual(["拉取skill调用"]);
    expect(calls[0]?.prompt).toContain("升级 pi-session-name 的命名输入");
    expect(calls[0]?.prompt).not.toContain("流程正文");
  });

  it("falls back to the skill name for a bare skill invocation", async () => {
    const harness = setup();
    const { ctx, calls } = makeCtx();
    const raw =
      '<skill name="ecom-x-flow" location="/skills/ecom-x-flow/SKILL.md">\n流程正文\n</skill>';
    harness.fire({ text: raw, source: "interactive" }, ctx);
    await settle();
    expect(harness.setCalls).toEqual(["ecom-x-flow"]);
    expect(calls).toHaveLength(0);
  });

  it("uses the request after a forced skill command", async () => {
    const harness = setup();
    const { ctx } = makeCtx();
    harness.fire({ text: "/skill:pdf-tools extract report.pdf", source: "interactive" }, ctx);
    await settle();
    expect(harness.setCalls).toEqual(["extract report.pdf"]);
  });

  it("falls back when the model has no configured auth", async () => {
    const harness = setup();
    const { ctx, calls } = makeCtx({
      model: fakeModel,
      hasAuth: false,
      complete: modelReply("模型标题"),
    });
    harness.fire({ text: "帮我看看这个报错", source: "interactive" }, ctx);
    await settle();
    expect(harness.setCalls).toEqual(["帮我看看这个报错"]);
    expect(calls).toHaveLength(0);
  });

  it("falls back when the model request throws", async () => {
    const harness = setup();
    const { ctx } = makeCtx({
      model: fakeModel,
      complete: async () => {
        throw new Error("boom");
      },
    });
    harness.fire({ text: "排查打包失败", source: "interactive" }, ctx);
    await settle();
    expect(harness.setCalls).toEqual(["排查打包失败"]);
  });

  it("falls back when the model reply has no usable text", async () => {
    const harness = setup();
    const { ctx } = makeCtx({
      model: fakeModel,
      complete: async () => ({
        content: [
          null,
          { type: "thinking" },
          { type: "text", text: 42 },
          { type: "text", text: "  " },
        ],
      }),
    });
    harness.fire({ text: "梳理接口契约", source: "interactive" }, ctx);
    await settle();
    expect(harness.setCalls).toEqual(["梳理接口契约"]);
  });

  it("uses the first non-empty text block of a mixed reply", async () => {
    const harness = setup();
    const { ctx } = makeCtx({
      model: fakeModel,
      complete: async () => ({
        content: [
          { type: "thinking", thinking: "..." },
          { type: "text", text: "   " },
          { type: "text", text: "登录超时" },
          { type: "text", text: "说明文字" },
        ],
      }),
    });
    harness.fire({ text: "修复登录", source: "interactive" }, ctx);
    await settle();
    expect(harness.setCalls).toEqual(["登录超时"]);
  });

  it("truncates a long model title to the code-point limit", async () => {
    const harness = setup();
    const { ctx } = makeCtx({
      model: fakeModel,
      complete: modelReply("修复登录超时并重试三次并补齐测试并上线发布完成"),
    });
    harness.fire({ text: "修复登录", source: "interactive" }, ctx);
    await settle();
    expect(harness.setCalls).toEqual(["修复登录超时并重试三次并补齐测试并上线发布"]);
    expect(Array.from(harness.setCalls[0] ?? "")).toHaveLength(21);
  });

  it("skips when the session already has a name", async () => {
    const harness = setup();
    harness.forceName("已有名称");
    const { ctx } = makeCtx();
    harness.fire({ text: "修复登录", source: "interactive" }, ctx);
    await settle();
    expect(harness.setCalls).toHaveLength(0);
  });

  it("skips when the branch already has a user message", async () => {
    const harness = setup();
    const { ctx } = makeCtx({ branch: [{ type: "message", message: { role: "user" } }] });
    harness.fire({ text: "修复登录", source: "interactive" }, ctx);
    await settle();
    expect(harness.setCalls).toHaveLength(0);
  });

  it("skips extension-sourced input", async () => {
    const harness = setup();
    const { ctx } = makeCtx();
    harness.fire({ text: "修复登录", source: "extension" }, ctx);
    await settle();
    expect(harness.setCalls).toHaveLength(0);
  });

  it("ignores a decoration-only first input and names on the next one", async () => {
    const harness = setup();
    const { ctx } = makeCtx();
    harness.fire({ text: "。。。", source: "interactive" }, ctx);
    await settle();
    expect(harness.setCalls).toHaveLength(0);
    harness.fire({ text: "修复登录超时", source: "interactive" }, ctx);
    await settle();
    expect(harness.setCalls).toEqual(["修复登录超时"]);
  });

  it("names only once per session", async () => {
    const harness = setup();
    const { ctx } = makeCtx();
    harness.fire({ text: "第一个请求", source: "interactive" }, ctx);
    harness.fire({ text: "第二个请求", source: "interactive" }, ctx);
    await settle();
    expect(harness.setCalls).toEqual(["第一个请求"]);
  });

  it("re-arms on session_start", async () => {
    const harness = setup();
    const { ctx } = makeCtx();
    harness.fire({ text: "第一个请求", source: "interactive" }, ctx);
    await settle();
    harness.forceName(undefined);
    harness.handlers.get("session_start")?.({}, ctx);
    harness.fire({ text: "新的请求", source: "interactive" }, ctx);
    await settle();
    expect(harness.setCalls).toEqual(["第一个请求", "新的请求"]);
  });

  it("does not overwrite a name set while the model call is in flight", async () => {
    const harness = setup();
    const { ctx } = makeCtx({
      model: fakeModel,
      complete: async () => {
        await settle();
        return { content: [{ type: "text", text: "模型标题" }] };
      },
    });
    harness.fire({ text: "修复登录", source: "interactive" }, ctx);
    harness.forceName("用户自己命名");
    await settle();
    await settle();
    expect(harness.setCalls).toHaveLength(0);
    expect(harness.sessionName()).toBe("用户自己命名");
  });

  it("does not let a stale call name a session that restarted", async () => {
    const harness = setup();
    const { ctx } = makeCtx({
      model: fakeModel,
      complete: async () => {
        await settle();
        return { content: [{ type: "text", text: "模型标题" }] };
      },
    });
    harness.fire({ text: "修复登录", source: "interactive" }, ctx);
    harness.handlers.get("session_start")?.({}, ctx);
    await settle();
    await settle();
    expect(harness.setCalls).toHaveLength(0);
  });

  it("honours a custom maxLength", async () => {
    const harness = setup({ maxLength: 4 });
    const { ctx } = makeCtx();
    harness.fire({ text: "帮我看看这个报错", source: "interactive" }, ctx);
    await settle();
    expect(harness.setCalls).toEqual(["帮我看看"]);
  });
});
