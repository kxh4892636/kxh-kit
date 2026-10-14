import { describe, expect, it } from "vite-plus/test";
import {
  buildNamePrompt,
  cleanModelOutput,
  cleanTitle,
  fallbackName,
  MAX_NAME_LENGTH,
  truncate,
} from "./name.ts";

describe("truncate", () => {
  it("keeps at most maxLength code points", () => {
    expect(truncate("一二三四五六七八九十", 8)).toBe("一二三四五六七八");
    expect(truncate("short", 8)).toBe("short");
  });

  it("never splits a surrogate pair", () => {
    expect(truncate("😀😀😀", 2)).toBe("😀😀");
    expect(Array.from(truncate("😀😀😀", 2))).toHaveLength(2);
  });

  it("handles a non-positive limit", () => {
    expect(truncate("abc", 0)).toBe("");
    expect(truncate("abc", -1)).toBe("");
  });

  it("defaults to MAX_NAME_LENGTH", () => {
    expect(truncate("一二三四五六七八九十")).toBe("一二三四五六七八");
    expect(MAX_NAME_LENGTH).toBe(8);
  });
});

describe("cleanTitle", () => {
  it("collapses whitespace and strips trailing punctuation", () => {
    expect(cleanTitle("  修复\n登录  超时！！！ ")).toBe("修复 登录 超时");
  });

  it("strips markdown list and heading markers", () => {
    expect(cleanTitle("## 修复登录")).toBe("修复登录");
    expect(cleanTitle("- 修复登录")).toBe("修复登录");
    expect(cleanTitle("1. 修复登录")).toBe("修复登录");
    expect(cleanTitle("> 修复登录")).toBe("修复登录");
  });

  it("strips wrapping quotes", () => {
    expect(cleanTitle('"修复登录"')).toBe("修复登录");
    expect(cleanTitle("「修复登录」")).toBe("修复登录");
  });

  it("strips a title label", () => {
    expect(cleanTitle("标题：修复登录")).toBe("修复登录");
    expect(cleanTitle("title: 修复登录")).toBe("修复登录");
  });

  it("strips markdown emphasis markers", () => {
    expect(cleanTitle("**修复登录**")).toBe("修复登录");
    expect(cleanTitle("__修复登录__")).toBe("修复登录");
    expect(cleanTitle("*修复登录*")).toBe("修复登录");
    expect(cleanTitle("~~修复登录~~")).toBe("修复登录");
  });

  it("truncates to the configured length", () => {
    expect(cleanTitle("一二三四五六七八九十", 4)).toBe("一二三四");
  });

  it("returns an empty string for decoration-only input", () => {
    expect(cleanTitle("。。。")).toBe("");
    expect(cleanTitle("   ")).toBe("");
  });
});

describe("cleanModelOutput", () => {
  it("keeps the first non-empty line", () => {
    expect(cleanModelOutput("\n\n修复登录超时\n这是解释")).toBe("修复登录超时");
  });

  it("cleans a quoted, labelled reply", () => {
    expect(cleanModelOutput('标题: "登录超时修复"。')).toBe("登录超时修复");
  });

  it("returns an empty string when nothing is left", () => {
    expect(cleanModelOutput("\n  \n")).toBe("");
  });
});

describe("fallbackName", () => {
  it("derives a short title from the first input", () => {
    expect(fallbackName("帮我看看这个报错到底是怎么回事")).toBe("帮我看看这个报错");
  });

  it("honours a custom length", () => {
    expect(fallbackName("帮我看看这个报错", 4)).toBe("帮我看看");
  });
});

describe("buildNamePrompt", () => {
  it("states the limit and embeds the request", () => {
    const prompt = buildNamePrompt("修复登录超时", 8);
    expect(prompt).toContain("不超过 8 个字");
    expect(prompt).toContain("修复登录超时");
  });

  it("caps how much input is embedded", () => {
    const prompt = buildNamePrompt("x".repeat(1000), 8);
    expect(prompt).not.toContain("x".repeat(501));
    expect(prompt).toContain("x".repeat(500));
  });
});
