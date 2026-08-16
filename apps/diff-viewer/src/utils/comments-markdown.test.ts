import { describe, expect, it } from "vitest";

import type { DiffCommentThread } from "../types/diff.js";

import { formatCommentsMarkdown } from "./comments-markdown.js";

const makeThread = (overrides: Partial<DiffCommentThread> & { id: string }): DiffCommentThread => ({
  filePath: "src/a.ts",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  position: { side: "new", line: 2 },
  messages: [
    {
      id: overrides.id,
      body: "评论正文",
      author: "User",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
  ],
  ...overrides,
});

describe("formatCommentsMarkdown", () => {
  it("空评论列表输出空串", () => {
    expect(formatCommentsMarkdown([])).toBe("");
  });

  it("单条: 文件:行号 + 引用代码块 + 正文, 代码块与正文缩进在列表项内", () => {
    const output = formatCommentsMarkdown([
      makeThread({
        id: "t1",
        codeSnapshot: { content: "const x = 1;", language: "typescript" },
      }),
    ]);

    expect(output).toBe(
      ["- `src/a.ts:L2`", "", "  ```typescript", "  const x = 1;", "  ```", "", "  评论正文"].join(
        "\n",
      ),
    );
  });

  it("old side 锚点带 (old) 后缀; 行范围锚点输出 L起-L止", () => {
    const output = formatCommentsMarkdown([
      makeThread({ id: "t1", position: { side: "old", line: 7 } }),
      makeThread({ id: "t2", position: { side: "new", line: { start: 3, end: 5 } } }),
    ]);

    expect(output).toBe(
      ["- `src/a.ts:L7` (old)", "", "  评论正文", "", "- `src/a.ts:L3-L5`", "", "  评论正文"].join(
        "\n",
      ),
    );
  });

  it("无快照或快照为空时不输出代码块", () => {
    const output = formatCommentsMarkdown([
      makeThread({ id: "t1" }),
      makeThread({ id: "t2", codeSnapshot: { content: "   " } }),
    ]);

    expect(output).not.toContain("```");
  });

  it("快照内容含 ``` 时改用更长围栏避免截断", () => {
    const output = formatCommentsMarkdown([
      makeThread({ id: "t1", codeSnapshot: { content: "```ts\nnested\n```" } }),
    ]);

    expect(output).toContain("  ````\n  ```ts\n  nested\n  ```\n  ````");
  });

  it("快照无语言时围栏不带语言标记", () => {
    const output = formatCommentsMarkdown([
      makeThread({ id: "t1", codeSnapshot: { content: "plain line" } }),
    ]);

    expect(output).toContain("  ```\n  plain line\n  ```");
  });

  it("多行正文逐行缩进; CRLF 归一为 LF", () => {
    const output = formatCommentsMarkdown([
      makeThread({
        id: "t1",
        messages: [
          {
            id: "t1",
            body: "第一行\r\n\r\n第二行",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      }),
    ]);

    expect(output).toBe("- `src/a.ts:L2`\n\n  第一行\n\n  第二行");
  });

  it("thread 回复作为后续段落, 标注 Reply 序号与作者", () => {
    const output = formatCommentsMarkdown([
      makeThread({
        id: "t1",
        messages: [
          {
            id: "t1",
            body: "根评论",
            author: "User",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
          {
            id: "t1:r1",
            body: "回复内容",
            author: "Reviewer",
            createdAt: "2026-01-01T00:00:01.000Z",
            updatedAt: "2026-01-01T00:00:01.000Z",
          },
          {
            id: "t1:r2",
            body: "匿名回复",
            createdAt: "2026-01-01T00:00:02.000Z",
            updatedAt: "2026-01-01T00:00:02.000Z",
          },
        ],
      }),
    ]);

    expect(output).toBe(
      [
        "- `src/a.ts:L2`",
        "",
        "  根评论",
        "",
        "  Reply 1 (Reviewer):",
        "  回复内容",
        "",
        "  Reply 2 (Unknown):",
        "  匿名回复",
      ].join("\n"),
    );
  });

  it("多条评论各自成列表项, 以空行分隔", () => {
    const output = formatCommentsMarkdown([
      makeThread({ id: "t1", filePath: "a.txt", position: { side: "new", line: 1 } }),
      makeThread({ id: "t2", filePath: "b.txt", position: { side: "new", line: 9 } }),
    ]);

    expect(output).toBe("- `a.txt:L1`\n\n  评论正文\n\n- `b.txt:L9`\n\n  评论正文");
  });
});
