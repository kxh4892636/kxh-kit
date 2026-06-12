#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const skillRoot = resolve(scriptDir, "..");
const configPath = join(scriptDir, "update-source-docs.config.json");

const toPosix = (value) => value.split("\\").join("/");

const splitRelativePath = (value) =>
  value
    .split("/")
    .map((part) => part.trim())
    .filter((part) => part.length > 0 && part !== ".");

const resolveRelative = ({ root, path }) => resolve(root, ...splitRelativePath(path));

const isPathInside = ({ root, path }) => {
  const resolvedRoot = resolve(root);
  const resolvedPath = resolve(path);
  const pathRelative = relative(resolvedRoot, resolvedPath);
  return pathRelative === "" || (!pathRelative.startsWith("..") && !isAbsolute(pathRelative));
};

const assertUnderSkillRoot = (path) => {
  if (!isPathInside({ root: skillRoot, path })) {
    throw new Error(`Refusing to modify path outside skill root: ${path}`);
  }
};

const removeUnderSkillRoot = (path) => {
  assertUnderSkillRoot(path);
  rmSync(path, { force: true, recursive: true });
};

const writeTextUnderSkillRoot = ({ path, text }) => {
  assertUnderSkillRoot(path);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${text.replace(/\r\n?/g, "\n").replace(/\n?$/, "")}\n`, "utf8");
};

const readConfig = () => {
  if (!existsSync(configPath)) {
    throw new Error(`Missing config file: ${configPath}`);
  }
  return JSON.parse(readFileSync(configPath, "utf8"));
};

const parseArgs = ({ config }) => {
  const options = {
    branch: config.branch ?? "main",
    dryRun: false,
    repoUrl: config.repoUrl,
  };

  for (let index = 2; index < process.argv.length; index += 1) {
    const arg = process.argv[index];
    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    if (arg === "--branch") {
      options.branch = process.argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--repo") {
      options.repoUrl = process.argv[index + 1];
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!options.repoUrl) {
    throw new Error("repoUrl is required in config or --repo");
  }
  return options;
};

const runGit = ({ args, cwd }) => {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.status !== 0) {
    const command = `git ${args.join(" ")}`;
    throw new Error(`${command} failed\n${result.stderr || result.stdout}`);
  }

  return result.stdout.trim();
};

const copyDirectoryContents = ({ source, target }) => {
  mkdirSync(target, { recursive: true });
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    const sourcePath = join(source, entry.name);
    const targetPath = join(target, entry.name);
    cpSync(sourcePath, targetPath, { force: true, recursive: true });
  }
};

const copyMappingsToStage = ({ cloneRoot, config, stageRoot }) => {
  for (const mapping of config.sourceMappings) {
    const sourcePath = resolveRelative({ root: cloneRoot, path: mapping.source });
    const targetPath = resolveRelative({ root: stageRoot, path: mapping.target ?? "." });

    if (!existsSync(sourcePath)) {
      throw new Error(`Expected source directory was not found: ${mapping.source}`);
    }
    if (!isPathInside({ root: stageRoot, path: targetPath })) {
      throw new Error(`Refusing to stage outside stage root: ${targetPath}`);
    }

    copyDirectoryContents({ source: sourcePath, target: targetPath });
  }
};

const walkFiles = ({ root }) => {
  const files = [];
  const visit = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const entryPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        visit(entryPath);
      } else if (entry.isFile()) {
        files.push(entryPath);
      }
    }
  };
  visit(root);
  return files.sort((left, right) => left.localeCompare(right));
};

const getByteCount = ({ files }) =>
  files.reduce((total, file) => total + statSync(file).size, 0);

const getHeading = ({ path }) => {
  const content = readFileSync(path, "utf8");
  const heading = content
    .split(/\r?\n/)
    .map((line) => line.match(/^\s*#\s+(.+?)\s*$/)?.[1])
    .find(Boolean);
  return heading ?? path.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, "") ?? "Untitled";
};

const writeSourceMap = ({ commitSha, config, destination, files, options, stageRoot }) => {
  if (!config.sourceMap) {
    return;
  }

  const mapPath = resolveRelative({ root: skillRoot, path: config.sourceMap.path });
  const referencesRoot = dirname(destination);
  const sourceDirectories = config.sourceMappings
    .map((mapping) => `\`${mapping.source}\``)
    .join(", ");
  const localMirror = config.sourceMap.localMirror ?? "references/source-docs/";
  const intro =
    config.sourceMap.intro ??
    "The source docs are copied from upstream with git sparse checkout. Use this map to choose the smallest relevant source file before relying on exact API, command, or configuration details.";

  const lines = [
    `# ${config.sourceMap.title ?? `${config.name} Source Docs Map`}`,
    "",
    `Source repo: \`${options.repoUrl}\``,
    `Source directories: ${sourceDirectories}`,
    `Snapshot commit: \`${commitSha}\``,
    "",
    `Local mirror: \`${localMirror}\``,
    "",
    intro,
    "",
    "## Files",
    "",
  ];

  for (const file of files) {
    const stagedRelative = relative(stageRoot, file);
    const finalPath = resolve(destination, stagedRelative);
    const displayPath = toPosix(relative(referencesRoot, finalPath));
    lines.push(`- \`${displayPath}\` - ${getHeading({ path: file })}`);
  }

  writeTextUnderSkillRoot({ path: mapPath, text: lines.join("\n") });
};

