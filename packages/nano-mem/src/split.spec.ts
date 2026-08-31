import { describe, expect, it } from "vitest";
import { cjkTokenize } from "./split";

describe("cjkTokenize", () => {
  it("在每个 Han 字符两侧插入空格", () => {
    expect(cjkTokenize("记忆信息很关键")).toBe(" 记  忆  信  息  很  关  键 ");
  });

  it("整体 lowercase", () => {
    expect(cjkTokenize("Hello世界")).toBe("hello 世  界 ");
  });

  it("中英文混合与标点保持原 token", () => {
    expect(cjkTokenize("a记b，关键C")).toBe("a 记 b， 关  键 c");
  });

  it("无 Han 字符时只做 lowercase", () => {
    expect(cjkTokenize("HELLO world")).toBe("hello world");
  });

  it("空字符串返回空字符串", () => {
    expect(cjkTokenize("")).toBe("");
  });
});
