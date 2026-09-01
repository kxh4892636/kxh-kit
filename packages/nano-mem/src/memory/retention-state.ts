export const RETENTION_POLICY_VERSION = 1;
export const INITIAL_STABILITY_DAYS = 2.3065;

const initialDifficultyWeight = 6.4133;
const difficultyMultiplier = 0.8334;
const goodRating = 3;
const decay = -0.1542;
const factor = Math.exp(Math.log(0.9) / decay) - 1;
const forgetThreshold = 0.5;
const millisecondsPerDay = 86_400_000;

export const INITIAL_DIFFICULTY =
  Math.round(
    (initialDifficultyWeight - Math.exp((goodRating - 1) * difficultyMultiplier) + 1) * 1e8,
  ) / 1e8;

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

const elapsedDaysAtThreshold =
  (INITIAL_STABILITY_DAYS / factor) * (forgetThreshold ** (1 / decay) - 1);

export const initialRetentionState = (nowMs: number): RetentionState => ({
  difficulty: INITIAL_DIFFICULTY,
  explicitForgottenAtMs: null,
  lastUsedAtMs: null,
  naturalForgetAtMs: nowMs + Math.ceil(elapsedDaysAtThreshold * millisecondsPerDay),
  policyVersion: RETENTION_POLICY_VERSION,
  retentionAnchorAtMs: nowMs,
  retrievalCount: 0,
  stability: INITIAL_STABILITY_DAYS,
  useCount: 0,
});
