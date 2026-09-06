import { z } from "zod";
export const tradeDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value: string): boolean => {
    const date = new Date(value + "T00:00:00Z");
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, "日期无效");
export const addDays = (date: string, days: number): string =>
  new Date(Date.parse(date + "T00:00:00Z") + days * 86400000).toISOString().slice(0, 10);
export const shanghaiDate = (now: Date): string =>
  new Date(now.getTime() + 8 * 3600000).toISOString().slice(0, 10);
export const dateRange = (start: string, end: string): string[] => {
  const days: string[] = [];
  for (let date = start; date <= end; date = addDays(date, 1)) days.push(date);
  return days;
};
export const isWeekday = (date: string): boolean =>
  ![0, 6].includes(new Date(date + "T00:00:00Z").getUTCDay());
