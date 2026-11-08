import { create } from "zustand";
import { persist } from "zustand/middleware";
import { drawNext, refillBag } from "./bag.ts";
import { pushHistory, type HistoryEntry } from "./history.ts";

interface PlayerState {
  history: HistoryEntry[];
  bag: string[];
  currentId: string | null;
  autoPlay: boolean;
  start: (ids: readonly string[]) => void;
  advance: (ids: readonly string[]) => string | null;
  select: (id: string) => void;
  commitPlayed: (id: string, at?: number) => void;
  setAutoPlay: (value: boolean) => void;
}

const STORAGE_KEY = "musopen.listen.v1";

/**
 * History and the auto-play preference survive a reload; the bag and the
 * current track reset, which is what a fresh shuffle should do.
 */
export const usePlayerStore = create<PlayerState>()(
  persist(
    (set, get) => ({
      history: [],
      bag: [],
      currentId: null,
      autoPlay: false,

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

      setAutoPlay: (value) => {
        set({ autoPlay: value });
      },
    }),
    {
      name: STORAGE_KEY,
      partialize: (state) => ({ history: state.history, autoPlay: state.autoPlay }),
    },
  ),
);

export const resetPlayer = (): void => {
  usePlayerStore.setState({ history: [], bag: [], currentId: null, autoPlay: false });
};
