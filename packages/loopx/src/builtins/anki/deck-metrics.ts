import type { JsonValue } from "../../cli/types";

const formatNumber = (value: number): string =>
  Number.isInteger(value) ? value.toString() : value.toFixed(1);

const emptyBuckets = (boundaries: readonly number[], suffix: string): Record<string, number> => {
  if (boundaries.length === 0) return {};
  const buckets: Record<string, number> = {};
  const first = boundaries[0];
  const last = boundaries.at(-1);
  if (first === undefined || last === undefined) return buckets;
  buckets[`<${formatNumber(first)}${suffix}`] = 0;
  for (let index = 0; index < boundaries.length - 1; index += 1) {
    const lower = boundaries[index];
    const upper = boundaries[index + 1];
    if (lower !== undefined && upper !== undefined) {
      buckets[`${formatNumber(lower)}-${formatNumber(upper)}${suffix}`] = 0;
    }
  }
  buckets[`>${formatNumber(last)}${suffix}`] = 0;
  return buckets;
};

export const computeDistribution = (
  values: readonly number[],
  boundaries: readonly number[],
  suffix = "",
): JsonValue => {
  const sorted = [...values].sort((left: number, right: number): number => left - right);
  const buckets = emptyBuckets(boundaries, suffix);
  for (const value of sorted) {
    const first = boundaries[0];
    const last = boundaries.at(-1);
    if (first === undefined || last === undefined) continue;
    if (value < first) {
      const label = `<${formatNumber(first)}${suffix}`;
      buckets[label] = (buckets[label] ?? 0) + 1;
      continue;
    }
    let placed = false;
    for (let index = 0; index < boundaries.length - 1; index += 1) {
      const lower = boundaries[index];
      const upper = boundaries[index + 1];
      if (lower !== undefined && upper !== undefined && value >= lower && value < upper) {
        const label = `${formatNumber(lower)}-${formatNumber(upper)}${suffix}`;
        buckets[label] = (buckets[label] ?? 0) + 1;
        placed = true;
        break;
      }
    }
    if (!placed) {
      const label = `>${formatNumber(last)}${suffix}`;
      buckets[label] = (buckets[label] ?? 0) + 1;
    }
  }
  if (sorted.length === 0) return { mean: 0, median: 0, min: 0, max: 0, count: 0, buckets };
  const middle = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0
      ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
      : (sorted[middle] ?? 0);
  return {
    mean: sorted.reduce((sum: number, value: number): number => sum + value, 0) / sorted.length,
    median,
    min: sorted[0] ?? 0,
    max: sorted.at(-1) ?? 0,
    count: sorted.length,
    buckets,
  };
};

const ankiSearchSpecials = /[\\"*_]/gu;

export const deckScopeQuery = (deck: string): string =>
  `"deck:${deck.replace(ankiSearchSpecials, (character: string): string => `\\${character}`)}"`;
