import { appendFileSync, existsSync, renameSync, rmSync, statSync } from "node:fs";
export const LOG_LIMIT = 5 * 1024 * 1024;
// 同一 supervisor 内同步追加，避免 stdout/stderr 交错轮转破坏文件上限。
export const appendLog = (path: string, data: string | Buffer, limit: number = LOG_LIMIT): void => {
  let buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
  while (buffer.length > 0) {
    let size = existsSync(path) ? statSync(path).size : 0;
    if (size >= limit) {
      rmSync(path + ".2", { force: true });
      if (existsSync(path + ".1")) renameSync(path + ".1", path + ".2");
      if (existsSync(path)) renameSync(path, path + ".1");
      size = 0;
    }
    const length = Math.min(limit - size, buffer.length);
    appendFileSync(path, buffer.subarray(0, length));
    buffer = buffer.subarray(length);
  }
};
