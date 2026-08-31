/**
 * 9 个会话/模型管理工具的定义。
 *
 * 工具只做参数校验与错误归一化, 行为全部委托 SessionManagerHost;
 * presentCall 省略以回退通用卡片(工具私有呈现属后续迭代)。
 */
import { defineTool } from "@deepseek-ai/dsh-tools";
import type { ToolDefinition, ToolRunContext } from "@deepseek-ai/dsh-tools";
import { normalizeHostError } from "./host.ts";
import type { SessionManagerHost } from "./host.ts";

/** 无损 JSON 节点(工具规范值保持纯 JSON 形状)。 */
type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

/** 结果文本投影: 规范值 → 缩进 JSON 文本块(模型可读、无损)。 */
function renderJson(
  this: void,
  _args: unknown,
  value: unknown,
): { readonly type: "text"; readonly text: string }[] {
  return [{ type: "text", text: JSON.stringify(value, null, 2) }];
}

/** 执行包装: 归一化 Host 错误并转成面向模型的文本异常(保留 code)。 */
const runHost = async (
  task: (signal: AbortSignal) => Promise<JsonValue>,
  exec: ToolRunContext,
): Promise<JsonValue> => {
  try {
    return await task(exec.signal);
  } catch (error) {
    const normalized = normalizeHostError(error);
    throw new Error(`${normalized.code}: ${normalized.message}`);
  }
};

/** 调用方会话的 cwd(经工具执行上下文); 不可得时返回 undefined。 */
export const callerSessionCwdOf = (exec: ToolRunContext): string | undefined => {
  const agent = exec.agent as unknown as
    | { readonly session?: { readonly header?: { readonly cwd?: string } } }
    | undefined;
  const cwd = agent?.session?.header?.cwd;
  return typeof cwd === "string" && cwd !== "" ? cwd : undefined;
};

const requiredString = (
  description: string,
): { readonly type: "string"; readonly required: true; readonly description: string } => ({
  type: "string",
  required: true,
  description,
});

const optionalString = (
  description: string,
): { readonly type: "string"; readonly description: string } => ({
  type: "string",
  description,
});

/** 非负整数参数(带说明)。 */
const optionalInteger = (
  description: string,
): { readonly type: "integer"; readonly description: string } => ({
  type: "integer",
  description,
});

/** 数值型模型选择参数无枚举: provider/model 是运行时注册表产物。 */
const spawnSchemaValidator = (args: {
  readonly provider?: string;
  readonly model?: string;
}): void => {
  if ((args.provider === undefined) !== (args.model === undefined)) {
    throw new Error(
      "session_spawn 需要 provider 与 model 同时给出或同时省略(省略时使用部署默认模型)",
    );
  }
};

