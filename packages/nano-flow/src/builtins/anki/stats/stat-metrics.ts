export type DistributionMetrics = {
  readonly mean: number;
  readonly median: number;
  readonly min: number;
  readonly max: number;
  readonly count: number;
  readonly buckets: Readonly<Record<string, number>>;
};

const label = (value: number): string =>
  Number.isInteger(value) ? String(value) : value.toFixed(1);
const bucketLabels = (boundaries: readonly number[], suffix: string): readonly string[] =>
  boundaries.length === 0
    ? []
    : [
        `<${label(boundaries[0]!)}${suffix}`,
        ...boundaries
          .slice(0, -1)
          .map(
            (lower: number, index: number): string =>
              `${label(lower)}-${label(boundaries[index + 1]!)}${suffix}`,
          ),
        `>${label(boundaries.at(-1)!)}${suffix}`,
      ];

export const distribution = (
  values: readonly number[],
  boundaries: readonly number[],
  suffix = "",
): DistributionMetrics => {
  const labels = bucketLabels(boundaries, suffix);
  const buckets: Record<string, number> = Object.fromEntries(
    labels.map((name: string): readonly [string, number] => [name, 0]),
  );
  const sorted = [...values].sort((left: number, right: number): number => left - right);
  for (const value of sorted) {
    const index = boundaries.findIndex((boundary: number): boolean => value < boundary);
    const bucket = labels[index === -1 ? labels.length - 1 : index];
    if (bucket !== undefined) buckets[bucket] = (buckets[bucket] ?? 0) + 1;
  }
  if (sorted.length === 0) return { mean: 0, median: 0, min: 0, max: 0, count: 0, buckets };
  const middle = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0 ? (sorted[middle - 1]! + sorted[middle]!) / 2 : sorted[middle]!;
  return {
    mean: sorted.reduce((sum: number, value: number): number => sum + value, 0) / sorted.length,
    median,
    min: sorted[0]!,
    max: sorted.at(-1)!,
    count: sorted.length,
    buckets,
  };
};

export const retention = (
  ratings: readonly number[],
): { readonly overall: number; readonly by_rating: Readonly<Record<string, number>> } => {
  const counts: Record<string, number> = { again: 0, hard: 0, good: 0, easy: 0 };
  const names = ["", "again", "hard", "good", "easy"];
  for (const rating of ratings) {
    const name = names[rating];
    if (name !== undefined && name !== "") counts[name] = (counts[name] ?? 0) + 1;
  }
  const total = ratings.filter((rating: number): boolean => rating >= 1 && rating <= 4).length;
  return { overall: total === 0 ? 0 : 1 - (counts["again"] ?? 0) / total, by_rating: counts };
};

export const streak = (
  reviews: readonly { readonly date: string; readonly count: number }[],
  today: Date,
): number => {
  const byDate = new Map(
    reviews.map((entry: { readonly date: string; readonly count: number }): [string, number] => [
      entry.date,
      entry.count,
    ]),
  );
  const cursor = new Date(today);
  cursor.setUTCHours(0, 0, 0, 0);
  let days = 0;
  for (;;) {
    const key = cursor.toISOString().slice(0, 10);
    if ((byDate.get(key) ?? 0) <= 0) return days;
    days += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
};
