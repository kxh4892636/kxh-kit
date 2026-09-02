import { createHash } from "node:crypto";
import { lstatSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative } from "node:path";
import { compare, prerelease, valid, validRange } from "semver";
import type { ProcessExecutor, ProcessRequest } from "../runtime.js";
import type { SkillManifest, SkillManifestFile } from "./managed-skill.js";

const packageName = "@kxh4892636/nano-mem";

export interface ResolvedNanoMemPackage {
  archivePath: string;
  cleanup: () => void;
  manifest: SkillManifest;
  sourceDirectory: string;
  version: string;
}

export interface NanoMemPackageExecutor {
  captureInstalled: (version: string) => Promise<ResolvedNanoMemPackage>;
  install: (artifact: ResolvedNanoMemPackage) => Promise<void>;
  resolve: (selector: string | undefined) => Promise<ResolvedNanoMemPackage>;
  verifyInstalled: (version: string) => Promise<void>;
}

interface NpmPackageExecutorDependencies {
  execPath?: string;
  platform?: NodeJS.Platform;
  prefix?: string;
  processExecutor: ProcessExecutor;
}

const parseJson = (stdout: string, description: string): unknown => {
  try {
    return JSON.parse(stdout) as unknown;
  } catch (error) {
    throw new Error(`npm returned invalid JSON for ${description}`, { cause: error });
  }
};

const parseVersions = (stdout: string): readonly string[] => {
  const value = parseJson(stdout, "versions");
  const entries = typeof value === "string" ? [value] : value;
  if (
    !Array.isArray(entries) ||
    !entries.every(
      (entry: unknown): entry is string => typeof entry === "string" && valid(entry) !== null,
    )
  ) {
    throw new Error("npm returned an invalid nano-mem version response");
  }
  return entries;
};

const parsePackFilename = (stdout: string): string => {
  const value = parseJson(stdout, "pack");
  if (
    !Array.isArray(value) ||
    value.length !== 1 ||
    typeof value[0] !== "object" ||
    value[0] === null ||
    !("filename" in value[0]) ||
    typeof value[0].filename !== "string"
  ) {
    throw new Error("npm returned an invalid nano-mem pack response");
  }
  return basename(value[0].filename);
};

const hash = (content: string | Buffer): string =>
  createHash("sha256").update(content).digest("hex");

const readManifest = (sourceDirectory: string, version: string): SkillManifest => {
  const files: SkillManifestFile[] = readdirSync(sourceDirectory, {
    recursive: true,
    withFileTypes: true,
  })
    .filter((entry: import("node:fs").Dirent): boolean => !entry.isDirectory())
    .map((entry: import("node:fs").Dirent): SkillManifestFile => {
      const absolutePath = join(entry.parentPath, entry.name);
      if (!entry.isFile() || lstatSync(absolutePath).isSymbolicLink()) {
        throw new Error("The downloaded nano-mem skill contains a non-file entry.");
      }
      return {
        path: relative(sourceDirectory, absolutePath).replaceAll("\\", "/"),
        sha256: hash(readFileSync(absolutePath)),
      };
    })
    .sort((left: SkillManifestFile, right: SkillManifestFile): number =>
      left.path.localeCompare(right.path),
    );
  if (!files.some((file: SkillManifestFile): boolean => file.path === "SKILL.md")) {
    throw new Error("The downloaded nano-mem skill is missing SKILL.md.");
  }
  return {
    files,
    packageVersion: version,
    skillName: "nano-mem",
    treeHash: hash(
      files.map((file: SkillManifestFile): string => `${file.path}\0${file.sha256}\n`).join(""),
    ),
  };
};

const assertPackageIdentity = (packageRoot: string, version: string): string => {
  const value = parseJson(readFileSync(join(packageRoot, "package.json"), "utf8"), "package");
  if (
    typeof value !== "object" ||
    value === null ||
    !("name" in value) ||
    value.name !== packageName ||
    !("version" in value) ||
    value.version !== version ||
    !("bin" in value) ||
    typeof value.bin !== "object" ||
    value.bin === null ||
    !("nnm" in value.bin) ||
    value.bin.nnm !== "dist/main.mjs"
  ) {
    throw new Error(
      "The downloaded package identity does not match the resolved nano-mem version.",
    );
  }
  return assertContainedFile(packageRoot, join(packageRoot, "dist", "main.mjs"));
};

