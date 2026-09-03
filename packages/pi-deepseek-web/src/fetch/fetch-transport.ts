import type { FetchConfig } from "../plugin-config.js";
import { TextDecoder } from "node:util";
import {
  classifyContentType,
  createTextDecoder,
  fetchFailure,
  isFetchFailure,
  isSameOrigin,
  parseCharset,
  validateFetchUrl,
  type FetchBodyKind,
} from "./fetch-policy.js";
import { fetchNetwork, type PinnedResponse, type FetchNetwork } from "./fetch-network.js";

const REQUEST_HEADERS = Object.freeze({
  accept:
    "text/html,application/xhtml+xml,text/*;q=0.9,application/json;q=0.8,application/xml;q=0.8",
  "user-agent": "pi-deepseek-web/0.1.0",
});

export interface FetchTransportResult {
  readonly url: string;
  readonly statusCode: number;
  readonly kind: FetchBodyKind;
  readonly content: string;
  readonly truncated: boolean;
}

interface CappedBody {
  readonly bytes: Uint8Array;
  readonly truncated: boolean;
}

const throwBoundaryFailure = (
  error: unknown,
  callerSignal: AbortSignal | undefined,
  timeoutSignal: AbortSignal,
): never => {
  if (callerSignal?.aborted === true) {
    throw fetchFailure("aborted");
  }
  if (timeoutSignal.aborted) {
    throw fetchFailure("timed out");
  }
  if (isFetchFailure(error)) {
    throw error;
  }
  throw fetchFailure("network request failed");
};

const joinChunks = (chunks: readonly Uint8Array[], total: number): Uint8Array => {
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
};

const readCappedBody = async (
  response: Response,
  maximumBytes: number,
  signal: AbortSignal,
): Promise<CappedBody> => {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
    await response.body?.cancel().catch((): undefined => undefined);
    throw fetchFailure("response body too large");
  }
  if (response.body === null) {
    return { bytes: new Uint8Array(), truncated: false };
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let truncated = false;
  try {
    while (true) {
      const chunk = await reader.read().catch((_error: unknown): never => {
        throw signal.aborted ? fetchFailure("aborted") : fetchFailure("response read failed");
      });
      if (chunk.done) {
        break;
      }
      const remaining = maximumBytes - total;
      if (chunk.value.byteLength > remaining) {
        chunks.push(chunk.value.subarray(0, remaining));
        total += remaining;
        truncated = true;
        break;
      }
      chunks.push(chunk.value);
      total += chunk.value.byteLength;
    }
  } finally {
    await reader.cancel().catch((): undefined => undefined);
    reader.releaseLock();
  }
  return { bytes: joinChunks(chunks, total), truncated };
};

const readFinalResponse = async (
  response: Response,
  finalUrl: URL,
  config: Readonly<FetchConfig>,
  signal: AbortSignal,
): Promise<FetchTransportResult> => {
  const contentType = response.headers.get("content-type");
  const kind = classifyContentType(contentType);
  if (kind === undefined) {
    await response.body?.cancel().catch((): undefined => undefined);
    throw fetchFailure("unsupported content type");
  }
  let decoder: TextDecoder;
  try {
    decoder = createTextDecoder(parseCharset(contentType));
  } catch (error: unknown) {
    await response.body?.cancel().catch((): undefined => undefined);
    throw error;
  }
  const body = await readCappedBody(response, config.maxResponseBytes, signal);
  const decoded = decoder.decode(body.bytes);
  const truncatedByCharacters = decoded.length > config.maxBodyChars;
  return {
    url: finalUrl.toString(),
    statusCode: response.status,
    kind,
    content: truncatedByCharacters ? decoded.slice(0, config.maxBodyChars) : decoded,
    truncated: body.truncated || truncatedByCharacters,
  };
};

const isRedirectStatus = (status: number): boolean =>
  status === 301 || status === 302 || status === 303 || status === 307 || status === 308;

const redirectTarget = (response: Response, currentUrl: URL): URL => {
  const location = response.headers.get("location");
  if (location === null) {
    throw fetchFailure("redirect blocked");
  }
  let target: URL;
  try {
    target = validateFetchUrl(new URL(location, currentUrl).toString());
  } catch {
    throw fetchFailure("redirect blocked");
  }
  if (!isSameOrigin(target, currentUrl)) {
    throw fetchFailure("redirect blocked");
  }
  return target;
};

const requestOnce = async (
  url: URL,
  signal: AbortSignal,
  network: FetchNetwork,
): Promise<PinnedResponse> => {
  if (signal.aborted) {
    throw fetchFailure("aborted");
  }
  const addresses = await network.resolve(url.hostname, signal);
  if (signal.aborted) {
    throw fetchFailure("aborted");
  }
  return network.request(url, addresses, REQUEST_HEADERS, signal);
};

const followAndRead = async (
  input: string,
  config: Readonly<FetchConfig>,
  signal: AbortSignal,
  network: FetchNetwork,
): Promise<FetchTransportResult> => {
  let currentUrl = validateFetchUrl(input);
  let redirects = 0;
  while (true) {
    const pinned = await requestOnce(currentUrl, signal, network);
    try {
      if (!isRedirectStatus(pinned.response.status)) {
        return await readFinalResponse(pinned.response, currentUrl, config, signal);
      }
      if (redirects >= config.maxRedirects) {
        await pinned.response.body?.cancel().catch((): undefined => undefined);
        throw fetchFailure("redirect blocked");
      }
      let target: URL;
      try {
        target = redirectTarget(pinned.response, currentUrl);
      } catch (error: unknown) {
        await pinned.response.body?.cancel().catch((): undefined => undefined);
        throw error;
      }
      await pinned.response.body?.cancel().catch((): undefined => undefined);
      currentUrl = target;
      redirects += 1;
    } finally {
      await pinned.close();
    }
  }
};

export const fetchHttpPage = async (
  input: string,
  config: Readonly<FetchConfig>,
  callerSignal: AbortSignal | undefined,
  network: FetchNetwork = fetchNetwork,
): Promise<FetchTransportResult> => {
  const timeoutSignal = AbortSignal.timeout(config.timeoutMs);
  const signal =
    callerSignal === undefined ? timeoutSignal : AbortSignal.any([callerSignal, timeoutSignal]);
  try {
    return await followAndRead(input, config, signal, network);
  } catch (error: unknown) {
    return throwBoundaryFailure(error, callerSignal, timeoutSignal);
  }
};
