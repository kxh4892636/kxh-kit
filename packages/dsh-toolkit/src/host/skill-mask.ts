import type { Context } from "@deepseek-ai/cordis";
import type {
  SkillCatalogSnapshot,
  SkillDefinition,
  SkillSummary,
  SkillViewOptions,
} from "@deepseek-ai/dsh-skill";
import { hasMethod, serviceOf } from "./services.js";

/** 内置 office 技能的 provider 名（`dsh-skill-office/lib/index.js` 的 `provider` 字段）。 */
export const DSH_OFFICE_PROVIDER = "dsh-office";

/** 屏蔽判据：只看目录里读得到的摘要字段，不加载正文。 */
export type SkillBlocklist = (skill: SkillSummary) => boolean;

/**
 * dsh 自带的 office 技能：provider 固定为 `dsh-office`；provider 被改名时，
 * `bundled` 来源的 `office` / `office-*` 同样算内置（用户自装 skill 不带 bundled 来源）。
 */
export const isDshOfficeSkill: SkillBlocklist = (skill: SkillSummary): boolean => {
  if (skill.provider === DSH_OFFICE_PROVIDER) return true;
  return (
    skill.source === "bundled" && (skill.name === "office" || skill.name.startsWith("office-"))
  );
};

/** `ctx.skills` 的读取面：只声明用到的三个入口，`collect` 等实现细节不碰。 */
interface SkillCatalogService {
  list(options?: SkillViewOptions): Promise<SkillSummary[]>;
  snapshot(options?: SkillViewOptions): Promise<SkillCatalogSnapshot>;
  get(name: string, options?: SkillViewOptions): Promise<SkillDefinition | undefined>;
}

/** 被替换的方法名；还原时逐个判断归属。 */
type MaskKey = "list" | "snapshot" | "get";

/**
 * 在技能注册表的读取入口上装一层过滤：命中的技能既不出现在目录里，也加载不到。
 *
 * 不注销 provider、不改技能文件：只包装 `ctx.skills` 的公开读取面（`list` / `snapshot` /
 * `get`），因此 `skill` 工具、`/skill` 命令与技能页面一次性生效，开关切换也无需让
 * provider 重注册。返回的 disposer 只在被替换的方法仍是本次安装的包装器时还原，
 * 避免覆盖别处之后装的补丁。
 * @param ctx - 插件上下文；需能取到 `skills` 服务。
 * @param blocked - 判定函数；为真表示屏蔽。
 * @returns 还原三个读取入口的 disposer。
 */
export const installSkillMask = (ctx: Context, blocked: SkillBlocklist): (() => void) => {
  const service = serviceOf<SkillCatalogService>(ctx, "skills");
  if (
    !hasMethod<SkillCatalogService>(service, "list") ||
    !hasMethod<SkillCatalogService>(service, "snapshot") ||
    !hasMethod<SkillCatalogService>(service, "get")
  ) {
    ctx.logger.warn("toolkit: skills service has no list/snapshot/get; skills cannot be masked");
    return () => {};
  }
  const target = service as unknown as Record<MaskKey, unknown>;
  const previous: Record<MaskKey, unknown> = {
    list: Reflect.get(target, "list"),
    snapshot: Reflect.get(target, "snapshot"),
    get: Reflect.get(target, "get"),
  };
  const call = {
    list: service.list.bind(service),
    snapshot: service.snapshot.bind(service),
    get: service.get.bind(service),
  };
  const owned: Record<MaskKey, boolean> = {
    list: Object.hasOwn(target, "list"),
    snapshot: Object.hasOwn(target, "snapshot"),
    get: Object.hasOwn(target, "get"),
  };
  const masked = {
    list: async (options?: SkillViewOptions): Promise<SkillSummary[]> => {
      const skills = await call.list(options);
      return skills.filter((skill) => !blocked(skill));
    },
    snapshot: async (options?: SkillViewOptions): Promise<SkillCatalogSnapshot> => {
      const snapshot = await call.snapshot(options);
      return { ...snapshot, skills: snapshot.skills.filter((skill) => !blocked(skill)) };
    },
    get: async (name: string, options?: SkillViewOptions): Promise<SkillDefinition | undefined> => {
      const skill = await call.get(name, options);
      return skill !== undefined && blocked(skill) ? undefined : skill;
    },
  };
  for (const key of Object.keys(masked) as MaskKey[]) target[key] = masked[key];
  return () => {
    for (const key of Object.keys(masked) as MaskKey[]) {
      if (target[key] !== masked[key]) continue;
      if (owned[key]) target[key] = previous[key];
      else Reflect.deleteProperty(target, key);
    }
  };
};