const assertContainedDirectory = (root: string, path: string): string => {
  const stat = lstatSync(path);
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new Error("The downloaded package contains an unsafe directory boundary.");
  }
  const canonicalRoot = realpathSync(root);
  const canonicalPath = realpathSync(path);
  const pathFromRoot = relative(canonicalRoot, canonicalPath);
  if (pathFromRoot === "" || pathFromRoot.startsWith("..") || isAbsolute(pathFromRoot)) {
    throw new Error("The downloaded package escaped its temporary root.");
  }
  return canonicalPath;
};

const assertContainedFile = (root: string, path: string): string => {
  const stat = lstatSync(path);
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new Error("npm produced an unsafe package archive.");
  }
  const canonicalRoot = realpathSync(root);
  const canonicalPath = realpathSync(path);
  const pathFromRoot = relative(canonicalRoot, canonicalPath);
  if (pathFromRoot === "" || pathFromRoot.startsWith("..") || isAbsolute(pathFromRoot)) {
    throw new Error("The package archive escaped its temporary root.");
  }
  return canonicalPath;
};

const cleanupAndRethrow = (temporaryRoot: string, error: unknown): never => {
  try {
    rmSync(temporaryRoot, { force: true, recursive: true });
  } catch (cleanupError) {
    throw new AggregateError(
      [error, cleanupError],
      "The package operation failed and its temporary directory could not be cleaned.",
      { cause: error },
    );
  }
  throw error;
};

const npmRequest = (
  dependencies: NpmPackageExecutorDependencies,
  argumentsList: readonly string[],
): ProcessRequest => {
  const platform = dependencies.platform ?? process.platform;
  const execPath = dependencies.execPath ?? process.execPath;
  if (platform !== "win32") return { argumentsList, command: "npm" };
  return {
    argumentsList: [
      join(dirname(execPath), "node_modules", "npm", "bin", "npm-cli.js"),
      ...argumentsList,
    ],
    command: execPath,
  };
};

const runCliSmoke = async (
  dependencies: NpmPackageExecutorDependencies,
  entryPath: string,
  version: string,
): Promise<void> => {
  const result = await dependencies.processExecutor.execute({
    argumentsList: [entryPath, "--version"],
    command: dependencies.execPath ?? process.execPath,
  });
  const value = parseJson(result.stdout, "nano-mem CLI version smoke");
  const observed =
    typeof value === "object" &&
    value !== null &&
    "ok" in value &&
    value.ok === true &&
    "data" in value &&
    typeof value.data === "object" &&
    value.data !== null &&
    "version" in value.data
      ? value.data.version
      : undefined;
  if (observed !== version) {
    throw new Error(`Expected runnable nano-mem CLI ${version}, observed ${String(observed)}.`);
  }
};

const globalArguments = (
  dependencies: NpmPackageExecutorDependencies,
  argumentsList: readonly string[],
): readonly string[] =>
  dependencies.prefix === undefined
    ? argumentsList
    : [...argumentsList, "--prefix", dependencies.prefix];

const resolveVersion = async (
  dependencies: NpmPackageExecutorDependencies,
  selector: string | undefined,
): Promise<string> => {
  if (selector !== undefined && valid(selector, true) === null) {
    const range = validRange(selector, true);
    const isTag = range === null && encodeURIComponent(selector) === selector;
    if (!isTag) throw new Error(`Invalid npm version or tag: ${selector}`);
  }
  const target = selector === undefined ? packageName : `${packageName}@${selector}`;
  const result = await dependencies.processExecutor.execute(
    npmRequest(dependencies, [
      "view",
      target,
      selector === undefined ? "versions" : "version",
      "--json",
    ]),
  );
  const versions = parseVersions(result.stdout)
    .filter((version: string): boolean => selector !== undefined || prerelease(version) === null)
    .sort(compare);
  const resolved = versions.at(-1);
  if (resolved === undefined) throw new Error("No matching stable nano-mem version is available.");
  return resolved;
};

const inspectArchive = async (
  dependencies: NpmPackageExecutorDependencies,
  temporaryRoot: string,
  archive: string,
  version: string,
  runSmoke: boolean,
): Promise<{ manifest: SkillManifest; sourceDirectory: string }> => {
  const extracted = join(temporaryRoot, "extracted");
  await dependencies.processExecutor.execute(
    npmRequest(dependencies, [
      "install",
      "--prefix",
      extracted,
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      "--offline",
      archive,
    ]),
  );
  const packageRoot = assertContainedDirectory(
    temporaryRoot,
    join(extracted, "node_modules", "@kxh4892636", "nano-mem"),
  );
  const entryPath = assertPackageIdentity(packageRoot, version);
  if (runSmoke) await runCliSmoke(dependencies, entryPath, version);
  const sourceDirectory = assertContainedDirectory(
    temporaryRoot,
    join(packageRoot, "skills", "nano-mem"),
  );
  return { manifest: readManifest(sourceDirectory, version), sourceDirectory };
};

