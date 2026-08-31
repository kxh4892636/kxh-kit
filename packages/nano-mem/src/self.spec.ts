import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { runCli, type CliEnv, type CliResult } from "./cli";
import {
  hashSkillFiles,
  inspectSkill,
  loadSkillCatalog,
  managedMarkerName,
  prepareSkillChange,
  readManagedMarker,
  readSkillFiles,
  type ManagedSkill,
  type ManagedSkillFile,
  type SkillState,
} from "./self";

const CATALOG_ROOT = fileURLToPath(new URL("../skills/", import.meta.url));
const SKILL_ROOT = fileURLToPath(new URL("../skills/nano-mem/", import.meta.url));

const tempDirs: string[] = [];
const makeTemp = (): string => {
  const dir = mkdtempSync(path.join(tmpdir(), "nano-mem-self-"));
  tempDirs.push(dir);
  return dir;
};

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** 合成技能：files 仅 SKILL.md，contentHash 由 hashSkillFiles 计算。 */
const makeSkill = (name: string, version = "1.0.0", content = `# ${name}`): ManagedSkill => {
  const files: readonly ManagedSkillFile[] = [{ path: "SKILL.md", content }];
  return { name, version, contentHash: hashSkillFiles(files), files };
};

const install = async (
  catalog: readonly ManagedSkill[],
  targetRoot: string,
  force = false,
): Promise<void> => {
  await (
    await prepareSkillChange(catalog, {
      kind: "install",
      names: catalog.map((skill) => skill.name),
      targetRoot,
      force,
    })
  ).commit();
};

const makeEnv = (overrides: Partial<CliEnv> = {}): CliEnv => ({
  cwd: "C:/work/my-agent",
  env: {},
  homeDir: "C:/fake-home",
  now: () => new Date("2026-01-01T00:00:00.000Z"),
  readStdin: async () => "",
  version: "9.9.9-test",
  ...overrides,
});

/** CLI 冒烟入口：argv 为 self skill 之后的参数。 */
const invoke = (argv: readonly string[], overrides: Partial<CliEnv> = {}): Promise<CliResult> =>
  runCli(["self", "skill", ...argv], makeEnv(overrides));

const parseJson = <T>(text: string): T => JSON.parse(text) as T;

interface SkillJson {
  readonly skills: ReadonlyArray<{
    readonly name: string;
    readonly status: string;
    readonly version: string;
  }>;
}
interface CheckJson {
  readonly skill: {
    readonly name: string;
    readonly status: string;
    readonly version: string;
    readonly target: string;
  };
}
interface ChangeJson {
  readonly dryRun: boolean;
  readonly changes: ReadonlyArray<{
    readonly name: string;
    readonly action: string;
    readonly target: string;
    readonly fromVersion: string | null;
    readonly toVersion: string | null;
  }>;
}
interface ErrorJson {
  readonly error: { readonly code: string; readonly message: string; readonly hint?: string };
}

describe("技能文件树哈希（skill-files）", () => {
  it("同文件不同顺序哈希一致；换行/空文件边界不碰撞", () => {
    const first: readonly ManagedSkillFile[] = [
      { path: "a", content: "x\n" },
      { path: "b", content: "y" },
    ];
    const reversed = [...first].reverse();
    expect(hashSkillFiles(first)).toBe(hashSkillFiles(reversed));
    // 无 \0 分隔时会把 path/content 拼接混淆，这里验证边界：
    // {"a":"x\n","b":"y"} 与 {"a":"x","b":"\ny"} 不同
    expect(hashSkillFiles(first)).not.toBe(
      hashSkillFiles([
        { path: "a", content: "x" },
        { path: "b", content: "\ny" },
      ]),
    );
    // 换行风格与空文件均参与哈希
    expect(hashSkillFiles([{ path: "a", content: "\r\n" }])).not.toBe(
      hashSkillFiles([{ path: "a", content: "\n" }]),
    );
    expect(hashSkillFiles([])).not.toBe(hashSkillFiles([{ path: "e", content: "" }]));
  });

  it("从磁盘读取按名称排序，与写入顺序无关", async () => {
    const dir = makeTemp();
    const content = (name: string): string => `# ${name}`;
    for (const name of ["zeta.txt", "alpha.txt", "mid.txt"]) {
      writeFileSync(path.join(dir, name), content(name), "utf8");
    }
    const first = hashSkillFiles(await readSkillFiles(dir));
    for (const name of ["alpha.txt", "mid.txt", "zeta.txt"]) {
      rmSync(path.join(dir, name));
    }
    for (const name of ["mid.txt", "zeta.txt", "alpha.txt"]) {
      writeFileSync(path.join(dir, name), content(name), "utf8");
    }
    expect(hashSkillFiles(await readSkillFiles(dir))).toBe(first);
    expect((await readSkillFiles(dir)).map((file) => file.path)).toEqual([
      "alpha.txt",
      "mid.txt",
      "zeta.txt",
    ]);
  });

  it("readSkillFiles 递归子目录并跳过 marker", async () => {
    const dir = makeTemp();
    mkdirSync(path.join(dir, "sub"));
    writeFileSync(path.join(dir, "README.md"), "r", "utf8");
    writeFileSync(path.join(dir, "sub", "x.md"), "x", "utf8");
    writeFileSync(path.join(dir, managedMarkerName), "{}", "utf8");
    const files = await readSkillFiles(dir);
    expect(files.map((file) => file.path).sort()).toEqual(["README.md", "sub/x.md"]);
    expect(files.find((file) => file.path === "sub/x.md")?.content).toBe("x");
  });
});

