import { describe, expect, test } from "vitest";
import {
  applyGoodUse,
  FSRS6_DEFAULT_WEIGHTS,
  initialRetentionState,
  lifecycleBoost,
  retentionStatus,
  retrievability,
} from "./retention-state.js";

const day = 86_400_000;

describe("FSRS retention policy", (): void => {
  test("uses the versioned FSRS-6 defaults and crosses R=0.5 near 208 days", (): void => {
    const state = initialRetentionState(0);
    expect(FSRS6_DEFAULT_WEIGHTS).toHaveLength(21);
    expect(retrievability(state, state.naturalForgetAtMs - 1)).toBeGreaterThanOrEqual(0.5);
    expect(retrievability(state, state.naturalForgetAtMs)).toBeLessThan(0.5);
    expect(state.naturalForgetAtMs / day).toBeCloseTo(208, 0);
    expect(retentionStatus(state, state.naturalForgetAtMs - 1)).toEqual({
      forgottenReason: null,
      status: "active",
    });
    expect(retentionStatus(state, state.naturalForgetAtMs)).toEqual({
      forgottenReason: "natural",
      status: "forgotten",
    });
  });

  test("applies continuous-time Good uses without fabricating same-time elapsed time", (): void => {
    const initial = initialRetentionState(0);
    const immediate = applyGoodUse(initial, 0);
    const later = applyGoodUse(immediate, 10 * day + 123);
    expect(immediate).toMatchObject({
      lastUsedAtMs: 0,
      stability: initial.stability,
      useCount: 1,
    });
    expect(later.stability).toBeGreaterThan(immediate.stability);
    expect(later.naturalForgetAtMs).toBeGreaterThan(immediate.naturalForgetAtMs);
    expect(later.useCount).toBe(2);
  });

  test("caps the golden-ratio lifecycle boost at 38.2 percent", (): void => {
    const state = initialRetentionState(0);
    const maximum = { ...state, retrievalCount: 1_000, useCount: 1_000 };
    expect(lifecycleBoost(maximum, 0)).toBeCloseTo(0.382, 10);
    expect(lifecycleBoost(maximum, 10 * day)).toBeLessThan(0.382);
  });

  test("keeps explicit forgetting authoritative", (): void => {
    const state = { ...initialRetentionState(0), explicitForgottenAtMs: 1 };
    expect(retentionStatus(state, 1)).toEqual({
      forgottenReason: "explicit",
      status: "forgotten",
    });
  });
});
