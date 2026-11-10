/**
 * `ask_questions`：向用户提出任意数量的问题，每题可选预设选项、自定义回答或跳过。
 * 无交互界面时不报错，而是返回结构化登记 `needs=answer`，让调用方知道问题未被回答。
 *
 * TUI 走 `ctx.ui.custom` 自己渲染，因为宿主 `SelectList` 把概述渲染在同一行、项与项之间
 * 也没有空行；这里每项两行（`→ 1. label` + 缩进概述），项间 `Spacer(1)`。
 *
 * TUI 下由**一个组件管全部题目**：`←/→`（或 Tab/Shift+Tab）切题，切回去恢复该题原来的
 * 选中位置；题目之后另有一页独立的「提交」页（汇总各题答案），末题 Enter 只是前进到那里，
 * 在提交页按 Enter 才结束提问；还有题未作答（既未作答也未显式跳过）时提交被拦下，光标跳到
 * 第一道未答题并提示是哪几题。
 * 选中「自定义回答」时组件先退出，外层用 `ctx.ui.input` 取文本，再带着同一份草稿重新进入
 * 组件：文本非空即等于「确认并前进」（下一题，末题落到「提交」页），空输入或取消则留在同一题
 * 并提示 —— 之前的答案不会丢，`←` 回退也照旧。
 *
 * rpc / print 没有自定义组件，退回 `ctx.ui.select` 顺序问答（不能回退），把概述拼进 label
 * —— 至少不让它丢掉。
 * @module @kxh4892636/pi-toolkit/ask
 */

import type { ExtensionToolContext, Theme, ToolDefinition } from "@earendil-works/pi-coding-agent";
import { DynamicBorder, keyText } from "@earendil-works/pi-coding-agent";
import { Container, Spacer, Text, matchesKey } from "@earendil-works/pi-tui";
import { Type } from "typebox";

/** 每道题最多几个预设选项：选项要能一眼比较，给多了只是噪音。 */
export const MAX_OPTIONS = 3;

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
export interface AskAnswer {
  readonly question: string;
  /** 第几题（0 起）：取消时可跳过未答的题，编号不能靠数组下标重排。 */
  readonly questionIndex?: number;
  readonly answer: string;
  readonly skipped: boolean;
  readonly custom: boolean;
}

/**
 * 多题共用的作答草稿：当前 tab、每题选中位置、每题答案。
 * `index` 取 `0..questions.length-1` 表示第几题，取 `questions.length` 表示提交页。
 */
export interface AskDraft {
  readonly index: number;
  readonly selection: readonly number[];
  readonly answers: readonly (AskAnswer | undefined)[];
  /** 只展示一次的提示（自定义回答为空 / 取消自定义）；下一次按键即清掉。 */
  readonly notice?: string;
}

/** 组件交回外层的意图：「自定义」要跳出组件去 `ctx.ui.input`。 */
export type AskEvent =
  | { readonly kind: "custom"; readonly draft: AskDraft }
  | { readonly kind: "submit"; readonly draft: AskDraft }
  | { readonly kind: "cancel"; readonly draft: AskDraft };

/** 一轮提问的全部结果。 */
export interface AskResult {
  readonly answers: readonly AskAnswer[];
  readonly cancelled: boolean;
}

/** 末尾追加的「自定义回答」项。 */
export const CUSTOM_LABEL = "✎ 自定义回答";
/** 末尾追加的「跳过」项。 */
export const SKIP_LABEL = "跳过";
/** 「提交」页的标签：题目 tab 之后的独立一页，汇总各题答案并在此提交。 */
export const SUBMIT_LABEL = "提交";
/** 自定义回答为空时的提示：空串不算答案，也不记跳过。 */
export const EMPTY_CUSTOM_NOTICE = "自定义回答不能为空：请输入内容，或选「跳过」";
/** 取消自定义输入后的提示：留在同一题，该题已有答案不变。 */
export const CUSTOM_CANCELLED_NOTICE = "已取消自定义回答：本题答案保持不变";

/**
 * 确认之后的落点：题目页前进一题，末题落到「提交」页（`total`）。
 * 组件里按 Enter 与自定义回答取到文本后共用这一条前进规则。
 * @param index - 当前 tab。
 * @param total - 题目数。
 * @returns 前进后的 tab。
 */
