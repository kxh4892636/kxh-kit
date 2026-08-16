import { spawnSync } from "node:child_process";
import type { SpawnSyncReturns } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, vi } from "vite-plus/test";

// 每个用例 spawnSync node 子进程做真实安装, 并行负载下会超出 vitest 默认 5s 超时
vi.setConfig({ testTimeout: 30_000 });

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = join(packageRoot, "..", "..");
const cliPath = join(packageRoot, "dist", "cli.mjs");

const runCli = (args: string[]): SpawnSyncReturns<string> => {
  return spawnSync(process.execPath, [cliPath, ...args], {
    encoding: "utf8",
  });
};

test("requires an explicit target root", (): void => {
  const result = runCli([]);

  expect(result.status).toBe(1);
  expect(result.stderr).toContain("--target");
});

test("rejects a target root that does not exist", (): void => {
  const parent = mkdtempSync(join(tmpdir(), "loop-kit-cli-"));
  const missingTarget = join(parent, "missing");

  try {
    const result = runCli(["--target", missingTarget]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("existing directory");
    expect(existsSync(missingTarget)).toBe(false);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test("installs the published snapshot into an empty target root", (): void => {
  const targetRoot = mkdtempSync(join(tmpdir(), "loop-kit-cli-"));

  try {
    const result = runCli(["--target", targetRoot]);

    expect(result.status).toBe(0);
    expect(readFileSync(join(targetRoot, "DOMAIN.md"), "utf8")).toBe(
      readFileSync(join(repositoryRoot, "DOMAIN.md"), "utf8"),
    );
    expect(
      readFileSync(
        join(targetRoot, ".agents", "skills", "loop-kit", "kaizen", "grilling", "SKILL.md"),
        "utf8",
      ),
    ).toBe(
      readFileSync(
        join(repositoryRoot, ".agents", "skills", "loop-kit", "kaizen", "grilling", "SKILL.md"),
        "utf8",
      ),
    );

    const agents = readFileSync(join(targetRoot, "AGENTS.md"), "utf8");
    expect(agents).toContain("<!-- GENERAL RULES START -->");
    expect(agents).toContain("<!-- LOOP KIT START -->");
    expect(agents).not.toContain("<!-- SKILL RULES START -->");
    expect(agents).not.toContain("<!-- PROJECT RULES START -->");
    expect(result.stdout).toContain("created");
  } finally {
    rmSync(targetRoot, { recursive: true, force: true });
  }
});

test("removes a target-only skill and reports one deleted skill", (): void => {
  const targetRoot = mkdtempSync(join(tmpdir(), "loop-kit-cli-"));
  const staleSkillRoot = join(targetRoot, ".agents", "skills", "loop-kit", "local", "stale-skill");
  mkdirSync(staleSkillRoot, { recursive: true });
  writeFileSync(join(staleSkillRoot, "SKILL.md"), "# Stale skill\n");

  try {
    const result = runCli(["--target", targetRoot]);

    expect(result.status).toBe(0);
    expect(existsSync(staleSkillRoot)).toBe(false);
    expect(result.stdout).toContain("deleted 1");
  } finally {
    rmSync(targetRoot, { recursive: true, force: true });
  }
});

test("removes target-only non-skill content without counting it as a skill", (): void => {
  const targetRoot = mkdtempSync(join(tmpdir(), "loop-kit-cli-"));
  const staleFile = join(targetRoot, ".agents", "skills", "loop-kit", "local-note.md");
  mkdirSync(dirname(staleFile), { recursive: true });
  writeFileSync(staleFile, "not a skill\n");

  try {
    const result = runCli(["--target", targetRoot]);

    expect(result.status).toBe(0);
    expect(existsSync(staleFile)).toBe(false);
    expect(result.stdout).toContain("deleted 0");
  } finally {
    rmSync(targetRoot, { recursive: true, force: true });
  }
});

test("removes a target-only empty directory without counting it as a skill", (): void => {
  const targetRoot = mkdtempSync(join(tmpdir(), "loop-kit-cli-"));

  try {
    const first = runCli(["--target", targetRoot]);
    expect(first.status).toBe(0);

    const staleDirectory = join(targetRoot, ".agents", "skills", "loop-kit", "empty-directory");
    mkdirSync(staleDirectory);

    const second = runCli(["--target", targetRoot]);
    expect(second.status).toBe(0);
    expect(existsSync(staleDirectory)).toBe(false);
    expect(second.stdout).toContain("deleted 0");
  } finally {
    rmSync(targetRoot, { recursive: true, force: true });
  }
});

test("updates managed files while preserving target-owned AGENTS.md content", (): void => {
  const targetRoot = mkdtempSync(join(tmpdir(), "loop-kit-cli-"));
  const extraSkill = join(targetRoot, ".agents", "skills", "loop-kit", "local-skill.md");
  mkdirSync(dirname(extraSkill), { recursive: true });
  writeFileSync(extraSkill, "local skill\n");
  writeFileSync(join(targetRoot, "DOMAIN.md"), "old domain\n");
  writeFileSync(
    join(targetRoot, "AGENTS.md"),
    [
      "# Local rules",
      "",
      "<!-- GENERAL RULES START -->",
      "old general rules",
      "<!-- GENERAL RULES END -->",
      "",
      "<!-- LOOP KIT START -->",
      "old loop kit",
      "<!-- LOOP KIT END -->",
      "",
      "<!-- SKILL RULES START -->",
      "local skill rules",
      "<!-- SKILL RULES END -->",
      "",
    ].join("\n"),
  );

  try {
    const first = runCli(["--target", targetRoot]);
    const agents = readFileSync(join(targetRoot, "AGENTS.md"), "utf8");

    expect(first.status).toBe(0);
    expect(agents).toContain("# Local rules");
    expect(agents).toContain("local skill rules");
    expect(agents).not.toContain("old general rules");
    expect(agents).not.toContain("old loop kit");
    expect(agents).toContain("## 主流程：想法 → 交付");
    expect(existsSync(extraSkill)).toBe(false);
    expect(readFileSync(join(targetRoot, "DOMAIN.md"), "utf8")).toBe(
      readFileSync(join(repositoryRoot, "DOMAIN.md"), "utf8"),
    );

    const second = runCli(["--target", targetRoot]);
    expect(second.status).toBe(0);
    expect(second.stdout).toContain("updated 0");
    expect(second.stdout).toContain("deleted 0");
  } finally {
    rmSync(targetRoot, { recursive: true, force: true });
  }
});

test("rolls back earlier writes when a later destination fails", (): void => {
  const targetRoot = mkdtempSync(join(tmpdir(), "loop-kit-cli-"));
  const originalAgents = [
    "<!-- GENERAL RULES START -->",
    "original general",
    "<!-- GENERAL RULES END -->",
    "",
    "<!-- LOOP KIT START -->",
    "original loop",
    "<!-- LOOP KIT END -->",
    "",
  ].join("\n");
  const originalDomain = "original domain\n";
  writeFileSync(join(targetRoot, "AGENTS.md"), originalAgents);
  writeFileSync(join(targetRoot, "DOMAIN.md"), originalDomain);
  writeFileSync(join(targetRoot, ".agents"), "path conflict\n");

  try {
    const result = runCli(["--target", targetRoot]);

    expect(result.status).toBe(1);
    expect(readFileSync(join(targetRoot, "AGENTS.md"), "utf8")).toBe(originalAgents);
    expect(readFileSync(join(targetRoot, "DOMAIN.md"), "utf8")).toBe(originalDomain);
    expect(readFileSync(join(targetRoot, ".agents"), "utf8")).toBe("path conflict\n");
  } finally {
    rmSync(targetRoot, { recursive: true, force: true });
  }
});

test("rejects ambiguous managed markers before changing other files", (): void => {
  const targetRoot = mkdtempSync(join(tmpdir(), "loop-kit-cli-"));
  const originalDomain = "original domain\n";
  const originalAgents = [
    "<!-- GENERAL RULES START -->",
    "first",
    "<!-- GENERAL RULES START -->",
    "second",
    "<!-- GENERAL RULES END -->",
  ].join("\n");
  const originalSkill = join(
    targetRoot,
    ".agents",
    "skills",
    "loop-kit",
    "local",
    "original-skill",
    "SKILL.md",
  );
  mkdirSync(dirname(originalSkill), { recursive: true });
  writeFileSync(originalSkill, "original skill\n");
  writeFileSync(join(targetRoot, "DOMAIN.md"), originalDomain);
  writeFileSync(join(targetRoot, "AGENTS.md"), originalAgents);

  try {
    const result = runCli(["--target", targetRoot]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Invalid GENERAL RULES markers");
    expect(readFileSync(join(targetRoot, "AGENTS.md"), "utf8")).toBe(originalAgents);
    expect(readFileSync(join(targetRoot, "DOMAIN.md"), "utf8")).toBe(originalDomain);
    expect(readFileSync(originalSkill, "utf8")).toBe("original skill\n");
  } finally {
    rmSync(targetRoot, { recursive: true, force: true });
  }
});

test("rejects nested managed blocks before changing other files", (): void => {
  const targetRoot = mkdtempSync(join(tmpdir(), "loop-kit-cli-"));
  const originalDomain = "original domain\n";
  writeFileSync(join(targetRoot, "DOMAIN.md"), originalDomain);
  writeFileSync(
    join(targetRoot, "AGENTS.md"),
    [
      "<!-- GENERAL RULES START -->",
      "<!-- LOOP KIT START -->",
      "nested loop kit",
      "<!-- LOOP KIT END -->",
      "<!-- GENERAL RULES END -->",
    ].join("\n"),
  );

  try {
    const result = runCli(["--target", targetRoot]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("overlap");
    expect(readFileSync(join(targetRoot, "DOMAIN.md"), "utf8")).toBe(originalDomain);
  } finally {
    rmSync(targetRoot, { recursive: true, force: true });
  }
});
