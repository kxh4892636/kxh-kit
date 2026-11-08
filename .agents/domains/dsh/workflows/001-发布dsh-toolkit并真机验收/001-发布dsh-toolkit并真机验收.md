---
name: '001-发布dsh-toolkit并真机验收'
description: '改动 packages/dsh-toolkit 后要装进本机宿主时：先 check/test/build，再打包安装到 desktop 与 web profile，重启后做真机验收。'
---

# 001-发布dsh-toolkit并真机验收

## 触发条件

改了 `packages/dsh-toolkit` 的宿主半或客户端半（含 `src/nano-flow` 的提示词、skill 与 check 脚本），要让本机宿主真正用上新行为时。

## 步骤

1. **静态门禁**：`pnpm --filter @kxh4892636/dsh-toolkit check`（即 `vp check`：格式 + lint + 类型）。
2. **单测**：`pnpm --filter @kxh4892636/dsh-toolkit test`（即 `vp test src`）；只改 nano-flow 时可先 `vp test src/nano-flow` 快跑。
3. **构建**：`pnpm --filter @kxh4892636/dsh-toolkit build`（`vp pack` + 复制 nano-flow 资产 + 包客户端半）；产出 `dist/index.mjs`、客户端 bundle 与 `dist/nano-flow/`。
4. **打包**：在 `packages/dsh-toolkit` 执行 `pnpm pack`；`prepack` 会再跑一次 `vp run --no-cache build`。构建必须挂在 `prepack` 而不是 `prepublishOnly`——后者本地打包时不执行，tarball 会带陈旧 `dist`，装进去 `locateAssetsRoot()` 直接抛错。
5. **安装到 profile**：用桌面版自带 CLI，不要用 `PATH` 上的 `dsh`（它认不到 desktop profile）：

   ```powershell
   & "$env:LOCALAPPDATA\Programs\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd" `
     plugin --profile desktop add <absolute path to the packed .tgz>
   ```

   web profile 同样一条，换 `--profile web`。
6. **重启宿主**：bundle 在启动时组合，装完必须重启（或至少新建会话）才生效；重启前宿主仍跑旧版本，别把旧行为当成新版本的证据。
7. **验收**：核对两个 profile 的安装版本（`node_modules/@kxh4892636/dsh-toolkit/package.json`）与 `dist` 资产是否齐全；再针对本次改动做一项真机观察（面板开关、技能目录、提示词注入、`nano_flow_check` 输出等），把版本与观察结果写进 note。

## 已知坑

- 版本不兼容会被 `dsh plugin add` 拦下，按声明下限对齐。
- desktop profile 跑 boot 类命令报独占托管错误时，先确认宿主没在占用该 profile。
- 客户端半必须把 `react` / `react-dom` 与 UI 基座保持为外部依赖，自带一份会拆开 hook 上下文。

## 相关

- [002-PATH上的dsh不能装desktop插件](../../questions/002-PATH上的dsh不能装desktop插件.md) — 同一条安装命令必须用桌面包内 CLI。
- [004-插件被判定incompatible](../../questions/004-插件被判定incompatible.md) — 安装前的版本声明门禁。
- [001-desktop-dump-config报错](../../questions/001-desktop-dump-config报错.md) — 装完跑 boot 类命令前先看宿主占用。
