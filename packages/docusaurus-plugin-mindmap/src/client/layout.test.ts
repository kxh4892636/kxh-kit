import { describe, expect, it } from "vite-plus/test";
import { MAX_SCALE, panView, placeTree, wrapTitle, zoomView, type MindmapNode } from "./layout.ts";

const node = (id: string, title: string, children: MindmapNode[] = []): MindmapNode => ({
  id,
  title,
  overview: [],
  refs: [],
  children,
});

const tree: MindmapNode = node("root", "根", [
  node("a", "甲", [node("a1", "甲一"), node("a2", "甲二")]),
  node("b", "乙"),
  node("c", "丙"),
  node("d", "丁"),
]);

describe("placeTree", () => {
  it("splits children to both sides of the root", () => {
    const placed = placeTree(tree);
    const root = placed.nodes.find((item) => item.id === "root")!;
    const left = placed.nodes.filter((item) => item.x < root.x);
    const right = placed.nodes.filter((item) => item.x > root.x);
    expect(right.map((item) => item.id).sort()).toEqual(["a", "a1", "a2", "b"]);
    expect(left.map((item) => item.id).sort()).toEqual(["c", "d"]);
  });

  it("keeps siblings from overlapping in one column", () => {
    const placed = placeTree(tree);
    const column = placed.nodes.filter(
      (item) => item.x === placed.nodes.find((entry) => entry.id === "c")!.x,
    );
    const sorted = column.slice().sort((first, second) => first.y - second.y);
    for (let index = 1; index < sorted.length; index += 1) {
      expect(sorted[index]!.y).toBeGreaterThanOrEqual(
        sorted[index - 1]!.y + sorted[index - 1]!.height,
      );
    }
  });

  it("thickens edges near the root", () => {
    const placed = placeTree(tree);
    const widths = placed.edges.map((edge) => edge.width);
    expect(Math.max(...widths)).toBeGreaterThan(Math.min(...widths));
  });
});

describe("wrapTitle", () => {
  it("does not split a latin word", () => {
    const lines = wrapTitle("type 与 interface 的区别");
    expect(lines.join("")).not.toContain("inter face");
    expect(lines.length).toBeGreaterThan(1);
  });
});

describe("view math", () => {
  it("zooms around the pointer", () => {
    const before = { x: 10, y: 20, scale: 1 };
    const after = zoomView(before, 2, 100, 100);
    // 缩放中心（100,100）下的内容点在缩放前后落在同一个屏幕位置
    expect(after.scale).toBe(2);
    expect(100 - (100 - before.x) * 2).toBe(after.x);
    expect(100 - (100 - before.y) * 2).toBe(after.y);
  });

  it("clamps zoom to the allowed range", () => {
    expect(zoomView({ x: 0, y: 0, scale: 1 }, 100, 0, 0).scale).toBe(MAX_SCALE);
    expect(zoomView({ x: 0, y: 0, scale: 1 }, 0.01, 0, 0).scale).toBe(0.35);
  });

  it("pans by the pointer delta and keeps the scale", () => {
    expect(panView({ x: 5, y: 6, scale: 1.5 }, -15, 4)).toEqual({ x: -10, y: 10, scale: 1.5 });
  });
});
