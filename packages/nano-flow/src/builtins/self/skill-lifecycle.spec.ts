import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { runCli, type CliRequest } from "../../cli/run";
import type { BuiltinCommand } from "../../cli/types";
import { createSelfCommand } from "./self-command";
import type { ManagedSkill } from "./skill-catalog";
import { hashSkillFiles, readSkillFiles } from "./skill-files";
import type { SkillStoreDependencies } from "./skill-store";

interface InvocationResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

const directories: string[] = [];

const skill = (name: string, version = "1.0.0", content = `# ${name}`): ManagedSkill => {
  const files = [{ path: "SKILL.md", content }];
  return { name, version, contentHash: hashSkillFiles(files), files };
};

const invoke = async (
  catalog: readonly ManagedSkill[],
  target: string,
  argv: readonly string[],
  dependencies: SkillStoreDependencies = {},
): Promise<InvocationResult> => {
  let stdout = "";
  let stderr = "";
  const request: CliRequest = {
    argv: ["self", "skill", ...argv, "--target", target, "--compact"],
    cwd: target,
    env: {},
    signal: new AbortController().signal,
    stdin: { readLine: async (): Promise<null> => null },
    stdout: {
      write: (chunk: string): void => {
        stdout += chunk;
      },
    },
    stderr: {
      write: (chunk: string): void => {
        stderr += chunk;
      },
    },
  };
  const code = await runCli(request, [
    (): BuiltinCommand => createSelfCommand(catalog, dependencies),
  ]);
  return { code, stdout, stderr };
};

const createTarget = async (): Promise<string> => {
  const target = await mkdtemp(path.join(tmpdir(), "nf-skill-lifecycle-"));
  directories.push(target);
  return target;
};

const exists = async (target: string): Promise<boolean> => {
  try {
    await access(target);
    return true;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return false;
    throw error;
  }
};

afterEach(async (): Promise<void> => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory: string): Promise<void> => rm(directory, { force: true, recursive: true })),
  );
});