export const nextTab = (index: number, total: number): number =>
  index < total ? Math.min(index + 1, total) : index;

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
    if (Array.isArray(rawOptions) && rawOptions.length > MAX_OPTIONS) {
      throw new Error(
        `questions[${index}].options 最多 ${MAX_OPTIONS} 个（当前 ${rawOptions.length} 个）；最多 3 个，不足不必硬凑`,
      );
    }
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

/** 未作答提示：显式跳过不算未作答。 */
export const unansweredNotice = (missing: readonly number[]): string =>
  `还有 ${missing.map((at) => `Q${at + 1}`).join("、")} 未作答：请作答或显式跳过`;

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

/**
 * 一题的候选项：预设项 + 自定义 / 跳过。
 * 「提交」不混进候选项 —— 它是题目 tab 之后的独立一页，免得提交被当成一种回答。
 * 该题已有自定义答案时，把它挂在「自定义回答」项下方。
 */
const entriesFor = (question: AskQuestion, answer: AskAnswer | undefined): readonly AskEntry[] =>
  askEntries(question).map((entry) =>
    answer !== undefined && answer.custom && !answer.skipped && entry.value === CUSTOM_LABEL
      ? { ...entry, description: `已填：${answer.answer}` }
      : entry,
  );

/** 提交页的一行：一题及其当前状态。 */
export interface SubmitRow {
  readonly questionIndex: number;
  readonly question: string;
  /** 渲染好的答案文本：答案 / `（跳过）` / `未作答`。 */
  readonly answer: string;
  /** `false` 表示这道题既没作答也没显式跳过，提交会被拦下。 */
  readonly answered: boolean;
}

/** 提交页的汇总行：每题一行，未作答的列出来好让人知道差什么。 */
export const submitRows = (
  questions: readonly AskQuestion[],
  answers: readonly (AskAnswer | undefined)[],
): readonly SubmitRow[] =>
  questions.map((question, at) => {
    const answer = answers[at];
    if (answer === undefined) {
      return { questionIndex: at, question: question.question, answer: "未作答", answered: false };
    }
    const text = answer.skipped
      ? "（跳过）"
      : answer.custom
        ? `${answer.answer}（自定义）`
        : answer.answer;
    return { questionIndex: at, question: question.question, answer: text, answered: true };
  });

/** 题目页的底部键位提示：切页、移动、直选、确认前进。 */
const questionHint = (total: number, answered: number): string => {
  const confirm = keyText("tui.select.confirm");
  const cancel = keyText("tui.select.cancel");
  return `  已答 ${answered}/${total} · ←/→ 或 Tab/Shift+Tab 切题（末页为「${SUBMIT_LABEL}」） · ↑/↓ 或 k/j 移动 · 数字 1-9 直选 · ${confirm} 确认并前进 · ${cancel} 取消`;
};

/** 提交页的底部键位提示：这里 Enter 才是提交。 */
const submitHint = (): string => {
  const confirm = keyText("tui.select.confirm");
  const cancel = keyText("tui.select.cancel");
  return `  ${confirm} ${SUBMIT_LABEL} · ←/Shift+Tab 回上一题 · ${cancel} 取消`;
};

/** 提交页标题。 */
const submitTitle = (answered: number, total: number): string =>
  `${SUBMIT_LABEL}（已答 ${answered}/${total}）`;

/**
 * TUI：一个组件管全部题目，每项两行、项间空行，可来回切题。
 * @param ctx - 工具上下文。
 * @param questions - 全部问题。
 * @param draft - 重新进入时的草稿（回到同一题或已前进的落点，可带一次性提示）。
 * @returns 组件的意图；自定义回答要由外层去 `ctx.ui.input`。
 */
