export interface HistoryEntry {
  id: string;
  at: number;
}

export const HISTORY_MAX = 13;

/**
 * Newest first, one row per track: replaying a track moves it to the top
 * instead of filling the list with the same piece.
 */
export const pushHistory = (
  list: readonly HistoryEntry[],
  id: string,
  at: number,
  max: number = HISTORY_MAX,
): HistoryEntry[] => [{ id, at }, ...list.filter((entry) => entry.id !== id)].slice(0, max);
