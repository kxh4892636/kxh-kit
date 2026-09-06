export const formatNumber = (value: number, digits: number = 2): string => {
  if (!Number.isFinite(value)) {
    return "-";
  }

  return new Intl.NumberFormat("zh-CN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  }).format(value);
};

export const formatPercent = (value: number): string =>
  Number.isFinite(value) ? `${value >= 0 ? "+" : ""}${formatNumber(value, 2)}%` : "-";

export const formatLargeNumber = (value: number): string => {
  if (!Number.isFinite(value)) {
    return "-";
  }

  const abs = Math.abs(value);
  if (abs >= 100_000_000) {
    return `${formatNumber(value / 100_000_000, 2)}亿`;
  }
  if (abs >= 10_000) {
    return `${formatNumber(value / 10_000, 2)}万`;
  }
  return formatNumber(value, 2);
};
