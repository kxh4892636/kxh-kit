import { describe, expect, it } from "vitest";
import { Rating, State, type Card } from "ts-fsrs";
import {
  cardToRow,
  createMemoryScheduler,
  gradeToRating,
  initReview,
  initialCard,
  isGrade,
  parseGrade,
  recordUse,
  retrievability,
  rowToCard,
  type Grade,
} from "./fsrs";

const DAY = 24 * 60 * 60 * 1000;
const DAYS = (n: number) => n * DAY;

/** 固定起点：UTC 午夜，任何偏移都保持整日边界，elapsed 计算确定。 */
const t0 = () => new Date("2026-01-01T00:00:00.000Z");
const later = (days: number) => new Date(t0().getTime() + DAYS(days));

describe("createMemoryScheduler", () => {
  it("以 enable_short_term: false 初始化（纯长时调度）", () => {
    const scheduler = createMemoryScheduler();
    expect(scheduler.parameters.enable_short_term).toBe(false);
  });

  it("首次到期按天调度：New 卡经 Again 也直达 Review 且 due ≥ 1 天", () => {
    const now = t0();
    const card = recordUse(initialCard(now), "again", now);
    // 长时路径：不存在 Learning/分钟级步骤
    expect(card.state).toBe(State.Review);
    expect(card.learning_steps).toBe(0);
    expect(card.due.getTime() - now.getTime()).toBeGreaterThanOrEqual(DAY);
  });
});

describe("initialCard / initReview", () => {
  it("初始卡片为 New 态，stability/difficulty 为 0", () => {
    const card = initialCard(t0());
    expect(card.state).toBe(State.New);
    expect(card.stability).toBe(0);
    expect(card.difficulty).toBe(0);
    expect(card.reps).toBe(0);
    expect(card.lapses).toBe(0);
  });

  it("首次按 Good 初始化：S0 > 0、D0 > 0、进入 Review", () => {
    const now = t0();
    const card = initReview(initialCard(now), now);
    expect(card.state).toBe(State.Review);
    expect(card.reps).toBe(1);
    expect(card.stability).toBeGreaterThan(0);
    expect(card.difficulty).toBeGreaterThan(0);
    expect(card.last_review).toBeInstanceOf(Date);
    expect(card.due.getTime() - now.getTime()).toBeGreaterThanOrEqual(DAY);
  });
});

describe("recordUse", () => {
  it("连续 Good 复习 stability 严格单调上升", () => {
    let card = initReview(initialCard(t0()), t0());
    for (let i = 1; i <= 5; i++) {
      const next = recordUse(card, "good", later(15 * i));
      expect(next.stability).toBeGreaterThan(card.stability);
      card = next;
    }
    expect(card.reps).toBe(6); // 1 次初始化 + 5 次 Good
  });

  it("Again 后 lapses +1 且 stability 低于 Good 之后", () => {
    const now = t0();
    let card = initReview(initialCard(now), now);
    card = recordUse(card, "good", later(15));
    const afterGood = card;
    const afterAgain = recordUse(afterGood, "again", later(15));
    expect(afterAgain.lapses).toBe(afterGood.lapses + 1);
    expect(afterAgain.stability).toBeLessThan(afterGood.stability);
  });

  it("非法评级在 recordUse 直接抛错", () => {
    const card = initReview(initialCard(t0()), t0());
    expect(() => recordUse(card, "manual" as Grade, t0())).toThrow(/Invalid grade/);
  });
});

describe("retrievability", () => {
  it("时间推进 R 单调下降（0 天 = 1，30/60 天后依次降低）", () => {
    const card = initReview(initialCard(t0()), t0());
    const r0 = retrievability(card, t0());
    const r30 = retrievability(card, later(30));
    const r60 = retrievability(card, later(60));
    expect(r0).toBe(1);
    expect(r30).toBeLessThan(r0);
    expect(r60).toBeLessThan(r30);
    expect(r60).toBeGreaterThan(0);
  });

  it("New 卡可检索性为 0；缺省 now 不抛错", () => {
    expect(retrievability(initialCard(t0()), t0())).toBe(0);
    expect(typeof retrievability(initReview(initialCard(t0()), t0()))).toBe("number");
  });
});

describe("评级校验与映射", () => {
  it("四种评级字符串映射到 ts-fsrs Rating", () => {
    expect(gradeToRating("again")).toBe(Rating.Again);
    expect(gradeToRating("hard")).toBe(Rating.Hard);
    expect(gradeToRating("good")).toBe(Rating.Good);
    expect(gradeToRating("easy")).toBe(Rating.Easy);
  });

  it("parseGrade 校验非法评级并抛错", () => {
    expect(parseGrade("good")).toBe("good");
    for (const bad of ["manual", "GOOD", "", 1, null, undefined]) {
      expect(() => parseGrade(bad)).toThrow();
    }
  });

  it("isGrade 判定边界", () => {
    expect(isGrade("again")).toBe(true);
    expect(isGrade("easy")).toBe(true);
    expect(isGrade("GOOD")).toBe(false);
    expect(isGrade(3)).toBe(false);
    expect(isGrade(null)).toBe(false);
  });
});

describe("card ↔ row 序列化", () => {
  it("已复习卡片往返一致（含 ISO due/last_review）", () => {
    const card = recordUse(initReview(initialCard(t0()), t0()), "good", later(15));
    const row = cardToRow(card);
    expect(row.due).toBe(card.due.toISOString());
    expect(row.last_review).toBe(card.last_review!.toISOString());
    expect(row.fsrs_state).toBe(State.Review);

    const restored = rowToCard(row);
    expect(restored.due.getTime()).toBe(card.due.getTime());
    expect(restored.last_review!.getTime()).toBe(card.last_review!.getTime());
    expect(restored.stability).toBe(card.stability);
    expect(restored.difficulty).toBe(card.difficulty);
    expect(restored.reps).toBe(card.reps);
    expect(restored.lapses).toBe(card.lapses);
    expect(restored.state).toBe(State.Review);
    // 行 ⇄ 卡 ⇄ 行 稳定
    expect(cardToRow(restored)).toEqual(row);
  });

  it("初始卡片（无 last_review）往返一致", () => {
    const empty = initialCard(t0());
    const row = cardToRow(empty);
    expect(row.last_review).toBeNull();
    expect(row.fsrs_state).toBe(State.New);

    const restored = rowToCard(row);
    expect(restored.last_review).toBeUndefined();
    expect(restored.state).toBe(State.New);
    expect(cardToRow(restored)).toEqual(row);
  });

  it("存储行可被调度器直接消费（rowToCard → recordUse）", () => {
    const card = initReview(initialCard(t0()), t0());
    const restored: Card = rowToCard(cardToRow(card));
    const next = recordUse(restored, "good", later(15));
    expect(next.state).toBe(State.Review);
    expect(next.stability).toBeGreaterThan(card.stability);
  });
});
