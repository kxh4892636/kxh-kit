import { describe, expect, it, vi } from "vite-plus/test";
import type { SkillCatalogSnapshot, SkillDefinition, SkillSummary } from "@deepseek-ai/dsh-skill";
import { DSH_OFFICE_PROVIDER, installSkillMask, isDshOfficeSkill } from "./skill-mask.js";

const summary = (name: string, overrides: Partial<SkillSummary> = {}): SkillSummary => ({
  name,
  description: `${name} description`,
  invocation: { modelInvocable: true, userInvocable: true },
  source: "bundled",
  provider: DSH_OFFICE_PROVIDER,
  ...overrides,
});

const body = (skill: SkillSummary): SkillDefinition => ({
  ...skill,
  content: `${skill.name} body`,
});

/** 与真实注册表同形：读取入口在原型上，实例本身不带同名自有属性。 */
class FakeSkills {
  readonly catalog: readonly SkillSummary[];

  constructor(catalog: readonly SkillSummary[]) {
    this.catalog = catalog;
  }

  async list(): Promise<SkillSummary[]> {
    return [...this.catalog];
  }

  async snapshot(): Promise<SkillCatalogSnapshot> {
    return { skills: [...this.catalog], complete: true };
  }

  async get(name: string): Promise<SkillDefinition | undefined> {
    const match = this.catalog.find((skill) => skill.name === name);
    return match === undefined ? undefined : body(match);
  }
}

const contextOf = (skills: unknown) => ({
  get: (key: string): unknown => (key === "skills" ? skills : undefined),
  logger: { warn: vi.fn() },
});

const names = (skills: readonly SkillSummary[]): string[] => skills.map((skill) => skill.name);

const catalogOf = (): SkillSummary[] => [
  summary("office"),
  summary("office-docx"),
  summary("code-spec", { source: "project-agents", provider: "nested-agents" }),
];

describe("isDshOfficeSkill", () => {
  it("blocks the bundled office provider and its office-* names", () => {
    expect(isDshOfficeSkill(summary("office"))).toBe(true);
    expect(isDshOfficeSkill(summary("office-xlsx"))).toBe(true);
    expect(isDshOfficeSkill(summary("office", { source: "user-dsh" }))).toBe(true);
    expect(isDshOfficeSkill(summary("office-docx", { provider: "filesystem" }))).toBe(true);
  });

  it("leaves user-sourced skills alone, office-like names included", () => {
    const userSource = {
      source: "user-dsh",
      provider: "filesystem",
    } as const;
    expect(isDshOfficeSkill(summary("office-docx", userSource))).toBe(false);
    expect(isDshOfficeSkill(summary("officecopy", userSource))).toBe(false);
    expect(isDshOfficeSkill(summary("code-spec", userSource))).toBe(false);
    expect(
      isDshOfficeSkill(summary("office-copy", { source: "project-dsh", provider: "filesystem" })),
    ).toBe(false);
  });
});

describe("installSkillMask", () => {
  it("hides blocked skills from list, snapshot and get until disposed", async () => {
    const skills = new FakeSkills(catalogOf());
    const dispose = installSkillMask(contextOf(skills) as never, isDshOfficeSkill);

    expect(names(await skills.list())).toEqual(["code-spec"]);
    expect(names((await skills.snapshot()).skills)).toEqual(["code-spec"]);
    expect((await skills.snapshot()).complete).toBe(true);
    expect(await skills.get("office-docx")).toBeUndefined();
    expect((await skills.get("code-spec"))?.content).toBe("code-spec body");
    expect(await skills.get("missing")).toBeUndefined();

    dispose();
    expect(names(await skills.list())).toEqual(["office", "office-docx", "code-spec"]);
    expect(Object.hasOwn(skills, "snapshot")).toBe(false);
    expect(Object.hasOwn(skills, "get")).toBe(false);
  });

  it("honours a custom blocklist", async () => {
    const skills = new FakeSkills(catalogOf());
    const dispose = installSkillMask(
      contextOf(skills) as never,
      (skill) => skill.name === "code-spec",
    );
    expect(names(await skills.list())).toEqual(["office", "office-docx"]);
    expect(await skills.get("code-spec")).toBeUndefined();
    dispose();
  });

  it("keeps a later override of the same method", async () => {
    const skills = new FakeSkills(catalogOf());
    const dispose = installSkillMask(contextOf(skills) as never, isDshOfficeSkill);
    const later = async (): Promise<SkillCatalogSnapshot> => ({ skills: [], complete: true });
    skills.snapshot = later;
    dispose();
    expect(await skills.snapshot()).toEqual({ skills: [], complete: true });
  });

  it("restores an own property that existed before installation", async () => {
    const skills = new FakeSkills(catalogOf());
    const own = async (): Promise<SkillSummary[]> => [summary("office")];
    skills.list = own;
    const dispose = installSkillMask(contextOf(skills) as never, isDshOfficeSkill);
    expect(await skills.list()).toEqual([]);
    dispose();
    expect(names(await skills.list())).toEqual(["office"]);
  });

  it("warns and does nothing when the host exposes no readable catalog", () => {
    const ctx = contextOf({ registerProvider: () => () => {} });
    const dispose = installSkillMask(ctx as never, isDshOfficeSkill);
    expect(ctx.logger.warn).toHaveBeenCalledWith(expect.stringContaining("cannot be masked"));
    expect(dispose).toBeTypeOf("function");
    expect(() => dispose()).not.toThrow();
  });
});
