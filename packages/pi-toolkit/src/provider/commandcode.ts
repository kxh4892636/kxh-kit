/**
 * Command Code's provider API shape. The gateway speaks two protocols on one
 * host: OpenAI Chat Completions (and Responses) under `/provider/v1`, Anthropic
 * Messages under `/provider/v1` as reached by the Anthropic SDK's own
 * `/v1/messages` suffix.
 *
 * Everything here is pure: it turns the gateway's catalog and pricing pages into
 * pi model definitions, and never touches the network or the filesystem.
 * @module @kxh4892636/pi-toolkit/provider/commandcode
 */

import type { ProviderModelConfig } from "@earendil-works/pi-coding-agent";

/** Chat-model definition shape; the chat member of pi's provider model union. */
export type ProviderChatModelConfig = Extract<ProviderModelConfig, { type?: "chat" }>;

/** Provider id used by `/model`, `/login`, and `models.json` overrides. */
export const PROVIDER_ID = "commandcode";

/** Display name shown in `/login` and `/model`. */
export const PROVIDER_NAME = "Command Code";

/** Catalog endpoint; returns every chat model without requiring a credential. */
export const MODELS_URL = "https://api.commandcode.ai/provider/v1/models";

/** Human-readable pricing page; per-model rates are embedded in its payload. */
export const PRICING_URL = "https://commandcode.ai/docs/resources/pricing-limits";

/** Base URL for OpenAI-protocol models: the SDK appends `/chat/completions`. */
export const OPENAI_BASE_URL = "https://api.commandcode.ai/provider/v1";

/** Base URL for Anthropic-protocol models: the SDK appends `/v1/messages`. */
export const ANTHROPIC_BASE_URL = "https://api.commandcode.ai/provider";

/** Anthropic protocol models always answer on this path and only on it. */
const ANTHROPIC_ENDPOINT = "/messages";

/** Fallbacks for catalog entries that omit a context window. */
const DEFAULT_CONTEXT_WINDOW = 128_000;

/** Ceiling for the derived output limit until the real value is probed. */
const MAX_OUTPUT_CEILING = 64_000;

/** One entry of the gateway's `/models` response, reduced to what pi needs. */
export interface CatalogEntry {
  readonly id: string;
  readonly name?: string;
  readonly contextLength?: number;
  /** Endpoint paths the model serves, e.g. `["/messages"]`. */
  readonly endpoints: readonly string[];
}

/** Per-million-token rates for one model, from the pricing page. */
export interface PriceEntry {
  readonly input: number;
  readonly output: number;
  readonly cacheRead: number;
  readonly cacheWrite: number;
}

/**
 * Capability hints the gateway's catalog does not publish. Each rule is added
 * only after it was verified against the live endpoint; unlisted models stay
 * text-only without thinking so pi never sends fields the upstream rejects.
 */
const CAPABILITY_RULES: readonly {
  readonly pattern: RegExp;
  readonly image?: boolean;
  readonly reasoning?: boolean;
}[] = [{ pattern: /vision|-vl$|omni/iu, image: true, reasoning: true }];

/** Read a string field, or undefined when the payload holds something else. */
const stringAt = (value: unknown, key: string): string | undefined => {
  if (typeof value !== "object" || value === null) return undefined;
  const field = (value as Record<string, unknown>)[key];
  return typeof field === "string" && field.length > 0 ? field : undefined;
};

/** Read a finite number field, or undefined when the payload holds something else. */
const numberAt = (value: unknown, key: string): number | undefined => {
  if (typeof value !== "object" || value === null) return undefined;
  const field = (value as Record<string, unknown>)[key];
  return typeof field === "number" && Number.isFinite(field) ? field : undefined;
};

/** Read an array of endpoint paths, keeping only string members. */
const endpointPaths = (value: unknown): readonly string[] => {
  if (typeof value !== "object" || value === null) return [];
  const field = (value as Record<string, unknown>)["supported_endpoints"];
  if (!Array.isArray(field)) return [];
  return field.filter((item): item is string => typeof item === "string");
};

/**
 * Reduce one `/models` response body to catalog entries. Entries without a
 * usable id are dropped: sending an empty model id would only fail later.
 */
export const parseCatalog = (payload: unknown): CatalogEntry[] => {
  if (typeof payload !== "object" || payload === null) return [];
  const data = (payload as Record<string, unknown>)["data"];
  if (!Array.isArray(data)) return [];
  const entries: CatalogEntry[] = [];
  for (const item of data) {
    const id = stringAt(item, "id");
    if (id === undefined) continue;
    const name = stringAt(item, "name");
    const contextLength = numberAt(item, "context_length");
    entries.push({
      id,
      ...(name !== undefined ? { name } : {}),
      ...(contextLength !== undefined ? { contextLength } : {}),
      endpoints: endpointPaths(item),
    });
  }
  return entries;
};

/**
 * Collapse a model id to its vendor-neutral comparable form: the last path
 * segment, lowercased, without punctuation. `moonshotai/Kimi-K3.1-Pro` and
 * `kimi-k3.1-pro` both become `kimik31pro`.
 */
export const normalizeKey = (id: string): string => {
  const tail = id.slice(id.lastIndexOf("/") + 1);
  return tail.toLowerCase().replace(/[^a-z0-9]/gu, "");
};