describe("managed skill lifecycle", (): void => {
  test("requires exactly one selector and rejects unknown skills", async (): Promise<void> => {
    const target = await createTarget();
    const catalog = [skill("alpha")];
    expect((await invoke(catalog, target, ["install"])).code).toBe(2);
    expect((await invoke(catalog, target, ["install", "--name", "alpha", "--all"])).code).toBe(2);
    expect((await invoke(catalog, target, ["install", "--name", "missing"])).code).toBe(2);
  });

  test("installs one or all skills and reports current state", async (): Promise<void> => {
    const target = await createTarget();
    const catalog = [skill("alpha"), skill("beta")];
    expect((await invoke(catalog, target, ["install", "--name", "alpha"])).code).toBe(0);
    const one = await invoke(catalog, target, ["check", "--name", "alpha"]);
    expect(JSON.parse(one.stdout).status).toBe("current");
    expect((await invoke(catalog, target, ["install", "--name", "beta"])).code).toBe(0);
    expect(JSON.parse((await invoke(catalog, target, ["list"])).stdout).skills).toHaveLength(2);
  });

  test("updates and uninstalls single or all skills", async (): Promise<void> => {
    const target = await createTarget();
    const initial = [skill("alpha"), skill("beta")];
    await invoke(initial, target, ["install", "--all"]);
    const updated = [skill("alpha", "2.0.0", "# alpha v2"), initial[1] as ManagedSkill];
    expect((await invoke(updated, target, ["update", "--name", "alpha"])).code).toBe(0);
    expect(
      JSON.parse((await invoke(updated, target, ["check", "--name", "alpha"])).stdout).status,
    ).toBe("current");
    expect(await readFile(path.join(target, "alpha", "SKILL.md"), "utf8")).toBe("# alpha v2");
    expect((await invoke(updated, target, ["uninstall", "--name", "alpha"])).code).toBe(0);
    expect(
      JSON.parse((await invoke(updated, target, ["check", "--name", "alpha"])).stdout).status,
    ).toBe("not_installed");
    expect((await invoke(updated, target, ["uninstall", "--name", "beta"])).code).toBe(0);
    expect(
      JSON.parse((await invoke(updated, target, ["check", "--name", "beta"])).stdout).status,
    ).toBe("not_installed");
    expect((await invoke(updated, target, ["install", "--all"])).code).toBe(0);
    expect((await invoke(updated, target, ["uninstall", "--all"])).code).toBe(0);
    expect(JSON.parse((await invoke(updated, target, ["list"])).stdout).skills).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "alpha", status: "not_installed" }),
        expect.objectContaining({ name: "beta", status: "not_installed" }),
      ]),
    );
  });

  test("every write command dry-runs without changing the tree hash", async (): Promise<void> => {
    const target = await createTarget();
    const initial = [skill("alpha")];
    const install = await invoke(initial, target, ["install", "--name", "alpha", "--dry-run"]);
    expect(JSON.parse(install.stdout)).toMatchObject({
      dryRun: true,
      preview: { changes: [{ action: "install" }] },
    });
    expect(await exists(path.join(target, "alpha"))).toBe(false);
    await invoke(initial, target, ["install", "--name", "alpha"]);
    const before = hashSkillFiles(await readSkillFiles(target));
    const updated = [skill("alpha", "2.0.0", "# alpha v2")];
    const update = await invoke(updated, target, ["update", "--name", "alpha", "--dry-run"]);
    expect(JSON.parse(update.stdout)).toMatchObject({
      dryRun: true,
      preview: { changes: [{ action: "update" }] },
    });
    expect(hashSkillFiles(await readSkillFiles(target))).toBe(before);
    const uninstall = await invoke(initial, target, ["uninstall", "--name", "alpha", "--dry-run"]);
    expect(JSON.parse(uninstall.stdout)).toMatchObject({
      dryRun: true,
      preview: { changes: [{ action: "uninstall" }] },
    });
    expect(hashSkillFiles(await readSkillFiles(target))).toBe(before);
  });

  test("install always removes the target before reinstalling packaged files", async (): Promise<void> => {
    const target = await createTarget();
    const catalog = [skill("alpha"), skill("beta")];
    await mkdir(path.join(target, "beta"));
    await writeFile(path.join(target, "beta", "SKILL.md"), "foreign", "utf8");
    let replacements = 0;
    const dependencies: SkillStoreDependencies = {
      beforeReplace: async (name: string): Promise<void> => {
        replacements += 1;
        expect(await exists(path.join(target, name))).toBe(false);
      },
    };
    expect((await invoke(catalog, target, ["install", "--name", "beta"], dependencies)).code).toBe(
      0,
    );
    expect(await readFile(path.join(target, "beta", "SKILL.md"), "utf8")).toBe("# beta");
    await invoke(catalog, target, ["install", "--name", "alpha"]);
    await writeFile(path.join(target, "alpha", "SKILL.md"), "local", "utf8");
    expect((await invoke(catalog, target, ["install", "--name", "alpha"], dependencies)).code).toBe(
      0,
    );
    expect(await readFile(path.join(target, "alpha", "SKILL.md"), "utf8")).toBe("# alpha");
    expect((await invoke(catalog, target, ["install", "--name", "alpha"], dependencies)).code).toBe(
      0,
    );
    expect(replacements).toBe(3);
  });

  test("update still protects locally modified managed directories unless forced", async (): Promise<void> => {
    const target = await createTarget();
    const catalog = [skill("alpha")];
    await invoke(catalog, target, ["install", "--name", "alpha"]);
    await writeFile(path.join(target, "alpha", "SKILL.md"), "local", "utf8");
    expect((await invoke(catalog, target, ["update", "--name", "alpha"])).code).toBe(1);
    expect((await invoke(catalog, target, ["update", "--name", "alpha", "--force"])).code).toBe(0);
    expect(await readFile(path.join(target, "alpha", "SKILL.md"), "utf8")).toBe("# alpha");
  });

  test("rolls back the whole batch after an injected replacement failure", async (): Promise<void> => {
    const target = await createTarget();
    const catalog = [skill("alpha"), skill("beta")];
    const dependencies: SkillStoreDependencies = {
      beforeReplace: async (name: string): Promise<void> => {
        if (name === "beta") throw new Error("injected failure");
      },
    };
    const result = await invoke(catalog, target, ["install", "--all"], dependencies);
    expect(result.code).toBe(1);
    expect(await exists(path.join(target, "alpha"))).toBe(false);
    expect(await exists(path.join(target, "beta"))).toBe(false);
    await expect((await import("node:fs/promises")).readdir(target)).resolves.toEqual([]);
  });

  test("install --all replaces existing unmanaged targets", async (): Promise<void> => {
    const target = await createTarget();
    const catalog = [skill("alpha"), skill("beta")];
    await mkdir(path.join(target, "beta"));
    await writeFile(path.join(target, "beta", "SKILL.md"), "foreign", "utf8");
    const result = await invoke(catalog, target, ["install", "--all"]);
    expect(result.code).toBe(0);
    expect(await readFile(path.join(target, "alpha", "SKILL.md"), "utf8")).toBe("# alpha");
    expect(await readFile(path.join(target, "beta", "SKILL.md"), "utf8")).toBe("# beta");
  });
});
