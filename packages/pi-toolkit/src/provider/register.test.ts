import type { ExtensionAPI, ProviderConfig } from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vite-plus/test";
import {
  MODELS_URL,
  OPENAI_BASE_URL,
  PROVIDER_ID,
  PRICING_URL,
  type ProviderChatModelConfig,
} from "./commandcode.ts";
import { registerCommandCodeProvider } from "./register.ts";

/** Capture the provider config the module registers. */
interface Registration {
  readonly id: string;
  readonly config: ProviderConfig;
}

const fakeExtension = (): { pi: ExtensionAPI; registration: Registration } => {
  let registration: Registration | undefined;
  const pi = {
    registerProvider: (id: string, config: ProviderConfig) => {
      registration = { id, config };
    },
  } as unknown as ExtensionAPI;
  registerCommandCodeProvider(pi);
  if (registration === undefined) throw new Error("provider was not registered");
  return { pi, registration };
};

/** Minimal refresh context: what pi hands a `refreshModels` implementation. */
interface RefreshHarness {
  readonly published: Array<{ persist?: unknown }>;
  readonly context: {
    allowNetwork: boolean;
    signal: AbortSignal;
    stored?: { models: readonly unknown[] };
    publish: (publication: { persist?: unknown }) => Promise<boolean>;
  };
}

const refreshHarness = (
  overrides: { allowNetwork?: boolean; signal?: AbortSignal; stored?: readonly unknown[] } = {},
): RefreshHarness => {
  const published: Array<{ persist?: unknown }> = [];
  const context: RefreshHarness["context"] = {
    allowNetwork: overrides.allowNetwork ?? true,
    signal: overrides.signal ?? new AbortController().signal,
    ...(overrides.stored !== undefined ? { stored: { models: overrides.stored } } : {}),
    publish: async (publication) => {
      published.push(publication);
      return true;
    },
  };
  return { published, context };
};

const catalogBody = {
  data: [
    {
      id: "claude-sonnet-5",
      name: "Claude Sonnet 5",
      context_length: 1_000_000,
      supported_endpoints: ["/messages"],
    },
    {
      id: "deepseek/deepseek-v4-flash",
      name: "DeepSeek V4 Flash",
      context_length: 1_000_000,
      supported_endpoints: ["/chat/completions"],
    },
  ],
};

/** Read the request URL without relying on `String(Request)` semantics. */
const urlOf = (input: Parameters<typeof fetch>[0]): string => {
  if (typeof input === "string") return input;
  return input instanceof URL ? input.href : input.url;
};

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const pricingResponse = (): Response =>
  new Response(
    'self.__next_f.push([1,"[{\\"id\\":\\"deepseek-v4-flash\\",\\"inputCost\\":0.15,\\"outputCost\\":0.6,\\"cacheReadCost\\":0.003}]"])',
    {
      status: 200,
      headers: { "content-type": "text/html" },
    },
  );

/** A stored model as an older run persisted it: no capability, text only. */
const storedModel = {
  type: "chat",
  id: "deepseek/deepseek-v4-flash",
  name: "DeepSeek V4 Flash",
  api: "openai-completions",
  provider: PROVIDER_ID,
  baseUrl: OPENAI_BASE_URL,
  input: ["text"],
  cost: { input: 0.15, output: 0.6, cacheRead: 0.003, cacheWrite: 0.15 },
  reasoning: false,
  contextWindow: 1_000_000,
  maxTokens: 64_000,
};

/** A stored model from another vendor, as a snapshot written before the narrowing. */
const storedOtherVendor = {
  ...storedModel,
  id: "claude-sonnet-5",
  name: "Claude Sonnet 5",
};

describe("registerCommandCodeProvider", () => {
  it("registers the gateway without an api key so /login stores the credential", () => {
    const { registration } = fakeExtension();
    expect(registration.id).toBe(PROVIDER_ID);
    expect(registration.config.apiKey).toBeUndefined();
    expect(registration.config.baseUrl).toBe(OPENAI_BASE_URL);
    expect(typeof registration.config.refreshModels).toBe("function");
  });
});

