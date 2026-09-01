import { appendFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { runCli } from "../cli.js";
import { nodeRuntime, type RuntimeDependencies } from "../runtime.js";
import { nanoMemSkillManifest } from "./generated-skill-manifest.js";
import type { NanoMemPackageExecutor, ResolvedNanoMemPackage } from "./npm-package-executor.js";
import { createSelfCommandRegistrar, type SelfCommandDependencies } from "./self-commands.js";

interface CliResult {
  code: number;
  error: unknown;
  output: unknown;
}

const sourceDirectory = fileURLToPath(new URL("../../skills/nano-mem/", import.meta.url));
let temporaryRoot = "";
let runtime: RuntimeDependencies;

beforeEach((): void => {
  temporaryRoot = mkdtempSync(join(tmpdir(), "nano-mem-self-cli-"));
  const base = nodeRuntime();
  runtime = { ...base, paths: { ...base.paths, cwd: temporaryRoot } };
});

afterEach((): void => rmSync(temporaryRoot, { force: true, recursive: true }));

const execute = async (
  argumentsList: string[],
  dependencies: Partial<SelfCommandDependencies> = {},
): Promise<CliResult> => {
  let stderr = "";
  let stdout = "";
  const code = await runCli({
    argumentsList,
    io: {
      stderr: (text: string): void => {
        stderr += text;
      },
      stdout: (text: string): void => {
        stdout += text;
      },
    },
    registrars: [
      createSelfCommandRegistrar({
        manifest: nanoMemSkillManifest,
        sourceDirectory,
        ...dependencies,
      }),
    ],
    runtime,
  });
  return {
    code,
    error: stderr === "" ? undefined : JSON.parse(stderr),
    output: stdout === "" ? undefined : JSON.parse(stdout),
  };
};

describe("self skill CLI", (): void => {
  test("reports, plans, installs, updates, and uninstalls the single skill", async (): Promise<void> => {
    const initial = await execute(["self", "skill", "status"]);
    const planned = await execute(["self", "skill", "install", "--dry-run"]);
    const stillMissing = await execute(["self", "skill", "status"]);
    const installed = await execute(["self", "skill", "install"]);
    const current = await execute(["self", "skill", "status"]);
    const updated = await execute(["self", "skill", "update"]);
    const uninstalled = await execute(["self", "skill", "uninstall"]);
    expect(initial.output).toMatchObject({ data: { status: "not_installed" }, ok: true });
    expect(planned.output).toMatchObject({
      data: { after: "current", dryRun: true },
      ok: true,
    });
    expect(stillMissing.output).toMatchObject({ data: { status: "not_installed" } });
    expect(installed.output).toMatchObject({ data: { after: "current", changed: true } });
    expect(current.output).toMatchObject({
      data: {
        expectedContentHash: nanoMemSkillManifest.treeHash,
        packageVersion: nanoMemSkillManifest.packageVersion,
        status: "current",
      },
    });
    expect(updated.output).toMatchObject({ data: { after: "current", changed: false } });
    expect(uninstalled.output).toMatchObject({
      data: { after: "not_installed", changed: true },
    });
  });

  test("returns stable errors for unsafe targets and protected modifications", async (): Promise<void> => {
    const invalid = await execute(["self", "skill", "status", "--target", "../outside"]);
    await execute(["self", "skill", "install"]);
    const skillFile = join(temporaryRoot, ".agents", "skills", "nano-mem", "SKILL.md");
    appendFileSync(skillFile, "\nlocal\n");
    const protectedResult = await execute(["self", "skill", "uninstall"]);
    const forced = await execute(["self", "skill", "uninstall", "--force"]);
    expect(invalid).toMatchObject({
      code: 2,
      error: { error: { code: "INVALID_SKILL_TARGET" } },
    });
    expect(protectedResult).toMatchObject({
      code: 1,
      error: { error: { code: "SKILL_MODIFIED" } },
    });
    expect(forced.output).toMatchObject({ data: { after: "not_installed" }, ok: true });
  });
});

describe("self update CLI", (): void => {
  test("passes version and dry-run through the command boundary", async (): Promise<void> => {
    const selectors: Array<string | undefined> = [];
    const packageExecutor: NanoMemPackageExecutor = {
      captureInstalled: async (): Promise<never> => {
        throw new Error("dry-run must not capture the installed package");
      },
      install: async (): Promise<void> => undefined,
      resolve: async (selector: string | undefined): Promise<ResolvedNanoMemPackage> => {
        selectors.push(selector);
        return {
          archivePath: "candidate.tgz",
          cleanup: (): void => undefined,
          manifest: nanoMemSkillManifest,
          sourceDirectory,
          version: nanoMemSkillManifest.packageVersion,
        };
      },
      verifyInstalled: async (): Promise<void> => undefined,
    };
    const result = await execute(["self", "update", "--version", "next", "--dry-run"], {
      packageExecutor,
    });
    expect(result).toMatchObject({
      code: 0,
      output: { data: { changed: false, dryRun: true }, ok: true },
    });
    expect(selectors).toEqual(["next"]);
  });

  test("serializes failure stage and recovery details", async (): Promise<void> => {
    const packageExecutor: NanoMemPackageExecutor = {
      captureInstalled: async (): Promise<never> => {
        throw new Error("resolve failure must not capture the installed package");
      },
      install: async (): Promise<void> => undefined,
      resolve: async (): Promise<never> => {
        throw new Error("registry unavailable");
      },
      verifyInstalled: async (): Promise<void> => undefined,
    };
    const result = await execute(["self", "update"], { packageExecutor });
    expect(result).toMatchObject({
      code: 1,
      error: {
        error: {
          code: "SELF_UPDATE_FAILED",
          details: {
            recovery: {
              cli: { status: "not_needed" },
              skill: { status: "not_needed" },
            },
            stage: "resolve",
          },
        },
        ok: false,
      },
    });
  });
});
