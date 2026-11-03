export const formatTime = (seconds: number): string => {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
};

/** Day label used as the history group header. */
export const formatDayLabel = (at: number, now: number = Date.now()): string => {
  const date = new Date(at);
  const reference = new Date(now);
  const startOfDay = (value: Date): number =>
    new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  const days = Math.round((startOfDay(reference) - startOfDay(date)) / 86_400_000);
  if (days === 0) return "今天";
  if (days === 1) return "昨天";
  return date.getFullYear() === reference.getFullYear()
    ? `${date.getMonth() + 1}月${date.getDate()}日`
    : `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
};

export interface DayGroup<T> {
  key: string;
  label: string;
  items: T[];
}

/** Group newest-first entries by local day, keeping their order. */
export const groupByDay = <T extends { at: number }>(
  items: readonly T[],
  now: number = Date.now(),
): DayGroup<T>[] => {
  const groups: DayGroup<T>[] = [];
  for (const item of items) {
    const date = new Date(item.at);
    const key = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
    const last = groups.at(-1);
    if (last && last.key === key) {
      last.items.push(item);
      continue;
    }
    groups.push({ key, label: formatDayLabel(item.at, now), items: [item] });
  }
  return groups;
};

/** Clock only: the day lives in the group header above the row. */
export const formatClock = (at: number): string =>
  new Date(at).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