describe("refreshModels", () => {
  const refresh = async (
    deps: Parameters<typeof registerCommandCodeProvider>[1],
    harness: RefreshHarness,
  ) => {
    let registration: Registration | undefined;
    const pi = {
      registerProvider: (id: string, config: ProviderConfig) => {
        registration = { id, config };
      },
    } as unknown as ExtensionAPI;
    registerCommandCodeProvider(pi, deps);
    const registered = registration;
    if (registered?.config.refreshModels === undefined) throw new Error("no refreshModels");
    const models = await registered.config.refreshModels(
      harness.context as Parameters<typeof registered.config.refreshModels>[0],
    );
    return models;
  };

  it("loads the live catalog and persists it", async () => {
    const harness = refreshHarness();
    const fetchImpl = vi.fn<typeof fetch>(async (input) =>
      urlOf(input) === MODELS_URL ? jsonResponse(catalogBody) : pricingResponse(),
    );
    const models = await refresh({ fetchImpl }, harness);
    // 目录里还有 claude，provider 只上架 deepseek。
    expect(models.map((model) => model.id)).toEqual(["deepseek/deepseek-v4-flash"]);
    expect(harness.published).toHaveLength(1);
    const persisted = harness.published[0]?.persist as { models: unknown[] } | undefined;
    expect(persisted?.models).toHaveLength(1);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("returns the persisted catalog without network access", async () => {
    const harness = refreshHarness({ allowNetwork: false, stored: [storedModel] });
    const fetchImpl = vi.fn<typeof fetch>();
    const models = await refresh({ fetchImpl }, harness);
    expect(models).toHaveLength(1);
    expect(models[0]?.api).toBe("openai-completions");
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(harness.published).toHaveLength(0);
  });

  it("keeps the persisted catalog when the catalog request fails", async () => {
    const harness = refreshHarness({ stored: [storedModel] });
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse({ error: "boom" }, 502));
    const models = await refresh({ fetchImpl }, harness);
    expect(models.map((model) => model.id)).toEqual(["deepseek/deepseek-v4-flash"]);
    expect(harness.published).toHaveLength(0);
  });

  it("falls back to the persisted catalog when the live one has no DeepSeek model", async () => {
    const harness = refreshHarness({ stored: [storedModel] });
    const fetchImpl = vi.fn<typeof fetch>(async (input) =>
      urlOf(input) === MODELS_URL
        ? jsonResponse({
            data: [{ id: "claude-sonnet-5", supported_endpoints: ["/chat/completions"] }],
          })
        : pricingResponse(),
    );
    const models = await refresh({ fetchImpl }, harness);
    expect(models.map((model) => model.id)).toEqual(["deepseek/deepseek-v4-flash"]);
    // 抓取成功但过滤后为空：没东西可持久化，旧快照原样留着。
    expect(harness.published).toHaveLength(0);
  });

  it("surfaces the failure when there is no persisted catalog to fall back to", async () => {
    const harness = refreshHarness();
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse({ error: "boom" }, 502));
    await expect(refresh({ fetchImpl }, harness)).rejects.toThrow(/HTTP 502/u);
    expect(harness.published).toHaveLength(0);
  });

  it("drops persisted entries that no longer parse", async () => {
    const harness = refreshHarness({ allowNetwork: false, stored: [{ id: "x" }, storedModel] });
    const models = await refresh({}, harness);
    expect(models).toHaveLength(1);
  });

  it("drops stored entries with an unknown protocol or no cost", async () => {
    const harness = refreshHarness({
      allowNetwork: false,
      stored: [
        { ...storedModel, api: "openai-responses" },
        { ...storedModel, id: "deepseek/deepseek-v4-pro", cost: undefined },
        storedModel,
      ],
    });
    const models = await refresh({}, harness);
    expect(models.map((model) => model.id)).toEqual(["deepseek/deepseek-v4-flash"]);
  });

  it("drops persisted models from another vendor", async () => {
    const harness = refreshHarness({
      allowNetwork: false,
      stored: [storedOtherVendor, storedModel],
    });
    const models = await refresh({}, harness);
    expect(models.map((model) => model.id)).toEqual(["deepseek/deepseek-v4-flash"]);
  });

  it("re-derives the thinking capability for a snapshot that predates it", async () => {
    const harness = refreshHarness({ allowNetwork: false, stored: [storedModel] });
    const models = (await refresh({}, harness)) as ProviderChatModelConfig[];
    expect(models[0]?.reasoning).toBe(true);
    expect(models[0]?.input).toEqual(["text", "image"]);
    expect(models[0]?.compat).toEqual({
      supportsReasoningEffort: true,
      requiresReasoningContentOnAssistantMessages: true,
    });
  });

  it("returns the persisted catalog when the refresh was cancelled", async () => {
    const controller = new AbortController();
    controller.abort();
    const harness = refreshHarness({ stored: [storedModel], signal: controller.signal });
    const fetchImpl = vi.fn<typeof fetch>();
    const models = await refresh({ fetchImpl }, harness);
    expect(models).toHaveLength(1);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("requests the pricing page alongside the catalog", async () => {
    const harness = refreshHarness();
    const urls: string[] = [];
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      urls.push(urlOf(input));
      return urlOf(input) === MODELS_URL ? jsonResponse(catalogBody) : pricingResponse();
    });
    await refresh({ fetchImpl }, harness);
    expect(urls.sort()).toEqual([MODELS_URL, PRICING_URL].sort());
  });
});
