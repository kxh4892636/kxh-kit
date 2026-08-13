import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { expect, test } from "vite-plus/test";
import { installSnapshotForTest } from "../src/install.ts";

test("restores every managed destination when failure follows skill replacement", (): void => {
  const testRoot = mkdtempSync(join(tmpdir(), "loop-kit-install-"));
  const payloadRoot = join(testRoot, "payload");
  const targetRoot = join(testRoot, "target");
  const sourceSkill = join(payloadRoot, ".agents", "skills", "loop-kit", "new", "SKILL.md");
  const targetSkill = join(targetRoot, ".agents", "skills", "loop-kit", "old", "SKILL.md");
  const originalAgents =
    "<!-- GENERAL RULES START -->\nold\n<!-- GENERAL RULES END -->\n\n<!-- LOOP KIT START -->\nold\n<!-- LOOP KIT END -->\n";
  const originalDomain = "original domain\n";

  mkdirSync(dirname(sourceSkill), { recursive: true });
  mkdirSync(dirname(targetSkill), { recursive: true });
  writeFileSync(
    join(payloadRoot, "AGENTS.md"),
    "<!-- GENERAL RULES START -->\nnew\n<!-- GENERAL RULES END -->\n\n<!-- LOOP KIT START -->\nnew\n<!-- LOOP KIT END -->\n",
  );
  writeFileSync(join(payloadRoot, "DOMAIN.md"), "new domain\n");
  writeFileSync(sourceSkill, "new skill\n");
  writeFileSync(join(targetRoot, "AGENTS.md"), originalAgents);
  writeFileSync(join(targetRoot, "DOMAIN.md"), originalDomain);
  writeFileSync(targetSkill, "old skill\n");

  try {
    expect((): void => {
      installSnapshotForTest(payloadRoot, targetRoot, (destination: string): void => {
        if (destination.endsWith(join(".agents", "skills", "loop-kit"))) {
          throw new Error("injected failure after skill replacement");
        }
      });
    }).toThrow("injected failure after skill replacement");
    expect(readFileSync(join(targetRoot, "AGENTS.md"), "utf8")).toBe(originalAgents);
    expect(readFileSync(join(targetRoot, "DOMAIN.md"), "utf8")).toBe(originalDomain);
    expect(readFileSync(targetSkill, "utf8")).toBe("old skill\n");
  } finally {
    rmSync(testRoot, { recursive: true, force: true });
  }
});
