import type { FsEntry, HostFs } from "./boundary.js";

/** 以 `path -> content` map 支撑的内存 HostFs；目录隐式存在。 */
export const memoryFs = (files: Record<string, string>): HostFs => {
  const normalized = new Map<string, string>();
  for (const [path, content] of Object.entries(files)) {
    normalized.set(toPosix(path), content);
  }
  return {
    async listDir(path) {
      const prefix = toPosix(path).replace(/\/+$/, "");
      const children = new Map<string, "file" | "directory">();
      for (const entryPath of normalized.keys()) {
        if (!entryPath.startsWith(`${prefix}/`)) continue;
        const rest = entryPath.slice(prefix.length + 1);
        const [head] = rest.split("/");
        if (head === undefined || head.length === 0) continue;
        const isFile = rest.indexOf("/") < 0;
        const kind = isFile ? "file" : "directory";
        const existing = children.get(head);
        if (existing === undefined || (existing === "directory" && kind === "file")) {
          children.set(head, kind);
        }
      }
      return [...children.entries()].map(([name, kind]) => ({
        name,
        kind,
        path: joinDisplay(prefix, name),
      })) satisfies FsEntry[];
    },
    async readText(path) {
      return normalized.get(toPosix(path));
    },
    async exists(path) {
      const posixPath = toPosix(path);
      if (normalized.has(posixPath)) return true;
      const prefix = posixPath.replace(/\/+$/, "");
      for (const entryPath of normalized.keys()) {
        if (entryPath.startsWith(`${prefix}/`)) return true;
      }
      return false;
    },
  };
};

const toPosix = (path: string): string => {
  return path.replaceAll("\\", "/");
};

const joinDisplay = (base: string, name: string): string => {
  return `${base.replace(/\/+$/, "")}/${name}`;
};

/** 冲刷微任务队列再加一个宏任务轮次（等待排队的失效回调）。 */
export const flushTurns = (): Promise<void> => {
  return new Promise((resolve) => {
    setImmediate(resolve);
  });
};
