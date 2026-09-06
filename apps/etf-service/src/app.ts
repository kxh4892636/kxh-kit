import { Hono } from "hono";
import { cors } from "hono/cors";
import { ZodError } from "zod";
import type { SecurityStore } from "./market/securities.ts";

export class MarketError extends Error {
  readonly status: 400 | 404 | 502 | 504;
  readonly code: string;
  constructor(status: 400 | 404 | 502 | 504, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
export const createApp = (store: SecurityStore) =>
  new Hono()
    .use("*", async (c, next) => {
      try {
        await next();
      } catch (error) {
        if (error instanceof ZodError)
          return c.json({ error: { code: "invalid_argument", message: "请求参数无效" } }, 400);
        throw error;
      }
    })
    .use("*", cors())
    .get("/", (c) => c.json({ ok: true }))
    .get("/api/securities", (c) => c.json({ securities: store.listSecurities() }))
    .onError((error, c) => {
      if (error instanceof MarketError)
        return c.json({ error: { code: error.code, message: error.message } }, error.status);
      console.error(error);
      return c.json({ error: { code: "internal", message: "服务内部错误" } }, 500);
    });
export type AppType = ReturnType<typeof createApp>;
