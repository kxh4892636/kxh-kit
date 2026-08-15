// 生产构建的 renderer 部分 (main/preload 由 tsc 完成, 见 package.json build script)。
// 通过 vite JS API 调用: 本仓库的 vite 由 catalog 映射到 vite-plus-core, 没有独立 CLI bin。
import { build } from "vite";

await build();
