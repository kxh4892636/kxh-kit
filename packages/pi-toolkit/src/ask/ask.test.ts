import { describe, expect, it } from "vite-plus/test";
import {
  CUSTOM_CANCELLED_NOTICE,
  EMPTY_CUSTOM_NOTICE,
  askEntries,
  askEntryLines,
  createAskQuestionsTool,
  formatAnswers,
  nextTab,
  parseQuestions,
  submitRows,
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
  done: (result: unknown) => void,
) => FakeComponent;

/** 在 tui 模式下跑一次提问：拦下自定义组件（可多次进入）、记下每帧、按脚本送按键。 */
const runTui = async (
  questions: unknown,
  steps: readonly (readonly string[])[],
  inputs: readonly string[] = [],
): Promise<{
  readonly text: string;
  readonly rendered: readonly string[];
  readonly renders: readonly (readonly string[])[];
  readonly frames: readonly (readonly string[])[];
  readonly details: Record<string, unknown>;
}> => {
  const pending = [...inputs];
  const scripts = steps.map((step) => [...step]);
  const starts: string[][] = [];
  const frames: string[][] = [];
  const ctx = {
    mode: "tui",
    ui: {
      custom: async (factory: unknown) =>
        new Promise<unknown>((resolve) => {
          // resolve 幂等：脚本没把组件送出去时也不让测试挂住。
          let settled = false;
          const done = (result: unknown): void => {
            if (settled) return;
            settled = true;
            resolve(result);
          };
          const component = (factory as FakeFactory)(
            { requestRender: () => undefined },
            fakeTheme,
            fakeKeybindings,
            done,
          );
          const keys = scripts.shift() ?? [];
          starts.push(component.render(60));
          frames.push(component.render(60));
          for (const key of keys) {
            component.handleInput(key);
            frames.push(component.render(60));
          }
          // 脚本没结束时补一个 Esc，让 ask() 拿到组件真实状态的取消终态。
          if (!settled) component.handleInput("\u001b");
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
  )) as { content: { text: string }[]; details: Record<string, unknown> };
  return {
    text: result.content[0]?.text ?? "",
    rendered: starts[0] ?? [],
    renders: starts,
    frames,
    details: result.details,
  };
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

describe("parseQuestions 选项上限", () => {
  it("4 个选项报错并说明上限", () => {
    expect(() =>
      parseQuestions(
        params([
          {
            question: "选哪个？",
            options: [{ label: "A" }, { label: "B" }, { label: "C" }, { label: "D" }],
          },
        ]),
      ),
    ).toThrow(/最多 3 个/u);
    expect(() =>
      parseQuestions(
        params([
          {
            question: "选哪个？",
            options: [{ label: "A" }, { label: "B" }, { label: "C" }, { label: "D" }],
          },
        ]),
      ),
    ).toThrow(/不足不必硬凑/u);
  });

  it("3 个选项通过，0 个也通过（只剩自定义与跳过）", () => {
    const three = parseQuestions(
      params([{ question: "选哪个？", options: [{ label: "A" }, { label: "B" }, { label: "C" }] }]),
    );
    expect(three[0]?.options).toHaveLength(3);
    const none = parseQuestions(params([{ question: "随便聊聊？", options: [] }]));
    expect(none[0]?.options).toEqual([]);
    expect(askEntries(none[0]!).map((entry) => entry.value)).toEqual(["✎ 自定义回答", "跳过"]);
  });
});

describe("TUI 状态机", () => {
  const twoQuestions = [
    { question: "第一题", options: [{ label: "A" }, { label: "B" }] },
    { question: "第二题", options: [{ label: "C" }, { label: "D" }] },
  ];

  it("Enter 前进到下一题，末题 Enter 前进到提交页", async () => {
    const { text, frames, renders } = await runTui(twoQuestions, [["\r", "\u001b[B", "\r", "\r"]]);
    expect(renders[0]?.join("\n")).toContain("问题 1/2");
    expect(text).toContain("A1: A");
    expect(text).toContain("A2: D");
    // 末题 Enter 只前进到提交页，不直接提交。
    expect((frames.at(-1) ?? []).join("\n")).toContain("提交（已答 2/2）");
    expect((await runTui(twoQuestions, [["\r", "\r", "\r"]])).text).toContain("A2: C");
  });

  it("→ / Tab 前进、← / Shift+Tab 回退，回退后能覆盖答案", async () => {
    // Q1 Enter 得 A 并前进 → ← 回 Q1 改选 B 并确认 → Q2 选 D → 提交页提交。
    const viaArrows = await runTui(twoQuestions, [
      ["\r", "\u001b[D", "\u001b[B", "\r", "\u001b[B", "\r", "\r"],
    ]);
    expect(viaArrows.text).toContain("A1: B");
    expect(viaArrows.text).toContain("A2: D");
    expect(viaArrows.details["cancelled"]).toBe(false);

    // Tab 前进、Shift+Tab 回退（在首题上用 Shift+Tab 得回绕到提交页）。
    const viaTab = await runTui(twoQuestions, [["\t", "\u001b[Z", "\r", "\r", "\r"]]);
    expect(viaTab.text).toContain("A1: A");
    expect(viaTab.text).toContain("A2: C");
    expect(viaTab.details["cancelled"]).toBe(false);
  });

  it("回退保留该题原来的选中位置", async () => {
    // Q1 ↓ 到 B 但先不确认，→ 去 Q2，← 回来应仍在 B（Enter 直接就是 B）。
    const { text, details } = await runTui(twoQuestions, [
      ["\u001b[B", "\u001b[C", "\u001b[D", "\r", "\r", "\r"],
    ]);
    expect(text).toContain("A1: B");
    expect(text).toContain("A2: C");
    expect(details["cancelled"]).toBe(false);
  });

  it("Esc 取消并保留已答", async () => {
    const { text, details } = await runTui(twoQuestions, [["\r", "\u001b"]]);
    expect(text).toContain("A1: A");
    expect(text).not.toContain("Q2");
    expect(text).toContain("用户取消了后续问题");
    expect(details["cancelled"]).toBe(true);
  });
});

describe("TUI 「提交」拦截未答", () => {
  const twoQuestions = [
    { question: "第一题", options: [{ label: "A" }, { label: "B" }] },
    { question: "第二题", options: [{ label: "C" }, { label: "D" }] },
  ];

  it("还有未答题时提交被拒并指出是哪几题", async () => {
    // Q1 确认前进 → Tab 翻到「提交」页 → Enter 被拦下。
    const { text, renders, frames, details } = await runTui(twoQuestions, [["\r", "\t", "\r"]]);
    // 被拦下：组件没有退出（只进入过一次）。
    expect(renders).toHaveLength(1);
    const last = (frames.at(-1) ?? []).join("\n");
    expect(last).toContain("还有 Q2 未作答");
    // 光标回到第一道未答题。
    expect(last).toContain("问题 2/2");
    // 没交出去就是取消（脚本耗尽后的兜底），已答的 Q1 保留。
    expect(text).toContain("A1: A");
    expect(text).not.toContain("A2");
    expect(details["cancelled"]).toBe(true);
  });

  it("拦下后补答再提交就通过，且光标停在首个未答题", async () => {
    const { text, frames, details } = await runTui(twoQuestions, [
      // Q1 确认 → Tab 到提交页 → Enter 被拦（光标回 Q2）→ 选 D → 前进到提交页 → Enter 提交。
      ["\r", "\t", "\r", "\u001b[B", "\r", "\r"],
    ]);
    expect((frames.at(-1) ?? []).join("\n")).toContain("提交（已答 2/2）");
    expect(text).toContain("A1: A");
    expect(text).toContain("A2: D");
    expect(details["cancelled"]).toBe(false);
  });

  it("从首题直接翻到提交页也被拦下，并指出没答的题", async () => {
    // 在 Q1 上按 ← 回绕到「提交」页，再 Enter。
    const { text, frames } = await runTui(twoQuestions, [["\u001b[D", "\r"]]);
    const last = (frames.at(-1) ?? []).join("\n");
    expect(last).toContain("还有 Q1、Q2 未作答");
    expect(last).toContain("问题 1/2");
    expect(text).toContain("取消了后续问题");
  });

  it("显式跳过不算未作答，提交通过，details 能区分跳过与未答", async () => {
    const { text, details } = await runTui(twoQuestions, [
      // Q1 选「跳过」（↓↓↓）→ 前进 → Q2 选 C → 提交页 → 提交。
      ["\u001b[B", "\u001b[B", "\u001b[B", "\r", "\r", "\r"],
    ]);
    expect(text).toContain("A1: （跳过）");
    expect(text).toContain("A2: C");
    const answers = details["answers"] as { skipped: boolean; answer: string }[];
    expect(answers).toHaveLength(2);
    expect(answers[0]).toMatchObject({ skipped: true, answer: "" });
    expect(answers[1]).toMatchObject({ skipped: false, answer: "C" });
  });
});

describe("TUI 「提交」独立一页", () => {
  const twoQuestions = [
    { question: "第一题", options: [{ label: "A" }, { label: "B" }] },
    { question: "第二题", options: [{ label: "C" }, { label: "D" }] },
  ];

  it("提交页汇总每题状态：答案与跳过", async () => {
    const { frames } = await runTui(twoQuestions, [
      // Q1 A → 前进；Q2 选「跳过」→ 前进到提交页。
      ["\r", "\u001b[B", "\u001b[B", "\u001b[B", "\r"],
    ]);
    const page = (frames.at(-1) ?? []).join("\n");
    expect(page).toContain("提交（已答 2/2）");
    expect(page).toContain("Q1 第一题 → A");
    expect(page).toContain("Q2 第二题 → （跳过）");
    expect(page).toContain("←/Shift+Tab 回上一题");
  });

  it("提交页按 ← 回到末题，改完再回提交页提交", async () => {
    const { text, details } = await runTui(twoQuestions, [
      // Q1 A → Q2 C → 提交页 → ← 回 Q2 → D → 提交页 → Enter 提交。
      ["\r", "\r", "\u001b[D", "\u001b[B", "\r", "\r"],
    ]);
    expect(text).toContain("A1: A");
    expect(text).toContain("A2: D");
    expect(details["cancelled"]).toBe(false);
  });

  it("submitRows 区分答案 / 跳过 / 未作答", () => {
    const parsed = parseQuestions(params(twoQuestions));
    const rows = submitRows(parsed, [
      { question: "第一题", answer: "A", skipped: false, custom: false },
      undefined,
    ]);
    expect(rows[0]).toMatchObject({ questionIndex: 0, answer: "A", answered: true });
    expect(rows[1]).toMatchObject({ questionIndex: 1, answer: "未作答", answered: false });
    const mixed = submitRows(parsed, [
      { question: "第一题", answer: "", skipped: true, custom: false },
      { question: "第二题", answer: "手写", skipped: false, custom: true },
    ]);
    expect(mixed[0]?.answer).toBe("（跳过）");
    expect(mixed[1]?.answer).toBe("手写（自定义）");
  });
});

describe("TUI 自定义回答", () => {
  const twoQuestions = [
    { question: "第一题", options: [{ label: "A" }] },
    { question: "第二题", options: [{ label: "C" }] },
  ];

  it("输入非空即保存并前进到下一题", async () => {
    const { text, renders, details } = await runTui(
      twoQuestions,
      [
        // Q1 滚到「✎ 自定义回答」后确认，跳出组件取文本。
        ["\u001b[B", "\r"],
        // 重新进入应已在 Q2：确认 C → 提交页 → 提交。
        ["\r", "\r"],
      ],
      ["自己写"],
    );
    expect(renders).toHaveLength(2);
    const second = renders[1]?.join("\n") ?? "";
    expect(second).toContain("问题 2/2");
    expect(second).toContain("已答 1/2");
    expect(text).toContain("A1: 自己写（自定义）");
    expect(text).toContain("A2: C");
    expect(details["cancelled"]).toBe(false);
  });

  it("末题自定义后直接落到「提交」页", async () => {
    const { text, renders, details } = await runTui(
      [{ question: "第一题", options: [{ label: "A" }] }],
      [["\u001b[B", "\r"], ["\r"]],
      ["自己写"],
    );
    const page = renders[1]?.join("\n") ?? "";
    expect(page).toContain("提交（已答 1/1）");
    expect(page).toContain("Q1 第一题 → 自己写（自定义）");
    expect(text).toContain("A1: 自己写（自定义）");
    expect(details["cancelled"]).toBe(false);
  });

  it("空串 / 纯空白不前进、不记答案，留在该题并提示", async () => {
    const { text, renders, details } = await runTui(
      [{ question: "第一题", options: [{ label: "A" }] }],
      [
        ["\u001b[B", "\r"],
        // 回到原题后改选 A：确认 → 提交页 → 提交。
        ["\u001b[A", "\r", "\r"],
      ],
      ["   "],
    );
    const page = renders[1]?.join("\n") ?? "";
    expect(page).toContain("问题 1/1");
    expect(page).toContain("已答 0/1");
    expect(page).toContain(EMPTY_CUSTOM_NOTICE);
    expect(text).toContain("A1: A");
    expect(details["cancelled"]).toBe(false);
    const answers = details["answers"] as { skipped: boolean; custom: boolean }[];
    expect(answers).toHaveLength(1);
    expect(answers[0]).toMatchObject({ skipped: false, custom: false });
  });

  it("输入框里取消 = 回原题，答案不变", async () => {
    const { text, renders, details } = await runTui(
      [{ question: "第一题", options: [{ label: "A" }] }],
      [
        // 选 A 确认 → 提交页 → ← 回该题 → 滚到自定义并确认。
        ["\r", "\u001b[D", "\u001b[B", "\r"],
        // 取消后应仍在原题、答案仍是 A：确认 A → 提交页 → 提交。
        ["\u001b[A", "\r", "\r"],
      ],
      [],
    );
    const page = renders[1]?.join("\n") ?? "";
    expect(page).toContain("问题 1/1");
    expect(page).toContain("已答 1/1");
    expect(page).toContain(CUSTOM_CANCELLED_NOTICE);
    expect(text).toContain("A1: A");
    expect(details["cancelled"]).toBe(false);
  });
});

describe("nextTab", () => {
  it("题目页前进一题，末题落到提交页", () => {
    expect(nextTab(0, 2)).toBe(1);
    expect(nextTab(1, 2)).toBe(2);
    // 提交页本身就是终点：不再往后跑。
    expect(nextTab(2, 2)).toBe(2);
  });
});

describe("TUI 渲染", () => {
  it("标题带进度，保留概述与键位提示", async () => {
    const { rendered } = await runTui(
      [
        { question: "第一题", options: [{ label: "A", description: "代价小" }] },
        { question: "第二题" },
      ],
      [["\r", "\r"]],
    );
    const text = rendered.join("\n");
    expect(text).toContain("问题 1/2");
    expect(text).toContain("代价小");
    expect(text).toContain("已答 0/2");
    expect(text).toContain("←/→");
    expect(text).toContain("Tab/Shift+Tab");
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
    const { rendered } = await runTui(question, [["\r"]]);
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
      [["\r"]],
    );
    const text = rendered.join("\n");
    expect(text).toContain("1. A");
    expect(text).not.toContain("✎ 自定义回答");
    expect(text).not.toContain("3. 跳过");
  });

  it("数字键直选并确认", async () => {
    const { text } = await runTui(question, [["2"]]);
    expect(text).toContain("A1: B");
  });

  it("↓ 移动后 Enter 确认", async () => {
    const { text } = await runTui(question, [["\u001b[B", "\r"]]);
    expect(text).toContain("A1: B");
  });

  it("k/j 也能移动，↑ 从首项环绕到末项（跳过）", async () => {
    const { text } = await runTui(question, [["j", "\r"]]);
    expect(text).toContain("A1: B");
    const wrapped = await runTui(question, [["\u001b[A", "\r"]]);
    // 首项向上环绕到末项「跳过」；单题也还有一页提交页要过。
    expect(wrapped.text).toContain("A1: （跳过）");
    expect((wrapped.frames.at(-1) ?? []).join("\n")).toContain("提交（已答 1/1）");
  });

  it("末尾固定项只有 自定义 / 跳过，「提交」不占选项位", async () => {
    const { rendered } = await runTui(question, [["\r"]]);
    const text = rendered.join("\n");
    expect(text).toContain("3. ✎ 自定义回答");
    expect(text).toContain("4. 跳过");
    expect(text).not.toContain("5. 提交");
  });

  it("Esc 取消并保留已完成答案", async () => {
    const { text } = await runTui([{ question: "第一题" }], [["\u001b"]]);
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
