import { describe, expect, it } from "vite-plus/test";
import {
  askEntries,
  askEntryLines,
  createAskQuestionsTool,
  formatAnswers,
  parseQuestions,
} from "./ask.ts";

const params = (questions: unknown): Record<string, unknown> => ({ questions });

/** 只回显文本的主题替身：断言里可直接看内容，不被 ANSI 干扰。 */
const fakeTheme = {
  fg: (_color: string, text: string) => text,
  bold: (text: string) => text,
};

/** 最小键位替身：只认本组件用到的几个 id。 */
const fakeKeybindings = {
  matches: (data: string, id: string): boolean => {
    switch (id) {
      case "tui.select.confirm":
        return data === "\r";
      case "tui.select.cancel":
        return data === "\u001b";
      case "tui.select.up":
        return data === "\u001b[A";
      case "tui.select.down":
        return data === "\u001b[B";
      default:
        return false;
    }
  },
};

interface FakeComponent {
  render(width: number): string[];
  handleInput(data: string): void;
}

type FakeFactory = (
  tui: unknown,
  theme: unknown,
  keybindings: unknown,
  done: (result: string | undefined) => void,
) => FakeComponent;

/** 在 tui 模式下跑一次提问：拦下自定义组件、渲一次、再按顺序送按键。 */
const runTui = async (
  questions: unknown,
  keys: readonly string[],
  inputs: readonly string[] = [],
): Promise<{
  readonly text: string;
  readonly rendered: readonly string[];
}> => {
  const pending = [...inputs];
  let rendered: string[] = [];
  const ctx = {
    mode: "tui",
    ui: {
      custom: async (factory: unknown) =>
        new Promise<string | undefined>((resolve) => {
          const done = (result: string | undefined): void => resolve(result);
          const component = (factory as FakeFactory)(
            { requestRender: () => undefined },
            fakeTheme,
            fakeKeybindings,
            done,
          );
          rendered = component.render(60);
          for (const key of keys) component.handleInput(key);
          // 按键没结束时也收尾，避免测试挂住（resolve 幂等）。
          done(undefined);
        }),
      input: async () => pending.shift(),
    },
  };
  const result = (await createAskQuestionsTool().execute?.(
    "id",
    params(questions),
    undefined,
    undefined,
    ctx as never,
  )) as { content: { text: string }[] };
  return { text: result.content[0]?.text ?? "", rendered };
};

describe("parseQuestions", () => {
  it("accepts options, custom answers and skips", () => {
    const parsed = parseQuestions(
      params([
        {
          question: "选哪个？",
          options: [{ label: "A", description: "第一个" }, { label: "B" }],
        },
        { question: "补充？", allow_custom: false, allow_skip: false },
      ]),
    );
    expect(parsed).toHaveLength(2);
    expect(parsed[0]?.options.map((option) => option.label)).toEqual(["A", "B"]);
    expect(parsed[0]?.allowCustom).toBe(true);
    expect(parsed[1]).toMatchObject({ allowCustom: false, allowSkip: false });
  });

  it("rejects empty or malformed question lists", () => {
    expect(() => parseQuestions(params([]))).toThrow(/至少需要一道题/u);
    expect(() => parseQuestions(params([{ options: [] }]))).toThrow(/question 必填/u);
    expect(() => parseQuestions(params([{ question: "x", options: [{}] }]))).toThrow(/label 必填/u);
  });
});

describe("formatAnswers", () => {
  it("renders options, custom answers, skips and cancellation", () => {
    const text = formatAnswers(
      [
        { question: "Q1", answer: "A", skipped: false, custom: false },
        { question: "Q2", answer: "手写", skipped: false, custom: true },
        { question: "Q3", answer: "", skipped: true, custom: false },
      ],
      true,
    );
    expect(text).toContain("A1: A");
    expect(text).toContain("A2: 手写（自定义）");
    expect(text).toContain("A3: （跳过）");
    expect(text).toContain("用户取消了后续问题");
  });
});

describe("askEntries / askEntryLines", () => {
  it("presets first, then custom and skip according to the flags", () => {
    const [question] = parseQuestions(
      params([
        { question: "选哪个？", options: [{ label: "A", description: "快" }, { label: "B" }] },
      ]),
    );
    const entries = askEntries(question!);
    expect(entries.map((entry) => entry.value)).toEqual(["A", "B", "✎ 自定义回答", "跳过"]);
    expect(entries[0]?.description).toBe("快");
    expect(entries[1]?.description).toBeUndefined();
  });

  it("renders two lines per described entry, one line otherwise, and marks the selection", () => {
    const lines = askEntryLines(
      [
        { value: "A", label: "A", description: "代价小" },
        { value: "B", label: "B" },
        { value: "跳过", label: "跳过" },
      ],
      1,
    );
    expect(lines[0]).toEqual(["  1. A", "     代价小"]);
    expect(lines[1]).toEqual(["→ 2. B"]);
    expect(lines[2]).toEqual(["  3. 跳过"]);
  });
});

