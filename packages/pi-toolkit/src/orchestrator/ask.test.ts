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

  it("Enter 前进到下一题，末题 Enter 提交", async () => {
    const { text, renders } = await runTui(twoQuestions, [["\r", "\u001b[B", "\r"]]);
    expect(renders[0]?.join("\n")).toContain("问题 1/2");
    expect(text).toContain("A1: A");
    expect(text).toContain("A2: D");
    expect((await runTui(twoQuestions, [["\r", "\r"]])).text).toContain("A2: C");
  });

  it("→ / Tab 前进、← / Shift+Tab 回退，回退后能覆盖答案", async () => {
    // Q1 Enter 得 A 并前进 → ← 回 Q1 改选 B 并确认 → Q2 选 D 提交。
    const viaArrows = await runTui(twoQuestions, [
      ["\r", "\u001b[D", "\u001b[B", "\r", "\u001b[B", "\r"],
    ]);
    expect(viaArrows.text).toContain("A1: B");
    expect(viaArrows.text).toContain("A2: D");
    expect(viaArrows.details["cancelled"]).toBe(false);

    // Tab 前进、Shift+Tab 回退（在首题上用 Shift+Tab 得回绕）。
    const viaTab = await runTui(twoQuestions, [["\t", "\u001b[Z", "\r", "\r"]]);
    expect(viaTab.text).toContain("A1: A");
    expect(viaTab.text).toContain("A2: C");
  });

  it("回退保留该题原来的选中位置", async () => {
    // Q1 ↓ 到 B 但先不确认，→ 去 Q2，← 回来应仍在 B（Enter 直接就是 B）。
    const { text } = await runTui(twoQuestions, [["\u001b[B", "\u001b[C", "\u001b[D", "\r", "\r"]]);
    expect(text).toContain("A1: B");
    expect(text).toContain("A2: C");
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
  // 每题候选项：预设项 + ✎ 自定义回答 + 跳过 + 提交。
  const Q2_SUBMIT = ["\u001b[B", "\u001b[B", "\u001b[B", "\u001b[B"];

  it("还有未答题时提交被拒并指出是哪几题", async () => {
    const { text, renders, frames, details } = await runTui(twoQuestions, [
      ["\r", ...Q2_SUBMIT, "\r"],
    ]);
    // 被拦下：组件没有退出（只进入过一次），最后一帧给出未答清单。
    expect(renders).toHaveLength(1);
    expect((frames.at(-1) ?? []).join("\n")).toContain("还有 Q2 未作答");
    // 没交出去就是取消（脚本耗尽后的兜底），已答的 Q1 保留。
    expect(text).toContain("A1: A");
    expect(text).not.toContain("A2");
    expect(details["cancelled"]).toBe(true);
  });

  it("拦下后补答再提交就通过，且光标停在首个未答题", async () => {
    const { text, frames, details } = await runTui(twoQuestions, [
      // Q1 确认前进 → Q2 选到「提交」→ 被拦（光标回 Q2、提示）→ 选 D → 提交。
      ["\r", ...Q2_SUBMIT, "\r", "\u001b[B", "\u001b[B", "\r"],
    ]);
    expect((frames.at(-1) ?? []).join("\n")).toContain("问题 2/2");
    expect(text).toContain("A1: A");
    expect(text).toContain("A2: D");
    expect(details["cancelled"]).toBe(false);
  });

  it("跳题后停在首题按「提交」也被拦下，并指出跳过的题", async () => {
    const { text, frames } = await runTui(twoQuestions, [
      // Q1 直接选到「提交」（↓×4）并回车。
      [...Q2_SUBMIT, "\r"],
    ]);
    const last = (frames.at(-1) ?? []).join("\n");
    expect(last).toContain("还有 Q1、Q2 未作答");
    expect(last).toContain("问题 1/2");
    expect(text).toContain("取消了后续问题");
  });

  it("显式跳过不算未作答，提交通过，details 能区分跳过与未答", async () => {
    const { text, details } = await runTui(twoQuestions, [
      // Q1 选「跳过」（↓↓↓）→ 自动前进 → Q2 选 C → 末题 Enter 提交。
      ["\u001b[B", "\u001b[B", "\u001b[B", "\r", "\r"],
    ]);
    expect(text).toContain("A1: （跳过）");
    expect(text).toContain("A2: C");
    const answers = details["answers"] as { skipped: boolean; answer: string }[];
    expect(answers).toHaveLength(2);
    expect(answers[0]).toMatchObject({ skipped: true, answer: "" });
    expect(answers[1]).toMatchObject({ skipped: false, answer: "C" });
  });
});

describe("TUI 自定义回答", () => {
  it("跳出组件输入后回到同一题，且此前答案不丢", async () => {
    const { text, renders } = await runTui(
      [
        { question: "第一题", options: [{ label: "A" }] },
        { question: "第二题", options: [{ label: "C" }] },
      ],
      [
        // Q1 选确认，Q2 滚到「✎ 自定义回答」（C → 自定义）。
        ["\r", "\u001b[B", "\r"],
        // 输入后重新进入组件，应停在 Q2 的「自定义回答」项上，Enter 采用该答案提交。
        ["\r"],
      ],
      ["自己写"],
    );
    expect(renders).toHaveLength(2);
    const second = renders[1]?.join("\n") ?? "";
    expect(second).toContain("问题 2/2");
    expect(second).toContain("已填：自己写");
    expect(text).toContain("A1: A");
    expect(text).toContain("A2: 自己写（自定义）");
  });

  it("自定义输入被取消时整轮取消但保留已答", async () => {
    const { text, details } = await runTui(
      [{ question: "第一题", options: [{ label: "A" }] }],
      [["\u001b[B", "\r"]],
      [],
    );
    expect(details["cancelled"]).toBe(true);
    expect(text).toContain("用户取消了后续问题");
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

  it("k/j 也能移动，↑ 从首项环绕到末项（提交）", async () => {
    const { text } = await runTui(question, [["j", "\r"]]);
    expect(text).toContain("A1: B");
    const wrapped = await runTui(question, [["\u001b[A", "\r"]]);
    // 首项向上环绕到末项「提交」；单题未作答时提交被拦下。
    expect(wrapped.text).toContain("取消了后续问题");
    expect((wrapped.frames.at(-1) ?? []).join("\n")).toContain("还有 Q1 未作答");
  });

  it("末尾固定项依次是 自定义 / 跳过 / 提交", async () => {
    const { rendered } = await runTui(question, [["\r"]]);
    const text = rendered.join("\n");
    expect(text).toContain("3. ✎ 自定义回答");
    expect(text).toContain("4. 跳过");
    expect(text).toContain("5. 提交");
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
