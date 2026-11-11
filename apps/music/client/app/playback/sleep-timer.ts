/**
 * Sleep timer: how long auto-play stays on. `off` is the default (a track ends,
 * the next one is queued at 0:00); `endless` never expires; `until` carries the
 * deadline so the decision survives a backgrounded tab, where timers are throttled.
 */
export type SleepTimer =
  | { kind: "off" }
  | { kind: "endless" }
  | { kind: "until"; endsAt: number; totalMs: number };

export const MINUTES_MIN = 1;
export const MINUTES_MAX = 1440;

export const OFF_TIMER: SleepTimer = { kind: "off" };

export const isAutoPlayActive = (timer: SleepTimer, now: number = Date.now()): boolean => {
  if (timer.kind === "endless") return true;
  if (timer.kind === "until") return now < timer.endsAt;
  return false;
};

export const remainingMs = (timer: SleepTimer, now: number = Date.now()): number | null =>
  timer.kind === "until" ? Math.max(0, timer.endsAt - now) : null;

/** Whole minutes, rounded up, so a fresh 30-minute timer never reads 29. */
export const remainingMinutes = (timer: SleepTimer, now: number = Date.now()): number | null => {
  const left = remainingMs(timer, now);
  return left === null ? null : Math.ceil(left / 60_000);
};

export const parseMinutes = (raw: string): number | null => {
  const text = raw.trim();
  if (!/^\d+$/.test(text)) return null;
  const value = Number(text);
  if (!Number.isInteger(value) || value < MINUTES_MIN || value > MINUTES_MAX) return null;
  return value;
};

const pad = (value: number): string => String(value).padStart(2, "0");

/** `MM:SS` under an hour, `H:MM:SS` past it, rounded up to the second. */
export const formatRemaining = (ms: number): string => {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
};
