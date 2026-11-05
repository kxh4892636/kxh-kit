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
   - 状态文件 `$DSH_HOME/toolkit/state.json`：`{ version: 1, tools, pendingDeletes, pendingUnarchives }`；读失败或字段缺失按 `defaultEnabled` 回落；写入走临时文件 + rename。
   - 宿主 HTTP 路由：`GET api/toolkit/state`（工具清单 + 开关）、`POST api/toolkit/state`（`{ id, enabled }`）、`GET/POST api/toolkit/undo-turn`（可用性探测 / `{ sessionId }` → `{ childSessionId, prompt }`）。
   - 工具一 `nested-skill`：迁移现有 provider，**默认关闭**（三个工具都默认关闭，见 [07](07-撤回语义收敛与彻底删除.md)）。
   - 工具二 `undo-turn`：宿主执行撤销（算切点 → fork → 归档 → 接管置顶与记账序 → 摘记账 → 删日志 → 撤销归档）。
   - 工具三 `office-skills`：屏蔽宿主内置 office 技能；默认关闭，开启时在 `ctx.skills` 读取面（`list` / `snapshot` / `get`）过滤，见 [06](06-屏蔽自带office技能.md)。
   - 启动时执行两条队列（`pendingDeletes` 删日志、`pendingUnarchives` 摘归档 id），并清扫「归档集合里既无日志、也不存活」的历史占位。
2. **客户端半（`src/client/*` → `dist/client.js`）**
   - root 作用域 `sidebar.panellist` 注册 `toolkit` 图标行 + `main` 注册同 key 面板；面板列出工具与开关，读写宿主路由。
   - session 作用域 `conversation.input.right` 注册「撤回」按钮（紧贴模型选择左侧，与「权限选择」同度量）；点击用 `ui-primitives` 的 `Modal` + `Button` 确认，确认后调宿主路由、`uiWorkspace.openSession(child)`，再由**新会话自己的按钮**用 `inputActions.setDraft` 回填原文（`requestDraftInitialization` 兜底）。
3. **打包**：`vp pack` 的两份 pack 配置分别产出宿主 ESM（`dist/index.mjs`）与客户端 CJS，再由 `scripts/wrap-client.mjs` 包成 `window.__ModuleLoader__.load({ id, factory })` 写 `dist/client.js`（外部依赖只有 `react`/`react-dom`/`ui-primitives`）。

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
- **撤回语义**：目标轮 = 运行中的本轮，否则最近一轮；切点 = 目标轮 `turn/start` 之前最近的**非 inbox 记账**事件（排队提示词会先写 `agent/inbox/spliced`，跳过它才不会被 fork 带进子会话）；没有可回退事件（目标是首轮）→ 按钮置灰。执行顺序：算切点与原文 → `sessionController.fork({ sessionId, atSeq: cut })`（不增标题）→ 归档原会话（`stopActivity: true`）→ `insertSessionBefore(child, 原后继)` 接管记账序 → 置顶集合里顶替原会话的序号 → `detachSession(原)` → 删日志 `~/.dsh/sessions/<slug>/<sessionId>/` → `unarchiveSession(原)`。会话仍存活时，删日志与撤销归档都排队到下次启动（`pendingDeletes` / `pendingUnarchives`）；启动清扫无会话的归档 id。
- **回填**：只回填该轮 `user/message` 的文本拼接（跳过 `runtime-context` 等注入消息）；图片/文件附件不回填。回填走「新会话自己的按钮 + `inputActions.setDraft` + `persistDraft`」，1.5s 未消费则服务面兜底。
- **默认状态**：三个工具都 `defaultEnabled: false`。
- **样式**：一份带 `data-plugin-css` 的 token 样式表 + 宿主 `ui-primitives`（`Switch`/`Modal`/`Button`），图标 `stroke-width: 1`。
- **副作用**：不回滚已执行命令与已写文件。

## 工作环境

- 仓库：`C:\Users\kxh\kxh-awesome\projects\kxh-kit`（`main`，直接在主分支做，不建 worktree）。
- 宿主：Desktop `0.2.1-rc.5`；插件用 `<install>\resources\runtime\cli\bin\dsh.cmd plugin --profile desktop add|remove`。
- 宿主包证据：`<install>\resources\app\dsh\node_modules\@deepseek-ai\*`（仅 JS）；profile `~/.dsh/profiles/desktop`。
- 构建/测试：`pnpm --filter @kxh4892636/dsh-toolkit test|check|build`。
- GUI：`http://127.0.0.1:58683`（重启宿主生效）。

## 范围

包改名与 manifest、宿主工具注册表/状态/路由、客户端 bundle 与 toolkit 面板、嵌套 skill 工具化、撤回工具（按钮 + 确认 + 宿主执行 + 草稿回填 + 原会话删除）、office 技能屏蔽、测试、README、打包安装与真机验证。

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
- 历史 Plan：[2026-10-27 装进 desktop 宿主](../2026-10-27-dsh插件装进desktop宿主/spec.md)、[2026-08-31 嵌套skill发现插件](../2026-08-31-dsh嵌套skill发现插件/spec.md)

## 当前进度

（2026-11-04）