const writeSnapshot = ({ byteCount, commitSha, config, fileCount, options }) => {
  const snapshotPath = resolveRelative({ root: skillRoot, path: config.snapshotPath });
  const sourceSubdirectories = config.sourceMappings.map((mapping) => mapping.source);
  const sourceUrls =
    config.sourceUrls ??
    sourceSubdirectories.map((source) => `${options.repoUrl}/tree/${options.branch}/${source}`);

  const snapshot = {
    repo_url: options.repoUrl,
    source_urls: sourceUrls,
    branch: options.branch,
    source_subdirectories: sourceSubdirectories,
    snapshot_date: new Date().toISOString().slice(0, 10),
    commit_sha: commitSha,
    file_count: fileCount,
    byte_count: byteCount,
    notes: config.notes ?? [],
  };

  writeTextUnderSkillRoot({
    path: snapshotPath,
    text: JSON.stringify(snapshot, null, 2),
  });
};

const updateReadmeSnapshotCommit = ({ commitSha, config }) => {
  if (!config.updateReadmeSnapshotCommit) {
    return;
  }

  const readmePath = join(skillRoot, "README.md");
  const readme = readFileSync(readmePath, "utf8");
  const updated = readme.replace(
    /- Snapshot commit: `[^`]+`/,
    `- Snapshot commit: \`${commitSha}\``,
  );

  if (updated !== readme) {
    writeTextUnderSkillRoot({ path: readmePath, text: updated });
  }
};

const replaceSourceDocs = ({ destination, stageRoot }) => {
  const oldPath = join(dirname(destination), ".source-docs-old");
  removeUnderSkillRoot(oldPath);
  if (existsSync(destination)) {
    renameSync(destination, oldPath);
  }
  renameSync(stageRoot, destination);
  removeUnderSkillRoot(oldPath);
};

const syncSkillRoot = ({ config, stageRoot }) => {
  const targetRoot = resolveRelative({ root: skillRoot, path: config.targetRoot ?? "." });
  const preserve = new Set(config.preserveEntries ?? ["scripts"]);
  const stageName = stageRoot.split(/[\\/]/).pop();

  for (const entry of readdirSync(targetRoot, { withFileTypes: true })) {
    if (preserve.has(entry.name) || entry.name === stageName) {
      continue;
    }
    removeUnderSkillRoot(join(targetRoot, entry.name));
  }

  copyDirectoryContents({ source: stageRoot, target: targetRoot });
  removeUnderSkillRoot(stageRoot);
};

const prepareStageRoot = ({ config }) => {
  if (config.mode === "skill-root") {
    return join(skillRoot, ".source-skill-new");
  }

  const destination = resolveRelative({ root: skillRoot, path: config.docsDestination });
  return join(dirname(destination), ".source-docs-new");
};

const update = () => {
  const config = readConfig();
  const options = parseArgs({ config });
  const cloneRoot = mkdtempSync(join(tmpdir(), `${config.slug ?? "source-docs"}-`));
  const stageRoot = prepareStageRoot({ config });

  try {
    assertUnderSkillRoot(stageRoot);
    removeUnderSkillRoot(stageRoot);
    mkdirSync(stageRoot, { recursive: true });

    runGit({
      args: [
        "clone",
        "--depth",
        "1",
        "--filter=blob:none",
        "--sparse",
        "--branch",
        options.branch,
        options.repoUrl,
        cloneRoot,
      ],
    });
    runGit({
      args: ["sparse-checkout", "set", ...config.sourceMappings.map((mapping) => mapping.source)],
      cwd: cloneRoot,
    });
    const commitSha = runGit({ args: ["rev-parse", "HEAD"], cwd: cloneRoot });

    copyMappingsToStage({ cloneRoot, config, stageRoot });
    const stagedFiles = walkFiles({ root: stageRoot });
    if (stagedFiles.length < 1) {
      throw new Error(`No files were copied from ${options.repoUrl}`);
    }

    const byteCount = getByteCount({ files: stagedFiles });

    if (options.dryRun) {
      console.log(
        `Dry run OK for ${config.name}: ${stagedFiles.length} files, ${byteCount} bytes from ${commitSha}`,
      );
      return;
    }

    if (config.mode === "skill-root") {
      syncSkillRoot({ config, stageRoot });
    } else {
      const destination = resolveRelative({ root: skillRoot, path: config.docsDestination });
      assertUnderSkillRoot(destination);
      writeSourceMap({
        commitSha,
        config,
        destination,
        files: stagedFiles,
        options,
        stageRoot,
      });
      replaceSourceDocs({ destination, stageRoot });
    }

    writeSnapshot({
      byteCount,
      commitSha,
      config,
      fileCount: stagedFiles.length,
      options,
    });
    updateReadmeSnapshotCommit({ commitSha, config });
    console.log(`Updated ${config.name}: ${stagedFiles.length} files from ${commitSha}`);
  } finally {
    rmSync(cloneRoot, { force: true, recursive: true });
    if (existsSync(stageRoot)) {
      removeUnderSkillRoot(stageRoot);
    }
  }
};

update();
