/**
 * Network side of the Command Code provider: fetch the catalog, then decorate it
 * with the pricing page's rates. The catalog is authoritative and must succeed;
 * pricing is best effort, because a redesigned marketing page should cost the
 * footer's cost estimate, never the whole model list.
 * @module @kxh4892636/pi-toolkit/provider/fetch-catalog
 */

import {
  MODELS_URL,
  PRICING_URL,
  extractPrices,
  parseCatalog,
  toProviderModels,
  type CatalogEntry,
  type PriceEntry,
  type ProviderChatModelConfig,
} from "./commandcode.ts";

/** Attribution header; keep in sync with the package version. */
const USER_AGENT = "pi-toolkit/1.0.0";

/** Hard ceiling for one catalog round trip. */
const REQUEST_TIMEOUT_MS = 20_000;

/** Transport seams kept injectable so tests never touch the network. */
export interface CatalogTransport {
  readonly fetchImpl?: typeof fetch;
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
}

/** Compose the caller's cancellation with the request's own deadline. */
const requestSignal = (transport: CatalogTransport): AbortSignal => {
  const timeout = AbortSignal.timeout(transport.timeoutMs ?? REQUEST_TIMEOUT_MS);
  return transport.signal === undefined ? timeout : AbortSignal.any([transport.signal, timeout]);
};

/** GET one URL as text, naming the endpoint in any failure. */
const getText = async (url: string, transport: CatalogTransport): Promise<string> => {
  const doFetch = transport.fetchImpl ?? fetch;
  const response = await doFetch(url, {
    method: "GET",
    redirect: "error",
    headers: { accept: "application/json, text/html", "user-agent": USER_AGENT },
    signal: requestSignal(transport),
  });
  if (!response.ok) {
    throw new Error(`Command Code catalog error (HTTP ${response.status}). Endpoint: ${url}`);
  }
  return response.text();
};

/** Fetch and validate the raw catalog entries. */
export const fetchCatalog = async (transport: CatalogTransport = {}): Promise<CatalogEntry[]> => {
  const body = await getText(MODELS_URL, transport);
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    throw new Error(`Command Code catalog returned unreadable JSON. Endpoint: ${MODELS_URL}`);
  }
  const entries = parseCatalog(payload);
  if (entries.length === 0) {
    throw new Error(`Command Code catalog returned no models. Endpoint: ${MODELS_URL}`);
  }
  return entries;
};

/** Fetch per-model rates, degrading to an empty map on any failure. */
export const fetchPrices = async (
  transport: CatalogTransport = {},
): Promise<ReadonlyMap<string, PriceEntry>> => {
  try {
    return extractPrices(await getText(PRICING_URL, transport));
  } catch {
    return new Map<string, PriceEntry>();
  }
};

/**
 * Build the provider's model list: catalog for identity and context, pricing for
 * rates. Both requests share the caller's signal and deadline.
 */
export const loadCommandCodeModels = async (
  transport: CatalogTransport = {},
): Promise<ProviderChatModelConfig[]> => {
  const [entries, prices] = await Promise.all([fetchCatalog(transport), fetchPrices(transport)]);
  return toProviderModels(entries, prices);
};