describe("安装状态四态判定（skill-state）", () => {
  it("not_installed：目标目录不存在", async () => {
    const target = makeTemp();
    const alpha = makeSkill("alpha");
    expect((await inspectSkill(alpha, target)).status).toBe("not_installed");
  });

  it("current：安装后未做任何修改", async () => {
    const target = makeTemp();
    const alpha = makeSkill("alpha", "1.0.0", "# alpha v1");
    await install([alpha], target);
    const state: SkillState = await inspectSkill(alpha, target);
    expect(state.status).toBe("current");
    expect(state.version).toBe("1.0.0");
    expect(state.target).toBe(path.join(target, "alpha"));
  });

  it("outdated：marker 版本与包版本不同但内容未被修改", async () => {
    const target = makeTemp();
    const alpha = makeSkill("alpha", "1.0.0", "# alpha v1");
    await install([alpha], target);
    const markerPath = path.join(target, "alpha", managedMarkerName);
    const marker = JSON.parse(readFileSync(markerPath, "utf8")) as { version: string };
    marker.version = "0.0.9"; // 模拟旧版 CLI 安装的 marker
    writeFileSync(markerPath, JSON.stringify(marker), "utf8");
    expect((await inspectSkill(alpha, target)).status).toBe("outdated");
  });

  it("modified：文件内容被本地修改 / marker 缺失 / marker 属其他技能", async () => {
    const target = makeTemp();
    const alpha = makeSkill("alpha", "1.0.0", "# alpha v1");
    await install([alpha], target);
    writeFileSync(path.join(target, "alpha", "SKILL.md"), "# 本地修改", "utf8");
    expect((await inspectSkill(alpha, target)).status).toBe("modified");

    // marker 缺失（如非受管目录）→ modified
    const dir = makeTemp();
    mkdirSync(path.join(dir, "beta"));
    writeFileSync(path.join(dir, "beta", "SKILL.md"), "# 外来内容", "utf8");
    const beta = makeSkill("beta");
    expect((await inspectSkill(beta, dir)).status).toBe("modified");

    // marker 属于其他技能名 → modified
    const gammaDir = makeTemp();
    const gamma = makeSkill("gamma");
    await install([gamma], gammaDir);
    const markerPath = path.join(gammaDir, "gamma", managedMarkerName);
    const marker = JSON.parse(readFileSync(markerPath, "utf8")) as { name: string };
    marker.name = "other";
    writeFileSync(markerPath, JSON.stringify(marker), "utf8");
    expect((await inspectSkill(gamma, gammaDir)).status).toBe("modified");
  });
});