/** Session/Model 管理工具集合。 */
export const buildSessionTools = (host: SessionManagerHost): ToolDefinition[] => [
  defineTool({
    name: "session_list",
    description:
      "列出当前 Host 上全部会话(跨全部 workspace): 会话 id、标题、更新时间、运行态、workspace 归属、" +
      "subagent 归属(origin/parentSessionId)与归档标记。默认隐藏已归档会话; 默认按更新时间降序。" +
      "可用 workspaceId 只列一个 workspace, 用 parentSessionId 只列某父会话的子会话。",
    parameters: {
      includeArchived: { type: "boolean", description: "是否包含已归档会话(默认 false)。" },
      workspaceId: optionalString("只返回该 workspace 的会话(默认全部)。"),
      parentSessionId: optionalString("只返回该父会话的直接子会话(默认全部)。"),
    },
    output: { schema: { type: "json" }, render: renderJson },
    execute: async (args, exec) =>
      runHost(async (signal) => {
        const all = await host.list(args.includeArchived ?? false, signal);
        let items = all;
        if (args.workspaceId !== undefined)
          items = items.filter((item) => item.workspaceId === args.workspaceId);
        if (args.parentSessionId !== undefined)
          items = items.filter((item) => item.parentSessionId === args.parentSessionId);
        return { items } as unknown as JsonValue;
      }, exec),
  }),
  defineTool({
    name: "session_read",
    description:
      "分页读取一个会话的消息文本历史(按消息对齐, 冷读不激活目标 Agent)。普通会话给 sessionId;" +
      " subagent 子会话需额外给 parentSessionId。beforeSeq 提供时向前翻更早的页," +
      " 返回 entries(消息文本)、throughSeq(当前页游标)与 hasMore。maxMessages 限制每页消息数。",
    parameters: {
      sessionId: requiredString("目标会话 id(来自 session_list)。"),
      parentSessionId: optionalString("子会话的父会话 id; 读取 subagent 子会话时必填。"),
      beforeSeq: optionalInteger(
        "向前翻页的游标: 返回该 seq 之前的消息(来自上一页的 throughSeq)。",
      ),
      maxMessages: optionalInteger("每页返回的最大消息数。"),
    },
    output: { schema: { type: "json" }, render: renderJson },
    execute: async (args, exec) =>
      runHost(async (signal) => {
        const window = await host.read(
          {
            sessionId: args.sessionId,
            ...(args.parentSessionId === undefined
              ? {}
              : { parentSessionId: args.parentSessionId }),
          },
          {
            ...(args.beforeSeq === undefined ? {} : { beforeSeq: args.beforeSeq }),
            ...(args.maxMessages === undefined ? {} : { maxMessages: args.maxMessages }),
          },
          signal,
        );
        return {
          sessionId: window.sessionId,
          header: window.header,
          throughSeq: window.throughSeq,
          hasMore: window.hasMore,
          messages: window.entries.map(entryToMessage),
        } as unknown as JsonValue;
      }, exec),
  }),
  defineTool({
    name: "session_spawn",
    description:
      "创建新会话并可选地为其选择指定模型。workspaceId/cwd 缺省时与调用方会话同一 workspace;" +
      " 新会话与 GUI「新会话」一致: 默认携带部署预置的系统消息/上下文。" +
      " model+provider 择一省略时用部署默认模型。创建后给 session 投递指令请使用 session_prompt。",
    parameters: {
      workspaceId: optionalString(
        "归属的 workspace id(与 cwd 二选一; 缺省与调用方会话同 workspace)。",
      ),
      cwd: optionalString("会话的工作目录(与 workspaceId 二选一; 缺省同上)。"),
      sessionId: optionalString("显式会话 id(缺省自动生成, 便于幂等与测试)。"),
      provider: optionalString(
        "模型 provider id(来自 session_model_list; 与 model 同时给出或同时省略)。",
      ),
      model: optionalString("模型 id(来自 session_model_list)。"),
      reasoningEffort: optionalString("推理档位(由模型目录的 reasoning.efforts 给出, 可选)。"),
    },
    output: { schema: { type: "json" }, render: renderJson },
    execute: async (args, exec) =>
      runHost(async () => {
        spawnSchemaValidator(args);
        const callerCwd = callerSessionCwdOf(exec);
        const result = await host.spawn({
          ...(args.workspaceId === undefined ? {} : { workspaceId: args.workspaceId }),
          ...(args.cwd === undefined ? {} : { cwd: args.cwd }),
          ...(callerCwd === undefined ? {} : { callerCwd }),
          ...(args.sessionId === undefined ? {} : { sessionId: args.sessionId }),
          ...(args.provider === undefined || args.model === undefined
            ? {}
            : {
                provider: args.provider,
                model: args.model,
                ...(args.reasoningEffort === undefined
                  ? {}
                  : { reasoningEffort: args.reasoningEffort }),
              }),
        });
        return result as unknown as JsonValue;
      }, exec),
  }),
  defineTool({
    name: "session_prompt",
    description:
      "向指定会话发送文本消息。mode 默认 queue(追加到收件箱, 当前 turn 结束后按序处理);" +
      " steer 注入运行中的 turn(目标会话正在运行)。返回 accepted 即消息已投递。",
    parameters: {
      sessionId: requiredString("目标会话 id。"),
      text: requiredString("要发送的消息文本。"),
      mode: {
        type: "string",
        enum: ["queue", "steer"],
        description: "投递模式: queue(默认)/steer。",
      },
    },
    output: { schema: { type: "json" }, render: renderJson },
    execute: async (args, exec) =>
      runHost(async (signal) => {
        const result = await host.prompt(
          { sessionId: args.sessionId, text: args.text, mode: args.mode ?? "queue" },
          signal,
        );
        return result as unknown as JsonValue;
      }, exec),
  }),
  defineTool({
    name: "session_model_list",
    description:
      "列出当前 Host 可路由的全部模型目录: provider 分组(模型名/id/描述/reasoning 档位)、" +
      " 部署默认、routableProviders 与隔离的 provider 失败。为会话选择模型时用作 session_model_select 的输入来源。",
    parameters: {},
    output: { schema: { type: "json" }, render: renderJson },
    execute: async (_args, exec) =>
      runHost(async () => {
        const catalog = await host.modelList();
        return catalog as unknown as JsonValue;
      }, exec),
  }),
  defineTool({
    name: "session_model_select",
    description:
      "为一个会话选择模型(provider/model 取自 session_model_list)。选择对该会话后续请求生效。",
    parameters: {
      sessionId: requiredString("目标会话 id。"),
      provider: requiredString("provider id。"),
      model: requiredString("模型 id。"),
      reasoningEffort: optionalString("推理档位(可选)。"),
    },
    output: { schema: { type: "json" }, render: renderJson },
    execute: async (args, exec) =>
      runHost(async () => {
        const result = await host.selectModel({
          sessionId: args.sessionId,
          provider: args.provider,
          model: args.model,
          ...(args.reasoningEffort === undefined ? {} : { reasoningEffort: args.reasoningEffort }),
        });
        return result as unknown as JsonValue;
      }, exec),
  }),
  defineTool({
    name: "session_rename",
    description: "重命名一个会话(标题), 使会话列表可读。返回归一化标题与其持久化 seq。",
    parameters: {
      sessionId: requiredString("目标会话 id。"),
      title: requiredString("新标题。"),
    },
    output: { schema: { type: "json" }, render: renderJson },
    execute: async (args, exec) =>
      runHost(async () => {
        const result = await host.rename({ sessionId: args.sessionId, title: args.title });
        return result as unknown as JsonValue;
      }, exec),
  }),
  defineTool({
    name: "session_archive",
    description:
      "归档(隐藏)一个会话: 从 workspace 分组表面移除, 会话日志与数据完整保留(无硬删除, 不可取消归档)。",
    parameters: {
      sessionId: requiredString("目标会话 id。"),
    },
    output: { schema: { type: "json" }, render: renderJson },
    execute: async (args, exec) =>
      runHost(async () => {
        const result = await host.archive(args.sessionId);
        return result as unknown as JsonValue;
      }, exec),
  }),
  defineTool({
    name: "session_wait",
    description:
      "等待指定会话结束当前任务: 轮询其 running 状态直至 false或超时。用于编排: 投递 prompt 后等待结果。",
    parameters: {
      sessionId: requiredString("目标会话 id。"),
      timeoutMs: optionalInteger("总超时毫秒数(默认 300000)。"),
      pollIntervalMs: optionalInteger("轮询间隔毫秒数(默认 5000)。"),
    },
    output: { schema: { type: "json" }, render: renderJson },
    execute: async (args, exec) =>
      runHost(async (signal) => {
        const entry = await host.wait(
          {
            sessionId: args.sessionId,
            timeoutMs: args.timeoutMs ?? 300000,
            pollIntervalMs: args.pollIntervalMs ?? 5000,
          },
          signal,
        );
        return entry as unknown as JsonValue;
      }, exec),
  }),
];

/** 历史条目 → 模型可读消息(seq/时间 ISO 化)。 */
const entryToMessage = (entry: {
  readonly seq: number;
  readonly time: number;
  readonly kind: "user" | "assistant" | "event";
  readonly text: string;
}): unknown => ({
  seq: entry.seq,
  time: new Date(entry.time).toISOString(),
  role: entry.kind,
  text: entry.text,
});
