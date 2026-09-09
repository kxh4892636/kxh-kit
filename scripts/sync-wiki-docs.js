import { cp, rm, stat } from "node:fs/promises";
import { isAbsolute, parse, resolve } from "node:path";

const origin = "C:/Users/kxh/kxh-awesome/projects/kxh-kit/apps/wiki/docs";
const target = "C:/Users/kxh/kxh-awesome/kxh/10-wiki/doc";

try {
  if (!isAbsolute(origin) || !isAbsolute(target)) {
    throw new Error("origin 和 target 必须使用绝对路径");
  }

  const targetPath = resolve(target);
  if (targetPath === parse(targetPath).root) {
    throw new Error("target 不能是磁盘根目录");
  }

  // 确认源目录可用后再删除目标，避免源路径错误导致数据丢失。
  if (!(await stat(origin)).isDirectory()) {
    throw new Error(`源路径不是目录：${origin}`);
  }

  await rm(targetPath, { recursive: true, force: true });
  await cp(origin, targetPath, { recursive: true });
  console.log(`同步完成：${origin} -> ${targetPath}`);
} catch (error) {
  console.error("同步失败：", error);
  process.exitCode = 1;
}