describe("安装/更新/卸载事务（skill-store）", () => {
  it("install 落盘文件树 + marker，check=current", async () => {
    const target = makeTemp();
    const alpha = makeSkill("alpha", "1.0.0", "# alpha v1");
    await install([alpha], target);
    expect(await readFile(path.join(target, "alpha", "SKILL.md"), "utf8")).toBe("# alpha v1");
    const marker = await readManagedMarker(path.join(target, "alpha"));
    expect(marker).toEqual({ name: "alpha", version: "1.0.0", contentHash: alpha.contentHash });
    expect((await inspectSkill(alpha, target)).status).toBe("current");
    // loopx marker 不产生（隔离）
    expect(existsSync(path.join(target, "alpha", ".loopx-managed.json"))).toBe(false);
  });

  it("update 升级版本与内容，uninstall 删除目录与 marker", async () => {
    const target = makeTemp();
    const v1 = makeSkill("alpha", "1.0.0", "# alpha v1");
    const v2 = makeSkill("alpha", "2.0.0", "# alpha v2");
    await install([v1], target);
    expect((await inspectSkill(v2, target)).status).toBe("outdated");
    await (
      await prepareSkillChange([v2], {
        kind: "update",
        names: ["alpha"],
        targetRoot: target,
        force: false,
      })
    ).commit();
    expect(await readFile(path.join(target, "alpha", "SKILL.md"), "utf8")).toBe("# alpha v2");
    expect((await inspectSkill(v2, target)).status).toBe("current");

    await (
      await prepareSkillChange([v2], {
        kind: "uninstall",
        names: ["alpha"],
        targetRoot: target,
        force: false,
      })
    ).commit();
    expect(existsSync(path.join(target, "alpha"))).toBe(false);
    expect((await inspectSkill(v2, target)).status).toBe("not_installed");
  });

  it("事务回滚：注入失败后原目录还原、事务目录清理", async () => {
    const target = makeTemp();
    const v1: readonly ManagedSkill[] = [
      makeSkill("alpha", "1.0.0", "# alpha v1"),
      makeSkill("beta", "1.0.0", "# beta v1"),
    ];
    await install(v1, target);
    const v2: readonly ManagedSkill[] = [
      makeSkill("alpha", "2.0.0", "# alpha v2"),
      makeSkill("beta", "2.0.0", "# beta v2"),
    ];
    const plan = await prepareSkillChange(
      v2,
      { kind: "update", names: ["alpha", "beta"], targetRoot: target, force: false },
      {
        beforeReplace: async (name: string): Promise<void> => {
          if (name === "beta") throw new Error("注入失败");
        },
      },
    );
    await expect(plan.commit()).rejects.toThrow("已回滚");
    // 两个目录都还原为 v1（alpha 是新装后被移除再恢复备份）
    expect(await readFile(path.join(target, "alpha", "SKILL.md"), "utf8")).toBe("# alpha v1");
    expect(await readFile(path.join(target, "beta", "SKILL.md"), "utf8")).toBe("# beta v1");
    expect((await readdir(target)).sort()).toEqual(["alpha", "beta"]);
  });

  it("首装失败不留下半成品（staged/事务目录清理）", async () => {
    const target = makeTemp();
    const skills: readonly ManagedSkill[] = [makeSkill("alpha"), makeSkill("beta")];
    const plan = await prepareSkillChange(
      skills,
      { kind: "install", names: ["alpha", "beta"], targetRoot: target, force: false },
      {
        beforeReplace: async (name: string): Promise<void> => {
          if (name === "beta") throw new Error("注入失败");
        },
      },
    );
    await expect(plan.commit()).rejects.toThrow("已回滚");
    expect((await readdir(target)).sort()).toEqual([]);
  });

  it("未安装时 update/uninstall 拒绝；install 幂等重装", async () => {
    const target = makeTemp();
    const alpha = makeSkill("alpha");
    await expect(
      prepareSkillChange([alpha], {
        kind: "update",
        names: ["alpha"],
        targetRoot: target,
        force: false,
      }),
    ).rejects.toThrow("未安装");
    await expect(
      prepareSkillChange([alpha], {
        kind: "uninstall",
        names: ["alpha"],
        targetRoot: target,
        force: false,
      }),
    ).rejects.toThrow("未安装");
    await install([alpha], target);
    await (
      await prepareSkillChange([alpha], {
        kind: "install",
        names: ["alpha"],
        targetRoot: target,
        force: false,
      })
    ).commit();
    expect((await inspectSkill(alpha, target)).status).toBe("current");
  });
});

