export const RETENTION_POLICY_VERSION = 1;
export const INITIAL_STABILITY_DAYS = 2.3065;

export const FSRS6_DEFAULT_WEIGHTS = Object.freeze([
  0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722, 0.1666, 0.796, 1.4835,
  0.0614, 0.2629, 1.6483, 0.6014, 1.8729, 0.5425, 0.0912, 0.0658, 0.1542,
] as const);

const goodRating = 3;
const easyRating = 4;
const fsrsParameter = {
  decay: FSRS6_DEFAULT_WEIGHTS[20],
  difficultyMeanReversion: FSRS6_DEFAULT_WEIGHTS[7],
  difficultyRatingMultiplier: FSRS6_DEFAULT_WEIGHTS[6],
  initialDifficulty: FSRS6_DEFAULT_WEIGHTS[4],
  initialDifficultyMultiplier: FSRS6_DEFAULT_WEIGHTS[5],
  recallRetrievabilityExponent: FSRS6_DEFAULT_WEIGHTS[10],
  recallStabilityExponent: FSRS6_DEFAULT_WEIGHTS[8],
  recallStabilityPower: FSRS6_DEFAULT_WEIGHTS[9],
} as const;
const decay = -fsrsParameter.decay;
const factor = Math.exp(Math.log(0.9) / decay) - 1;
const forgetThreshold = 0.5;
const millisecondsPerDay = 86_400_000;
const stabilityMinimum = 0.001;
const stabilityMaximum = 36_500;
const goldenRatioBoostMaximum = 0.382;
const retrievabilityBoostMaximum = goldenRatioBoostMaximum * 0.4;
const useCountBoostMaximum = goldenRatioBoostMaximum * 0.4;
const retrievalCountBoostMaximum = goldenRatioBoostMaximum * 0.2;

const roundToEight = (value: number): number => Math.round(value * 1e8) / 1e8;
const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(Math.max(value, minimum), maximum);

const initialDifficulty = (rating: number): number =>
  roundToEight(
    fsrsParameter.initialDifficulty -
      Math.exp((rating - 1) * fsrsParameter.initialDifficultyMultiplier) +
      1,
  );

export const INITIAL_DIFFICULTY = initialDifficulty(goodRating);

export interface RetentionState {
  difficulty: number;
  explicitForgottenAtMs: number | null;
  lastUsedAtMs: number | null;
  naturalForgetAtMs: number;
  policyVersion: number;
  retentionAnchorAtMs: number;
  retrievalCount: number;
  stability: number;
  useCount: number;
}

export type ForgottenReason = "explicit" | "natural";

export interface RetentionStatus {
  forgottenReason: ForgottenReason | null;
  status: "active" | "forgotten";
}

const thresholdDays = (stability: number): number =>
  (stability / factor) * (forgetThreshold ** (1 / decay) - 1);

export const naturalForgetAt = (anchorAtMs: number, stability: number): number =>
  anchorAtMs + Math.floor(thresholdDays(stability) * millisecondsPerDay) + 1;

export const retrievability = (
  state: Pick<RetentionState, "retentionAnchorAtMs" | "stability">,
  nowMs: number,
): number => {
  const elapsedDays = Math.max(0, nowMs - state.retentionAnchorAtMs) / millisecondsPerDay;
  return (1 + (factor * elapsedDays) / state.stability) ** decay;
};

export const retentionStatus = (state: RetentionState, nowMs: number): RetentionStatus => {
  if (state.explicitForgottenAtMs !== null) {
    return { forgottenReason: "explicit", status: "forgotten" };
  }
  return nowMs >= state.naturalForgetAtMs
    ? { forgottenReason: "natural", status: "forgotten" }
    : { forgottenReason: null, status: "active" };
};

const nextDifficulty = (difficulty: number): number => {
  const delta = -fsrsParameter.difficultyRatingMultiplier * (goodRating - 3);
  const dampedDelta = (delta * (10 - difficulty)) / 9;
  const next = difficulty + dampedDelta;
  const reverted =
    fsrsParameter.difficultyMeanReversion * initialDifficulty(easyRating) +
    (1 - fsrsParameter.difficultyMeanReversion) * next;
  return clamp(roundToEight(reverted), 1, 10);
};

const nextStability = (state: RetentionState, nowMs: number): number => {
  const currentRetrievability = retrievability(state, nowMs);
  const increase =
    Math.exp(fsrsParameter.recallStabilityExponent) *
    (11 - state.difficulty) *
    state.stability ** -fsrsParameter.recallStabilityPower *
    (Math.exp((1 - currentRetrievability) * fsrsParameter.recallRetrievabilityExponent) - 1);
  return roundToEight(clamp(state.stability * (1 + increase), stabilityMinimum, stabilityMaximum));
};

export const applyGoodUse = (state: RetentionState, nowMs: number): RetentionState => {
  const stability = nextStability(state, nowMs);
  return {
    difficulty: nextDifficulty(state.difficulty),
    explicitForgottenAtMs: null,
    lastUsedAtMs: nowMs,
    naturalForgetAtMs: naturalForgetAt(nowMs, stability),
    policyVersion: RETENTION_POLICY_VERSION,
    retentionAnchorAtMs: nowMs,
    retrievalCount: state.retrievalCount,
    stability,
    useCount: state.useCount + 1,
  };
};

const cappedLogCount = (count: number): number =>
  Math.min(Math.log1p(Math.max(0, count)) / Math.log1p(100), 1);

export const lifecycleBoost = (state: RetentionState, nowMs: number): number =>
  retrievability(state, nowMs) * retrievabilityBoostMaximum +
  cappedLogCount(state.useCount) * useCountBoostMaximum +
  cappedLogCount(state.retrievalCount) * retrievalCountBoostMaximum;

export const initialRetentionState = (nowMs: number): RetentionState => ({
  difficulty: INITIAL_DIFFICULTY,
  explicitForgottenAtMs: null,
  lastUsedAtMs: null,
  naturalForgetAtMs: naturalForgetAt(nowMs, INITIAL_STABILITY_DAYS),
  policyVersion: RETENTION_POLICY_VERSION,
  retentionAnchorAtMs: nowMs,
  retrievalCount: 0,
  stability: INITIAL_STABILITY_DAYS,
  useCount: 0,
});
