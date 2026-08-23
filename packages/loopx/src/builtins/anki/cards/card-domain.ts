export interface AnkiCard {
  readonly answer: string;
  readonly cardId: number;
  readonly deckName: string;
  readonly factor?: number;
  readonly interval?: number;
  readonly lapses?: number;
  readonly modelName: string;
  readonly note: number;
  readonly question: string;
  readonly reps?: number;
  readonly tags?: readonly string[];
  readonly type: number;
  readonly due?: number;
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