const retrievePackage = async (
  dependencies: NpmPackageExecutorDependencies,
  version: string,
): Promise<ResolvedNanoMemPackage> => {
  const temporaryRoot = mkdtempSync(join(tmpdir(), "nano-mem-package-"));
  try {
    const packed = await dependencies.processExecutor.execute(
      npmRequest(dependencies, [
        "pack",
        `${packageName}@${version}`,
        "--pack-destination",
        temporaryRoot,
        "--json",
        "--ignore-scripts",
      ]),
    );
    const archive = assertContainedFile(
      temporaryRoot,
      join(temporaryRoot, parsePackFilename(packed.stdout)),
    );
    const inspected = await inspectArchive(dependencies, temporaryRoot, archive, version, false);
    return {
      archivePath: archive,
      cleanup: (): void => rmSync(temporaryRoot, { force: true, recursive: true }),
      ...inspected,
      version,
    };
  } catch (error) {
    return cleanupAndRethrow(temporaryRoot, error);
  }
};

const captureInstalled = async (
  dependencies: NpmPackageExecutorDependencies,
  version: string,
): Promise<ResolvedNanoMemPackage> => {
  const temporaryRoot = mkdtempSync(join(tmpdir(), "nano-mem-rollback-"));
  try {
    const npmRootResult = await dependencies.processExecutor.execute(
      npmRequest(dependencies, globalArguments(dependencies, ["root", "--global"])),
    );
    const npmRoot = realpathSync(npmRootResult.stdout.trim());
    const packageRoot = assertContainedDirectory(npmRoot, join(npmRoot, "@kxh4892636", "nano-mem"));
    assertPackageIdentity(packageRoot, version);
    const packed = await dependencies.processExecutor.execute(
      npmRequest(dependencies, [
        "pack",
        packageRoot,
        "--pack-destination",
        temporaryRoot,
        "--json",
        "--ignore-scripts",
      ]),
    );
    const archivePath = assertContainedFile(
      temporaryRoot,
      join(temporaryRoot, parsePackFilename(packed.stdout)),
    );
    const inspected = await inspectArchive(dependencies, temporaryRoot, archivePath, version, true);
    return {
      archivePath,
      cleanup: (): void => rmSync(temporaryRoot, { force: true, recursive: true }),
      ...inspected,
      version,
    };
  } catch (error) {
    return cleanupAndRethrow(temporaryRoot, error);
  }
};

export const createNpmPackageExecutor = (
  dependencies: NpmPackageExecutorDependencies,
): NanoMemPackageExecutor => ({
  captureInstalled: async (version: string): Promise<ResolvedNanoMemPackage> =>
    captureInstalled(dependencies, version),
  install: async (artifact: ResolvedNanoMemPackage): Promise<void> => {
    await dependencies.processExecutor.execute(
      npmRequest(dependencies, [
        ...globalArguments(dependencies, ["install", "--global"]),
        "--ignore-scripts",
        "--offline",
        artifact.archivePath,
      ]),
    );
  },
  resolve: async (selector: string | undefined): Promise<ResolvedNanoMemPackage> =>
    retrievePackage(dependencies, await resolveVersion(dependencies, selector)),
  verifyInstalled: async (version: string): Promise<void> => {
    const result = await dependencies.processExecutor.execute(
      npmRequest(
        dependencies,
        globalArguments(dependencies, ["list", "--global", packageName, "--depth=0", "--json"]),
      ),
    );
    const value = parseJson(result.stdout, "global package status");
    const installed =
      typeof value === "object" &&
      value !== null &&
      "dependencies" in value &&
      typeof value.dependencies === "object" &&
      value.dependencies !== null &&
      packageName in value.dependencies
        ? (value.dependencies as Record<string, { version?: unknown }>)[packageName]?.version
        : undefined;
    if (installed !== version) {
      throw new Error(`Expected global ${packageName}@${version}, observed ${String(installed)}.`);
    }
    const npmRootResult = await dependencies.processExecutor.execute(
      npmRequest(dependencies, globalArguments(dependencies, ["root", "--global"])),
    );
    const npmRoot = realpathSync(npmRootResult.stdout.trim());
    const packageRoot = assertContainedDirectory(npmRoot, join(npmRoot, "@kxh4892636", "nano-mem"));
    const entryPath = assertPackageIdentity(packageRoot, version);
    await runCliSmoke(dependencies, entryPath, version);
  },
});
