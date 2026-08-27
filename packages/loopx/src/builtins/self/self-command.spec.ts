import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import packageMetadata from "../../../package.json" with { type: "json" };
import { runCli, type CliRequest } from "../../cli/run";
import type { BuiltinCommand } from "../../cli/types";
import { generatedSkills } from "./generated-skill-manifest";
import { createSelfCommand } from "./self-command";
import { inspectSkill, readManagedMarker } from "./skill-state";
import { prepareSkillChange } from "./skill-store";

const temporaryDirectories: string[] = [];

const invoke = async (target: string, argv: readonly string[]): Promise<unknown> => {
  let stdout = "";
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
    stderr: { write: (): void => undefined },
  };
  const code = await runCli(request, [(): BuiltinCommand => createSelfCommand(generatedSkills)]);
  expect(code).toBe(0);
  return JSON.parse(stdout);
};

const createTarget = async (): Promise<string> => {
  const target = await mkdtemp(path.join(tmpdir(), "loopx-skill-state-"));
  temporaryDirectories.push(target);
  return target;
};

const writeManagedSkill = async (target: string, version: string): Promise<void> => {
  const skill = generatedSkills[0];
  if (skill === undefined) throw new Error("Missing generated skill fixture");
  const directory = path.join(target, skill.name);
  for (const file of skill.files) {
    const destination = path.join(directory, ...file.path.split("/"));
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, file.content, "utf8");
  }
  await writeFile(
    path.join(directory, ".loopx-managed.json"),
    JSON.stringify({ name: skill.name, version, contentHash: skill.contentHash }),
    "utf8",
  );
};

afterEach(async (): Promise<void> => {
  const { rm } = await import("node:fs/promises");
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory: string): Promise<void> => rm(directory, { force: true, recursive: true })),
  );
});

