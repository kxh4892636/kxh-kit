import { Hono } from "hono";
import type { ApplyGlobalResponse } from "hono/client";
import { cors } from "hono/cors";
import { apiCode, apiFail, apiOk, type ApiResponse } from "../shared/api.ts";
import { handleError } from "./market/handler/errors.ts";
import { createMarketHandler } from "./market/handler/routes.ts";
import type { MarketService } from "./market/service/market-service.ts";

export const createApp = (service: MarketService) =>
  new Hono()
    .use("*", async (c, next) => {
      try {
        await next();
      } catch (error) {
        return handleError(error, c);
      }
      return undefined;
    })
    .use("*", cors())
    .get("/", (c) => c.json(apiOk({ ok: true }), 200))
    .route("/api", createMarketHandler(service))
    .onError(handleError)
    .notFound((c) =>
      c.json(
        apiFail(apiCode.routeNotFound, "接口不存在", {
          method: c.req.method,
          path: c.req.path,
        }),
        404,
      ),
    );

type ApiErrorStatus = 400 | 404 | 408 | 500 | 502 | 504;

export type AppType = ApplyGlobalResponse<
  ReturnType<typeof createApp>,
  { [S in ApiErrorStatus]: { json: ApiResponse<null> } }
>;
