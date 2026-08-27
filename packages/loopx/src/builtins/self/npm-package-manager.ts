import { execFile } from "node:child_process";
import type { Dirent } from "node:fs";
import { mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { compare, prerelease, valid } from "semver";
import type { ManagedSkill } from "./skill-catalog";
import type { ManagedSkillFile } from "./skill-catalog";
import { hashSkillFiles, readSkillFiles } from "./skill-files";
import type { PackageManagerPort, ResolvedLoopxPackage } from "./self-updater";

const execFileAsync = promisify(execFile);
const packageName = "@kxh4892636/loopx";

export interface NpmPackageManagerDependencies {
  readonly execPath?: string;
  readonly executeFile?: (
    executable: string,
    arguments_: readonly string[],
  ) => Promise<{ readonly stdout: string }>;
  readonly platform?: NodeJS.Platform;
}

const defaultExecuteFile = async (
  executable: string,
  arguments_: readonly string[],
): Promise<{ readonly stdout: string }> =>
  execFileAsync(executable, [...arguments_], { encoding: "utf8" });

const createNpmExecutor = (
  dependencies: NpmPackageManagerDependencies,
): ((arguments_: readonly string[]) => Promise<{ readonly stdout: string }>) => {
  const executeFile = dependencies.executeFile ?? defaultExecuteFile;
  const platform = dependencies.platform ?? process.platform;
  const execPath = dependencies.execPath ?? process.execPath;
  return async (arguments_: readonly string[]): Promise<{ readonly stdout: string }> => {
    if (platform !== "win32") return executeFile("npm", arguments_);
    const npmCli = path.join(path.dirname(execPath), "node_modules", "npm", "bin", "npm-cli.js");
    return executeFile(execPath, [npmCli, ...arguments_]);
  };
};

const parseVersions = (stdout: string): readonly string[] => {
  const value: unknown = JSON.parse(stdout);
  const versions = typeof value === "string" ? [value] : value;
  if (
    Array.isArray(versions) &&
    versions.every(
      (entry: unknown): entry is string => typeof entry === "string" && valid(entry) === entry,
    )
  ) {
    return versions;
  }
  throw new Error("npm returned an invalid LoopX version response");
};

const parsePackFilename = (stdout: string): string => {
  const value: unknown = JSON.parse(stdout);
  if (
    !Array.isArray(value) ||
    value.length !== 1 ||
    typeof value[0] !== "object" ||
    value[0] === null ||
    !("filename" in value[0]) ||
    typeof value[0].filename !== "string"
  ) {
    throw new Error("npm returned an invalid pack response");
  }
  return path.basename(value[0].filename);
};

const retrieveSkills = async (
  version: string,
  executeNpm: (arguments_: readonly string[]) => Promise<{ readonly stdout: string }>,
  executeFile: NonNullable<NpmPackageManagerDependencies["executeFile"]>,
): Promise<readonly ManagedSkill[]> => {
  const temporaryRoot = await mkdtemp(path.join(tmpdir(), "loopx-package-"));
  try {
    const { stdout } = await executeNpm([
      "pack",
      `${packageName}@${version}`,
      "--pack-destination",
      temporaryRoot,
      "--json",
    ]);
    const archive = path.join(temporaryRoot, parsePackFilename(stdout));
    const extracted = path.join(temporaryRoot, "extracted");
    await mkdir(extracted);
    await executeFile("tar", ["-xf", archive, "-C", extracted]);
    const skillsRoot = path.join(extracted, "package", "skills");
    const entries = await readdir(skillsRoot, { withFileTypes: true });
    return Promise.all(
      entries
        .filter((entry: Dirent): boolean => entry.isDirectory())
        .sort((left: Dirent, right: Dirent): number => left.name.localeCompare(right.name))
        .map(async (entry: Dirent): Promise<ManagedSkill> => {
          const files = await readSkillFiles(path.join(skillsRoot, entry.name));
          if (!files.some((file: ManagedSkillFile): boolean => file.path === "SKILL.md")) {
            throw new Error(`Packaged skill is missing SKILL.md: ${entry.name}`);
          }
          return {
            name: entry.name,
            version,
            contentHash: hashSkillFiles(files),
            files,
          };
        }),
    );
  } finally {
    await rm(temporaryRoot, { force: true, recursive: true });
  }
};

export const createNpmPackageManager = (
  dependencies: NpmPackageManagerDependencies = {},
): PackageManagerPort => {
  const executeFile = dependencies.executeFile ?? defaultExecuteFile;
  const executeNpm = createNpmExecutor(dependencies);
  return {
    resolve: async (
      selector: string,
      includePrerelease: boolean,
    ): Promise<ResolvedLoopxPackage> => {
      try {
        const { stdout } = await executeNpm([
          "view",
          `${packageName}@${selector}`,
          "version",
          "--json",
        ]);
        const versions = parseVersions(stdout)
          .filter((version: string): boolean => includePrerelease || prerelease(version) === null)
          .sort(compare);
        const version = versions.at(-1);
        if (version === undefined) throw new Error(`No stable LoopX version matches ${selector}`);
        return { version, skills: await retrieveSkills(version, executeNpm, executeFile) };
      } catch (error) {
        throw new Error(`Unable to resolve ${packageName}@${selector}`, { cause: error });
      }
    },
    install: async (version: string): Promise<void> => {
      try {
        await executeNpm(["install", "--global", `${packageName}@${version}`]);
      } catch (error) {
        throw new Error(`Unable to install ${packageName}@${version}`, { cause: error });
      }
    },
    rollback: async (version: string): Promise<void> => {
      try {
        await executeNpm(["install", "--global", `${packageName}@${version}`]);
      } catch (error) {
        throw new Error(`Unable to restore ${packageName}@${version}`, { cause: error });
      }
    },
  };
};
