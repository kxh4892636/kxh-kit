// 统计工具函数(自上游 stats.utils.ts 移植)。
// 注: 本仓库开启 noUncheckedIndexedAccess, 所有下标访问前均有 length 守卫,
// 语义上必然定义, 故使用非空断言。

export interface DistributionMetrics {
  mean: number;
  median: number;
  min: number;
  max: number;
  count: number;
  buckets: Record<string, number>;
}

export interface BucketConfig {
  boundaries: number[];
  formatLabel?: (lower: number | null, upper: number | null) => string;
  unitSuffix?: string;
}

export interface RetentionMetrics {
  overall: number;
  by_rating: {
    again: number;
    hard: number;
    good: number;
    easy: number;
  };
}

// 桶标签数字格式化: 整数不带小数, 否则最多 1 位小数。
function formatNumber(n: number): string {
  if (Number.isInteger(n)) {
    return n.toString();
  }
  return n.toFixed(1);
}

function createEmptyBuckets(config: BucketConfig): Record<string, number> {
  const buckets: Record<string, number> = {};
  const { boundaries, formatLabel, unitSuffix } = config;

  if (boundaries.length === 0) {
    return buckets;
  }

  const labels = [
    formatLabel
      ? formatLabel(null, boundaries[0]!)
      : `<${formatNumber(boundaries[0]!)}${unitSuffix || ""}`,
  ];

  for (let i = 0; i < boundaries.length - 1; i++) {
    labels.push(
      formatLabel
        ? formatLabel(boundaries[i]!, boundaries[i + 1]!)
        : `${formatNumber(boundaries[i]!)}-${formatNumber(boundaries[i + 1]!)}${unitSuffix || ""}`,
    );
  }

  labels.push(
    formatLabel
      ? formatLabel(boundaries[boundaries.length - 1]!, null)
      : `>${formatNumber(boundaries[boundaries.length - 1]!)}${unitSuffix || ""}`,
  );

  labels.forEach((label) => {
    buckets[label] = 0;
  });

  return buckets;
}

function computeBuckets(sortedValues: number[], config: BucketConfig): Record<string, number> {
  const buckets = createEmptyBuckets(config);
  const { boundaries, formatLabel, unitSuffix } = config;

  if (boundaries.length === 0) {
    return buckets;
  }

  for (const value of sortedValues) {
    let placed = false;

    if (value < boundaries[0]!) {
      const label = formatLabel
        ? formatLabel(null, boundaries[0]!)
        : `<${formatNumber(boundaries[0]!)}${unitSuffix || ""}`;
      buckets[label] = (buckets[label] ?? 0) + 1;
      continue;
    }

    for (let i = 0; i < boundaries.length - 1; i++) {
      if (value >= boundaries[i]! && value < boundaries[i + 1]!) {
        const label = formatLabel
          ? formatLabel(boundaries[i]!, boundaries[i + 1]!)
          : `${formatNumber(boundaries[i]!)}-${formatNumber(boundaries[i + 1]!)}${unitSuffix || ""}`;
        buckets[label] = (buckets[label] ?? 0) + 1;
        placed = true;
        break;
      }
    }

    if (!placed) {
      const label = formatLabel
        ? formatLabel(boundaries[boundaries.length - 1]!, null)
        : `>${formatNumber(boundaries[boundaries.length - 1]!)}${unitSuffix || ""}`;
      buckets[label] = (buckets[label] ?? 0) + 1;
    }
  }

  return buckets;
}

// 计算可配置桶的分布指标(均值/中位数/最小/最大/计数/桶分布)。
export function computeDistribution(values: number[], config: BucketConfig): DistributionMetrics {
  if (values.length === 0) {
    return {
      mean: 0,
      median: 0,
      min: 0,
      max: 0,
      count: 0,
      buckets: createEmptyBuckets(config),
    };
  }

  const sorted = [...values].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, v) => acc + v, 0);

  const medianIndex = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0
      ? (sorted[medianIndex - 1]! + sorted[medianIndex]!) / 2
      : sorted[medianIndex]!;

  return {
    mean: sum / sorted.length,
    median,
    min: sorted[0]!,
    max: sorted[sorted.length - 1]!,
    count: sorted.length,
    buckets: computeBuckets(sorted, config),
  };
}

// 保留率 = (hard + good + easy) / total; 按钮值 1=Again 2=Hard 3=Good 4=Easy。
export function computeRetention(buttonPresses: number[]): RetentionMetrics {
  const counts = { again: 0, hard: 0, good: 0, easy: 0 };

  buttonPresses.forEach((button) => {
    if (button === 1) counts.again++;
    else if (button === 2) counts.hard++;
    else if (button === 3) counts.good++;
    else if (button === 4) counts.easy++;
  });

  const total = counts.again + counts.hard + counts.good + counts.easy;
  const remembered = counts.hard + counts.good + counts.easy;

  return {
    overall: total > 0 ? remembered / total : 0,
    by_rating: counts,
  };
}

// 学习连续天数: 从今天往前数到第一个无复习的日子(今天无复习则为 0)。
export function calculateStreak(reviewsByDay: Array<{ date: string; count: number }>): number {
  if (reviewsByDay.length === 0) {
    return 0;
  }

  const sorted = [...reviewsByDay].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );

  let streak = 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = 0; i < sorted.length; i++) {
    const day = sorted[i];
    if (day === undefined) {
      break;
    }

    const reviewDate = new Date(day.date);
    reviewDate.setHours(0, 0, 0, 0);

    const expectedDate = new Date(today);
    expectedDate.setDate(expectedDate.getDate() - i);

    if (reviewDate.getTime() === expectedDate.getTime() && day.count > 0) {
      streak++;
    } else {
      break;
    }
  }

  return streak;
}
