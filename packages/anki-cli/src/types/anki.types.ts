// Anki 相关类型定义(自 anki-mcp-server 的 mcp/types/anki.types.ts 移植;
// enum 按 code-spec 改为 const 对象 + 派生联合类型)。

// 卡片类型数值(与 Anki 内部一致)。上游为 enum CardType, 此处改 const 对象。
export const CARD_TYPE = {
  New: 0,
  Learning: 1,
  Review: 2,
  Relearning: 3,
} as const;

export type CardTypeValue = (typeof CARD_TYPE)[keyof typeof CARD_TYPE];

// 评分档位(与 Anki 内部一致)。上游为 enum CardRating, 此处改 const 对象。
export const CARD_RATING = {
  Again: 1,
  Hard: 2,
  Good: 3,
  Easy: 4,
} as const;

export type CardRatingValue = (typeof CARD_RATING)[keyof typeof CARD_RATING];

// AnkiConnect 请求/响应信封
export interface AnkiConnectRequest {
  action: string;
  version: number;
  params: Record<string, unknown> | undefined;
  key: string | undefined;
}

export interface AnkiConnectResponse<T = unknown> {
  result: T;
  error: string | null;
}

// AnkiConnect cardsInfo 返回的卡片结构
export interface AnkiCard {
  cardId: number;
  fields: Record<string, { value: string; order: number }>;
  fieldOrder: number;
  question: string;
  answer: string;
  modelName: string;
  ord: number;
  deckName: string;
  css: string;
  factor?: number;
  interval?: number;
  note: number;
  type: number;
  queue: number;
  due?: number;
  reps?: number;
  lapses?: number;
  left?: number;
  mod?: number;
  flags?: number;
  tags?: string[];
}

// 命令输出的简化卡片结构
export interface SimplifiedCard {
  cardId: number;
  front: string;
  back: string;
  deckName: string;
  modelName: string;
  due: number;
  interval: number;
  factor: number;
}

// 卡片呈现结构(答案可选)
export interface CardPresentation {
  cardId: number;
  front: string;
  back?: string;
  deckName: string;
  modelName: string;
  tags: string[];
  currentInterval: number;
  easeFactor: number;
  reviews: number;
  lapses: number;
  cardType: string;
  noteId: number;
}

// 牌组信息
export interface DeckInfo {
  name: string;
  stats?: DeckStats;
}

/**
 * listDecks 呈现的牌组统计。
 * 三个桶是「今日到期、受每日上限约束」的数字(非卡片总数), 已上卷子牌组。
 */
export interface DeckStats {
  deck_id: number;
  name: string;
  new_count: number;
  learn_count: number;
  review_count: number;
  total_new: number;
  total_cards: number;
}

/**
 * AnkiConnect getDeckStats 响应(键为牌组 ID 字符串)。
 * IMPORTANT: 这些是调度器 due tree 数字, 不是卡片状态总数——
 * new/learn/review 是今日到期且受每日上限约束, total_in_deck 只计直接存放的卡片。
 */
export interface AnkiDeckStatsResponse {
  deck_id: number;
  name: string;
  new_count: number;
  learn_count: number;
  review_count: number;
  total_in_deck: number;
}

// 添加笔记时的重复检查选项
export interface NoteOptions {
  allowDuplicate?: boolean;
  duplicateScope?: "deck" | "collection";
  duplicateScopeOptions?: {
    deckName?: string;
    checkChildren?: boolean;
    checkAllModels?: boolean;
  };
}

export interface AddNoteParams {
  deckName: string;
  modelName: string;
  fields: Record<string, string>;
  tags?: string[];
  options?: NoteOptions;
}

// 笔记类型信息
export interface Model {
  name: string;
  id: number;
  css: string;
  fields: string[];
}

// 笔记详情
export interface NoteInfo {
  noteId: number;
  modelName: string;
  tags: string[];
  fields: Record<string, { value: string; order: number }>;
  cards: number[];
  mod: number;
}

// 更新笔记字段参数
export interface UpdateNoteFieldsParams {
  note: {
    id: number;
    fields: Record<string, string>;
    audio?: Array<{
      url: string;
      filename: string;
      fields: string[];
    }>;
    picture?: Array<{
      url: string;
      filename: string;
      fields: string[];
    }>;
  };
}

// 卡片模板定义(创建笔记类型用)
export interface CardTemplate {
  Name: string;
  Front: string;
  Back: string;
}

// 创建笔记类型参数
export interface CreateModelParams {
  modelName: string;
  inOrderFields: string[];
  cardTemplates: CardTemplate[];
  css?: string;
  isCloze?: boolean;
}

// 更新笔记类型样式参数
export interface UpdateModelStylingParams {
  model: {
    name: string;
    css: string;
  };
}

// 复习模式下的当前卡片信息(guiCurrentCard)
export interface GuiCurrentCardInfo {
  answer: string;
  question: string;
  deckName: string;
  modelName: string;
  cardId: number;
  buttons: number[];
  nextReviews: string[];
  fields?: Record<string, { value: string; order: number }>;
}

// guiBrowse 参数
export interface GuiBrowseParams {
  query: string;
  reorderCards?: {
    order: "ascending" | "descending";
    columnId: string;
  };
}

// guiAddCards 参数
export interface GuiAddCardsParams {
  note: {
    deckName: string;
    modelName: string;
    fields: Record<string, string>;
    tags?: string[];
  };
}
