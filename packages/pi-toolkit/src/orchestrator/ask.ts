/**
 * `ask_questions`：向用户提出任意数量的问题，每题可选预设选项、自定义回答或跳过。
 * 与 Orchestrator 同时激活。无交互界面时（worker session）不报错，而是返回
 * 结构化登记 `needs=answer`，由编排方转人工——worker 永远不能自己问人。
 * @module @kxh4892636/pi-toolkit/orchestrator/ask
 */

import type { ExtensionToolContext, ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

/** 一道问题的模型参数。 */
interface AskQuestion {
  readonly question: string;
  readonly options: readonly AskOption[];
  readonly allowCustom: boolean;
  readonly allowSkip: boolean;
}

interface AskOption {
  readonly label: string;
  readonly description?: string;
}

/** 一道题的问答结果。 */
interface AskAnswer {
  readonly question: string;
  readonly answer: string;
  readonly skipped: boolean;
  readonly custom: boolean;
}

const CUSTOM_LABEL = "✎ 自定义回答";
const SKIP_LABEL = "跳过";

const asRecord = (value: unknown): Record<string, unknown> | undefined => {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
};

/** 把模型参数收窄成问题列表；不接受空列表。 */
export const parseQuestions = (raw: unknown): AskQuestion[] => {
  const args = asRecord(raw);
  const list = args?.["questions"];
  if (!Array.isArray(list) || list.length === 0) throw new Error("questions 至少需要一道题");
  return list.map((item, index) => {
    const record = asRecord(item);
    const question = record?.["question"];
    if (typeof question !== "string" || question.trim() === "") {
      throw new Error(`questions[${index}].question 必填`);
    }
    const rawOptions = record?.["options"];
    const options: AskOption[] = Array.isArray(rawOptions)
      ? rawOptions.map((entry, optionIndex) => {
          const option = asRecord(entry);
          const label = option?.["label"];
          if (typeof label !== "string" || label.trim() === "") {
            throw new Error(`questions[${index}].options[${optionIndex}].label 必填`);
          }
          const description = option?.["description"];
          return {
            label,
            ...(typeof description === "string" ? { description } : {}),
          };
        })
      : [];
    return {
      question,
      options,
      allowCustom: record?.["allow_custom"] !== false,
      allowSkip: record?.["allow_skip"] !== false,
    };
  });
};

/** 逐题询问；取消（Esc）时保留已完成答案并标记 cancelled。 */
const ask = async (
  ctx: ExtensionToolContext,
  questions: readonly AskQuestion[],
): Promise<{ answers: AskAnswer[]; cancelled: boolean }> => {
  const answers: AskAnswer[] = [];
  for (const [index, item] of questions.entries()) {
    const labels = [
      ...item.options.map((option) => option.label),
      ...(item.allowCustom ? [CUSTOM_LABEL] : []),
      ...(item.allowSkip ? [SKIP_LABEL] : []),
    ];
    const picked = await ctx.ui.select(
      `问题 ${index + 1}/${questions.length}：${item.question}`,
      labels,
    );
    if (picked === undefined) return { answers, cancelled: true };
    if (picked === SKIP_LABEL) {
      answers.push({ question: item.question, answer: "", skipped: true, custom: false });
      continue;
    }
    if (picked === CUSTOM_LABEL) {
      const text = await ctx.ui.input(item.question, "输入回答");
      if (text === undefined) return { answers, cancelled: true };
      answers.push({
        question: item.question,
        answer: text.trim(),
        skipped: text.trim() === "",
        custom: true,
      });
      continue;
    }
    const selected = item.options.find((option) => option.label === picked);
    answers.push({
      question: item.question,
      answer: selected?.label ?? picked,
      skipped: false,
      custom: false,
    });
  }
  return { answers, cancelled: false };
};

/**
 * 无交互界面时的结构化登记：不阻塞、不报错，把问题交给上层转人工。
 * @param questions - 已解析的问题列表。
 * @returns 模型可见文本与 `needs=answer` 的 details。
 */
export const registerQuestion = (
  questions: readonly AskQuestion[],
): {
  text: string;
  details: Record<string, unknown>;
} => {
  const first = questions[0];
  if (first === undefined) throw new Error("questions 至少需要一道题");
  const lines = [
    "已登记为待答问题（needs=answer）；本会话没有交互界面，请交由编排方转人工后继续。",
    `Q1: ${first.question}`,
  ];
  if (first.options.length > 0) {
    lines.push(`选项: ${first.options.map((option) => option.label).join(" / ")}`);
  }
  if (questions.length > 1) {
    lines.push(`另有 ${questions.length - 1} 个问题待答`);
  }
  return {
    text: lines.join("\n"),
    details: {
      needs: "answer",
      question: first.question,
      questions: questions.map((item) => item.question),
      options: first.options,
      allow_custom: first.allowCustom,
      allow_skip: first.allowSkip,
      cancelled: true,
      answers: [],
    },
  };
};

/** 把答案渲染成模型可见文本。 */
export const formatAnswers = (answers: readonly AskAnswer[], cancelled: boolean): string => {
  const lines: string[] = [];
  answers.forEach((answer, index) => {
    const label = answer.skipped ? "（跳过）" : answer.answer;
    const suffix = answer.custom && !answer.skipped ? "（自定义）" : "";
    lines.push(`Q${index + 1}: ${answer.question}`);
    lines.push(`A${index + 1}: ${label}${suffix}`);
  });
  if (cancelled) lines.push("（用户取消了后续问题）");
  return lines.length === 0 ? "（未提问）" : lines.join("\n");
};

/** 构造 `ask_questions` 工具。 */
export const createAskQuestionsTool = (): ToolDefinition => ({
  name: "ask_questions",
  label: "Ask Questions",
  description:
    "向用户提出一个或多个问题，逐题等待回答。每题可给预设选项，也可自定义回答或跳过；用于 Orchestrator 的 ask 循环与其他需要用户决策的场景。",
  promptSnippet: "Ask the user one or more questions and wait for answers.",
  promptGuidelines: [
    "ask_questions 会阻塞直到用户作答；一次可提任意数量的问题，每题都能自定义回答或跳过。",
  ],
  executionMode: "sequential",
  parameters: Type.Unsafe<Record<string, unknown>>({
    type: "object",
    additionalProperties: false,
    properties: {
      questions: {
        type: "array",
        minItems: 1,
        description: "问题列表；按顺序逐题提问。",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            question: { type: "string", description: "要问用户的问题" },
            options: {
              type: "array",
              description: "预设选项；留空则只允许自定义回答或跳过",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  label: { type: "string", description: "选项文案" },
                  description: { type: "string", description: "选项说明" },
                },
                required: ["label"],
              },
            },
            allow_custom: {
              type: "boolean",
              description: "是否允许自定义回答，默认 true",
            },
            allow_skip: { type: "boolean", description: "是否允许跳过，默认 true" },
          },
          required: ["question"],
        },
      },
    },
    required: ["questions"],
  }),
  async execute(_toolCallId, raw, _signal, _onUpdate, ctx) {
    const questions = parseQuestions(raw);
    if (ctx.mode !== "tui" && ctx.mode !== "rpc") {
      const registered = registerQuestion(questions);
      return {
        content: [{ type: "text" as const, text: registered.text }],
        details: registered.details,
      };
    }
    const result = await ask(ctx, questions);
    return {
      content: [{ type: "text" as const, text: formatAnswers(result.answers, result.cancelled) }],
      details: result,
    };
  },
});
