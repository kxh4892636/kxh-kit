import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { randomUUID } from "node:crypto";

export const fail = (message) => {
  throw new Error(message);
};

export const planKey = (workspace, input) => {
  const relative = path.relative(workspace, path.resolve(workspace, input)).replaceAll("\\", "/");
  if (relative === ".." || relative.startsWith("../") || path.isAbsolute(relative)) {
    fail("--plan 必须位于工作区内");
  }
  return relative || ".";
};

export const canonicalPlanKey = async (workspace, input) => {
  let existing = path.resolve(workspace, input);
  const missing = [];
  for (;;) {
    try {
      const real = await fs.realpath(existing);
      const key = planKey(workspace, path.join(real, ...missing));
      return process.platform === "win32" ? key.toLowerCase() : key;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      missing.unshift(path.basename(existing));
      existing = path.dirname(existing);
    }
  }
};

const readText = async (file) => {
  try {
    return await fs.readFile(file, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
};

const safePath = async (workspace, relative) => {
  const file = path.resolve(workspace, relative);
  planKey(workspace, file);
  let existing = file;
  for (;;) {
    try {
      planKey(workspace, await fs.realpath(existing));
      return file;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      existing = path.dirname(existing);
    }
  }
};

const atomicWrite = async (file, content) => {
  const temporary = `${file}.${randomUUID()}.tmp`;
  let handle;
  try {
    handle = await fs.open(temporary, "wx");
    await handle.writeFile(content, "utf8");
    await handle.sync();
    await handle.close();
    handle = null;
    await fs.rename(temporary, file);
  } finally {
    if (handle) await handle.close();
    await fs.unlink(temporary).catch((error) => {
      if (error.code !== "ENOENT") throw error;
    });
  }
};

const parseJson = (content, name) => {
  try {
    return JSON.parse(content);
  } catch {
    fail(`${name} 不是有效 JSON`);
  }
};

const removeOwnFile = async (file) => {
  await fs.unlink(file).catch((error) => {
    if (error.code !== "ENOENT") throw error;
  });
};

const contenders = async (directory) => {
  const result = [];
  for (const name of await fs.readdir(directory)) {
    const match = name.match(/^(\d+)-[0-9a-f-]+\.lock$/);
    if (!match) continue;
    const file = path.join(directory, name);
    try {
      process.kill(Number(match[1]), 0);
    } catch (error) {
      if (error.code === "ESRCH") {
        await removeOwnFile(file);
        continue;
      }
      if (error.code !== "EPERM") throw error;
    }
    const content = await readText(file);
    if (content === null) continue;
    const ticket = Number(content);
    if (!Number.isSafeInteger(ticket) || ticket < 0) fail("Flow 写锁记录无效");
    result.push({ name, ticket });
  }
  return result;
};

// Bakery 排队：每次调用只拥有自己的唯一文件，回收死进程不会误删新持有者的锁。
const lock = async (directory) => {
  await fs.mkdir(directory, { recursive: true });
  const name = `${process.pid}-${randomUUID()}.lock`;
  const file = path.join(directory, name);
  try {
    await fs.writeFile(file, "0", { flag: "wx" });
    const ticket = Math.max(0, ...(await contenders(directory)).map((item) => item.ticket)) + 1;
    if (!Number.isSafeInteger(ticket)) fail("Flow 写锁序号超出范围");
    await atomicWrite(file, String(ticket));
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const waiting = (await contenders(directory)).some(
        (item) =>
          item.name !== name &&
          (item.ticket === 0 ||
            item.ticket < ticket ||
            (item.ticket === ticket && item.name < name)),
      );
      if (!waiting) return () => removeOwnFile(file);
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    fail("等待 Flow 写锁超时");
  } catch (error) {
    await removeOwnFile(file);
    throw error;
  }
};

const recover = async (workspace, journalFile, readonly) => {
  const raw = await readText(journalFile);
  if (raw === null) return;
  if (readonly) fail("存在未完成写入，请先 acquire 恢复");
  const journal = parseJson(raw, "Flow 写入记录");
  if (!Array.isArray(journal) || journal.length === 0) fail("Flow 写入记录无效");
  const pending = [];
  for (const entry of journal) {
    if (
      !entry ||
      typeof entry.path !== "string" ||
      typeof entry.after !== "string" ||
      (entry.before !== null && typeof entry.before !== "string")
    )
      fail("Flow 写入记录无效");
    const file = await safePath(workspace, entry.path);
    if (
      file === journalFile ||
      planKey(workspace, file).startsWith(".flow/locks") ||
      planKey(workspace, file) === ".flow/state.lock"
    )
      fail("Flow 写入目标无效");
    const current = await readText(file);
    if (current !== entry.before && current !== entry.after) {
      fail(`恢复冲突: ${entry.path} 已被外部修改；保留 pending.json 并先核对文件`);
    }
    if (current !== entry.after) pending.push({ file, before: entry.before, content: entry.after });
  }
  for (const entry of pending) {
    // 外部编辑不参与 Flow 锁；每次替换前重新检查，缩短检查与写入之间的窗口。
    const current = await readText(entry.file);
    if (current === entry.content) continue;
    if (current !== entry.before) fail(`恢复冲突: ${entry.file} 已被外部修改`);
    await atomicWrite(entry.file, entry.content);
  }
  await fs.unlink(journalFile);
};

// 先计算全部最终内容，再持久化写入意图；中断后只补写未完成且未被外部编辑的文件。
export const withFlowStore = async (workspace, readonly, action) => {
  const directory = await safePath(workspace, ".flow");
  await fs.mkdir(directory, { recursive: true });
  const lockDirectory = await safePath(workspace, ".flow/locks");
  const journalFile = await safePath(workspace, ".flow/pending.json");
  const unlock = await lock(lockDirectory);
  try {
    await recover(workspace, journalFile, readonly);
    const snapshots = new Map();
    const writes = new Map();
    const read = async (relative) => {
      if (!snapshots.has(relative))
        snapshots.set(relative, await readText(await safePath(workspace, relative)));
      return snapshots.get(relative);
    };
    const stage = async (relative, after) => {
      const before = await read(relative);
      if (before !== after) writes.set(relative, { path: relative, before, after });
    };
    const stateText = await read(".flow/state.json");
    const state =
      stateText === null ? { schema_version: 7, plans: {} } : parseJson(stateText, "Flow 状态");
    const output = await action({ state, read, stage });
    if (!readonly) {
      await stage(".flow/state.json", `${JSON.stringify(state, null, 2)}\n`);
      if (writes.size) {
        await atomicWrite(journalFile, `${JSON.stringify([...writes.values()])}\n`);
        await recover(workspace, journalFile, false);
      }
    }
    return output;
  } finally {
    await unlock();
  }
};
