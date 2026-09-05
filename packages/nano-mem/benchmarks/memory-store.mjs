import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { readdir, readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve, relative, dirname, sep } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";
import { evalRoot, runRoot } from "./model-call.mjs";

const compiledRoot = resolve(evalRoot, "compiled-nano-mem");
export const compileMemory = async () => {
  const sourceRoot = resolve("packages/nano-mem/src");
  const entries = await readdir(sourceRoot, { recursive: true, withFileTypes: true });
  const hashes = {};
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".ts") || entry.name.includes(".spec.")) continue;
    const sourcePath = resolve(entry.parentPath, entry.name);
    const name = relative(sourceRoot, sourcePath);
    const source = await readFile(sourcePath, "utf8");
    hashes[name] = createHash("sha256").update(source).digest("hex");
    const target = resolve(compiledRoot, name.replace(/\.ts$/u, ".js"));
    await mkdir(dirname(target), { recursive: true });
    const output = ts.transpileModule(source, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
    });
    await writeFile(target, output.outputText);
  }
  await writeFile(resolve(compiledRoot, "package.json"), '{"type":"module"}');
  return hashes;
};

export const openMemory = async (group, writable = false) => {
  if (!/^[a-zA-Z0-9_-]+$/u.test(group)) throw new Error("Invalid evaluation group");
  const directory = resolve(runRoot, "sqlite", group);
  const root = resolve(runRoot, "sqlite");
  if (!directory.startsWith(`${root}${sep}`))
    throw new Error("Memory path escaped evaluation root");
  await mkdir(directory, { recursive: true });
  const path = resolve(directory, "nano-mem.db");
  const { migrateMemoryDatabase } = await import(
    pathToFileURL(resolve(compiledRoot, "memory/memory-schema.js"))
  );
  const { createMemoryRepository } = await import(
    pathToFileURL(resolve(compiledRoot, "memory/memory-repository.js"))
  );
  const database = new DatabaseSync(path, { readOnly: !writable });
  try {
    if (writable) migrateMemoryDatabase(database);
    else database.exec("PRAGMA busy_timeout = 5000; PRAGMA query_only = ON");
    // 固定运行时钟，避免重复评测时由墙上时间改变生命周期排名；事件日期保留在正文中。
    let pendingContent = "";
    const repository = createMemoryRepository({
      database,
      now: () => new Date("2026-09-05T00:00:00.000Z"),
      createId: () => createHash("sha256").update(`${group}\n${pendingContent}`).digest("hex"),
    });
    const selector = { scope: "project", projectId: group };
    return {
      path,
      repository,
      selector,
      close: () => database.close(),
      add: (content, source) => {
        pendingContent = content;
        return repository.add({ content, source, scope: "project", projectId: group });
      },
      search: (query, limit = 5) =>
        repository
          .search({ query, limit, selector })
          .map(({ id, content, source }) => ({ id, content, source })),
    };
  } catch (error) {
    database.close();
    throw error;
  }
};