describe("非 TUI 回退", () => {
  it("把概述拼进 label，并且仍能选中", async () => {
    let seen: string[] = [];
    const ctx = {
      mode: "rpc",
      ui: {
        select: async (_title: string, labels: string[]) => {
          seen = labels;
          return labels[1];
        },
        input: async () => undefined,
      },
    };
    const result = (await createAskQuestionsTool().execute?.(
      "id",
      params([
        { question: "选哪个？", options: [{ label: "A", description: "代价小" }, { label: "B" }] },
      ]),
      undefined,
      undefined,
      ctx as never,
    )) as { content: { text: string }[] };
    expect(seen[0]).toBe("A — 代价小");
    expect(seen[1]).toBe("B");
    expect(seen).toContain("✎ 自定义回答");
    expect(seen).toContain("跳过");
    expect(result.content[0]?.text).toContain("A1: B");
  });
});

describe("TUI 自定义组件", () => {
  const question = [
    {
      question: "选哪个？",
      options: [{ label: "A", description: "代价小" }, { label: "B" }],
    },
  ];

  it("每项两行、项间一行空行，无概述的项不留空行", async () => {
    const { rendered } = await runTui(question, ["\r"]);
    const lines = rendered.map((line) => line.trimEnd());
    const head = lines.findIndex((line) => line.includes("1. A"));
    expect(head).toBeGreaterThanOrEqual(0);
    expect(lines[head]).toContain("→ 1. A");
    // 概述紧贴头部下一行（缩进后弱化），中间没有空行。
    expect(lines[head + 1]?.trim()).toBe("代价小");
    // 项与项之间恰有一行空行。
    expect(lines[head + 2]).toBe("");
    expect(lines[head + 3]).toContain("2. B");
    // 没有概述的项只占一行，紧跟的就是分隔空行。
    expect(lines[head + 4]).toBe("");
    // 末尾按 allow_custom / allow_skip 追加可选固定项。
    const text = lines.join("\n");
    expect(text).toContain("✎ 自定义回答");
    expect(text).toContain("跳过");
    expect(text).toContain("取消");
  });

  it("按 allow_custom / allow_skip 关掉末尾固定项", async () => {
    const { rendered } = await runTui(
      [{ question: "选一个", options: [{ label: "A" }], allow_custom: false, allow_skip: false }],
      ["\r"],
    );
    const text = rendered.join("\n");
    expect(text).toContain("1. A");
    expect(text).not.toContain("✎ 自定义回答");
    expect(text).not.toContain("3. 跳过");
  });

  it("数字键直选并确认", async () => {
    const { text } = await runTui(question, ["2"]);
    expect(text).toContain("A1: B");
  });

  it("↓ 移动后 Enter 确认", async () => {
    const { text } = await runTui(question, ["\u001b[B", "\r"]);
    expect(text).toContain("A1: B");
  });

  it("k/j 也能移动，↑ 从首项环绕到末项", async () => {
    const { text } = await runTui(question, ["j", "\r"]);
    expect(text).toContain("A1: B");
    const wrapped = await runTui(question, ["\u001b[A", "\r"]);
    // 首项向上环绕到末项（跳过）。
    expect(wrapped.text).toContain("A1: （跳过）");
  });

  it("Esc 取消并保留已完成答案", async () => {
    const { text } = await runTui([{ question: "第一题" }], ["\u001b"]);
    expect(text).toContain("取消了后续问题");
  });
});

describe("ask_questions tool", () => {
  it("asks each question and returns the answers", async () => {
    const picks = ["A", "✎ 自定义回答", "跳过"];
    const inputs = ["自己写"];
    const ctx = {
      mode: "rpc",
      ui: {
        select: async (_title: string, labels: string[]) => {
          const wanted = picks.shift();
          return labels.find((label) => label === wanted);
        },
        input: async () => inputs.shift(),
      },
    };
    const tool = createAskQuestionsTool();
    const result = (await tool.execute?.(
      "id",
      params([
        { question: "第一题", options: [{ label: "A" }, { label: "B" }] },
        { question: "第二题" },
        { question: "第三题" },
      ]),
      undefined,
      undefined,
      ctx as never,
    )) as { content: { text: string }[] };
    const text = result.content[0]?.text ?? "";
    expect(text).toContain("Q1: 第一题");
    expect(text).toContain("A1: A");
    expect(text).toContain("A2: 自己写（自定义）");
    expect(text).toContain("A3: （跳过）");
  });

  it("marks the result cancelled when the user escapes", async () => {
    const ctx = {
      mode: "rpc",
      ui: { select: async () => undefined, input: async () => undefined },
    };
    const tool = createAskQuestionsTool();
    const result = (await tool.execute?.(
      "id",
      params([{ question: "第一题" }]),
      undefined,
      undefined,
      ctx as never,
    )) as { content: { text: string }[] };
    expect(result.content[0]?.text).toContain("取消了后续问题");
  });

  it("registers the question instead of failing when no UI is available", async () => {
    const tool = createAskQuestionsTool();
    const result = (await tool.execute?.(
      "id",
      params([{ question: "要不要顺便改文档?" }]),
      undefined,
      undefined,
      {
        mode: "print",
      } as never,
    )) as {
      content: { text: string }[];
      details: Record<string, unknown>;
    };
    expect(result.details["needs"]).toBe("answer");
    expect(result.details["question"]).toBe("要不要顺便改文档?");
    expect(result.details["cancelled"]).toBe(true);
    expect(result.content[0]?.text).toContain("待答问题");
    expect(result.content[0]?.text).toContain("要不要顺便改文档?");
  });
});
