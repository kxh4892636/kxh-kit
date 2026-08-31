/**
 * nano-mem FSRS 调度封装（纯函数模块，不依赖 store）。
 *
 * 记忆场景采用纯长时调度（`enable_short_term: false`）：(re)learning 的分钟级
 * 步骤被旁路，任何一次使用都只按天推进 due —— 记忆不产生分钟级复习间隔。
 *
 * 生命周期：
 * - `initialCard()` 创建 New 态卡片；
 * - 首次写入用 `initReview(card, now)` 按 Good 推进 New→Review，建立初始 S0/D0；
 * - 此后每次使用经 `recordUse(card, grade, now)` 走 ts-fsrs `next()` 更新
 *   stability/difficulty/due/reps/lapses/state；
 * - `retrievability(card, now)` 即时计算可检索性 R ∈ [0,1]。
 */

import {
  createEmptyCard,
  fsrs,
  Rating,
  State,
  type Card,
  type CardInput,
  type DateInput,
  type FSRS,
  type Grade as FsrsGrade,
} from "ts-fsrs";

/** 使用评级：CLI/API 侧与 ts-fsrs Rating.Again..Easy 一一对应的字符串形式。 */
export type Grade = "again" | "hard" | "good" | "easy";

/** 全部合法评级。 */
export const GRADES: readonly Grade[] = ["again", "hard", "good", "easy"];

const GRADE_TO_RATING: Readonly<Record<Grade, FsrsGrade>> = {
  again: Rating.Again,
  hard: Rating.Hard,
  good: Rating.Good,
  easy: Rating.Easy,
};

/** 判断输入是否为合法评级字符串。 */
export function isGrade(value: unknown): value is Grade {
  return typeof value === "string" && (GRADES as readonly string[]).includes(value);
}

/**
 * 校验评级并返回规范形式；非法评级直接抛错。
 * 类型系统只挡编译期，运行期（CLI/JS 调用）仍需要防御。
 */
export function parseGrade(value: unknown): Grade {
  if (!isGrade(value)) {
    throw new Error(`Invalid grade "${String(value)}": expected one of ${GRADES.join(", ")}`);
  }
  return value;
}

/** 评级字符串 → ts-fsrs Grade（1..4）。 */
export function gradeToRating(grade: Grade): FsrsGrade {
  return GRADE_TO_RATING[grade];
}

/** 创建记忆调度器：纯长时调度（无分钟级 learning_steps 生效）。 */
export function createMemoryScheduler(): FSRS {
  return fsrs({ enable_short_term: false });
}

/** 新记忆的初始卡片（New 态，stability/difficulty 为 0）。 */
export function initialCard(now?: DateInput): Card {
  return createEmptyCard(now);
}

/** 首次写入按 Good 推进：New → Review，建立初始 S0/D0，返回新卡片。 */
export function initReview(card: CardInput | Card, now: DateInput): Card {
  return createMemoryScheduler().next(card, now, Rating.Good).card;
}

/** 记录一次使用：按评级更新调度状态，返回新卡片。 */
export function recordUse(card: CardInput | Card, grade: Grade, now: DateInput): Card {
  return createMemoryScheduler().next(card, now, gradeToRating(parseGrade(grade))).card;
}

/** 当前可检索性 R ∈ [0,1]（New 态恒为 0）。 */
export function retrievability(card: CardInput | Card, now?: DateInput): number {
  return createMemoryScheduler().get_retrievability(card, now, false);
}

/** 存储行：对应 memories 表 FSRS 列（due/last_review 为 ISO 字符串）。 */
export interface MemoryRow {
  due: string;
  last_review: string | null;
  stability: number;
  difficulty: number;
  reps: number;
  lapses: number;
  fsrs_state: number;
}

/** Card → 存储行；due/last_review 以 UTC ISO 字符串（毫秒精度）表示。 */
export function cardToRow(card: Card): MemoryRow {
  return {
    due: card.due.toISOString(),
    last_review: card.last_review ? card.last_review.toISOString() : null,
    stability: card.stability,
    difficulty: card.difficulty,
    reps: card.reps,
    lapses: card.lapses,
    fsrs_state: card.state,
  };
}

/**
 * 存储行 → Card。
 * 未持久化的瞬时字段（elapsed_days/scheduled_days/learning_steps）归零：
 * ts-fsrs 的调度只读 state/due/last_review/stability/difficulty/reps/lapses。
 */
export function rowToCard(row: MemoryRow): Card {
  const card: Card = {
    due: new Date(row.due),
    stability: row.stability,
    difficulty: row.difficulty,
    elapsed_days: 0,
    scheduled_days: 0,
    learning_steps: 0,
    reps: row.reps,
    lapses: row.lapses,
    state: row.fsrs_state as State,
  };
  if (row.last_review !== null) {
    card.last_review = new Date(row.last_review);
  }
  return card;
}
