import type { Context } from "hono";
import { ZodError } from "zod";
import { apiCode, apiFail, type ApiErrorCode } from "../../../shared/api.ts";
import { MarketError, type MarketErrorCode } from "../service/errors.ts";

type ErrorStatus = 400 | 404 | 408 | 500 | 502 | 504;

const statusByError = {
  not_found: 404,
  deadline_exceeded: 504,
  upstream_unavailable: 502,
} as const satisfies Record<MarketErrorCode, ErrorStatus>;

const codeByError = {
  not_found: apiCode.notFound,
  deadline_exceeded: apiCode.deadlineExceeded,
  upstream_unavailable: apiCode.upstreamUnavailable,
} as const satisfies Record<MarketErrorCode, ApiErrorCode>;

export const handleError = (error: unknown, c: Context): Response => {
  if (c.req.raw.signal.aborted) return c.json(apiFail(apiCode.canceled, "请求已取消"), 408);
  if (error instanceof ZodError)
    return c.json(apiFail(apiCode.invalidArgument, "请求参数无效"), 400);
  if (error instanceof MarketError)
    return c.json(apiFail(codeByError[error.code], error.message), statusByError[error.code]);
  console.error(error);
  return c.json(apiFail(apiCode.internal, "服务内部错误"), 500);
};
