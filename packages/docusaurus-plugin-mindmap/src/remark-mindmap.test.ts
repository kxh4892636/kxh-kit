import { readFileSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";
import { mindmapStyles } from "./client/styles.ts";
import { buildTree } from "./remark-mindmap.ts";

interface Node {
  type: string;
  depth?: number;
  name?: string;
  value?: string;
  url?: string;
  children?: Node[];
}

const heading = (depth: number, text: string): Node => ({
  type: "heading",
  depth,
  children: [{ type: "text", value: text }],
});
const link = (url: string, label: string): Node => ({
  type: "link",
  url,
  children: [{ type: "text", value: label }],
});
const text = (value: string): Node => ({ type: "text", value });
const quote = (nodes: Node[]): Node => ({
  type: "blockquote",
  children: [
    {
      type: "list",
      children: [{ type: "listItem", children: [{ type: "paragraph", children: nodes }] }],
    },
  ],
});
const paragraph = (value: string): Node => ({ type: "paragraph", children: [text(value)] });

describe("buildTree", () => {
  it("takes node ids from the numbered headings", () => {
    const tree = buildTree(
      [heading(1, "1 根"), heading(2, "1.1 甲"), heading(3, "1.1.1 甲一"), heading(2, "1.2 乙")],
      "a.md",
    );
    expect(tree.id).toBe("1");
    expect(tree.children.map((child) => child.id)).toEqual(["1.1", "1.2"]);
    expect(tree.children[0]?.children[0]?.id).toBe("1.1.1");
  });

  it("reads a node reference from the anchor", () => {
    const tree = buildTree(
      [heading(1, "1 根"), heading(2, "1.2 乙"), quote([link("#1.2", "乙")])],
      "a.md",
    );
    expect(tree.children[0]?.refs[0]).toEqual({ kind: "node", target: "1.2", label: "乙" });
  });

  it("reads a doc reference from the trailing doc directive", () => {
    const quoteNode = quote([
      link("./other.md", "文档"),
      text(" doc"),
      { type: "textDirective", name: "7c9f-1" },
    ]);
    const tree = buildTree([heading(1, "1 根"), quoteNode], "a.md");
    expect(tree.refs[0]?.kind).toBe("doc");
    expect(tree.refs[0]?.target).toBe("7c9f-1");
    expect(tree.refs[0]?.url).toBe("/7c9f-1");
  });

  it("keeps plain paragraphs as overview text", () => {
    const tree = buildTree([heading(1, "1 根"), paragraph("一句话说明")], "a.md");
    expect(tree.overview).toEqual(["一句话说明"]);
  });

  it("rejects a heading without a number and a duplicate number", () => {
    expect(() => buildTree([heading(1, "根")], "a.md")).toThrow();
    expect(() =>
      buildTree([heading(1, "1 根"), heading(2, "1.1 甲"), heading(2, "1.1 乙")], "a.md"),
    ).toThrow();
  });
});
describe("injected styles", () => {
  it("matches the stylesheet on disk", () => {
    const css = readFileSync(new URL("./client/mindmap-block.css", import.meta.url), "utf-8");
    expect(mindmapStyles.trim()).toBe(css.trim());
  });
});
