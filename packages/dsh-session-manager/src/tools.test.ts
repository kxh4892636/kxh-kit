/**
 * 工具定义测试: 工具集完整性、委托行为、参数交叉校验与错误包装。
 */
import { describe, expect, it } from "vitest";
import type { ToolRunContext } from "@deepseek-ai/dsh-tools";
import { SessionManagerHost } from "./host.ts";
import { headerOf, makeFakeServices, messageRecordOf, snapshotOf } from "./test-support.ts";
import { buildSessionTools } from "./tools.ts";

const toolOf = (tools: ReturnType<typeof buildSessionTools>, name: string) => {
  const found = tools.find((tool) => tool.name === name);
  if (found === undefined) throw new Error(`tool ${name} not found`);
  return found;
};

const makeTools = (
  options?: Parameters<typeof makeFakeServices>[0],
): {
  readonly tools: ReturnType<typeof buildSessionTools>;
  readonly calls: ReturnType<typeof makeFakeServices>["calls"];
} => {
  const fake = makeFakeServices(options);
  return { tools: buildSessionTools(new SessionManagerHost(fake.services)), calls: fake.calls };
};

const execOf = (): ToolRunContext =>
  ({ signal: new AbortController().signal }) as unknown as ToolRunContext;

const exec = async (
  tool: ReturnType<typeof buildSessionTools>[number],
  args: Record<string, unknown>,
): Promise<unknown> => {
  const executor = tool.execute.bind(tool) as unknown as (
    args: unknown,
    exec: ToolRunContext,
  ) => Promise<unknown>;
  return executor(args, execOf());
};

describe("工具集", () => {
  it("注册 9 个 session_* 工具", () => {
    const { tools } = makeTools();
    expect(tools.map((tool) => tool.name).sort()).toEqual([
      "session_archive",
      "session_list",
      "session_model_list",
      "session_model_select",
      "session_prompt",
      "session_read",
      "session_rename",
      "session_spawn",
      "session_wait",
    ]);
  });
});

describe("session_list", () => {
  it("透传 includeArchived / workspaceId / parentSessionId 过滤", async () => {
    const { tools, calls } = makeTools({
      items: [
        { sessionId: "session-a", cwd: "C:\\ws-a", title: "A" },
        {
          sessionId: "session-b",
          cwd: "C:\\ws-a",
          parentSessionId: "session-a",
          origin: "subagent",
        },
      ],
      workspaces: [{ id: "ws-1", path: "C:\\ws-a", title: "WS-A" }],
    });
    const value = (await exec(toolOf(tools, "session_list"), {})) as {
      readonly items: readonly { readonly sessionId: string }[];
    };
    expect(value.items.map((item) => item.sessionId)).toEqual(["session-a", "session-b"]);
    expect(calls.list[0]).toEqual({});
    const filtered = (await exec(toolOf(tools, "session_list"), {
      workspaceId: "ws-1",
      parentSessionId: "session-a",
    })) as { readonly items: readonly { readonly sessionId: string }[] };
    expect(filtered.items.map((item) => item.sessionId)).toEqual(["session-b"]);
  });
});

describe("session_read", () => {
  it("返回消息窗口, beforeSeq 翻页", async () => {
    const { tools, calls } = makeTools({
      frames: [snapshotOf([messageRecordOf("user/message", 1, "hi")], 10, true)],
      pageRecords: [messageRecordOf("assistant/message", 2, "older answer")],
    });
    const value = (await exec(toolOf(tools, "session_read"), {
      sessionId: "session-a",
      beforeSeq: 10,
      maxMessages: 3,
    })) as {
      readonly messages: readonly { readonly role: string; readonly text: string }[];
      readonly hasMore: boolean;
    };
    expect(value.messages.map((message) => [message.role, message.text])).toEqual([
      ["assistant", "older answer"],
    ]);
    expect(value.hasMore).toBe(false);
    expect(
      (calls.page[0] as { readonly beforeSeq: number; readonly maxMessages: number }).beforeSeq,
    ).toBe(10);
  });

  it("所有可选参数缺省时走快照窗口", async () => {
    const { tools, calls } = makeTools({
      frames: [
        snapshotOf(
          [messageRecordOf("user/message", 1, "hi")],
          10,
          false,
          headerOf("session-a", { parentSession: "parent-1", origin: "subagent" }),
        ),
      ],
    });
    const value = (await exec(toolOf(tools, "session_read"), { sessionId: "session-a" })) as {
      readonly header: { readonly parentSessionId?: string };
      readonly messages: readonly { readonly role: string; readonly text: string }[];
    };
    expect(value.header.parentSessionId).toBe("parent-1");
    expect(value.messages[0]?.text).toBe("hi");
    expect(calls.page).toHaveLength(0);
  });
});