const askInTui = async (
  ctx: ExtensionToolContext,
  questions: readonly AskQuestion[],
  draft: AskDraft,
): Promise<AskEvent> =>
  ctx.ui.custom<AskEvent>((tui, theme: Theme, keybindings, done) => {
    const total = questions.length;
    /** 提交页的 tab 下标：题目是 `0..total-1`，提交页是 `total`。 */
    const submitTab = total;
    const container = new Container();
    let index = Math.min(Math.max(draft.index, 0), submitTab);
    /** 提交被拦下时的提示；下一次按键先清掉。 */
    let warning: string | undefined = draft.notice;
    const selection: number[] = [];
    const answers: (AskAnswer | undefined)[] = [];
    for (let at = 0; at < total; at += 1) {
      const count = entriesFor(questions[at] as AskQuestion, draft.answers[at]).length;
      const picked = draft.selection[at] ?? 0;
      selection[at] = picked >= 0 && picked < count ? picked : 0;
      answers[at] = draft.answers[at];
    }

    const snapshot = (): AskDraft => ({
      index,
      selection: [...selection],
      answers: [...answers],
    });

    const entriesAt = (): readonly AskEntry[] =>
      entriesFor(questions[index] as AskQuestion, answers[index]);

    const answered = (): number => answers.filter((answer) => answer !== undefined).length;

    /** 未作答的题：显式跳过（`skipped`）算已处理。 */
    const unanswered = (): number[] => {
      const missing: number[] = [];
      answers.forEach((answer, at) => {
        if (answer === undefined) missing.push(at);
      });
      return missing;
    };

    /** 提交：还有未作答的题就拦下，把光标带到第一道未答题并提示。 */
    const attemptSubmit = (): AskEvent | undefined => {
      const missing = unanswered();
      if (missing.length > 0) {
        warning = unansweredNotice(missing);
        index = missing[0] as number;
        return undefined;
      }
      return { kind: "submit", draft: snapshot() };
    };

    const draw = (): void => {
      container.clear();
      container.addChild(new DynamicBorder((text) => theme.fg("accent", text)));
      container.addChild(new Spacer(1));
      if (index >= submitTab) {
        container.addChild(new Text(theme.bold(submitTitle(answered(), total)), 0, 0));
        container.addChild(new Spacer(1));
        for (const row of submitRows(questions, answers)) {
          const head = theme.fg("dim", `Q${row.questionIndex + 1} ${row.question}`);
          const body = row.answered ? row.answer : theme.fg("warning", row.answer);
          container.addChild(new Text(`${head} → ${body}`, 0, 0));
          container.addChild(new Spacer(1));
        }
        if (warning !== undefined) {
          container.addChild(new Text(theme.fg("warning", warning), 0, 0));
          container.addChild(new Spacer(1));
        }
        container.addChild(new Text(theme.fg("dim", submitHint()), 0, 0));
        container.addChild(new DynamicBorder((text) => theme.fg("accent", text)));
        return;
      }
      const entries = entriesAt();
      container.addChild(
        new Text(theme.bold(questionTitle(questions[index] as AskQuestion, index, total)), 0, 0),
      );
      container.addChild(new Spacer(1));
      for (const lines of askEntryLines(entries, selection[index] ?? 0, (text) =>
        theme.fg("dim", text),
      )) {
        container.addChild(new Text(lines.join("\n"), 0, 0));
        container.addChild(new Spacer(1));
      }
      if (warning !== undefined) {
        container.addChild(new Text(theme.fg("warning", warning), 0, 0));
        container.addChild(new Spacer(1));
      }
      container.addChild(new Text(theme.fg("dim", questionHint(total, answered())), 0, 0));
      container.addChild(new DynamicBorder((text) => theme.fg("accent", text)));
    };

    /**
     * 确认当前页：提交页才真提交（要过未答拦截）；题目页只记答案并前进，末题前进到提交页。
     */
    const commit = (): AskEvent | undefined => {
      if (index >= submitTab) return attemptSubmit();
      const question = questions[index] as AskQuestion;
      const entry = entriesAt()[selection[index] ?? 0];
      if (entry !== undefined) {
        if (entry.value === CUSTOM_LABEL) {
          // 已有自定义答案时 Enter 表示「采用它」，不再重复弹输入。
          if (answers[index]?.custom !== true) return { kind: "custom", draft: snapshot() };
        } else {
          answers[index] =
            entry.value === SKIP_LABEL
              ? {
                  question: question.question,
                  questionIndex: index,
                  answer: "",
                  skipped: true,
                  custom: false,
                }
              : {
                  question: question.question,
                  questionIndex: index,
                  answer: entry.value,
                  skipped: false,
                  custom: false,
                };
        }
      }
      index = nextTab(index, total);
      return undefined;
    };

    draw();

    /** 切到另一个 tab（题目与提交页共 `total + 1` 页）：保留每题自己的选中位置。 */
    const moveTo = (offset: number): void => {
      index = (index + offset + submitTab + 1) % (submitTab + 1);
      draw();
      tui.requestRender();
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
        warning = undefined;
        if (keybindings.matches(data, "tui.select.cancel")) {
          done({ kind: "cancel", draft: snapshot() });
          return;
        }
        if (keybindings.matches(data, "tui.select.confirm")) {
          const event = commit();
          if (event !== undefined) {
            done(event);
            return;
          }
          draw();
          tui.requestRender();
          return;
        }
        const back = matchesKey(data, "left") || matchesKey(data, "shift+tab");
        const forward = matchesKey(data, "right") || matchesKey(data, "tab");
        if (back) {
          moveTo(-1);
          return;
        }
        if (forward) {
          moveTo(1);
          return;
        }
        // 提交页没有候选项：Enter / Esc / 切页已在上面处理，其余键忽略。
        if (index >= submitTab) return;
        const entries = entriesAt();
        if (entries.length === 0) return;
        const at = selection[index] ?? 0;
        if (keybindings.matches(data, "tui.select.up") || data === "k") {
          selection[index] = (at + entries.length - 1) % entries.length;
        } else if (keybindings.matches(data, "tui.select.down") || data === "j") {
          selection[index] = (at + 1) % entries.length;
        } else if (data.length === 1 && data >= "1" && data <= "9") {
          // 数字直选：按下就确认，省掉一次 Enter。
          const target = Number(data) - 1;
          if (target >= entries.length) return;
          selection[index] = target;
          const event = commit();
          if (event !== undefined) {
            done(event);
            return;
          }
        } else {
          return;
        }
        draw();
        tui.requestRender();
      },
    };
  });

