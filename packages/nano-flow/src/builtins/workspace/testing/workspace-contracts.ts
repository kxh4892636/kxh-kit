import commandContracts from "./workspace-command-contracts.json";
import repositoryContracts from "./workspace-repository-contracts.json";
import worktreeContracts from "./workspace-worktree-contracts.json";

// 保存可读的规范化输出；变更必须核对业务断言和差异，不能追加机器专属摘要。
const contracts: Readonly<Record<string, ReadonlySet<string>>> = Object.fromEntries(
  Object.entries({
    command: commandContracts,
    repository: repositoryContracts,
    worktree: worktreeContracts,
  }).map(([kind, entries]): [string, ReadonlySet<string>] => [
    kind,
    new Set(entries.map((entry): string => JSON.stringify(entry))),
  ]),
);

const normalizePaths = (value: unknown, cwd: string): unknown => {
  if (Array.isArray(value)) return value.map((item: unknown): unknown => normalizePaths(item, cwd));
  if (value !== null && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]): [string, unknown] => [
        key,
        normalizePaths(item, cwd),
      ]),
    );
  if (typeof value !== "string") return value;
  // CLI 的 stdout/stderr 可能再次封装 JSON；先解码再替换，避免依赖反斜线转义层数。
  try {
    const parsed: unknown = JSON.parse(value);
    if (parsed !== null && typeof parsed === "object")
      return JSON.stringify(normalizePaths(parsed, cwd)) + (value.match(/\s*$/u)?.[0] ?? "");
  } catch {
    // 普通文本输出仍按文本比较，不能因为不是 JSON 而丢失契约。
  }
  return value
    .replaceAll(cwd, "<CWD>")
    .replaceAll(/file:\/\/\/[^"'\r\n]*?\/(?=nf-workspace-)/gu, "file:///<TMP>/")
    .replaceAll(/<CWD>[^\r\n"']*/gu, (match: string): string => match.replaceAll("\\", "/"));
};

export const normalizeWorkspaceContract = (value: unknown, cwd: string): string =>
  JSON.stringify(normalizePaths(value, cwd))
    .replaceAll(JSON.stringify(cwd).slice(1, -1), "<CWD>")
    .replaceAll(cwd, "<CWD>")
    .replaceAll(/(nf-workspace-[a-z-]+-)[A-Za-z0-9]{6}/gu, "$1<RAND>")
    .replaceAll(/\b[0-9a-f]{40}\b/gu, "<GIT_SHA>")
    .replaceAll(/worktree\/[a-z0-9-]+-\d{14}/gu, "worktree/<TIMESTAMP>")
    .replaceAll(/after \d+ ms/gu, "after <MS> ms");

export const verifyWorkspaceContract = (kind: string, value: unknown, cwd: string): void => {
  const payload = normalizeWorkspaceContract(value, cwd);
  if (!contracts[kind]?.has(payload))
    throw new Error(`Workspace contract changed (${kind}): ${payload}`);
};
