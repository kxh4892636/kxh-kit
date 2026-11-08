// 把 src/nano-flow 里的资产（提示词、skill、校验脚本、哈希锁）复制到 dist/nano-flow，
// 让发布包只带 dist 一份；源与代码同目录，避免包根再开一个 nano-flow/。
import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "src", "nano-flow");
const target = join(root, "dist", "nano-flow");
const entries = ["prompts", "templates", "skills", "scripts"];

await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
for (const entry of entries) {
  await cp(join(source, entry), join(target, entry), {
    recursive: true,
    filter: (file) => !file.endsWith(".d.mts"),
  });
}
console.log(`copy-nano-flow-assets: wrote ${target}`);