describe("session_spawn", () => {
  it("创建并选模型; provider/model 必须成对", async () => {
    const { tools, calls } = makeTools();
    const value = (await exec(toolOf(tools, "session_spawn"), {
      provider: "p",
      model: "m",
      reasoningEffort: "max",
    })) as { readonly sessionId: string };
    expect(value.sessionId).toBe("session-new-1");
    expect(calls.selectModel[0]).toMatchObject({ provider: "p", model: "m" });
    await expect(exec(toolOf(tools, "session_spawn"), { provider: "p" })).rejects.toThrow(
      "provider 与 model 同时给出或同时省略",
    );
  });

  it("workspaceId/sessionId 透传且无模型时不选模型", async () => {
    const { tools, calls } = makeTools();
    await exec(toolOf(tools, "session_spawn"), { workspaceId: "ws-1", sessionId: "session-x" });
    expect(calls.create[0]).toMatchObject({ workspaceId: "ws-1", sessionId: "session-x" });
    expect(calls.selectModel).toHaveLength(0);
  });
});

describe("session_prompt", () => {
  it("默认 queue 且透传文本", async () => {
    const { tools, calls } = makeTools();
    await exec(toolOf(tools, "session_prompt"), { sessionId: "session-a", text: "go" });
    const request = calls.prompt[0] as {
      readonly mode: string;
      readonly content: readonly { readonly text: string }[];
    };
    expect(request.mode).toBe("queue");
    expect(request.content[0]?.text).toBe("go");
  });

  it("steer 透传", async () => {
    const { tools, calls } = makeTools();
    await exec(toolOf(tools, "session_prompt"), {
      sessionId: "session-a",
      text: "stop",
      mode: "steer",
    });
    expect((calls.prompt[0] as { readonly mode: string }).mode).toBe("steer");
  });
});

describe("model / rename / archive / wait", () => {
  it("model_list 与 model_select 透传", async () => {
    const { tools, calls } = makeTools();
    const catalog = (await exec(toolOf(tools, "session_model_list"), {})) as {
      readonly default: { readonly provider: string };
    };
    expect(catalog.default.provider).toBe("deepseek-official");
    await exec(toolOf(tools, "session_model_select"), {
      sessionId: "session-a",
      provider: "p",
      model: "m",
    });
    expect(calls.selectModel[0]).toMatchObject({ provider: "p", model: "m" });
    expect(calls.selectModel[0]).not.toHaveProperty("reasoningEffort");
    await exec(toolOf(tools, "session_model_select"), {
      sessionId: "session-a",
      provider: "p",
      model: "m",
      reasoningEffort: "max",
    });
    expect((calls.selectModel[1] as { readonly reasoningEffort: string }).reasoningEffort).toBe(
      "max",
    );
  });

  it("rename/archive 透传", async () => {
    const { tools, calls } = makeTools();
    const renamed = (await exec(toolOf(tools, "session_rename"), {
      sessionId: "session-a",
      title: "x",
    })) as { readonly title: string; readonly seq: number };
    expect(renamed).toEqual({ title: "X", seq: 42 });
    await exec(toolOf(tools, "session_archive"), { sessionId: "session-a" });
    expect(calls.archive).toEqual(["session-a"]);
  });

  it("wait 使用默认超时与间隔", async () => {
    const { tools, calls } = makeTools({
      items: [{ sessionId: "session-a", running: false, title: "A" }],
    });
    await exec(toolOf(tools, "session_wait"), { sessionId: "session-a" });
    expect(calls.list).toHaveLength(1);
  });
});

describe("错误包装", () => {
  const throwingRename = (error: unknown): ReturnType<typeof buildSessionTools> => {
    const fake = makeFakeServices();
    return buildSessionTools(
      new SessionManagerHost({
        ...fake.services,
        sessionController: {
          ...fake.services.sessionController,
          rename: async () => {
            throw error;
          },
        },
      }),
    );
  };

  it("Host 错误映射为带 code 的文本异常", async () => {
    const tools = throwingRename({ code: "session/title-invalid", message: "bad title" });
    await expect(
      exec(toolOf(tools, "session_rename"), { sessionId: "session-a", title: "!" }),
    ).rejects.toThrow("session/title-invalid: bad title");
  });

  it("未知失败落到 SESSION_MANAGER_TOOL_FAILED", async () => {
    const tools = throwingRename("strange");
    await expect(
      exec(toolOf(tools, "session_rename"), { sessionId: "session-a", title: "!" }),
    ).rejects.toThrow("SESSION_MANAGER_TOOL_FAILED");
  });
});
