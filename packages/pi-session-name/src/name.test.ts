import { describe, expect, it } from "vite-plus/test";
import {
  buildNamePrompt,
  cleanModelOutput,
  cleanTitle,
  fallbackName,
  namingInput,
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
    expect(truncate("一二三四五六七八九十".repeat(3))).toBe(
      "一二三四五六七八九十".repeat(2) + "一",
    );
    expect(MAX_NAME_LENGTH).toBe(21);
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
    expect(fallbackName("帮我看看这个报错到底是怎么回事")).toBe("帮我看看这个报错到底是怎么回事");
    expect(fallbackName("一".repeat(30))).toBe("一".repeat(21));
  });

  it("honours a custom length", () => {
    expect(fallbackName("帮我看看这个报错", 4)).toBe("帮我看看");
  });
});

describe("namingInput", () => {
  const block = (name: string, body: string): string =>
    `<skill name="${name}" location="/skills/${name}/SKILL.md">\n${body}\n</skill>`;

  it("keeps a plain input", () => {
    expect(namingInput("帮我修复登录超时")).toBe("帮我修复登录超时");
  });

  it("keeps the request that follows a skill block", () => {
    const raw = `${block("ecom-x-flow", "# 流程正文")} pi-session-name 进行升级`;
    expect(namingInput(raw)).toBe("pi-session-name 进行升级");
  });

  it("keeps the text around a skill block", () => {
    expect(namingInput(`用 ${block("alpha", "正文")} 修一下`)).toBe("用 修一下");
  });

  it("strips a block embedded after other text", () => {
    const raw = `pi-session-name 插件有异常case, 以下输入 ${block("alpha", "正文")} 阅读相关文档`;
    expect(namingInput(raw)).toBe("pi-session-name 插件有异常case, 以下输入 阅读相关文档");
  });

  it("strips a block whose closing tag is indented", () => {
    const raw =
      '<skill name="ecom-x-flow" location="/skills/ecom-x-flow/SKILL.md">\n' +
      " References are relative to /skills/ecom-x-flow.\n\n流程正文\n   </skill> 阅读相关文档";
    expect(namingInput(raw)).toBe("阅读相关文档");
  });

  it("strips a block that uses CRLF line endings", () => {
    const raw =
      '<skill name="alpha" location="/skills/alpha/SKILL.md">\r\n正文\r\n</skill>\r\n修一下';
    expect(namingInput(raw)).toBe("修一下");
  });

  it("keeps a request after several skill blocks", () => {
    const raw = `${block("alpha", "a")} ${block("beta", "b")} 排查打包失败`;
    expect(namingInput(raw)).toBe("排查打包失败");
  });

  it("ignores a closing tag inside a skill body", () => {
    const raw = `${block("alpha", "示例：</skill> 后面继续")} 写文档`;
    expect(namingInput(raw)).toBe("写文档");
  });

  it("falls back to the first skill name when nothing remains", () => {
    expect(namingInput(block("ecom-x-flow", "正文"))).toBe("ecom-x-flow");
    expect(namingInput(`${block("alpha", "a")} ${block("beta", "b")}`)).toBe("alpha");
  });

  it("parses a forced skill command", () => {
    expect(namingInput("/skill:pdf-tools extract report.pdf")).toBe("extract report.pdf");
    expect(namingInput("/skill:ecom-x-flow")).toBe("ecom-x-flow");
  });

  it("prefers the forced command over skills it embeds", () => {
    const raw = `/skill:main ${block("helper", "正文")}`;
    expect(namingInput(raw)).toBe("main");
  });

  it("leaves dollar-prefixed text alone", () => {
    expect(namingInput("帮我看 $HOME 和 $ref 的差异")).toBe("帮我看 $HOME 和 $ref 的差异");
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
