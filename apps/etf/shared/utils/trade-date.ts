const DAY_MS = 86_400_000;

export interface TradeDateParts {
  year: number;
  month: number;
  day: number;
  dateMs: number;
}

export const parseTradeDate = (value: string): TradeDateParts => {
  const [yearText, monthText, dayText] = value.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  return { year, month, day, dateMs: Date.UTC(year, month - 1, day) };
};

export const formatTradeDate = (dateMs: number): string => {
  const date = new Date(dateMs);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const isValidTradeDate = (value: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const { dateMs } = parseTradeDate(value);
  return Number.isFinite(dateMs) && formatTradeDate(dateMs) === value;
};

export const addDays = (date: string, days: number): string =>
  formatTradeDate(parseTradeDate(date).dateMs + days * DAY_MS);

export const dateRange = (start: string, end: string): string[] => {
  const days: string[] = [];
  for (let date = start; date <= end; date = addDays(date, 1)) days.push(date);
  return days;
};

export const isWeekday = (date: string): boolean =>
  ![0, 6].includes(new Date(parseTradeDate(date).dateMs).getUTCDay());