describe("self skill query interface", (): void => {
  test("treats missing, invalid, and malformed managed markers as unmanaged", async (): Promise<void> => {
    const target = await createTarget();
    const directory = path.join(target, "marker");
    await mkdir(directory);
    await expect(readManagedMarker(directory)).resolves.toBeNull();
    for (const marker of [
      "{",
      "null",
      "[]",
      "{}",
      '{"name":1,"version":"1","contentHash":"x"}',
      '{"name":"x","version":1,"contentHash":"x"}',
      '{"name":"x","version":"1","contentHash":1}',
    ]) {
      await writeFile(path.join(directory, ".loopx-managed.json"), marker, "utf8");
      await expect(readManagedMarker(directory)).resolves.toBeNull();
    }
  });

  test("wraps marker and skill tree filesystem failures", async (): Promise<void> => {
    const target = await createTarget();
    const directory = path.join(target, "broken-marker");
    await mkdir(path.join(directory, ".loopx-managed.json"), { recursive: true });
    await expect(readManagedMarker(directory)).rejects.toThrow(
      "Unable to read managed skill marker",
    );

    const skill = generatedSkills[0];
    if (skill === undefined) throw new Error("Missing generated skill fixture");
    await writeFile(path.join(target, skill.name), "not a directory", "utf8");
    await expect(inspectSkill(skill, target)).rejects.toThrow("Unable to inspect skill");
  });

  test("enforces managed update and uninstall state boundaries", async (): Promise<void> => {
    const skill = generatedSkills[0];
    if (skill === undefined) throw new Error("Missing generated skill fixture");

    const missing = await createTarget();
    await expect(
      prepareSkillChange([skill], {
        kind: "update",
        names: [skill.name],
        targetRoot: missing,
        force: false,
      }),
    ).rejects.toThrow("is not installed");

    const unmanaged = await createTarget();
    await mkdir(path.join(unmanaged, skill.name));
    await writeFile(path.join(unmanaged, skill.name, "SKILL.md"), "local", "utf8");
    await expect(
      prepareSkillChange([skill], {
        kind: "update",
        names: [skill.name],
        targetRoot: unmanaged,
        force: true,
      }),
    ).rejects.toThrow("unmanaged skill directory");

    const modified = await createTarget();
    await writeManagedSkill(modified, skill.version);
    await writeFile(path.join(modified, skill.name, "SKILL.md"), "changed", "utf8");
    await expect(
      prepareSkillChange([skill], {
        kind: "update",
        names: [skill.name],
        targetRoot: modified,
        force: false,
      }),
    ).rejects.toThrow("local changes");
    await expect(
      prepareSkillChange([skill], {
        kind: "update",
        names: [skill.name],
        targetRoot: modified,
        force: true,
      }),
    ).resolves.toMatchObject({ preview: { success: true } });
  });

  test("lists packaged skills without writing the target", async (): Promise<void> => {
    const target = await createTarget();
    const result = await invoke(target, ["list", "--dry-run"]);
    expect(result).toEqual({
      skills: ["loop-x", "loop-x-cli"].map(
        (name: string): Record<string, string> => ({
          name,
          status: "not_installed",
          target: path.join(target, name),
          version: packageMetadata.version,
        }),
      ),
    });
  });

  test("packages code-test as the implementation testing skill", (): void => {
    const loopX = generatedSkills.find((skill) => skill.name === "loop-x");
    if (loopX === undefined) throw new Error("Missing loop-x generated skill");
    const paths = loopX.files.map((file) => file.path);

    expect(paths).toContain("references/subskills/code-test/SKILL.md");
    expect(paths.some((filePath) => filePath.startsWith("references/subskills/tdd/"))).toBe(false);
  });

  test("installs, checks, and uninstalls loop-x-cli", async (): Promise<void> => {
    const target = await createTarget();
    await invoke(target, ["install", "--name", "loop-x-cli"]);
    expect(await invoke(target, ["check", "--name", "loop-x-cli"])).toMatchObject({
      name: "loop-x-cli",
      status: "current",
    });
    await invoke(target, ["uninstall", "--name", "loop-x-cli"]);
    expect(await invoke(target, ["check", "--name", "loop-x-cli"])).toMatchObject({
      name: "loop-x-cli",
      status: "not_installed",
    });
  });
});

describe("self skill query interface", (): void => {
  test("installs and uninstalls every packaged skill", async (): Promise<void> => {
    const target = await createTarget();
    await invoke(target, ["install", "--all"]);
    expect(await invoke(target, ["list"])).toMatchObject({
      skills: [
        { name: "loop-x", status: "current" },
        { name: "loop-x-cli", status: "current" },
      ],
    });
    await invoke(target, ["uninstall", "--all"]);
    expect(await invoke(target, ["list"])).toMatchObject({
      skills: [
        { name: "loop-x", status: "not_installed" },
        { name: "loop-x-cli", status: "not_installed" },
      ],
    });
  });

  test.each([
    { expected: "current", version: "current" },
    { expected: "outdated", version: "0.0.0" },
  ])(
    "detects $expected managed state",
    async ({ expected, version }: { expected: string; version: string }): Promise<void> => {
      const target = await createTarget();
      const skill = generatedSkills[0];
      if (skill === undefined) throw new Error("Missing generated skill fixture");
      await writeManagedSkill(target, version === "current" ? skill.version : version);
      const result = await invoke(target, ["check", "--name", skill.name, "--dry-run"]);
      expect(result).toMatchObject({ name: skill.name, status: expected, version: skill.version });
    },
  );

  test("detects a locally modified managed file", async (): Promise<void> => {
    const target = await createTarget();
    const skill = generatedSkills[0];
    if (skill === undefined) throw new Error("Missing generated skill fixture");
    await writeManagedSkill(target, skill.version);
    await writeFile(path.join(target, skill.name, "SKILL.md"), "locally modified", "utf8");
    const result = await invoke(target, ["check", "--name", skill.name]);
    expect(result).toMatchObject({ name: skill.name, status: "modified" });
  });
});
