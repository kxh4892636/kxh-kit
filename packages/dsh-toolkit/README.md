# dsh-toolkit

一个 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 插件：**一组可独立开关的工具**。
侧边栏的 `toolkit` 面板逐项列出工具与开关，开关状态由宿主持久化，刷新与重启后保持。**所有工具默认关闭**，需要先在面板里打开。

当前工具：

| 工具 id         | 名称                      | 默认 | 作用                                                           |
| --------------- | ------------------------- | ---- | -------------------------------------------------------------- |
| `nested-skill`  | 嵌套 skill 发现           | 关   | 在 `.agents` 树内任意深度发现 `SKILL.md`（内建一层形态之外）   |
| `undo-turn`     | 撤回                      | 关   | 在会话工具栏、模型选择左侧加「撤回」按钮，撤销最后一轮会话     |
| `office-skills` | 移除 dsh 自带 office 技能 | 关   | 屏蔽宿主内置的 office / office-* 技能（provider `dsh-office`） |

## 安装

桌面版自带 CLI 管理 `desktop` profile；`PATH` 上的 `dsh` 属于另一套安装，不认该 profile。

```powershell
& "$env:LOCALAPPDATA\Programs\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd" `
  plugin --profile desktop add <absolute path to the packed .tgz>
```

profile 的 `dsh.profile.bundles` 会多出本包及其 `cordis.patch.yml` 挂载。宿主启动时组合 bundle，
因此**重启宿主**（或新建会话）后生效。

## 样式方案

与宿主同一套做法：插件注入一张带 `data-plugin-css` 标记的全局样式表，**只写 `--dsw-*` token、不出现字面色值**；能复用原生组件的地方直接复用，不重画控件。

| 位置             | 复用的原生样式 / 组件                                                                                                                                                                 |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 面板容器与行卡片 | 复刻设置页 `section / rows / rowCard / rowHead / rowName / rowTag / rowActions` 的度量：`--dsw-alias-settings-card-fill/-stroke`、`--dsw-radius-xl`、`0.5px` 描边、`12px 14px` 内边距 |
| 工具开关         | 宿主 `@deepseek-ai/dsh-client-ui-primitives` 的 `Switch`（滑块自带 `--dsw-alias-switch-thumb`）                                                                                       |
| 撤回触发器       | 复刻 `ui-permission-presets` 的 `.trigger` 度量与 `:hover`/`:disabled`/`focus-visible` 状态                                                                                           |
| 撤回确认弹窗     | 宿主 `Modal` + `Button`，正文层级用本插件 token 类                                                                                                                                    |
| 图标             | `currentColor` 描边 SVG，尺寸由 class 决定（与宿主 `.triggerIcon svg` 同规则）                                                                                                        |

## 工具一：嵌套 skill 发现

把任意深度的 `SKILL.md` 注册成宿主 skill provider，典型布局：

```text
.agents/
└── skills/
    └── nano-flow/
        └── references/
            └── skills/
                └── questing/
                    └── SKILL.md          ← 内建 provider 看不到，本工具能看到
