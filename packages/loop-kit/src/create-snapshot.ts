import { copyFileSync, cpSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { extractManagedBlocks } from "./managed-agents.ts";

const createSnapshot = (): void => {
  const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const repositoryRoot = resolve(packageRoot, "..", "..");
  const distRoot = join(packageRoot, "dist");
  const payloadRoot = join(distRoot, "payload");

  if (dirname(payloadRoot) !== distRoot) {
    throw new Error(`Refusing to replace unexpected payload path: ${payloadRoot}`);
  }

  const sourceAgentsPath = join(repositoryRoot, "AGENTS.md");
  extractManagedBlocks(readFileSync(sourceAgentsPath, "utf8"));

  rmSync(payloadRoot, { recursive: true, force: true });
  mkdirSync(payloadRoot, { recursive: true });
  copyFileSync(sourceAgentsPath, join(payloadRoot, "AGENTS.md"));
  copyFileSync(join(repositoryRoot, "DOMAIN.md"), join(payloadRoot, "DOMAIN.md"));
  cpSync(
    join(repositoryRoot, ".agents", "skills", "loop-kit"),
    join(payloadRoot, ".agents", "skills", "loop-kit"),
    { recursive: true },
  );
};

try {
  createSnapshot();
} catch (error: unknown) {
  console.error("Failed to create the Loop Kit package snapshot", error);
  process.exitCode = 1;
}
