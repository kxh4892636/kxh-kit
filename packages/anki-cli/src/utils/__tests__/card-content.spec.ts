import { describe, expect, it } from "vitest";
import {
  cleanHtml,
  extractRenderedCardContent,
  formatInterval,
  getCardType,
  getNoteType,
  getRatingDescription,
} from "../card-content";

describe("cleanHtml", () => {
  it("去除标签并转换换行", () => {
    // 与上游语义一致: 换行来自 <br> 与块级闭合标签, 开标签不产生换行。
    expect(cleanHtml("<b>Hallo</b><br>Welt<div>Foo</div>")).toBe("Hallo\nWeltFoo");
  });

  it("去除 style/script 块", () => {
    expect(cleanHtml("A<style>body{color:red}</style>B<script>evil()</script>C")).toBe("ABC");
  });

  it("解码常见实体且不连锁解码", () => {
    expect(cleanHtml("&lt;b&gt;&amp;amp;&nbsp;x")).toBe("<b>&amp; x");
  });

  it("压缩多余空白保留换行", () => {
    expect(cleanHtml("a   b\n\n\nc")).toBe("a b\nc");
  });

  it("空输入返回空串", () => {
    expect(cleanHtml("")).toBe("");
  });
});

describe("extractRenderedCardContent", () => {
  it("有 <hr id=answer> 分隔时背面只取分隔之后", () => {
    const { front, back } = extractRenderedCardContent({
      question: "<b>Q</b>",
      answer: '<div>Q</div><hr id="answer"><i>A</i>',
    });
    expect(front).toBe("Q");
    expect(back).toBe("A");
  });

  it("无分隔时背面整体清洗(反转卡等场景)", () => {
    const { front, back } = extractRenderedCardContent({
      question: "Q",
      answer: "Q and A",
    });
    expect(front).toBe("Q");
    expect(back).toBe("Q and A");
  });
});

describe("getCardType / getNoteType / getRatingDescription", () => {
  it("数值类型映射", () => {
    expect(getCardType(0)).toBe("new");
    expect(getCardType(1)).toBe("learning");
    expect(getCardType(2)).toBe("review");
    expect(getCardType(3)).toBe("relearning");
    expect(getCardType(99)).toBe("unknown");
  });

  it("笔记类型推断", () => {
    expect(getNoteType("Basic")).toBe("Basic");
    expect(getNoteType("Basic (and reversed card)")).toBe("Basic (and reversed card)");
    expect(getNoteType("Cloze-XXXX")).toBe("Cloze");
    expect(getNoteType("My Custom Type")).toBe("Custom");
  });

  it("评分描述", () => {
    expect(getRatingDescription(1)).toContain("Again");
    expect(getRatingDescription(2)).toContain("Hard");
    expect(getRatingDescription(3)).toContain("Good");
    expect(getRatingDescription(4)).toContain("Easy");
    expect(getRatingDescription(5)).toBe("Unknown");
  });
});

describe("formatInterval", () => {
  it("小时/天/月/年", () => {
    expect(formatInterval(0.5)).toBe("12 hours");
    expect(formatInterval(5)).toBe("5 days");
    expect(formatInterval(60)).toBe("2 months");
    expect(formatInterval(400)).toBe("1.1 years");
  });
});
