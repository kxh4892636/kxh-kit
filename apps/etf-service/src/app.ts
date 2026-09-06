import { Hono, type Context } from "hono";
import { validator } from "hono/validator";
import { cors } from "hono/cors";
import { ZodError } from "zod";
import { MarketError } from "./market/errors.ts";
import { dailyBarsRequest, type MarketService } from "./market/daily-bars.ts";
export { MarketError } from "./market/errors.ts";
const handleError = (error: unknown, c: Context): Response => {
  if (c.req.raw.signal.aborted)
    return c.json({ error: { code: "canceled", message: "请求已取消" } }, 408);
  if (error instanceof ZodError)
    return c.json({ error: { code: "invalid_argument", message: "请求参数无效" } }, 400);
  if (error instanceof MarketError)
    return c.json({ error: { code: error.code, message: error.message } }, error.status);
  console.error(error);
  return c.json({ error: { code: "internal", message: "服务内部错误" } }, 500);
};
export const createApp = (store: MarketService) =>
  new Hono()
    .use("*", async (c, next) => {
      try {
        await next();
      } catch (error) {
        return handleError(error, c);
      }
    })
    .use("*", cors())
    .get("/", (c) => c.json({ ok: true }))
    .get("/api/securities", (c) => c.json({ securities: store.listSecurities() }))
    .get(
      "/api/daily-bars",
      validator("query", (value) => dailyBarsRequest.parse(value)),
      async (c) => c.json(await store.getDailyBars(c.req.valid("query"), c.req.raw.signal)),
    )
    .onError(handleError);
export type AppType = ReturnType<typeof createApp>;
