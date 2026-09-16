import type { AnkiPort } from "../port";
import { ankiCardArrayResponse, parseResponse } from "../responses";

export interface AnkiCard {
  readonly answer: string;
  readonly cardId: number;
  readonly deckName: string;
  readonly factor?: number | undefined;
  readonly interval?: number | undefined;
  readonly lapses?: number | undefined;
  readonly modelName: string;
  readonly note: number;
  readonly question: string;
  readonly reps?: number | undefined;
  readonly tags?: readonly string[] | undefined;
  readonly type: number;
  readonly due?: number | undefined;
}

export interface SimplifiedCard {
  readonly back: string;
  readonly cardId: number;
  readonly deckName: string;
  readonly due: number;
  readonly factor: number;
  readonly front: string;
  readonly interval: number;
  readonly modelName: string;
}

export interface CardPresentation {
  readonly back?: string;
  readonly cardId: number;
  readonly cardType: string;
  readonly currentInterval: number;
  readonly deckName: string;
  readonly easeFactor: number;
  readonly front: string;
  readonly lapses: number;
  readonly modelName: string;
  readonly noteId: number;
  readonly reviews: number;
  readonly tags: readonly string[];
}

const answerSeparator = /<hr\b[^>]*\bid=["']?answer["']?[^>]*>/iu;
const searchSpecials = /[\\"*_]/gu;

export const deckScopeQuery = (deckName: string): string =>
  `"deck:${deckName.replace(searchSpecials, (character: string): string => `\\${character}`)}"`;

export const cleanHtml = (html: string): string =>
  html
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/giu, "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/giu, "")
    .replace(/<br\s*\/?>/giu, "\n")
    .replace(/<\/(?:div|p)>/giu, "\n")
    .replace(/<[^>]*>/gu, "")
    .replace(/&nbsp;/gu, " ")
    .replace(/&lt;/gu, "<")
    .replace(/&gt;/gu, ">")
    .replace(/&quot;/gu, '"')
    .replace(/&#39;/gu, "'")
    .replace(/&amp;/gu, "&")
    .replace(/[ \t]+/gu, " ")
    .replace(/ *\n */gu, "\n")
    .replace(/\n{2,}/gu, "\n")
    .trim();

export const extractRenderedCardContent = (
  card: Pick<AnkiCard, "answer" | "question">,
): { readonly back: string; readonly front: string } => {
  const match = card.answer.match(answerSeparator);
  const backHtml =
    match?.index === undefined ? card.answer : card.answer.slice(match.index + match[0].length);
  return { front: cleanHtml(card.question), back: cleanHtml(backHtml) };
};

/** 卡片查询结果统一裁剪: 只保留列表/详情展示需要的字段, 缺失值用 Anki 默认值补齐。 */
const simplifyCard = (card: AnkiCard): SimplifiedCard => {
  const { front, back } = extractRenderedCardContent(card);
  return {
    cardId: card.cardId,
    front,
    back,
    deckName: card.deckName,
    modelName: card.modelName,
    due: card.due ?? 0,
    interval: card.interval ?? 0,
    factor: card.factor ?? 2500,
  };
};

/**
 * 按上限截取卡片 ID 后读取详情: 上游 cardsInfo 一次最多接受 50 张。
 * 列表与到期查询的截取口径相同, 集中在这里以免两处漂移。
 */
export const loadSimplifiedCards = async (
  port: AnkiPort,
  cardIds: readonly number[],
  limit: number | undefined,
): Promise<readonly SimplifiedCard[]> =>
  parseResponse(
    "cardsInfo",
    ankiCardArrayResponse,
    await port.invoke<unknown>("cardsInfo", { cards: cardIds.slice(0, Math.min(limit ?? 10, 50)) }),
  ).map(simplifyCard);

const cardTypes: Readonly<Record<number, string>> = {
  0: "new",
  1: "learning",
  2: "review",
  3: "relearning",
};

export const getCardType = (type: number): string => cardTypes[type] ?? "unknown";

const ratingDescriptions: Readonly<Record<number, string>> = {
  1: "Again (failed to recall)",
  2: "Hard (recalled with difficulty)",
  3: "Good (recalled with some effort)",
  4: "Easy (recalled instantly)",
};

export const getRatingDescription = (rating: number): string =>
  ratingDescriptions[rating] ?? "Unknown";
