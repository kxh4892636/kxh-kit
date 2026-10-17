// extra 是外部附加信息容器，允许任意值。
type ISafeAny = any;

export const apiCode = {
  ok: 0,
  invalidArgument: 1001,
  notFound: 1002,
  canceled: 1003,
  internal: 1004,
  upstreamUnavailable: 1005,
  deadlineExceeded: 1006,
  routeNotFound: 1007,
} as const;

export type ApiCode = (typeof apiCode)[keyof typeof apiCode];
export type ApiErrorCode = Exclude<ApiCode, typeof apiCode.ok>;

export interface ApiResponse<T> {
  code: number;
  message: string;
  extra: Record<string, ISafeAny>;
  data: T;
}

export const apiOk = <T>(data: T): ApiResponse<T> => ({
  code: apiCode.ok,
  message: "ok",
  extra: {},
  data,
});

export const apiFail = (
  code: ApiErrorCode,
  message: string,
  extra: Record<string, ISafeAny> = {},
): ApiResponse<null> => ({ code, message, extra, data: null });