/**
 * 非 TUI：一道题一次 `ctx.ui.select`，顺序问答、不能回退。
 * @param ctx - 工具上下文。
 * @param question - 当前问题。
 * @param index - 第几题（0 起）。
 * @param total - 总题数。
 * @returns 选中项的值；取消为 undefined。
 */
const pickSequential = async (
  ctx: ExtensionToolContext,
  question: AskQuestion,
  index: number,
  total: number,
): Promise<string | undefined> => {
  const entries = askEntries(question);
  const labels = fallbackLabels(entries);
  const picked = await ctx.ui.select(questionTitle(question, index, total), labels);
  if (picked === undefined) return undefined;
  const at = labels.indexOf(picked);
  return at === -1 ? picked : entries[at]?.value;
};

/** 把选中的值落成一条答案。 */
const answerFrom = (question: AskQuestion, index: number, picked: string): AskAnswer =>
  picked === SKIP_LABEL
    ? {
        question: question.question,
        questionIndex: index,
        answer: "",
        skipped: true,
        custom: false,
      }
    : {
        question: question.question,
        questionIndex: index,
        answer: picked,
        skipped: false,
        custom: false,
      };

/** rpc / print：逐题询问；取消时保留已完成答案并标记 cancelled。 */
const askSequential = async (
  ctx: ExtensionToolContext,
  questions: readonly AskQuestion[],
): Promise<AskResult> => {
  const answers: AskAnswer[] = [];
  for (const [index, item] of questions.entries()) {
    const picked = await pickSequential(ctx, item, index, questions.length);
    if (picked === undefined) return { answers, cancelled: true };
    if (picked === CUSTOM_LABEL) {
      // 与 TUI 同一条规则：空输入不算答案，留在本题重问；取消（undefined）才离开。
      for (;;) {
        const text = await ctx.ui.input(item.question, "输入回答");
        if (text === undefined) return { answers, cancelled: true };
        const trimmed = text.trim();
        if (trimmed === "") continue;
        answers.push({
          question: item.question,
          questionIndex: index,
          answer: trimmed,
          skipped: false,
          custom: true,
        });
        break;
      }
      continue;
    }
    answers.push(answerFrom(item, index, picked));
  }
  return { answers, cancelled: false };
};

/**
 * TUI：一个组件管全部题目，直到提交 / 取消；自定义回答跳出后按「确认并前进」继续。
 * @param ctx - 工具上下文。
 * @param questions - 全部问题。
 * @returns 答案与是否取消。
 */