describe("self 命令组（CLI）", () => {
  it("list 显示包内技能未安装；install --dry-run 输出 preview 且不落盘", async () => {
    const target = makeTemp();
    const list = await invoke(["list", "--target", target, "--json"]);
    expect(list.exitCode).toBe(0);
    expect(parseJson<SkillJson>(list.stdout).skills).toEqual([
      expect.objectContaining({ name: "nano-mem", status: "not_installed" }),
    ]);
    const preview = await invoke([
      "install",
      "--name",
      "nano-mem",
      "--target",
      target,
      "--dry-run",
      "--json",
    ]);
    expect(preview.exitCode).toBe(0);
    expect(parseJson<ChangeJson>(preview.stdout)).toMatchObject({
      dryRun: true,
      changes: [{ name: "nano-mem", action: "install", toVersion: "9.9.9-test" }],
    });
    expect(existsSync(path.join(target, "nano-mem"))).toBe(false);
  });

  it("install 后 marker 存在且 check=current；update 跨版本升级后仍 current", async () => {
    const target = makeTemp();
    const install = await invoke(["install", "--name", "nano-mem", "--target", target, "--json"], {
      version: "1.0.0",
    });
    expect(install.exitCode).toBe(0);
    const marker = JSON.parse(
      readFileSync(path.join(target, "nano-mem", managedMarkerName), "utf8"),
    ) as { name: string; version: string; contentHash: string };
    expect(marker).toMatchObject({ name: "nano-mem", version: "1.0.0" });
    const packaged = await loadSkillCatalog({ version: "1.0.0", root: CATALOG_ROOT });
    expect(marker.contentHash).toBe((packaged[0] as ManagedSkill).contentHash);
    expect(
      parseJson<CheckJson>(
        (
          await invoke(["check", "--name", "nano-mem", "--target", target, "--json"], {
            version: "1.0.0",
          })
        ).stdout,
      ).skill.status,
    ).toBe("current");

    // 包版本升级（新 CLI）→ outdated，update 无 force 升级
    expect(
      parseJson<CheckJson>(
        (
          await invoke(["check", "--name", "nano-mem", "--target", target, "--json"], {
            version: "2.0.0",
          })
        ).stdout,
      ).skill.status,
    ).toBe("outdated");
    const update = await invoke(["update", "--name", "nano-mem", "--target", target, "--json"], {
      version: "2.0.0",
    });
    expect(update.exitCode).toBe(0);
    expect(
      parseJson<CheckJson>(
        (
          await invoke(["check", "--name", "nano-mem", "--target", target, "--json"], {
            version: "2.0.0",
          })
        ).stdout,
      ).skill.status,
    ).toBe("current");
  });

  it("默认 target 为 <cwd>/.agents/skills", async () => {
    const cwd = makeTemp();
    const result = await runCli(
      ["self", "skill", "install", "--name", "nano-mem", "--json"],
      makeEnv({ cwd }),
    );
    expect(result.exitCode).toBe(0);
    expect(existsSync(path.join(cwd, ".agents", "skills", "nano-mem", "SKILL.md"))).toBe(true);
  });

  it("本地修改后 install/update/uninstall 拒绝（退出 1），--force 可覆盖", async () => {
    const target = makeTemp();
    await invoke(["install", "--name", "nano-mem", "--target", target], { version: "1.0.0" });
    writeFileSync(path.join(target, "nano-mem", "SKILL.md"), "# 本地修改", "utf8");
    const packaged = readFileSync(path.join(SKILL_ROOT, "SKILL.md"), "utf8");

    const update = await invoke(["update", "--name", "nano-mem", "--target", target], {
      version: "2.0.0",
    });
    expect(update.exitCode).toBe(1);
    expect(update.stderr).toContain("本地修改");
    expect(
      (await invoke(["install", "--name", "nano-mem", "--target", target], { version: "2.0.0" }))
        .exitCode,
    ).toBe(1);
    expect((await invoke(["uninstall", "--name", "nano-mem", "--target", target])).exitCode).toBe(
      1,
    );

    const forcedUpdate = await invoke(
      ["update", "--name", "nano-mem", "--target", target, "--force"],
      {
        version: "2.0.0",
      },
    );
    expect(forcedUpdate.exitCode).toBe(0);
    expect(readFileSync(path.join(target, "nano-mem", "SKILL.md"), "utf8")).toBe(packaged);

    // 再改一次，install --force 与 uninstall --force
    writeFileSync(path.join(target, "nano-mem", "SKILL.md"), "# 再次修改", "utf8");
    expect(
      (await invoke(["install", "--name", "nano-mem", "--target", target, "--force"])).exitCode,
    ).toBe(0);
    expect(readFileSync(path.join(target, "nano-mem", "SKILL.md"), "utf8")).toBe(packaged);
    writeFileSync(path.join(target, "nano-mem", "SKILL.md"), "# 第三次修改", "utf8");
    expect(
      (await invoke(["uninstall", "--name", "nano-mem", "--target", target, "--force"])).exitCode,
    ).toBe(0);
    expect(existsSync(path.join(target, "nano-mem"))).toBe(false);
  });

  it("dry-run 下 update/uninstall 不改变文件系统", async () => {
    const target = makeTemp();
    await invoke(["install", "--name", "nano-mem", "--target", target]);
    const before = hashSkillFiles(await readSkillFiles(target));
    const update = await invoke(
      ["update", "--name", "nano-mem", "--target", target, "--dry-run", "--json"],
      {
        version: "2.0.0",
      },
    );
    expect(update.exitCode).toBe(0);
    expect(parseJson<ChangeJson>(update.stdout)).toMatchObject({
      dryRun: true,
      changes: [{ action: "update" }],
    });
    expect(hashSkillFiles(await readSkillFiles(target))).toBe(before);
    const uninstall = await invoke([
      "uninstall",
      "--name",
      "nano-mem",
      "--target",
      target,
      "--dry-run",
      "--json",
    ]);
    expect(uninstall.exitCode).toBe(0);
    expect(parseJson<ChangeJson>(uninstall.stdout)).toMatchObject({
      dryRun: true,
      changes: [{ action: "uninstall" }],
    });
    expect(hashSkillFiles(await readSkillFiles(target))).toBe(before);
    expect(existsSync(path.join(target, "nano-mem"))).toBe(true);
  });

  it("文本输出：list/check/install 人类可读", async () => {
    const target = makeTemp();
    const list = await invoke(["list", "--target", target]);
    expect(list.stdout).toContain("nano-mem [not_installed]");
    const install = await invoke(["install", "--name", "nano-mem", "--target", target]);
    expect(install.stdout).toContain("install nano-mem");
    expect(install.stdout).toContain("v9.9.9-test");
    const check = await invoke(["check", "--name", "nano-mem", "--target", target]);
    expect(check.stdout).toContain("nano-mem [current]");
    expect(check.stdout).toContain("说明:");
  });

  it("用法错误：缺子命令 / 未知子命令 / 多位置参数 / 选项冲突 / 未知技能", async () => {
    expect((await runCli(["self"], makeEnv())).exitCode).toBe(2);
    expect((await runCli(["self", "skill"], makeEnv())).exitCode).toBe(2);
    expect((await runCli(["self", "skill", "frobnicate"], makeEnv())).exitCode).toBe(2);
    expect((await runCli(["self", "skill", "list", "extra"], makeEnv())).exitCode).toBe(2);
    expect((await invoke(["install"])).exitCode).toBe(2);
    expect((await invoke(["install", "--name", "x", "--all"])).exitCode).toBe(2);
    expect((await invoke(["check"])).exitCode).toBe(2);
    expect((await invoke(["install", "--name", "missing"])).exitCode).toBe(2);
    // 记忆命令专属选项对 self 不适用
    const db = await invoke(["list", "--db", "x"]);
    expect(db.exitCode).toBe(2);
    expect(db.stderr).toContain("--db");
  });

  it("--json 错误契约：未知技能 → usage/2，stderr 含 hint", async () => {
    const result = await invoke(["install", "--name", "missing", "--json"]);
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    const error = parseJson<ErrorJson>(result.stderr).error;
    expect(error.code).toBe("usage");
    expect(error.message).toContain("未知技能");
    expect(error.hint).toContain("可用技能");
  });

  it("技能目录缺失 → 运行时错误（loadSkillCatalog）", async () => {
    await expect(
      loadSkillCatalog({ version: "1.0.0", root: path.join(makeTemp(), "nothing") }),
    ).rejects.toThrow("技能目录不存在");
  });
});
