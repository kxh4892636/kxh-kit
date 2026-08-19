// 卡片内容处理: HTML 清洗、渲染内容提取、类型/评分描述(自上游 anki.utils.ts 移植)。

import { CARD_RATING, CARD_TYPE } from "../types/anki.types";
import type { AnkiCard } from "../types/anki.types";

// 多数背面模板在 {{FrontSide}} 之后输出的答案分隔线: 匹配任意引号形式、
// 任意属性顺序的 <hr id=answer>。用 [^>]* 界定, 保持线性匹配(无灾难回溯)。
const ANSWER_SEPARATOR_REGEX = /<hr\b[^>]*\bid=["']?answer["']?[^>]*>/i;

/**
 * 把渲染后的卡片 HTML 清洗为可读纯文本:
 * 去掉 <style>/<script> 块、换行/块级标签转行、去掉其余标签、解码常见实体、
 * 压缩多余空白。[sound:...] 等 Anki 媒体标记原样保留。
 */
export function cleanHtml(html: string): string {
  if (!html) {
    return "";
  }

  return (
    html
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(?:div|p)>/gi, "\n")
      // 去标签在实体解码之前, 避免解码出的 < > 被误认为标签
      .replace(/<[^>]*>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      // &amp; 最后解码, 双重编码如 &amp;lt; 不会连锁成 <
      .replace(/&amp;/g, "&")
      .replace(/[ \t]+/g, " ")
      .replace(/ *\n */g, "\n")
      .replace(/\n{2,}/g, "\n")
      .trim()
  );
}

/**
 * 从卡片的渲染输出提取正反面。用 cardsInfo 的 question/answer(而非字段值),
 * 因此反转卡与 cloze 卡按各自模板方向正确渲染。
 * 背面通常以 <hr id=answer> 分隔 {{FrontSide}}; 有分隔线时只取其后内容,
 * 避免背面重复正面。
 */
export function extractRenderedCardContent(card: Pick<AnkiCard, "question" | "answer">): {
  front: string;
  back: string;
} {
  const question = card.question ?? "";
  const answer = card.answer ?? "";

  const separatorMatch = answer.match(ANSWER_SEPARATOR_REGEX);
  // 匹配成功时 match 数组必有完整匹配项, 断言非空。
  const backHtml =
    separatorMatch !== null && separatorMatch.index !== undefined
      ? answer.slice(separatorMatch.index + separatorMatch[0]!.length)
      : answer;

  return {
    front: cleanHtml(question),
    back: cleanHtml(backHtml),
  };
}

// 数值卡片类型 → 可读字符串
export function getCardType(type: number): string {
  switch (type) {
    case CARD_TYPE.New:
      return "new";
    case CARD_TYPE.Learning:
      return "learning";
    case CARD_TYPE.Review:
      return "review";
    case CARD_TYPE.Relearning:
      return "relearning";
    default:
      return "unknown";
  }
}

// 依据笔记类型名推断其种类(供提示使用)
export function getNoteType(modelName: string): string {
  const lowerName = modelName.toLowerCase();

  if (lowerName.includes("basic")) {
    if (lowerName.includes("reverse")) {
      return "Basic (and reversed card)";
    }
    return "Basic";
  }

  if (lowerName.includes("cloze")) {
    return "Cloze";
  }

  return "Custom";
}

// 评分档位 → 可读描述
export function getRatingDescription(rating: number): string {
  switch (rating) {
    case CARD_RATING.Again:
      return "Again (failed to recall)";
    case CARD_RATING.Hard:
      return "Hard (recalled with difficulty)";
    case CARD_RATING.Good:
      return "Good (recalled with some effort)";
    case CARD_RATING.Easy:
      return "Easy (recalled instantly)";
    default:
      return "Unknown";
  }
}

// 间隔天数 → 人类可读(小时/天/月/年)
export function formatInterval(days: number): string {
  if (days < 1) {
    const hours = Math.round(days * 24);
    return `${hours} hour${hours !== 1 ? "s" : ""}`;
  }

  if (days < 30) {
    return `${Math.round(days)} day${days !== 1 ? "s" : ""}`;
  }

  if (days < 365) {
    const months = Math.round(days / 30);
    return `${months} month${months !== 1 ? "s" : ""}`;
  }

  const years = Math.round((days / 365) * 10) / 10;
  return `${years} year${years !== 1 ? "s" : ""}`;
}
