---
status: in_progress
---

# dsh-toolkit 插件重构

## 问题

现有插件 `@kxh4892636/dsh-nested-skill` 只做一件事（嵌套 skill 发现），无法承载新工具，也没有任何界面入口。需要把它重构为可承载多工具的 `@kxh4892636/dsh-toolkit`：一个侧边栏 `toolkit` 面板逐项开关工具，嵌套 skill 发现成为其中一个工具，并新增「撤回」工具——在会话 composer 工具栏、模型选择器左侧，确认后撤销正在执行或已经完成的一轮会话。见 story 的 US-001~US-004。

关键约束（取证见 note 01）：宿主的会话日志是**仅追加**的事件源记录，**没有删除/截断事件与会话的 API**，存活会话优先于磁盘；唯一受支持的截断历史手段是 `session/fork`（复制 `atSeq` 闭区间前缀为新会话）。因此「撤回」采用「fork 到上一轮结束 + 回填本轮输入 + 删除原会话」的组合。

## 方案

一个 npm 包、两个半：

1. **宿主半（`src/index.ts`，cordis 插件）**
   - 工具注册表 `ToolkitTool { id, title, description, defaultEnabled, apply(ctx): Disposer }`；插件启用时按持久状态逐个 apply，状态变化时 dispose/apply。
   - 状态文件 `$DSH_HOME/toolkit/state.json`：`{ version: 1, tools: { [id]: boolean } }`；读失败或字段缺失按 `defaultEnabled` 回落；写入走临时文件 + rename。
   - 宿主 HTTP 路由：`GET api/toolkit/state`（工具清单 + 开关）、`POST api/toolkit/state`（`{ id, enabled }`）、`POST api/toolkit/undo-turn`（`{ sessionId }` → `{ childSessionId, prompt }`）。
   - 工具一 `nested-skill`：迁移现有 provider，默认启用。
   - 工具二 `undo-turn`：宿主执行撤销（算切点 → fork → 归档 → detach → 排队删除原会话目录）。
   - 启动时执行待删除队列（会话未存活则立即删除，存活则推迟到下次启动）。
2. **客户端半（`src/client/*` → `dist/client.js`）**
   - root 作用域 `sidebar.panellist` 注册 `toolkit` 图标行 + `main` 注册同 key 面板；面板列出工具与开关，读写宿主路由。
   - session 作用域 `conversation.input.right` 注册「撤回」按钮（紧贴模型选择左侧）；点击用 `@deepseek-ai/dsh-client-ui-primitives` 的 `Modal` 确认，确认后调宿主路由、`uiWorkspace.openSession(child)`、`conversation.input.requestDraftInitialization` 回填原文。
3. **打包**：`vp pack` 出 `dist/main.mjs`；`vp pack --config vite.client.config.ts` 出 CJS 客户端 bundle，再由 `scripts/wrap-client.mjs` 包成 `window.__ModuleLoader__.load({ id, factory })` 写 `dist/client.js`。

## 已排除的备选

- **保持单包单工具**：需求即「一组工具的集合」。
- **开关状态放 localStorage**：`nested-skill` 开关必须真正卸载宿主 provider，localStorage 驱动不了宿主。
- **用上游插件管理器做开关**：需跨包调用 `pluginManager` remote 并把一个包拆成多个 loader entry，耦合更深。
- **原地截断会话日志**（用户初选项）：进程内不可行——无删除/截断 API；存活会话遮蔽磁盘（`dsh-api-session-controller/lib/index.js:1088-1093`、`dsh-session-query/lib/index.js:120-132`）；截断后存活会话续写会产生读取端拒绝的 seq gap（`dsh-session-format-v1-to-v2/lib/index.js:243-244`）；zstd 帧内切会把切帧内完整记录重新落盘（`dsh-session-persistence-jsonl/lib/index.js:3011-3038`）。
- **只做 `surface replace`**：replacement 只遮蔽模型可见面，人工 transcript 仍显示（`dsh-session/lib/types/surface.js:39-51`）。
- **启动时离线截断（C2）**：真·同 id 但必须重启宿主才生效，用户选择不做。

## 实施决策

- **包与目录**：`packages/dsh-nested-skill` → `packages/dsh-toolkit`；包名 `@kxh4892636/dsh-toolkit`；版本 `0.2.0`；旧包删除（registry 404，从未发布）。
- **入口命名**：`toolkit`（非字面 `{toolkit}`）。
- **状态与开关**：宿主持久化 + HTTP 路由；未知 id 忽略，缺失 id 用默认值。
- **撤回语义**：目标轮 = 运行中的本轮，否则最近一轮；切点 `cut = 目标轮 turn/start 的 seq - 1`；`cut < 0`（目标是首轮）→ 按钮置灰。执行顺序：算切点与原文 → `sessionController.fork({ sessionId, atSeq: cut })`（不增标题）→ 归档原会话（`stopActivity: true`）→ `WorkspaceRecord.detachSession` → 排队删除 `~/.dsh/sessions/<slug>/<sessionId>/`（存活时推迟到下次启动）→ 客户端打开子会话并回填草稿。
- **回填**：只回填该轮 `user/message` 的文本拼接；图片/文件附件不回填。
- **副作用**：不回滚已执行命令与已写文件。