```

注册名取 skill frontmatter 的 `name` 原样；rank 是同来源一层形态的 rank 加一
（项目 `.agents` 201 / custom 301 / 用户 `.agents` 501），因此同来源同名师冲突时显式声明的
一层形态获胜，跨来源仍按宿主来源序。某个扫描根的 watcher 起不来时，本次目录以
`complete: false` 返回，注册表保留上一份结果而不是缓存它。关闭该工具会卸载 provider，
嵌套 skill 立刻从目录里消失。

## 工具二：撤回

会话界面的 composer 工具栏中，模型选择器左侧出现「撤回」按钮：

- 会话只有一轮（没有可回到的上一轮）时按钮置灰。
- 控件样式与 composer 的「权限选择」逐条一致（同样的字体/字号/颜色/hover），文字左侧带 14px 回转箭头，与模型选择器之间的 gap 收到 6px。
- 确认弹窗外壳用宿主 `Modal`、动作用宿主 `Button`。
- 点击弹出确认框（宿主原生确认对话框布局：标题/说明 + 原文预览 + 取消/确认），取消不改动任何状态。
- 可用性随会话轮次变化自动刷新，宿主尚未打开会话时会短暂重试，无需切换会话。
- 确认后：停掉正在执行的一轮 → 会话回到**上一轮结束**的状态 → 本轮的用户原文回到输入框
  → 原会话被删除（先从所有分组视图隐藏，再删除持久化日志；会话仍存活时推迟到下次启动）。
  → 新会话**接管原会话的置顶位与列表位置**：置顶集合里顶替原会话的序号，工作区记账里插回原会话那一槽。

### 为什么是「新会话 + 删除原会话」而不是原地截断

宿主的会话日志是**仅追加**的事件源记录（`@deepseek-ai/dsh-session`），没有删除或截断事件的
API；存活会话优先于磁盘，且改文件后存活会话继续追加会产生读取端拒绝的 seq gap。
唯一受支持的历史截断手段是 `session/fork`：它复制 `atSeq` 闭区间之前的事件前缀，
因此子会话的历史**逐事件等于**原会话在上一轮结束那一刻的状态。

于是「撤回」= 在「本轮 `turn/start` 之前最近的**非 inbox 记账**事件」处 fork（排队输入会先写 `agent/inbox/spliced`，跳过它才不会把待发消息带给子会话；不递增标题）→ 打开子会话 →
归档原会话 → 让子会话接管它的置顶位与记账位置 → 非存活（或下次启动）时删除其 `$DSH_HOME/sessions/<slug>/<sessionId>/` 目录。

**为什么保留原会话的记账槽位**：客户端的会话列表把「fork 出来的子会话」排在它的父会话那一行之前（`ui-workspace` 的 `reconcileManualOrder` → `placeFork`）。保留原会话的记账条目与归档状态，子会话才会稳定落在原会话那一行；它的日志仍按上面的规则删除，因此列表里看不到原会话，只在「已归档」筛选下会留下一条打不开的占位。
会话仍在内存里存活时，删除推迟到下次宿主启动（启动早于会话加载，此时删文件安全）。

### 边界（不做的事）

- **不回滚副作用**：已写入的文件、已执行的命令不会撤销。
- **不回填附件**：只回填该轮 `user/message` 的文本；图片与文件附件需要重新选择。
- **不是时间旅行**：撤销的是「最后一轮」，不是任意轮。

## 工具三：移除 dsh 自带 office 技能

桌面宿主在启动时用代码挂载 `@deepseek-ai/dsh-skill-office`，把 `office`、`office-docx`、
`office-pptx`、`office-xlsx`、`office-render`、`office-recalculate`、`office-export-pdf`
七个技能注册成 provider `dsh-office`（全局层，rank 600）。这些技能不在 profile 配置里，
`.dsh` 的 patch 关不掉，所以本工具改在**读取面**上做屏蔽：

- 包装 `ctx.skills` 的 `list` / `snapshot` / `get`，命中判据的条目既不进技能目录，也加载不到；
- 判据：`provider === "dsh-office"`，或 `bundled` 来源的 `office` / `office-*`（provider 被改名时兜底）；
- 用户自己的 `office-*`（`user-dsh` / `project-dsh` 来源）不受影响；
- 不注销 provider、不删安装目录里的 `SKILL.md`、不改状态文件以外的任何东西；关闭开关即还原三个入口。

宿主升级带来的 provider 改名会让「provider 判据」失效，此时 bundled + 名字判据仍然生效；
若两个判据都不命中（例如上游换了来源标签），开关会静默无效——真机验收时看 skill 目录即可发现。

## 配置

全部字段可选；写在 profile 的 cordis 配置里，面板开关写在状态文件中（见下）。

| 字段                        | 默认                              | 含义                               |
| --------------------------- | --------------------------------- | ---------------------------------- |
| `watch`                     | `true`                            | 监听扫描根以感知目录变化           |
| `watchUsePolling`           | `false`                           | 以轮询代替原生文件系统事件         |
| `watchPollIntervalMs`       | `100`                             | 轮询探测间隔                       |
| `watchStabilityThresholdMs` | `200`                             | 变更条目稳定窗口                   |
| `includeUserRoots`          | `true`                            | 是否扫描用户 `.agents` 根          |
| `agentsHome`                | `$DSH_AGENTS_HOME` \| `~/.agents` | 用户 agent 根                      |
| `excludedDirs`              | 见源码                            | 额外剪除的目录名                   |
| `extraRoots`                | `[]`                              | 以 `custom` 来源扫描的额外根       |
| `stateFile`                 | `$DSH_HOME/toolkit/state.json`    | 工具开关与待删除会话的文件位置     |
| `sessionsRoot`              | `$DSH_HOME/sessions`              | 会话日志根（撤回删除原会话时使用） |

状态文件形状：

```json
{
  "version": 1,
  "tools": { "nested-skill": true, "undo-turn": true, "office-skills": false },
  "pendingDeletes": []
}
```

`pendingDeletes` 是「会话仍存活、推迟到下次启动再删」的原会话 id；启动时处理并清空。

## 宿主路由

浏览器半通过连接服务的同源路由读写开关（`ctx.connection.fetch.register`，已鉴权）：

| 路由                     | 方法 | 请求              | 响应                                               |
| ------------------------ | ---- | ----------------- | -------------------------------------------------- |
| `/api/toolkit/state`     | GET  | —                 | `{ tools: [{ id, title, description, enabled }] }` |
| `/api/toolkit/state`     | POST | `{ id, enabled }` | 同上（切换后的目录）                               |
| `/api/toolkit/undo-turn` | GET  | `?sessionId=<id>` | `{ available, reason?, prompt? }`                  |
| `/api/toolkit/undo-turn` | POST | `{ sessionId }`   | `{ childSessionId, prompt }`                       |

错误体为 `{ error, message }`：`invalid-body`（400）、`unknown-tool`（400）、
`tool-disabled`（409）、`no-previous-turn`（409）、`session-not-live`（409）、
`unsupported-host`（501）。

## 兼容性

不钉宿主版本：DSH peers（`@deepseek-ai/dsh-fs`、`dsh-skill`、`dsh-home-paths`）只声明下限
`>=0.2.1-rc.3`，任何更新的宿主（预发布或稳定）都满足；没有 `engines.dsh`，因此 0.2.x 的
兼容性评估对每一版都通过。

客户端半的契约（slot 名、面板/按钮的 owner props、`uiWorkspace` 与 `conversation` 的入口、
平台模块表里的 `@deepseek-ai/dsh-client-ui-primitives`）按宿主 `0.2.1-rc.5` 的实装取证，
结构声明集中在 `src/client/contract.ts`；宿主升级后若形状漂移，会在真机验收暴露。

## 验证

1. 重启宿主后，左侧边栏出现 `toolkit` 行；点击打开面板，三个工具各有一个开关。
2. 关闭「嵌套 skill 发现」后新会话的 skill 目录里不再有嵌套 skill；重新打开后恢复。
3. 开启「移除 dsh 自带 office 技能」后新会话的 skill 目录里不再有 `office*`；
   `skill` 加载 `office-docx` 也拿不到内容；关闭开关后恢复。
4. 任意会话发一条消息、等它跑完，点「撤回」→ 确认：会话回到上一轮结束的状态，
   输入框出现刚才那条原文，侧边栏不再有被撤销的那条会话。
5. 再次点「撤回」，若会话只剩一轮则按钮置灰。

## 卸载

```powershell
& "$env:LOCALAPPDATA\Programs\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd" `
  plugin --profile desktop remove @kxh4892636/dsh-toolkit
```

## 开发

```powershell
pnpm --filter @kxh4892636/dsh-toolkit test
pnpm --filter @kxh4892636/dsh-toolkit check
pnpm --filter @kxh4892636/dsh-toolkit build
```

`build` 分两步：`vp pack` 出宿主半 `dist/index.mjs` 与客户端半的 CJS 中间产物，
`scripts/wrap-client.mjs` 把后者包成宿主模块载体的形态（`window.__ModuleLoader__.load`）、
校验它只 require 平台模块表里的裸说明符，并真正执行一次确认导出了 `inject` / `apply`。
`react`、`react-dom` 与 UI 基座必须保持外部——它们由宿主页面提供，自带一份会拆开 hook 上下文。
