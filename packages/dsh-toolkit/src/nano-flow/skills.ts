import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import type {
  SkillCandidate,
  SkillDefinition,
  SkillLookupOptions,
  SkillProvider,
} from "@deepseek-ai/dsh-skill";

import { parseSkillText } from "../nested-skill/parse.js";

/** 包内 skill 的优先级：略高于项目 `.agents/skills`（201），保证预设内的流程 skill 生效。 */
export const ASSET_SKILL_RANK = 200;

/** provider 名称；与 filesystem provider 区分。 */
const ASSET_SKILL_PROVIDER = "nano-flow-assets";

interface AssetLocator {
  readonly file: string;
  readonly directory: string;
}

/**
 * 动态发现 `<root>/<name>/SKILL.md` 并注册成宿主的 skill provider。
 *
 * 不写死 skill 名单：目录里多一个 skill 目录就多一个 skill，删掉即消失。
 * @param root - `nano-flow/skills` 目录。
 * @returns 宿主 skill provider。
 */
export const createAssetSkillProvider = (root: string): SkillProvider => ({
  name: ASSET_SKILL_PROVIDER,
  async list(options: SkillLookupOptions): Promise<readonly SkillCandidate[]> {
    if (options.signal?.aborted === true) return [];
    let entries;
    try {
      entries = await readdir(root, { withFileTypes: true });
    } catch {
      return [];
    }
    const candidates: SkillCandidate[] = [];
    for (const entry of entries
      .filter((item) => item.isDirectory())
      .sort((left, right) => left.name.localeCompare(right.name))) {
      const directory = join(root, entry.name);
      const file = join(directory, "SKILL.md");
      let raw: string;
      try {
        raw = await readFile(file, "utf8");
      } catch {
        continue;
      }
      const parsed = parseSkillText(raw);
      if (parsed === undefined) continue;
      candidates.push({
        path: file,
        name: parsed.name,
        description: parsed.description,
        ...(parsed.whenToUse === undefined ? {} : { whenToUse: parsed.whenToUse }),
        invocation: parsed.invocation,
        source: "bundled",
        provider: ASSET_SKILL_PROVIDER,
        resourceBase: { kind: "directory", path: directory },
        rank: ASSET_SKILL_RANK,
        locator: { file, directory } satisfies AssetLocator,
        ...(parsed.metadata === undefined ? {} : { metadata: parsed.metadata }),
      });
    }
    return candidates;
  },
  async get(
    candidate: SkillCandidate,
    options: SkillLookupOptions,
  ): Promise<SkillDefinition | undefined> {
    if (options.signal?.aborted === true) return undefined;
    const locator = candidate.locator as AssetLocator;
    let raw: string;
    try {
      raw = await readFile(locator.file, "utf8");
    } catch {
      return undefined;
    }
    const parsed = parseSkillText(raw);
    if (parsed === undefined) return undefined;
    const { rank: _rank, locator: _locator, ...summary } = candidate;
    return { ...summary, content: parsed.content };
  },
});
