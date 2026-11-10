/**
 * Register Command Code as a pi provider. The provider declares no `apiKey` on
 * purpose: pi then offers its default API-key login, so the credential lives in
 * `~/.pi/agent/auth.json` behind `/login` instead of an environment variable or
 * a plaintext config value.
 *
 * Only DeepSeek models are offered. The list comes from the live catalog on every
 * refresh, with the last good catalog persisted through `context.publish` so an
 * offline start still knows which models exist; a snapshot written before the
 * narrow still lists other vendors and is filtered on restore.
 * @module @kxh4892636/pi-toolkit/provider/register
 */

import type { ExtensionAPI, ProviderConfig } from "@earendil-works/pi-coding-agent";
import {
  OPENAI_BASE_URL,
  PROVIDER_ID,
  PROVIDER_NAME,
  deepSeekCapability,
  isDeepSeekModel,
} from "./commandcode.ts";
import type { ProviderChatModelConfig } from "./commandcode.ts";
import { loadCommandCodeModels, type CatalogTransport } from "./fetch-catalog.ts";

/** The refresh context pi hands to `ProviderConfig.refreshModels`. */
type RefreshContext = Parameters<NonNullable<ProviderConfig["refreshModels"]>>[0];

/**
 * One persisted catalog entry. It is a full pi model rather than a provider
 * definition: `context.stored` holds raw models, so the snapshot has to name the
 * provider and carry every field the model needs to stream.
 */
interface StoredModel {
  type: "chat";
  id: string;
  name: string;
  api: "openai-completions";
  provider: string;
  baseUrl: string;
  input: ("text" | "image")[];
  cost: ProviderChatModelConfig["cost"];
  reasoning: boolean;
  contextWindow: number;
  maxTokens: number;
}

/** Persisted snapshot shape, derived from the publication type pi accepts. */
type PersistedCatalog = NonNullable<Parameters<RefreshContext["publish"]>[0]["persist"]>;

/** Dependencies kept injectable so tests never reach the network. */
export interface CommandCodeDeps {
  readonly fetchImpl?: typeof fetch;
  readonly timeoutMs?: number;
}

/** True for the only protocol this provider speaks; rejects a stored unknown api. */
const isOpenAIChatApi = (value: unknown): value is "openai-completions" =>
  value === "openai-completions";

/** Map a provider model definition onto the raw model shape pi persists. */
const toStored = (model: ProviderChatModelConfig): StoredModel => ({
  type: "chat",
  id: model.id,
  name: model.name,
  api: "openai-completions",
  provider: PROVIDER_ID,
  baseUrl: model.baseUrl ?? OPENAI_BASE_URL,
  input: [...model.input],
  cost: model.cost,
  reasoning: model.reasoning,
  contextWindow: model.contextWindow,
  maxTokens: model.maxTokens,
});

/** Rebuild a provider model definition from a persisted raw model. */
const fromStored = (model: unknown): ProviderChatModelConfig | undefined => {
  if (typeof model !== "object" || model === null) return undefined;
  const candidate = model as Partial<ProviderChatModelConfig>;
  if (typeof candidate.id !== "string" || typeof candidate.name !== "string") return undefined;
  if (!isOpenAIChatApi(candidate.api)) return undefined;
  if (candidate.cost === undefined) return undefined;
  if (typeof candidate.contextWindow !== "number" || typeof candidate.maxTokens !== "number") {
    return undefined;
  }
  return {
    type: "chat",
    id: candidate.id,
    name: candidate.name,
    api: "openai-completions",
    baseUrl: candidate.baseUrl ?? OPENAI_BASE_URL,
    // Capability is derived, never read back: an old snapshot gains thinking as
    // soon as the code does, without waiting for a network refresh.
    ...deepSeekCapability(),
    cost: candidate.cost,
    contextWindow: candidate.contextWindow,
    maxTokens: candidate.maxTokens,
  };
};

/**
 * Restore the persisted catalog, dropping anything that no longer parses and any
 * model from another vendor (a snapshot written before the provider was narrowed
 * to DeepSeek still lists them).
 */
const restoreStored = (context: RefreshContext): ProviderChatModelConfig[] => {
  const stored = context.stored?.models ?? [];
  const models: ProviderChatModelConfig[] = [];
  for (const entry of stored) {
    const model = fromStored(entry);
    if (model === undefined || !isDeepSeekModel(model.id)) continue;
    models.push(model);
  }
  return models;
};

/** Persist one catalog, ignoring a refresh that pi has already superseded. */
const persistCatalog = async (
  context: RefreshContext,
  models: readonly ProviderChatModelConfig[],
): Promise<void> => {
  const persist: PersistedCatalog = {
    models: models.map(toStored),
    checkedAt: Date.now(),
  };
  await context.publish({ persist });
};

/**
 * Register the provider. Registration is unconditional: it exposes no tool, and
 * an unauthenticated provider simply stays unavailable in `/model` until the
 * user runs `/login`.
 */
export const registerCommandCodeProvider = (pi: ExtensionAPI, deps: CommandCodeDeps = {}): void => {
  pi.registerProvider(PROVIDER_ID, {
    name: PROVIDER_NAME,
    api: "openai-completions",
    baseUrl: OPENAI_BASE_URL,
    models: [],
    refreshModels: async (context: RefreshContext) => {
      const stored = restoreStored(context);
      if (!context.allowNetwork || context.signal.aborted) return stored;
      const transport: CatalogTransport = {
        signal: context.signal,
        ...(deps.fetchImpl !== undefined ? { fetchImpl: deps.fetchImpl } : {}),
        ...(deps.timeoutMs !== undefined ? { timeoutMs: deps.timeoutMs } : {}),
      };
      // A failed catalog keeps the last good list; with nothing to fall back to
      // the error is rethrown so pi reports it instead of showing an empty provider.
      let models: ProviderChatModelConfig[];
      try {
        models = await loadCommandCodeModels(transport);
      } catch (error) {
        if (stored.length > 0) return stored;
        throw error;
      }
      // The loader never returns an empty list, so only a cancelled refresh lands here.
      if (context.signal.aborted) return stored;
      await persistCatalog(context, models);
      return models;
    },
  });
};