/**
 * Find every balanced JSON object that starts at a `{"id":"` literal and
 * follows it at least one field deep. The pricing page ships its rates as an
 * escaped JSON array inside an RSC payload, so quote order differs between
 * models and a fixed field-order pattern cannot be relied on.
 */
const jsonObjectsWithId = (text: string): string[] => {
  const found: string[] = [];
  let from = 0;
  for (;;) {
    const start = text.indexOf('{"id":"', from);
    if (start < 0) return found;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = start; index < text.length; index += 1) {
      const char = text[index];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === '"') {
        inString = !inString;
        continue;
      }
      if (inString) continue;
      if (char === "{") depth += 1;
      if (char === "}") {
        depth -= 1;
        if (depth === 0) {
          found.push(text.slice(start, index + 1));
          from = index + 1;
          break;
        }
      }
    }
    if (from <= start) return found;
  }
};

/** Unescape the RSC payload's JSON-in-a-string quoting. */
const unescapePayload = (html: string): string =>
  html.replace(/\\\\/gu, "\\").replace(/\\"/gu, '"');

/**
 * Read per-model rates out of the pricing page. A page that no longer carries
 * rates yields an empty list rather than throwing: prices are decoration next
 * to the catalog, and a missing rate must not hide every model.
 */
export const extractPrices = (html: string): Map<string, PriceEntry> => {
  const prices = new Map<string, PriceEntry>();
  for (const object of jsonObjectsWithId(unescapePayload(html))) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(object);
    } catch {
      continue;
    }
    const id = stringAt(parsed, "id");
    const input = numberAt(parsed, "inputCost");
    const output = numberAt(parsed, "outputCost");
    if (id === undefined || input === undefined || output === undefined) continue;
    const cacheRead = numberAt(parsed, "cacheReadCost") ?? 0;
    const cacheWrite = numberAt(parsed, "cacheWriteCost") ?? input;
    prices.set(normalizeKey(id), { input, output, cacheRead, cacheWrite });
  }
  return prices;
};

/**
 * Match a catalog id to a price. The two feeds name models differently —
 * `claude-haiku-4-5-20251001` against `claude-haiku-4-5`, `qwen-3.6-max` against
 * `Qwen/Qwen3.6-Max-Preview` — so an exact normalised hit wins, and otherwise
 * the longest key that contains the other wins.
 */
export const matchPrice = (
  id: string,
  prices: ReadonlyMap<string, PriceEntry>,
): PriceEntry | undefined => {
  const key = normalizeKey(id);
  const exact = prices.get(key);
  if (exact !== undefined) return exact;
  let bestKey = "";
  for (const candidate of prices.keys()) {
    const shorter = Math.min(candidate.length, key.length);
    if (shorter === 0) continue;
    const contains = candidate.startsWith(key) || key.startsWith(candidate);
    if (!contains) continue;
    if (candidate.length > bestKey.length) bestKey = candidate;
  }
  return bestKey.length > 0 ? prices.get(bestKey) : undefined;
};

/** Pick the protocol for one catalog entry from the endpoints it serves. */
export const apiFor = (entry: CatalogEntry): "anthropic-messages" | "openai-completions" =>
  entry.endpoints.includes(ANTHROPIC_ENDPOINT) ? "anthropic-messages" : "openai-completions";

/** Base URL that pairs with `apiFor`. */
const baseUrlFor = (api: "anthropic-messages" | "openai-completions"): string =>
  api === "anthropic-messages" ? ANTHROPIC_BASE_URL : OPENAI_BASE_URL;

/** Output limit derived from the context window until the real one is probed. */
const maxTokensFor = (contextWindow: number): number =>
  Math.max(4_096, Math.min(Math.floor(contextWindow / 8), MAX_OUTPUT_CEILING));

/** Apply the verified capability rules to one model id. */
const capabilitiesFor = (id: string): { image: boolean; reasoning: boolean } => {
  let image = false;
  let reasoning = false;
  for (const rule of CAPABILITY_RULES) {
    if (!rule.pattern.test(id)) continue;
    image = image || rule.image === true;
    reasoning = reasoning || rule.reasoning === true;
  }
  return { image, reasoning };
};

/**
 * Turn catalog entries plus prices into pi model definitions. Models without a
 * price keep zero rates so they stay selectable; the footer then understates
 * their cost instead of hiding them.
 */
export const toProviderModels = (
  entries: readonly CatalogEntry[],
  prices: ReadonlyMap<string, PriceEntry>,
): ProviderChatModelConfig[] =>
  entries.map((entry) => {
    const api = apiFor(entry);
    const price = matchPrice(entry.id, prices);
    const contextWindow = entry.contextLength ?? DEFAULT_CONTEXT_WINDOW;
    const capabilities = capabilitiesFor(entry.id);
    return {
      type: "chat",
      id: entry.id,
      name: entry.name ?? entry.id,
      api,
      baseUrl: baseUrlFor(api),
      reasoning: capabilities.reasoning,
      input: capabilities.image ? ["text", "image"] : ["text"],
      cost: {
        input: price?.input ?? 0,
        output: price?.output ?? 0,
        cacheRead: price?.cacheRead ?? 0,
        cacheWrite: price?.cacheWrite ?? 0,
      },
      contextWindow,
      maxTokens: maxTokensFor(contextWindow),
    };
  });
