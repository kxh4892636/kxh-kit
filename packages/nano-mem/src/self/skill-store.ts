import { randomUUID } from "node:crypto";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ManagedSkill, SkillState } from "./skill-catalog";
import { hashSkillFiles, managedMarkerName, readSkillFiles } from "./skill-files";
import { inspectSkill, readManagedMarker, type ManagedMarker } from "./skill-state";

export type SkillChangeKind = "install" | "uninstall" | "update";

export interface SkillChangeRequest {
  readonly kind: SkillChangeKind;
  readonly names: readonly string[];
  readonly targetRoot: string;
  readonly force: boolean;
}

/** 变更预览结果：--dry-run 只到 preview，不落盘。 */
export interface SkillChangePreview {
  readonly name: string;
  readonly action: SkillChangeKind;
  readonly source: string;
  readonly target: string;
  readonly fromVersion: string | null;
  readonly toVersion: string | null;
}

export interface SkillChangeResult {
  readonly success: true;
  readonly changes: readonly SkillChangePreview[];
}

/** 两段式：prepare 产出 preview，commit 执行事务（任一步失败回滚）。 */
export interface SkillChangePlan {
  readonly preview: SkillChangeResult;
  readonly commit: () => Promise<SkillChangeResult>;
}

/** 交易钩子（测试/失败注入用）：备份已移走后、新目录替换前调用。 */
export interface SkillStoreDependencies {
  readonly beforeReplace?: (name: string) => Promise<void>;
}

interface PlannedChange {
  readonly action: SkillChangeKind;
  readonly skill: ManagedSkill;
  readonly state: SkillState;
  readonly managed: boolean;
  readonly installedVersion: null | string;
}

interface AppliedChange {
  readonly change: PlannedChange;
  backupMoved: boolean;
  targetInstalled: boolean;
}

/** staged 写入技能文件树 + marker（marker 最后写，保证中途失败不留下伪完整安装）。 */
const writeSkillTree = async (directory: string, skill: ManagedSkill): Promise<void> => {
  for (const file of skill.files) {
    const destination = path.join(directory, ...file.path.split("/"));
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, file.content, "utf8");
  }
  await writeFile(
    path.join(directory, managedMarkerName),
    JSON.stringify({ name: skill.name, version: skill.version, contentHash: skill.contentHash }),
    "utf8",
  );
};

/**
 * 变更前置校验（issue 06 验收：本地修改一律拒绝、--force 覆盖）：
 * - modified（含非受管目录）：install/update/uninstall 均需 --force；
 * - not_installed：仅 install 允许，update/uninstall 拒绝；
 * - current/outdated：全部动作允许（install 重复安装为幂等重装）。
 */
const validateChange = (change: PlannedChange, force: boolean): void => {
  const { action, managed, state } = change;
  if (state.status === "modified") {
    if (force) return;
    const label = managed ? "受管技能有本地修改" : "目标目录不是 nano-mem 受管技能";
    throw new Error(`${label}，需 --force 覆盖: ${state.target}`);
  }
  if (state.status === "not_installed" && action !== "install") {
    throw new Error(`技能未安装: ${state.name}`);
  }
};

const changePreview = (change: PlannedChange): SkillChangePreview => ({
  name: change.skill.name,
  action: change.action,
  source: `package://skills/${change.skill.name}`,
  target: change.state.target,
  fromVersion: change.installedVersion,
  toVersion: change.action === "uninstall" ? null : change.skill.version,
});

/**
 * 提交事务：staged 写入 → 校验哈希 → 备份现目录 → rename 替换；任一技能失败则
 * 逆序回滚（移除新装、恢复备份），事务目录整体清理。回滚后抛出运行时错误。
 */
const commitChanges = async (
  changes: readonly PlannedChange[],
  targetRoot: string,
  dependencies: SkillStoreDependencies,
): Promise<SkillChangeResult> => {
  await mkdir(targetRoot, { recursive: true });
  const transaction = path.join(targetRoot, `.nano-mem-transaction-${randomUUID()}`);
  const stagedRoot = path.join(transaction, "staged");
  const backupRoot = path.join(transaction, "backup");
  await mkdir(stagedRoot, { recursive: true });
  const appliedChanges: AppliedChange[] = [];
  try {
    for (const change of changes) {
      if (change.action !== "uninstall") {
        const staged = path.join(stagedRoot, change.skill.name);
        await writeSkillTree(staged, change.skill);
        if (hashSkillFiles(await readSkillFiles(staged)) !== change.skill.contentHash) {
          throw new Error(`staged 技能哈希校验失败: ${change.skill.name}`);
        }
      }
    }
    for (const change of changes) {
      const applied: AppliedChange = { change, backupMoved: false, targetInstalled: false };
      appliedChanges.push(applied);
      if (change.state.status !== "not_installed") {
        await mkdir(backupRoot, { recursive: true });
        await rename(change.state.target, path.join(backupRoot, change.skill.name));
        applied.backupMoved = true;
      }
      await dependencies.beforeReplace?.(change.skill.name);
      if (change.action !== "uninstall") {
        await rename(path.join(stagedRoot, change.skill.name), change.state.target);
        applied.targetInstalled = true;
      }
    }
  } catch (error) {
    for (const applied of [...appliedChanges].reverse()) {
      if (applied.targetInstalled) {
        await rm(applied.change.state.target, { force: true, recursive: true });
      }
      if (applied.backupMoved) {
        await rename(path.join(backupRoot, applied.change.skill.name), applied.change.state.target);
      }
    }
    throw new Error("受管技能事务失败，已回滚", { cause: error });
  } finally {
    await rm(transaction, { force: true, recursive: true });
  }
  return { success: true, changes: changes.map(changePreview) };
};

/** 准备变更：逐技能检查状态与前置条件，产出 preview + commit（dry-run 只用到 preview）。 */
export const prepareSkillChange = async (
  catalog: readonly ManagedSkill[],
  request: SkillChangeRequest,
  dependencies: SkillStoreDependencies = {},
): Promise<SkillChangePlan> => {
  const changes: PlannedChange[] = [];
  for (const name of request.names) {
    const skill = catalog.find((candidate: ManagedSkill): boolean => candidate.name === name);
    if (skill === undefined) throw new Error(`未知技能: ${name}`);
    const state = await inspectSkill(skill, request.targetRoot);
    const marker: ManagedMarker | null = await readManagedMarker(state.target);
    const change: PlannedChange = {
      action: request.kind,
      skill,
      state,
      managed: marker?.name === skill.name,
      installedVersion: marker?.version ?? null,
    };
    validateChange(change, request.force);
    changes.push(change);
  }
  const preview: SkillChangeResult = { success: true, changes: changes.map(changePreview) };
  return {
    preview,
    commit: (): Promise<SkillChangeResult> =>
      commitChanges(changes, request.targetRoot, dependencies),
  };
};
