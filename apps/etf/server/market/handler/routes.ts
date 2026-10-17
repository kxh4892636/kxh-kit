import { Hono } from "hono";
import { validator } from "hono/validator";
import { z } from "zod";
import { apiOk } from "../../../shared/api.ts";
import { tradeDate } from "../../utils/dates.ts";
import type { MarketService } from "../service/market-service.ts";

export const dailyBarsRequest = z
  .object({
    symbol: z.string().trim().min(1),
    adjType: z
      .string()
      .trim()
      .transform((value: string): string => value || "qfq")
      .pipe(z.literal("qfq"))
      .default("qfq"),
    startDate: tradeDate.optional(),
    endDate: tradeDate.optional(),
  })
  .refine(
    (value): boolean => !value.startDate || !value.endDate || value.startDate <= value.endDate,
    "起点不能晚于终点",
  );

export const createMarketHandler = (service: MarketService) =>
  new Hono()
    .get("/securities", (c) => c.json(apiOk({ securities: service.listSecurities() }), 200))
    .get(
      "/daily-bars",
      validator("query", (value) => dailyBarsRequest.parse(value)),
      async (c) =>
        c.json(apiOk(await service.getDailyBars(c.req.valid("query"), c.req.raw.signal)), 200),
    );