const askInteractive = async (
  ctx: ExtensionToolContext,
  questions: readonly AskQuestion[],
): Promise<AskResult> => {
  const total = questions.length;
  let index = 0;
  /** 重新进入组件时展示一次提示（空输入 / 取消自定义）；清掉后不再重复。 */
  let notice: string | undefined;
  const selection: number[] = questions.map(() => 0);
  const answers: (AskAnswer | undefined)[] = questions.map(() => undefined);
  const collected = (): AskAnswer[] =>
    answers.filter((answer): answer is AskAnswer => answer !== undefined);

  for (;;) {
    const event = await askInTui(ctx, questions, {
      index,
      selection: [...selection],
      answers: [...answers],
      ...(notice === undefined ? {} : { notice }),
    });
    notice = undefined;
    // 组件里的切题与选中位置要带出来，重新进入时才能停在同一题。
    index = event.draft.index;
    event.draft.selection.forEach((picked, at) => {
      selection[at] = picked;
    });
    event.draft.answers.forEach((answer, at) => {
      answers[at] = answer;
    });
    if (event.kind === "cancel") return { answers: collected(), cancelled: true };
    if (event.kind === "submit") return { answers: collected(), cancelled: false };

    // 自定义回答：组件先退出，这里取文本后带着同一份草稿重新进入。
    const question = questions[index] as AskQuestion;
    const text = await ctx.ui.input(question.question, "输入回答");
    if (text === undefined) {
      // 放弃自定义：回到同一题，该题已有答案不变。
      notice = CUSTOM_CANCELLED_NOTICE;
      continue;
    }
    const trimmed = text.trim();
    if (trimmed === "") {
      // 空串 / 纯空白不算答案，也不记跳过：不前进，留在该题并提示。
      notice = EMPTY_CUSTOM_NOTICE;
      continue;
    }
    answers[index] = {
      question: question.question,
      questionIndex: index,
      answer: trimmed,
      skipped: false,
      custom: true,
    };
    // 与在选项上按 Enter 走同一条「确认并前进」：下一题，末题落到「提交」页。
    index = nextTab(index, total);
  }
};

/** 按运行模式选实现：TUI 可回退切题，rpc / print 顺序问答。 */
const ask = async (
  ctx: ExtensionToolContext,
  questions: readonly AskQuestion[],
): Promise<AskResult> =>
  ctx.mode === "tui" ? askInteractive(ctx, questions) : askSequential(ctx, questions);

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
    "已登记为待答问题（needs=answer）；当前会话没有交互界面，请切换到可交互会话后再问。",
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
    const number = (answer.questionIndex ?? index) + 1;
    lines.push(`Q${number}: ${answer.question}`);
    lines.push(`A${number}: ${label}${suffix}`);
  });
  if (cancelled) lines.push("（用户取消了后续问题）");
  return lines.length === 0 ? "（未提问）" : lines.join("\n");
};

/** 构造 `ask_questions` 工具。 */
export const createAskQuestionsTool = (): ToolDefinition => ({
  name: "ask_questions",
  label: "Ask Questions",
  description:
    "向用户提出一个或多个问题，逐题等待回答。每题最多 3 个预设选项（每个选项建议配一句话概述），也可自定义回答或跳过；适用于任何需要用户决策的场景。TUI 下可用 ←/→ 或 Tab/Shift+Tab 在题目间来回切换并回改答案；自定义回答输入后按 Enter 即保存并前进（末题进「提交」页），空输入不前进、Esc 取消则留原题；题目之后还有一页独立的「提交」（先汇总各题答案再提交），有题未作答（既未作答也未显式跳过）时提交会被拦下并提示是哪几题。rpc / print 为顺序问答，不支持回退。",
  promptSnippet: "Ask the user one or more questions and wait for answers.",
  promptGuidelines: [
    "ask_questions 会阻塞直到用户作答；一次可提任意数量的问题，每题都能自定义回答或跳过。",
    "每题最多给 3 个预设选项：优先给满 3 个，但不要硬凑；凑不出就少给，用户仍可自定义回答或跳过。",
    "给预设选项时，为每个选项写一句话 description（取舍 / 代价 / 后果）；TUI 会把它展示在选项下方，建议 ≤ 60 字，字段可选。",
    "多题可放进一次调用：TUI 下用户能来回切题、回改答案，也能直接翻到末尾的「提交」页预览，所以每题都应能独立作答，不依赖上一题的选择。",
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
              maxItems: MAX_OPTIONS,
              description: "预设选项；最多 3 个，优先给满但不要硬凑，留空则只允许自定义回答或跳过",
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