- note 01（拷问与方案定案）：completed。
- note 02（包重命名与工具注册表）：completed —— `packages/dsh-toolkit`，宿主半 + 状态 + 路由 + 两个工具。
- note 03（客户端 bundle 与 toolkit 面板）：completed —— `dist/client.js` 模块载体、面板、共享 store。
- note 04（撤回工具）：completed —— 切点/fork/归档/detach/删除队列 + composer 按钮与确认弹窗。
- note 05（打包安装与真机验证）：in_progress —— tgz 已装进 desktop profile，旧包已移除；真实 cordis 冒烟通过；**GUI 验收待宿主重启**。
- 样式：面板与撤回控件改为宿主同一套 CSS 方案——插件注入一份只写 `--dsw-*` token 的样式表，面板复刻设置页 section/rowCard 度量，开关复用 `ui-primitives` 的 `Switch`，弹窗复用 `Modal` + `Button`（note 03/04）。
- 门禁（0.2.3）：`vp test src` 126 passed；覆盖率 90.82 / 81.11 / 96.31 / 95.72（阈值 80）；`vp check` 0 error 0 warning；`vp pack` 双产物 + `wrap-client` 装载校验；`npm pack` 生产依赖无 `catalog:`。
- commit：`543003fb`（重构）、`20651c01`（工具栏样式 + 领域文档）、`2f0cca12`（权限选择对齐，0.2.2）、`117e0f6d`（原生样式方案 + ui-primitives 复用，0.2.3）。

（2026-11-05）

- note 06（屏蔽自带 office 技能）：completed —— 新工具 `office-skills`（默认关闭）；取证确认 office 技能由
  `dsh-desktop-host` 在代码里挂成全局 provider `dsh-office`，profile 层没有可 `disabled` 的行，因此在
  `ctx.skills` 的 `list` / `snapshot` / `get` 上做读取面过滤；版本 `0.3.0`。
- note 07（撤回语义收敛与彻底删除）：completed —— 三个工具默认关闭；撤回控件/弹窗/图标对齐宿主原生；
  原文回填改由新会话自己的按钮 `inputActions.setDraft` 落地；原会话彻底删除（归档 → 摘记账 → 删日志 →
  撤销归档）并接管置顶位；启动清扫无会话的归档 id；版本 `0.3.1` → `0.3.2` → `0.3.4`。
- 门禁（0.3.4）：`vp test src` 152 passed；覆盖率 90.81 / 81.76 / 96.14 / 95.37（阈值 80）；
  `vp check` 0 error 0 warning；`vp pack` 双产物 + `wrap-client` 装载校验；`npm pack` 生产依赖无 `catalog:`。
- commit：`0a93faab`（重构，0.2.0）、`39613070`（工具栏度量，0.2.1）、`a837147b`（权限选择对齐，0.2.2）、
  `b25c1fa2`（原生样式方案，0.2.3）、`5f11e2e0`（弹窗/可用性/排队切点，0.2.5）、`01e5f6ab`（1px 图标 +
  原生按钮，0.2.6）、`f9ae21f5`（office-skills，0.3.0）、`1cecd8b8`（默认关闭 + 置顶/位置接管，0.3.1）、
  `1ccd6680`（草稿回填，0.3.2）、`e779d37d`（彻底删除 + 归档清扫，0.3.4）。

### 归档说明（2026-11-05）

经用户要求，本 Plan 迁入 `reference`。代码侧门禁与真机安装全部通过；**GUI 复验（note 05 的四项）未由 agent 执行**，由用户自行验证，因此 note 05 保持 `in_progress`，本 spec 的 `status` 随之为 `in_progress`。若后续复验发现问题，把 Plan 迁回 `planning` 修订即可；结论以 [07](07-撤回语义收敛与彻底删除.md) 的「决策与证据」为准。

## 恢复入口

1. 读 [07-撤回语义收敛与彻底删除.md](07-撤回语义收敛与彻底删除.md) 的「决策与证据」与 [05-打包安装与真机验证.md](05-打包安装与真机验证.md) 的「执行检查点」。
2. 核对现场：`git status`；`~/.dsh/profiles/desktop/package.json` 的 `dsh.profile.bundles` 与 `dependencies`；
   `~/.dsh/toolkit/state.json` 的 `pendingDeletes` / `pendingUnarchives`（清空即无残留）。
3. 下一步：重启 DSH → 面板里打开 `undo-turn` → 发一条消息后点「撤回」：原文进输入框、原会话从「已归档」筛选消失、
   新会话接管置顶位；结果写回 note 05，通过后把 Plan 迁入 `reference`。
4. 停止条件：GUI 四项验收通过即收尾；任何一项失败按 note 07 的「决策与证据」定位（切点、回填、删除三条链路）。

## Notes

| #   | Notes                                                            | 状态        | 阻塞于     | 下一步                           |
| --- | ---------------------------------------------------------------- | ----------- | ---------- | -------------------------------- |
| 01  | [拷问与方案定案](01-拷问与方案定案.md)                           | completed   | —          | —                                |
| 02  | [包重命名与工具注册表](02-包重命名与工具注册表.md)               | completed   | 01         | —                                |
| 03  | [客户端 bundle 与 toolkit 面板](03-客户端bundle与toolkit面板.md) | completed   | 01         | —                                |
| 04  | [撤回工具](04-撤回工具.md)                                       | completed   | 01, 02, 03 | —                                |
| 05  | [打包、安装与真机验证](05-打包安装与真机验证.md)                 | in_progress | 02, 03, 04 | 重启宿主后走 README 验证四步     |
| 06  | [屏蔽自带 office 技能](06-屏蔽自带office技能.md)                 | completed   | 02         | 装 0.3.0 后走 README 验证第 3 步 |
| 07  | [撤回语义收敛与彻底删除](07-撤回语义收敛与彻底删除.md)           | completed   | 04         | GUI 复验后收尾                   |
