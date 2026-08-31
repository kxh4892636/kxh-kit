/**
 * self skill 管理（issue 06）：`nm self skill list|check|install|update|uninstall`。
 *
 * 把包内受管技能 `skills/nano-mem/` 安装/更新/卸载到目标工作区 `.agents/skills`
 * （ADR-0003：skill 与 CLI 同版发布，marker `.nano-mem-managed.json` 隔离 loopx）。
 * 写命令走 prepare → preview → commit 两段式：`--dry-run` 只到 preview，不落盘；
 * commit 为 staged + 备份 + 回滚事务。
 *
 * 本文件是 self 命令组的 CLI 层：参数/选项/选择器校验、目录加载、结果渲染；
 * 领域逻辑（文件树哈希、四态判定、事务）在 `self/` 子模块，可独立于 CLI 复用。
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadSkillCatalog,
  type ManagedSkill,
  type ManagedSkillFile,
  type SkillState,
  type SkillStatus,
} from "./self/skill-catalog";
import { hashSkillFiles, managedMarkerName, readSkillFiles } from "./self/skill-files";
import { inspectSkill, readManagedMarker, type ManagedMarker } from "./self/skill-state";
import {
  prepareSkillChange,
  type SkillChangeKind,
  type SkillChangePlan,
  type SkillChangePreview,
  type SkillChangeRequest,
  type SkillChangeResult,
  type SkillStoreDependencies,
} from "./self/skill-store";

export {
  hashSkillFiles,
  inspectSkill,
  loadSkillCatalog,
  managedMarkerName,
  prepareSkillChange,
  readManagedMarker,
  readSkillFiles,
};
export type {
  ManagedMarker,
  ManagedSkill,
  ManagedSkillFile,
  SkillChangeKind,
  SkillChangePlan,
  SkillChangePreview,
  SkillChangeRequest,
  SkillChangeResult,
  SkillState,
  SkillStatus,
  SkillStoreDependencies,
};

/** self 命令组的用法错误（→ 退出码 2；错误契约与 CliError 一致）。 */
export class SelfUsageError extends Error {
  readonly code = "usage" as const;
  readonly hint: string | undefined;

  constructor(message: string, hint?: string) {
    super(message);
    this.name = "SelfUsageError";
    this.hint = hint;
  }
}

export type SelfSubcommand = "list" | "check" | "install" | "update" | "uninstall";

const SUBCOMMANDS: readonly SelfSubcommand[] = ["list", "check", "install", "update", "uninstall"];

/** 各子命令允许的选项（全局 --json/--dry-run 可用；--help/--version 由 CLI 层先行处理）。 */
const SELF_OPTIONS: Readonly<Record<SelfSubcommand, readonly string[]>> = {
  list: ["json", "dry-run", "target"],
  check: ["json", "dry-run", "target", "name"],
  install: ["json", "dry-run", "target", "name", "all", "force"],
  update: ["json", "dry-run", "target", "name", "force"],
  uninstall: ["json", "dry-run", "target", "name", "all", "force"],
};

type RawValues = Readonly<Record<string, string | boolean | readonly string[] | undefined>>;

export type SelfPayload =
  | { readonly kind: "selfList"; readonly skills: readonly SkillState[] }
  | { readonly kind: "selfCheck"; readonly skill: SkillState }
  | {
      readonly kind: "selfChange";
      readonly dryRun: boolean;
      readonly changes: readonly SkillChangePreview[];
    };

export interface SelfCommandInput {
  readonly args: readonly string[];
  readonly values: RawValues;
  /** 当前工作目录（默认 target `<cwd>/.agents/skills` 来源）。 */
  readonly cwd: string;
  /** 包版本 = skill 版本（ADR-0003 同版发布）。 */
  readonly version: string;
}

const strValue = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;

/**
 * 包内技能根目录 `skills/`。本文件与打包产物 dist/main.mjs 都位于包根下一层，
 * `../skills/` 在两种形态下都解析到包根 `skills/`（与 cli.ts 读 package.json 同一技巧）。
 */
const packagedSkillRoot = (): string => fileURLToPath(new URL("../skills/", import.meta.url));

const usageError = (message: string, hint?: string): SelfUsageError =>
  new SelfUsageError(message, hint);

/** 默认 target：`<cwd>/.agents/skills`；`--target` 相对路径按 cwd 解析。 */
const resolveTargetRoot = (values: RawValues, cwd: string): string =>
  path.resolve(strValue(values["target"]) ?? path.join(cwd, ".agents", "skills"));

const assertOptionsAllowed = (sub: SelfSubcommand, values: RawValues): void => {
  const allowed = SELF_OPTIONS[sub];
  for (const name of Object.keys(values)) {
    if (!allowed.includes(name)) {
      throw usageError(
        `选项 --${name} 不适用于命令 self skill ${sub}`,
        `可用选项: ${allowed.map((item) => `--${item}`).join(" ")}`,
      );
    }
  }
};

const assertKnownNames = (names: readonly string[], catalog: readonly ManagedSkill[]): void => {
  for (const name of names) {
    if (!catalog.some((skill) => skill.name === name)) {
      throw usageError(
        `未知技能 "${name}"`,
        `可用技能: ${catalog.map((skill) => skill.name).join(", ")}`,
      );
    }
  }
};

