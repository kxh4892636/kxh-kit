---
id: ff09f4bf-d300-452f-b902-3e80aca8bdb8
---

# electron-vite 构建模型

## 工具定位

- `electron-vite`: 为 Electron main、preload、renderer 提供统一 Vite 配置和命令;
- 它解决: TypeScript 转换、依赖处理、dev server、HMR/hot reload 与生产 bundle;
- 它不解决: 安装器、签名、公证、平台图标和发布;
- 打包工具: Lithe 使用 electron-builder 处理分发;

## 三个构建目标

| target   | 运行环境                | 源入口                    | 产物                   |
| -------- | ----------------------- | ------------------------- | ---------------------- |
| main     | Node.js + Electron main | `src/main/index.ts`       | `out/main/index.js`    |
| preload  | sandboxed preload       | `src/preload/index.ts`    | `out/preload/index.js` |
| renderer | Chromium browser        | `src/renderer/index.html` | `out/renderer/**`      |

- 双环境约束: main 可以使用 `node:` 模块，renderer 不能假设 Node.js 存在;
- preload 约束: 既需要 Electron bridge，又要满足 sandbox 和 context isolation;
- TypeScript: Node 与 Web 使用不同 tsconfig，避免环境类型相互污染;

## 配置结构

```ts
export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    resolve: { alias: { "@": resolve("src/renderer/src") } },
    plugins: [react(), tailwindcss()],
  },
});
```

- renderer-only plugin: React Compiler 和 Tailwind 只作用于 Web UI;
- alias: `@` 只指向 renderer 源码，不应用于 main/shared 的跨层捷径;
- 默认输出: electron-vite 将三个 target 放入 `out/`;
- package entry: `package.json#main` 必须指向构建后的 main 文件;

## 开发模式

```powershell
pnpm run dev
```

- renderer: 启动 Vite dev server，提供 HMR;
- main/preload: 变更后重新构建并重新加载 Electron;
- 加载方式: main 读取 `ELECTRON_RENDERER_URL` 并调用 `loadURL()`;
- 风险: dev 能运行不代表生产本地文件路径与资源路径正确;

## 生产构建与 preview

```powershell
pnpm run build
pnpm run start
```

- build: 先运行 Node/Web typecheck，再生成三个 target;
- renderer: Vite 生成 HTML、JS、CSS 和字体资产;
- preview: 使用现有生产 build 启动 Electron，不生成安装器;
- 输出: `out/` 是可再生成产物，被 Git 忽略;

## 构建与打包的边界

```text
src/**
  -> electron-vite build
out/main + out/preload + out/renderer
  -> electron-builder
dist/安装器 + dist/win-unpacked
```

- `out`: 可执行代码的中间产物;
- `dist`: 面向用户或发布系统的分发产物;
- `drizzle`: 不经 Vite 打包，作为额外只读资源复制;
- preview 仍从仓库运行，不能证明安装资源布局正确;

## 官方资料

- [electron-vite Getting Started](https://electron-vite.org/guide/): 三 target、CLI 和默认入口;
- [Building for Production](https://electron-vite.org/guide/build): 默认 `out` 结构;
