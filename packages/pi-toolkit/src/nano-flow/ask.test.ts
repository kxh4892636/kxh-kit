import { describe, expect, it } from "vite-plus/test";
import { createAskQuestionsTool, formatAnswers, parseQuestions } from "./ask.ts";

const params = (questions: unknown): Record<string, unknown> => ({ questions });

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

describe("ask_questions tool", () => {
  it("asks each question and returns the answers", async () => {
    const picks = ["A", "✎ 自定义回答", "跳过"];
    const inputs = ["自己写"];
    const ctx = {
      mode: "tui",
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
      mode: "tui",
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

  it("refuses non-interactive modes", async () => {
    const tool = createAskQuestionsTool();
    const result = (await tool.execute?.("id", params([{ question: "x" }]), undefined, undefined, {
      mode: "print",
    } as never)) as { content: { text: string }[] };
    expect(result.content[0]?.text).toContain("需要交互模式");
  });
});