/** 按子命令从选项解析目标技能名：list 无；check/update 仅 --name；install/uninstall 二选一。 */
const selectNames = (
  sub: SelfSubcommand,
  values: RawValues,
  catalog: readonly ManagedSkill[],
): readonly string[] => {
  if (sub === "list") return [];
  const name = strValue(values["name"]);
  const hasName = name !== undefined;
  const hasAll = values["all"] === true;
  if (sub === "check" || sub === "update") {
    if (!hasName) {
      throw usageError(`${sub} 需要 --name`, `nm self skill ${sub} --name <技能名>`);
    }
    return [name ?? ""];
  }
  if (hasName === hasAll) {
    throw usageError(
      `${sub} 需要且仅需 --name 或 --all 之一`,
      `nm self skill ${sub} --name <技能名> | --all`,
    );
  }
  const names = hasAll ? catalog.map((skill) => skill.name) : [name ?? ""];
  assertKnownNames(names, catalog);
  return names;
};

const STATUS_LABELS: Readonly<Record<SkillStatus, string>> = {
  not_installed: "未安装（nm self skill install 安装）",
  current: "已安装且与包内一致",
  outdated: "已安装旧版本（nm self skill update 升级）",
  modified: "本地修改（--force 覆盖）",
};

const changeLine = (change: SkillChangePreview): string => {
  const version =
    change.action === "uninstall"
      ? ""
      : change.fromVersion === null
        ? ` (v${change.toVersion})`
        : ` (v${change.fromVersion} → v${change.toVersion})`;
  return `${change.action} ${change.name}${version} → ${change.target}`;
};

export const renderSelfText = (payload: SelfPayload): string => {
  switch (payload.kind) {
    case "selfList": {
      return payload.skills.length === 0
        ? "（无技能）\n"
        : payload.skills
            .map((skill) => `${skill.name} [${skill.status}] v${skill.version} → ${skill.target}\n`)
            .join("");
    }
    case "selfCheck": {
      const skill = payload.skill;
      return `${skill.name} [${skill.status}] v${skill.version}\n目标: ${skill.target}\n说明: ${STATUS_LABELS[skill.status]}\n`;
    }
    case "selfChange": {
      const prefix = payload.dryRun ? "[dry-run] " : "";
      return payload.changes.map((change) => `${prefix}${changeLine(change)}\n`).join("");
    }
  }
};

export const renderSelfJson = (payload: SelfPayload): string => {
  switch (payload.kind) {
    case "selfList": {
      return `${JSON.stringify({ skills: payload.skills })}\n`;
    }
    case "selfCheck": {
      return `${JSON.stringify({ skill: payload.skill })}\n`;
    }
    case "selfChange": {
      return `${JSON.stringify({ dryRun: payload.dryRun, changes: payload.changes })}\n`;
    }
  }
};

/** 执行 `nm self ...`（子命令树 + 校验 + 分派）；不接触数据库，dry-run 到 preview 为止。 */
export const runSelfCommand = async (input: SelfCommandInput): Promise<SelfPayload> => {
  const group = input.args[0];
  if (group === undefined) {
    throw usageError("self 需要子命令", "nm self skill <list|check|install|update|uninstall>");
  }
  if (group !== "skill") {
    throw usageError(`self 子命令 "${group}" 未知`, "只有子命令 skill（管理受管技能）");
  }
  const sub = input.args[1];
  if (sub === undefined) {
    throw usageError("self skill 需要子命令", `nm self skill <${SUBCOMMANDS.join("|")}>`);
  }
  if (!(SUBCOMMANDS as readonly string[]).includes(sub)) {
    throw usageError(`self skill 子命令 "${sub}" 未知`, `nm self skill <${SUBCOMMANDS.join("|")}>`);
  }
  if (input.args.length > 2) {
    throw usageError("self skill 不接受位置参数", `nm self skill ${sub} [选项]`);
  }
  const command: SelfSubcommand = sub as SelfSubcommand;
  assertOptionsAllowed(command, input.values);

  const targetRoot = resolveTargetRoot(input.values, input.cwd);
  const catalog = await loadSkillCatalog({ version: input.version, root: packagedSkillRoot() });

  if (command === "list") {
    const skills = await Promise.all(
      catalog.map((skill: ManagedSkill): Promise<SkillState> => inspectSkill(skill, targetRoot)),
    );
    return { kind: "selfList", skills };
  }
  if (command === "check") {
    const names = selectNames(command, input.values, catalog);
    const skill = catalog.find((candidate: ManagedSkill): boolean => candidate.name === names[0]);
    if (skill === undefined) {
      throw usageError(`未知技能 "${names[0]}"`, "运行 nm self skill list 查看包内技能");
    }
    return { kind: "selfCheck", skill: await inspectSkill(skill, targetRoot) };
  }

  const names = selectNames(command, input.values, catalog);
  const request: SkillChangeRequest = {
    kind: command,
    names,
    targetRoot,
    force: input.values["force"] === true,
  };
  const plan: SkillChangePlan = await prepareSkillChange(catalog, request);
  if (input.values["dry-run"] === true) {
    return { kind: "selfChange", dryRun: true, changes: plan.preview.changes };
  }
  const result: SkillChangeResult = await plan.commit();
  return { kind: "selfChange", dryRun: false, changes: result.changes };
};
