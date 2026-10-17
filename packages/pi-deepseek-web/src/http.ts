/**
 * Shared JSON transport for DeepSeek's official Search and Fetch APIs. Both
 * endpoints take a bearer-authenticated JSON POST and return JSON; keeping the
 * timeout, cancellation, and error decoding here prevents the two clients from
 * drifting apart.
 * @module @kxh4892636/pi-deepseek-web/http
 */

/** A JSON POST to one DeepSeek tool endpoint. */
export interface JsonPostRequest {
  endpoint: string;
  apiKey: string;
  body: unknown;
  /** Human-readable tool name used in error messages, e.g. `DeepSeek web search`. */
  label: string;
  timeoutMs: number;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}

/** Best-effort OpenAI-compatible error envelope. */
interface ApiErrorBody {
  error?: { message?: string } | string;
  message?: string;
}

/** Attribution header; keep in sync with the package version. */
const USER_AGENT = "pi-deepseek-web/0.2.0";

/**
 * Build one official tool endpoint.
 *
 * @param baseURL - API root (`https://api.deepseek.com`) or a versioned base.
 * @param tool - tool name appended after `/tools/`.
 * @returns the absolute endpoint, tolerating a trailing slash or `/v1` suffix.
 */
export const toolEndpoint = (baseURL: string, tool: "search" | "fetch"): string => {
  const base = baseURL.replace(/\/+$/u, "");
  return base.endsWith("/v1") ? `${base}/tools/${tool}` : `${base}/v1/tools/${tool}`;
};

/**
 * POST JSON with bearer auth, a hard timeout, and caller cancellation.
 *
 * @param request - endpoint, credentials, body, timeout and optional overrides.
 * @returns the parsed response body.
 * @throws on network failure, timeout, abort, non-2xx responses, or unreadable
 *   JSON; messages name the tool, endpoint and (when available) the API detail.
 */
export const postJson = async <T>(request: JsonPostRequest): Promise<T> => {
  const doFetch = request.fetchImpl ?? fetch;
  const timeout = AbortSignal.timeout(request.timeoutMs);
  const signal =
    request.signal === undefined ? timeout : AbortSignal.any([request.signal, timeout]);

  let response: Response;
  try {
    response = await doFetch(request.endpoint, {
      method: "POST",
      redirect: "error",
      headers: {
        authorization: `Bearer ${request.apiKey}`,
        "content-type": "application/json",
        accept: "application/json",
        "user-agent": USER_AGENT,
      },
      body: JSON.stringify(request.body),
      signal,
    });
  } catch (error) {
    throw requestError(request, timeout, error);
  }

  if (!response.ok) {
    const detail = await errorDetail(response);
    const suffix = detail.length > 0 ? `: ${detail}` : "";
    throw new Error(
      `${request.label} API error (HTTP ${response.status})${suffix}. Endpoint: ${request.endpoint}`,
    );
  }

  try {
    return (await response.json()) as T;
  } catch (error) {
    throw bodyError(request, timeout, error);
  }
};

/** Classify a failed request as caller abort, timeout, or network failure. */
const requestError = (request: JsonPostRequest, timeout: AbortSignal, error: unknown): Error => {
  if (request.signal?.aborted === true) {
    return new Error(`${request.label} was aborted`);
  }
  if (timeout.aborted) {
    return new Error(`${request.label} timed out after ${request.timeoutMs}ms`);
  }
  return new Error(
    `${request.label} request to ${request.endpoint} failed: ${messageOf(error)}. ` +
      "Check network or proxy access to that endpoint.",
  );
};

/** Classify an unreadable successful response body. */
const bodyError = (request: JsonPostRequest, timeout: AbortSignal, error: unknown): Error => {
  if (request.signal?.aborted === true) {
    return new Error(`${request.label} was aborted`);
  }
  if (timeout.aborted) {
    return new Error(`${request.label} timed out after ${request.timeoutMs}ms`);
  }
  return new Error(`${request.label} returned an unreadable body: ${messageOf(error)}`);
};

/** Extract the official (or OpenAI-compatible) error message, if any. */
const errorDetail = async (response: Response): Promise<string> => {
  try {
    const parsed = (await response.json()) as ApiErrorBody;
    if (typeof parsed.error === "string") return parsed.error;
    const nested = parsed.error?.message;
    if (typeof nested === "string" && nested.length > 0) return nested;
    if (typeof parsed.message === "string" && parsed.message.length > 0) return parsed.message;
  } catch {
    // A malformed/non-JSON error body can only cost a richer message.
  }
  return "";
};

const messageOf = (error: unknown): string => {
  return error instanceof Error ? error.message : String(error);
};
