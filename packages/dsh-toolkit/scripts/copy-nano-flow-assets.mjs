// 把 src/nano-flow 里按能力分目录的资产映射成 dist/nano-flow 的发布布局。
// 源码按领域分（session / documents / dream / skills），发布包的
// prompts / templates / skills / scripts 是稳定的运行时契约。
import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "src", "nano-flow");
const target = join(root, "dist", "nano-flow");
const entries = [
  { from: "session/prompts", to: "prompts" },
  { from: "dream/prompt.md", to: "prompts/dream.md" },
  { from: "documents/templates", to: "templates" },
  { from: "skills", to: "skills" },
  { from: "documents/check-domain.mjs", to: "scripts/check-domain.mjs" },
  { from: "documents/lib", to: "scripts/lib" },
  { from: "dream/scan.mjs", to: "scripts/dream-scan.mjs" },
];

await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
for (const entry of entries) {
  await cp(join(source, entry.from), join(target, entry.to), {
    recursive: true,
    filter: (file) => !file.endsWith(".d.mts"),
  });
}
console.log(`copy-nano-flow-assets: wrote ${target}`);
