import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vite-plus/test";

import { DEFAULT_NANO_FLOW_SETTINGS } from "../contract.js";
import { activePlans, isPlanLifecycle, listPlans, planRefOf } from "./plan.js";
import { createAssetSkillProvider } from "./skills.js";
import {
  asArguments,
  createToolRuntime,
  optionalBoolean,
  optionalString,
  requiredString,
  textBlocks,
} from "./tools/shared.js";
import type { HostServices } from "./services.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

const makeRoot = async (): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), "nano-flow-unit-"));
  roots.push(root);
  return root;
};

const write = async (root: string, file: string, content: string): Promise<void> => {
  const target = join(root, file);
  await mkdir(join(target, ".."), { recursive: true });
  await writeFile(target, content, "utf8");
};

describe("plan", () => {
  it("lists plans with spec.md and filters active ones", async () => {
    const root = await makeRoot();
    const domain = ".agents/domains/demo/plans";
    await write(root, `${domain}/active/2026-11-08-一/spec.md`, "x");
    await write(root, `${domain}/reference/2026-11-08-二/spec.md`, "x");
    await write(root, `${domain}/active/2026-11-08-无 spec/notes_index.md`, "x");
    await write(root, `${domain}/nope/2026-11-08-坏/spec.md`, "x");
    const plans = await listPlans(root, ".agents/domains");
    expect(plans.map(planRefOf)).toEqual([
      "demo/active/2026-11-08-一",
      "demo/reference/2026-11-08-二",
    ]);
    expect(activePlans(plans).map((plan) => plan.name)).toEqual(["2026-11-08-一"]);
    expect(isPlanLifecycle("active")).toBe(true);
    expect(isPlanLifecycle("planning")).toBe(false);
  });
});

describe("skills provider", () => {
  const skill = (name: string, body = "body"): string =>
    ["---", `name: ${name}`, "description: test skill", "---", "", body].join("\n");

  it("discovers valid skills and serves their body", async () => {
    const root = await makeRoot();
    await write(root, "valid/SKILL.md", skill("valid", "# Valid"));
    await write(root, "broken/SKILL.md", "no frontmatter");
    await mkdir(join(root, "empty"), { recursive: true });
    await write(
      root,
      "meta/SKILL.md",
      [
        "---",
        "name: meta",
        "description: meta skill",
        "whenToUse: when testing",
        "metadata:",
        "  owner: test",
        "---",
        "",
        "meta body",
      ].join("\n"),
    );
    const provider = createAssetSkillProvider(root);
    const signal = new AbortController().signal;
    const listed = await provider.list({ signal });
    const candidates = Array.isArray(listed) ? listed : [];
    expect(candidates.map((candidate) => candidate.name)).toEqual(["meta", "valid"]);
    const definition = await provider.get(candidates[0]!, { signal });
    expect(definition?.content).toContain("meta body");
    expect(definition?.whenToUse).toBe("when testing");
    expect(definition?.metadata).toEqual({ owner: "test" });
  });

  it("stops when aborted and tolerates a missing file", async () => {
    const root = await makeRoot();
    await write(root, "valid/SKILL.md", skill("valid"));
    const provider = createAssetSkillProvider(root);
    const aborted = new AbortController();
    aborted.abort();
    await expect(provider.list({ signal: aborted.signal })).resolves.toEqual([]);
    const listed = await provider.list({ signal: new AbortController().signal });
    const candidate = (Array.isArray(listed) ? listed : [])[0]!;
    await rm(join(root, "valid", "SKILL.md"));
    await expect(
      provider.get(candidate, { signal: new AbortController().signal }),
    ).resolves.toBeUndefined();
  });

  it("returns nothing for a missing root", async () => {
    const provider = createAssetSkillProvider(join(await makeRoot(), "missing"));
    await expect(provider.list({ signal: new AbortController().signal })).resolves.toEqual([]);
  });
});

describe("tool helpers", () => {
  it("validates arguments", () => {
    expect(textBlocks(1)[0]?.text).toBe("1");
    expect(asArguments({})).toEqual({});
    expect(() => asArguments(null)).toThrow(/对象/u);
    expect(optionalString({ a: "x" }, "a")).toBe("x");
    expect(optionalString({}, "a")).toBeUndefined();
    expect(() => optionalString({ a: 1 }, "a")).toThrow();
    expect(requiredString({ a: "x" }, "a")).toBe("x");
    expect(() => requiredString({ a: " " }, "a")).toThrow();
    expect(optionalBoolean({ a: true }, "a")).toBe(true);
    expect(optionalBoolean({}, "a")).toBeUndefined();
    expect(() => optionalBoolean({ a: 1 }, "a")).toThrow();
  });

  it("resolves the domain directory for relative and absolute roots", async () => {
    const root = await makeRoot();
    const services = {
      get: () => undefined,
    } as unknown as HostServices;
    const relative = createToolRuntime({
      services,
      config: { workspace: root },
      settings: () => DEFAULT_NANO_FLOW_SETTINGS,
      assetsRoot: root,
      domainRoot: ".agents/domains",
    });
    expect(relative.domainsDirectory(root)).toBe(join(root, ".agents", "domains"));
    const absolute = createToolRuntime({
      services,
      config: { workspace: root },
      settings: () => DEFAULT_NANO_FLOW_SETTINGS,
      assetsRoot: root,
      domainRoot: join(root, "domains"),
    });
    expect(absolute.domainsDirectory(root)).toBe(join(root, "domains"));
    await expect(relative.workspace({ signal: new AbortController().signal })).resolves.toBe(root);
  });

  it("falls back to the working directory service, then the process directory", async () => {
    const root = await makeRoot();
    const withWorkingDirectory = {
      get: (name: string) =>
        name === "workingDirectory"
          ? {
              ensure: async () => join(root, "from-service"),
            }
          : undefined,
      logger: { warn: () => {} },
    } as unknown as HostServices;
    const runtime = createToolRuntime({
      services: withWorkingDirectory,
      config: {},
      settings: () => DEFAULT_NANO_FLOW_SETTINGS,
      assetsRoot: root,
      domainRoot: ".agents/domains",
    });
    await expect(
      runtime.workspace({ signal: new AbortController().signal, agent: {} }),
    ).resolves.toBe(join(root, "from-service"));
    const throwing = {
      get: (name: string) =>
        name === "workingDirectory"
          ? {
              ensure: async () => {
                throw new Error("boom");
              },
            }
          : undefined,
      logger: { warn: () => {} },
    } as unknown as HostServices;
    const fallback = createToolRuntime({
      services: throwing,
      config: {},
      settings: () => DEFAULT_NANO_FLOW_SETTINGS,
      assetsRoot: root,
      domainRoot: ".agents/domains",
    });
    await expect(
      fallback.workspace({ signal: new AbortController().signal, agent: {} }),
    ).resolves.toBe(process.cwd());
  });
});
