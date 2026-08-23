import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import packageMetadata from "../../../package.json" with { type: "json" };
import { runCli, type CliRequest } from "../../cli/run";
import type { BuiltinCommand } from "../../cli/types";
import { generatedSkills } from "./generated-skill-manifest";
import { createSelfCommand } from "./self-command";

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
