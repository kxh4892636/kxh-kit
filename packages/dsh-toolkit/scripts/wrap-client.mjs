import { readFile, readdir, rm, writeFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * 把 `vp pack` 产出的 CJS 包体包成宿主模块载体：
 * `window.__ModuleLoader__.load({ id, factory: (require) => { ... } })`。
 * 形态对齐官方 `ui-*` bundle 与第三方 dsh-notify-me 的做法（`lib/client.js` 首行）。
 */
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const bundleDirectory = join(root, "dist", "client");
const target = join(root, "dist", "client.js");

const entries = (await readdir(bundleDirectory)).filter((name) => name.endsWith(".cjs"));
if (entries.length !== 1) {
  throw new Error(
    `wrap-client: expected exactly one .cjs bundle, found ${entries.join(", ") || "none"}`,
  );
}
const source = await readFile(join(bundleDirectory, entries[0]), "utf8");
assertSelfContained(source);

const banner = [
  `// ${manifest.name} — browser half, wrapped for the DSH client module loader.`,
  "window.__ModuleLoader__.load({",
  `  id: ${JSON.stringify(manifest.name)},`,
  "  factory: (require) => {",
  "    var module = { exports: {} };",
  "    var exports = module.exports;",
  "",
].join("\n");
const footer = ["", "    return module.exports;", "  },", "});", ""].join("\n");
const wrapped = `${banner}${source}${footer}`;

verifyModuleShape(wrapped, manifest.name);
await writeFile(target, wrapped, "utf8");
await rm(bundleDirectory, { recursive: true, force: true });
console.log(`wrap-client: wrote ${target} (${wrapped.length} bytes)`);

/**
 * 载体契约要求包体自包含：只能 require 平台模块表里的裸说明符，
 * 任何相对 require 都意味着打包没合进去，装到宿主里会 404。
 */
function assertSelfContained(code) {
  const relative = [...code.matchAll(/require\(\s*["'](\.{1,2}\/[^"']+)["']\s*\)/gu)];
  if (relative.length > 0) {
    throw new Error(
      `wrap-client: bundle still requires relative modules: ${relative.map((match) => match[1]).join(", ")}`,
    );
  }
}

/**
 * 用假 `window` 与假模块表执行一次包体，确认它注册了正确的 id
 * 并导出 `inject` / `apply` —— 这正是宿主加载时的最小契约。
 */
function verifyModuleShape(code, expectedId) {
  const loaded = [];
  const fakeWindow = { __ModuleLoader__: { load: (definition) => loaded.push(definition) } };
  runInNewContext(code, { window: fakeWindow });
  const [definition] = loaded;
  if (definition === undefined) throw new Error("wrap-client: bundle registered no module");
  if (definition.id !== expectedId) {
    throw new Error(`wrap-client: module id ${definition.id} != ${expectedId}`);
  }
  // 只验证模块形状，不渲染：平台模块用空对象顶替。
  const exported = definition.factory(() => ({}));
  if (typeof exported.apply !== "function" || !Array.isArray(exported.inject)) {
    throw new Error("wrap-client: factory did not export inject/apply");
  }
}
