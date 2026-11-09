import type { ExtensionAPI, ProviderConfig } from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vite-plus/test";
import {
  ANTHROPIC_BASE_URL,
  MODELS_URL,
  OPENAI_BASE_URL,
  PROVIDER_ID,
  PRICING_URL,
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

/** A stored model as the previous run persisted it. */
const storedModel = {
  type: "chat",
  id: "claude-sonnet-5",
  name: "Claude Sonnet 5",
  api: "anthropic-messages",
  provider: PROVIDER_ID,
  baseUrl: ANTHROPIC_BASE_URL,
  input: ["text"],
  cost: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
  reasoning: false,
  contextWindow: 1_000_000,
  maxTokens: 64_000,
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
    expect(models.map((model) => model.id)).toEqual([
      "claude-sonnet-5",
      "deepseek/deepseek-v4-flash",
    ]);
    expect(harness.published).toHaveLength(1);
    const persisted = harness.published[0]?.persist as { models: unknown[] } | undefined;
    expect(persisted?.models).toHaveLength(2);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("returns the persisted catalog without network access", async () => {
    const harness = refreshHarness({ allowNetwork: false, stored: [storedModel] });
    const fetchImpl = vi.fn<typeof fetch>();
    const models = await refresh({ fetchImpl }, harness);
    expect(models).toHaveLength(1);
    expect(models[0]?.api).toBe("anthropic-messages");
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(harness.published).toHaveLength(0);
  });

  it("keeps the persisted catalog when the catalog request fails", async () => {
    const harness = refreshHarness({ stored: [storedModel] });
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse({ error: "boom" }, 502));
    const models = await refresh({ fetchImpl }, harness);
    expect(models.map((model) => model.id)).toEqual(["claude-sonnet-5"]);
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