## 工作环境

- 仓库：`C:\Users\kxh\kxh-awesome\projects\kxh-kit`（`main`，直接在主分支做，不建 worktree）。
- 宿主：Desktop `0.2.1-rc.5`；插件用 `<install>\resources\runtime\cli\bin\dsh.cmd plugin --profile desktop add|remove`。
- 宿主包证据：`<install>\resources\app\dsh\node_modules\@deepseek-ai\*`（仅 JS）；profile `~/.dsh/profiles/desktop`。
- 构建/测试：`pnpm --filter @kxh4892636/dsh-toolkit test|check|build`。
- GUI：`http://127.0.0.1:58683`（重启宿主生效）。

## 范围

包改名与 manifest、宿主工具注册表/状态/路由、客户端 bundle 与 toolkit 面板、嵌套 skill 工具化、撤回工具（按钮 + 确认 + 宿主执行 + 草稿回填 + 原会话删除）、测试、README、打包安装与真机验证。

## 非范围

- 不修改 DSH 上游与宿主安装目录。
- 不回滚工具副作用，不恢复附件。
- 不做「启动时离线截断」（C2）。
- 不做 npm 发布。

## 执行约束

- 模式 `manual`：实现完成后在 `/delivery` 的 dev gate 等用户确认。
- 门禁：`vp test src`、`vp check`、`vp pack` + 客户端 wrap、`npm pack` 无 `catalog:`、桌面宿主真机验收。
- 覆盖率：本包 `vite.config.ts` 阈值 80。
- 完成后在主分支提交。

## 待定

- 无（Q1~Q6 已收敛，见 [01-拷问与方案定案.md](01-拷问与方案定案.md)）。

## 上下文

- story：[story.md](story.md)
- 取证：[01-拷问与方案定案.md](01-拷问与方案定案.md)
- 历史 Plan：[2026-10-27 装进 desktop 宿主](../reference/2026-10-27-dsh插件装进desktop宿主/spec.md)、[2026-08-31 嵌套skill发现插件](../reference/2026-08-31-dsh嵌套skill发现插件/spec.md)

## 当前进度

（2026-11-04）

- note 01（拷问与方案定案）：completed。
- note 02（包重命名与工具注册表）：completed —— `packages/dsh-toolkit`，宿主半 + 状态 + 路由 + 两个工具。
- note 03（客户端 bundle 与 toolkit 面板）：completed —— `dist/client.js` 模块载体、面板、共享 store。
- note 04（撤回工具）：completed —— 切点/fork/归档/detach/删除队列 + composer 按钮与确认弹窗。
- note 05（打包安装与真机验证）：in_progress —— tgz 已装进 desktop profile，旧包已移除；真实 cordis 冒烟通过；**GUI 验收待宿主重启**。
- 门禁：`vp test src` 123 passed；覆盖率 90.92 / 80.88 / 96.32 / 95.83（阈值 80）；`vp check` 0 error 0 warning；`vp pack` 双产物；`npm pack` 生产依赖无 `catalog:`。
- commit：`543003fb feat(dsh): dsh-nested-skill 重构为 dsh-toolkit 工具集`。

## 恢复入口

1. 读 [05-打包安装与真机验证.md](05-打包安装与真机验证.md) 的「执行检查点」与 README 的「验证」四步。
2. 核对现场：`git status`；`~/.dsh/profiles/desktop/package.json` 的 `dsh.profile.bundles`；
   `GET http://127.0.0.1:58683/plugins/@kxh4892636/dsh-toolkit/client.js`（重启后应为 200/401 而不是 404）。
3. 下一步：重启 DSH → 侧边栏出现 `toolkit` → 打开面板验证两个开关 → 发一条消息后点「撤回」验证回填与删除；
   结果写回 note 05，然后把 Plan 迁入 `reference`。
4. 停止条件：GUI 四项验收通过即收尾；任何一项失败按 note 04 的「决策与证据」定位（切点、归档、回填三条链路）。

## Notes

| #   | Notes                                                            | 状态        | 阻塞于     | 下一步                       |
| --- | ---------------------------------------------------------------- | ----------- | ---------- | ---------------------------- |
| 01  | [拷问与方案定案](01-拷问与方案定案.md)                           | completed   | —          | —                            |
| 02  | [包重命名与工具注册表](02-包重命名与工具注册表.md)               | completed   | 01         | —                            |
| 03  | [客户端 bundle 与 toolkit 面板](03-客户端bundle与toolkit面板.md) | completed   | 01         | —                            |
| 04  | [撤回工具](04-撤回工具.md)                                       | completed   | 01, 02, 03 | —                            |
| 05  | [打包、安装与真机验证](05-打包安装与真机验证.md)                 | in_progress | 02, 03, 04 | 重启宿主后走 README 验证四步 |
