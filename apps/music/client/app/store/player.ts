import { create } from "zustand";
import { persist } from "zustand/middleware";
import { drawNext, refillBag } from "./bag.ts";
import { pushHistory, type HistoryEntry } from "./history.ts";
import { OFF_TIMER, type SleepTimer } from "../playback/sleep-timer.ts";

interface PlayerState {
  history: HistoryEntry[];
  bag: string[];
  currentId: string | null;
  timer: SleepTimer;
  start: (ids: readonly string[]) => void;
  advance: (ids: readonly string[]) => string | null;
  select: (id: string) => void;
  commitPlayed: (id: string, at?: number) => void;
  startCountdown: (minutes: number, at?: number) => void;
  startEndless: () => void;
  expireTimer: (at?: number) => void;
}

const STORAGE_KEY = "musopen.listen.v1";

/**
 * History survives a reload; the bag, the current track and the sleep timer
 * reset, which is what a fresh shuffle and a fresh session should do.
 */
export const usePlayerStore = create<PlayerState>()(
  persist(
    (set, get) => ({
      history: [],
      bag: [],
      currentId: null,
      timer: OFF_TIMER,

      start: (ids) => {
        const bag = refillBag(ids, get().currentId);
        const currentId = bag[0] ?? null;
        set({ bag, currentId });
      },

      advance: (ids) => {
        const { bag, currentId } = get();
        // The current track may still sit in the bag until it actually plays;
        // skipping it here keeps「下一首」from handing back the same piece.
        const pool = bag.filter((id) => id !== currentId);
        const { id, bag: rest } = drawNext(pool, ids, currentId);
        set({ bag: rest, currentId: id });
        return id;
      },

      select: (id) => {
        set({ currentId: id });
      },

      commitPlayed: (id, at = Date.now()) => {
        set((state) => ({
          bag: state.bag.filter((entry) => entry !== id),
          history: pushHistory(state.history, id, at),
        }));
      },

      startCountdown: (minutes, at = Date.now()) => {
        const totalMs = Math.round(minutes * 60_000);
        set({ timer: { kind: "until", endsAt: at + totalMs, totalMs } });
      },

      startEndless: () => {
        set({ timer: { kind: "endless" } });
      },

      expireTimer: (at = Date.now()) => {
        const { timer } = get();
        if (timer.kind === "until" && at >= timer.endsAt) set({ timer: OFF_TIMER });
      },
    }),
    {
      name: STORAGE_KEY,
      partialize: (state) => ({ history: state.history }),
    },
  ),
);

export const resetPlayer = (): void => {
  usePlayerStore.setState({ history: [], bag: [], currentId: null, timer: OFF_TIMER });
};
