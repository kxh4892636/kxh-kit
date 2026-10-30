#!/usr/bin/env node
/**
 * Build the client half of the plugin.
 *
 * The web client loads plugins as `window.__ModuleLoader__.load({ id, factory })`
 * modules, where `factory` receives a `require` that resolves the shell's own
 * modules. We therefore emit CommonJS and wrap it: the wrapper's `require` is
 * passed straight through, so `react` resolves to the shell's single instance
 * (a second React copy would break hooks).
 */
import { build } from "esbuild";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const PKG = "@kxh4892636/dsh-infinite-story";
const outDir = path.resolve("dist");
await mkdir(outDir, { recursive: true });

const result = await build({
  entryPoints: ["src/client.ts"],
  bundle: true,
  write: false,
  format: "cjs",
  platform: "browser",
  target: "es2022",
  jsx: "transform",
  external: ["react", "react-dom", "react/jsx-runtime", "@deepseek-ai/*"],
  logLevel: "warning",
});

const code = result.outputFiles[0]?.text ?? "";
const wrapped = `window.__ModuleLoader__.load({
  id: ${JSON.stringify(PKG)},
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
${code}
    return module.exports;
  },
});
`;

await writeFile(path.join(outDir, "client.js"), wrapped, "utf8");
console.log(`dist/client.js  ${(wrapped.length / 1024).toFixed(1)} kB`);
