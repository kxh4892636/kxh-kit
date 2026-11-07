/**
 * `ask_questions`：向用户提出任意数量的问题，每题可选预设选项、自定义回答或跳过。
 * 与 Orchestrator 同时激活。无交互界面时（worker session）不报错，而是返回
 * 结构化登记 `needs=answer`，由编排方转人工——worker 永远不能自己问人。
 *
 * TUI 走 `ctx.ui.custom` 自己渲染，因为宿主 `SelectList` 把概述渲染在同一行、项与项之间
 * 也没有空行；这里每项两行（`→ 1. label` + 缩进概述），项间 `Spacer(1)`。rpc / print
 * 没有自定义组件，退回 `ctx.ui.select`，把概述拼进 label —— 至少不让它丢掉。
 * @module @kxh4892636/pi-toolkit/orchestrator/ask
 */

import type { ExtensionToolContext, Theme, ToolDefinition } from "@earendil-works/pi-coding-agent";
import { DynamicBorder, keyText } from "@earendil-works/pi-coding-agent";
import { Container, Spacer, Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";

/** 一道问题的模型参数。 */
export interface AskQuestion {
  readonly question: string;
  readonly options: readonly AskOption[];
  readonly allowCustom: boolean;
  readonly allowSkip: boolean;
}

/** 模型给出的预设选项。 */
export interface AskOption {
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

/** 末尾追加的「自定义回答」项。 */
export const CUSTOM_LABEL = "✎ 自定义回答";
/** 末尾追加的「跳过」项。 */
export const SKIP_LABEL = "跳过";

/** 渲染与选择共用的候选项：预设项在前，自定义 / 跳过在后。 */
export interface AskEntry {
  /** 选中后回传的值（预设项就是 label）。 */
  readonly value: string;
  readonly label: string;
  readonly description?: string;
}

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
          const trimmed = typeof description === "string" ? description.trim() : "";
          return {
            label,
            ...(trimmed === "" ? {} : { description: trimmed }),
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

/**
 * 一道题的全部候选项：预设项 + 末尾的「自定义回答」/「跳过」。
 * @param question - 已解析的问题。
 * @returns 候选项列表。
 */
export const askEntries = (question: AskQuestion): readonly AskEntry[] => {
  const entries: AskEntry[] = question.options.map((option) => ({
    value: option.label,
    label: option.label,
    ...(option.description === undefined ? {} : { description: option.description }),
  }));
  if (question.allowCustom) entries.push({ value: CUSTOM_LABEL, label: CUSTOM_LABEL });
  if (question.allowSkip) entries.push({ value: SKIP_LABEL, label: SKIP_LABEL });
  return entries;
};

/** 概述相对选项头部的缩进：`→ 1. ` 占 5 列。 */
const DESCRIPTION_INDENT = " ".repeat(5);

/**
 * 渲染一道题的候选项：每项一行头部，有概述时紧跟一行缩进概述；**没有概述就只占一行**。
 *
 * 返回按项切分的行数组，项与项之间的间距由调用方决定（TUI 用 `Spacer(1)`，纯文本用空行），
 * 所以这里不能自己塞空行，否则「没有概述时不留空行」会同时被两种调用方破坏。
 * @param entries - 候选项。
 * @param selectedIndex - 当前选中项下标。
 * @param dim - 概述的弱化着色函数；默认原样返回，便于单测。
 * @returns 每项的行。
 */
export const askEntryLines = (
  entries: readonly AskEntry[],
  selectedIndex: number,
  dim: (text: string) => string = (text) => text,
): string[][] =>
  entries.map((entry, index) => {
    const mark = index === selectedIndex ? "→" : " ";
    const head = `${mark} ${index + 1}. ${entry.label}`;
    return entry.description === undefined
      ? [head]
      : [head, `${DESCRIPTION_INDENT}${dim(entry.description)}`];
  });

/** 一道题的标题。 */
const questionTitle = (question: AskQuestion, index: number, total: number): string =>
  `问题 ${index + 1}/${total}：${question.question}`;

/** 非 TUI 的 label：把概述拼进去，至少不丢信息。 */
const withDescription = (label: string, description?: string): string =>
  description === undefined ? label : `${label} — ${description}`;

const fallbackLabels = (entries: readonly AskEntry[]): string[] =>
  entries.map((entry) => withDescription(entry.label, entry.description));

/** 底部键位提示。 */
const hintText = (): string => {
  const confirm = keyText("tui.select.confirm");
  const cancel = keyText("tui.select.cancel");
  return `  ↑/↓ 或 k/j 移动 · 数字 1-9 直选 · ${confirm} 确认 · ${cancel} 取消`;
};

/**
 * TUI：自定义组件，每项两行、项间空行。
 * @param ctx - 工具上下文。
 * @param question - 当前问题。
 * @param index - 第几题（0 起）。
 * @param total - 总题数。
 * @returns 选中项的值；取消为 undefined。
 */
const pickInTui = async (
  ctx: ExtensionToolContext,
  question: AskQuestion,
  index: number,
  total: number,
): Promise<string | undefined> => {
  const entries = askEntries(question);
  return ctx.ui.custom<string | undefined>((tui, theme: Theme, keybindings, done) => {
    const container = new Container();
    let selected = 0;

    const draw = (): void => {
      container.clear();
      container.addChild(new DynamicBorder((text) => theme.fg("accent", text)));
      container.addChild(new Spacer(1));
      container.addChild(new Text(theme.bold(questionTitle(question, index, total)), 0, 0));
      container.addChild(new Spacer(1));
      for (const lines of askEntryLines(entries, selected, (text) => theme.fg("dim", text))) {
        container.addChild(new Text(lines.join("\n"), 0, 0));
        container.addChild(new Spacer(1));
      }
      container.addChild(new Text(theme.fg("dim", hintText()), 0, 0));
      container.addChild(new DynamicBorder((text) => theme.fg("accent", text)));
    };
    draw();

    const finish = (value: string | undefined): void => {
      done(value);
    };

    return {
      capturesViewportInput: true,
      render(width: number): string[] {
        return container.render(width);
      },
      invalidate(): void {
        container.invalidate();
      },
      handleInput(data: string): void {
        if (keybindings.matches(data, "tui.select.cancel")) {
          finish(undefined);
          return;
        }
        if (keybindings.matches(data, "tui.select.confirm")) {
          finish(entries[selected]?.value);
          return;
        }
        if (keybindings.matches(data, "tui.select.up") || data === "k") {
          selected = (selected + entries.length - 1) % entries.length;
        } else if (keybindings.matches(data, "tui.select.down") || data === "j") {
          selected = (selected + 1) % entries.length;
        } else if (data.length === 1 && data >= "1" && data <= "9") {
          // 数字直选：按下就确认，省掉一次 Enter。
          const target = Number(data) - 1;
          if (target >= entries.length) return;
          finish(entries[target]?.value);
          return;
        } else {
          return;
        }
        draw();
        tui.requestRender();
      },
    };
  });
};

/**
 * 取一道题的答案：TUI 走自定义组件，其它交互式模式退回 `ctx.ui.select`。
 * @param ctx - 工具上下文。
 * @param question - 当前问题。
 * @param index - 第几题（0 起）。
 * @param total - 总题数。
 * @returns 选中项的值；取消为 undefined。
 */
const pickEntry = async (
  ctx: ExtensionToolContext,
  question: AskQuestion,
  index: number,
  total: number,
): Promise<string | undefined> => {
  if (ctx.mode === "tui") return pickInTui(ctx, question, index, total);
  const entries = askEntries(question);
  const labels = fallbackLabels(entries);
  const picked = await ctx.ui.select(questionTitle(question, index, total), labels);
  if (picked === undefined) return undefined;
  const at = labels.indexOf(picked);
  return at === -1 ? picked : entries[at]?.value;
};

/** 逐题询问；取消（Esc）时保留已完成答案并标记 cancelled。 */
const ask = async (
  ctx: ExtensionToolContext,
  questions: readonly AskQuestion[],
): Promise<{ answers: AskAnswer[]; cancelled: boolean }> => {
  const answers: AskAnswer[] = [];
  for (const [index, item] of questions.entries()) {
    const picked = await pickEntry(ctx, item, index, questions.length);
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
    answers.push({ question: item.question, answer: picked, skipped: false, custom: false });
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
    lines.push(
      `选项: ${first.options.map((option) => withDescription(option.label, option.description)).join(" / ")}`,
    );
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
    "向用户提出一个或多个问题，逐题等待回答。每题可给预设选项（每个选项建议配一句话概述），也可自定义回答或跳过；用于 Orchestrator 的 ask 循环与其他需要用户决策的场景。",
  promptSnippet: "Ask the user one or more questions and wait for answers.",
  promptGuidelines: [
    "ask_questions 会阻塞直到用户作答；一次可提任意数量的问题，每题都能自定义回答或跳过。",
    "给预设选项时，为每个选项写一句话 description（取舍 / 代价 / 后果）；TUI 会把它展示在选项下方，建议 ≤ 60 字，字段可选。",
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
                  description: {
                    type: "string",
                    description:
                      "选项的一句话概述：取舍 / 代价 / 后果。TUI 展示在选项下方，建议 ≤ 60 字；可选",
                  },
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
