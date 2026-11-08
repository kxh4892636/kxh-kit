# dsh-toolkit

一个 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 插件:**一组可独立开关的工具**.
侧边栏的 `toolkit` 面板逐项列出工具与开关,开关状态由宿主持久化,刷新与重启后保持.**所有工具默认关闭**,需要先在面板里打开.

当前工具:

| 工具 id         | 名称                      | 默认 | 作用                                                         |
| --------------- | ------------------------- | ---- | ------------------------------------------------------------ |
| `nested-skill`  | 嵌套 skill 发现           | 关   | 在 `.agents` 树内任意深度发现 `SKILL.md`(内建一层形态之外)   |
| `undo-turn`     | 撤回                      | 关   | 在会话工具栏,模型选择左侧加"撤回"按钮,撤销最后一轮会话       |
| `office-skills` | 移除 dsh 自带 office 技能 | 关   | 屏蔽宿主内置的 office / office-* 技能(provider `dsh-office`) |

另有一个 **Agent 预设 `nano-flow`**(不是面板开关):安装本插件后预设选择器里多出"Nano Flow",
只有选中它的会话才挂载 Nano Flow 的提示词,工具与 skill.

## 安装

桌面版自带 CLI 管理 `desktop` profile;`PATH` 上的 `dsh` 属于另一套安装,不认该 profile.

```powershell
& "$env:LOCALAPPDATA\Programs\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd" `
  plugin --profile desktop add <absolute path to the packed .tgz>
```

profile 的 `dsh.profile.bundles` 会多出本包及其 `cordis.patch.yml` 挂载.宿主启动时组合 bundle,
因此**重启宿主**(或新建会话)后生效.

## 样式方案

与宿主同一套做法:插件注入一张带 `data-plugin-css` 标记的全局样式表,**只写 `--dsw-*` token,不出现字面色值**;能复用原生组件的地方直接复用,不重画控件.

| 位置             | 复用的原生样式 / 组件                                                                                                                                                             |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 面板容器与行卡片 | 复刻设置页 `section / rows / rowCard / rowHead / rowName / rowTag / rowActions` 的度量:`--dsw-alias-settings-card-fill/-stroke`,`--dsw-radius-xl`,`0.5px` 描边,`12px 14px` 内边距 |
| 工具开关         | 宿主 `@deepseek-ai/dsh-client-ui-primitives` 的 `Switch`(滑块自带 `--dsw-alias-switch-thumb`)                                                                                     |
| 撤回触发器       | 复刻 `ui-permission-presets` 的 `.trigger` 度量与 `:hover`/`:disabled`/`focus-visible` 状态                                                                                       |
| 撤回确认弹窗     | 宿主 `Modal` + `Button`,正文层级用本插件 token 类                                                                                                                                 |
| 图标             | `currentColor` 描边 SVG,尺寸由 class 决定(与宿主 `.triggerIcon svg` 同规则)                                                                                                       |

## 工具一:嵌套 skill 发现

把任意深度的 `SKILL.md` 注册成宿主 skill provider,典型布局:

```text
.agents/
└── skills/
    └── nano-flow/
        └── references/
            └── skills/
                └── ask/
                    └── SKILL.md          ← 内建 provider 看不到,本工具能看到
```

注册名取 skill frontmatter 的 `name` 原样;rank 是同来源一层形态的 rank 加一
(项目 `.agents` 201 / custom 301 / 用户 `.agents` 501),因此同来源同名师冲突时显式声明的
一层形态获胜,跨来源仍按宿主来源序.某个扫描根的 watcher 起不来时,本次目录以
`complete: false` 返回,注册表保留上一份结果而不是缓存它.关闭该工具会卸载 provider,
嵌套 skill 立刻从目录里消失.

## 工具二:撤回

会话界面的 composer 工具栏中,模型选择器左侧出现"撤回"按钮:

- 会话只有一轮(没有可回到的上一轮)时按钮置灰.
- 控件样式与 composer 的"权限选择"逐条一致(同样的字体/字号/颜色/hover),文字左侧带 14px 回转箭头,与模型选择器之间的 gap 收到 6px.
- 确认弹窗外壳用宿主 `Modal`,动作用宿主 `Button`.
- 点击弹出确认框(宿主原生确认对话框布局:标题/说明 + 原文预览 + 取消/确认),取消不改动任何状态.
- 回填时序:`openSession` 只是同步换掉主视图引用,composer 随后才挂载;因此原文先登记为"待回填",由新会话自己的撤回按钮(与 composer 同时挂载)用 `inputActions.setDraft` 写进输入框并 `persistDraft()`;1.5s 后若仍未被消费,再走 `conversation.input.requestDraftInitialization` 兜底.
- 可用性随会话轮次变化自动刷新,宿主尚未打开会话时会短暂重试,无需切换会话.
- 确认后:停掉正在执行的一轮 → 会话回到**上一轮结束**的状态 → 本轮的用户原文回到输入框
  → 原会话被**彻底删除**:先归档隐藏并停掉在跑的一轮 → 摘掉工作区记账 → 删除持久化日志 → 从归档集合里去掉 id(删不掉的保持归档,留给下次启动清理).
  列表行消失:宿主 `session/list` 会合并**存活**会话,删掉日志后那一行仍会被列出(宿主没有销毁单个会话的公开 API).
  因此宿主删完日志就广播 `api-session/removed`(宿主销毁会话时客户端依赖的同一条事件),并把 id 记进 `state.json` 的 `hiddenSessionIds`;客户端启动时从 `GET /api/toolkit/hidden` 拉一次把残留行摘掉,目录刷新后再复查(墓碑存 localStorage).
  → 新会话**接管原会话的置顶位**:置顶集合里顶替原会话的序号;记账里先插到原会话那一槽,再把原会话摘掉.

### 为什么是"新会话 + 删除原会话"而不是原地截断

宿主的会话日志是**仅追加**的事件源记录(`@deepseek-ai/dsh-session`),没有删除或截断事件的
API;存活会话优先于磁盘,且改文件后存活会话继续追加会产生读取端拒绝的 seq gap.
唯一受支持的历史截断手段是 `session/fork`:它复制 `atSeq` 闭区间之前的事件前缀,
因此子会话的历史**逐事件等于**原会话在上一轮结束那一刻的状态.

于是"撤回"= 在"本轮 `turn/start` 之前最近的**非 inbox 记账**事件"处 fork(排队输入会先写 `agent/inbox/spliced`,跳过它才不会把待发消息带给子会话;不递增标题)→ 打开子会话 →
归档原会话 → 让子会话接管它的置顶位与记账位置 → 摘掉原会话的工作区记账 → 非存活(或下次启动)时删除其 `$DSH_HOME/sessions/<slug>/<sessionId>/` 目录 → 从归档集合里去掉它的 id.

**彻底删除与原会话的位置**:客户端的会话列表把"fork 出来的子会话"排在它的父会话那一行之前(`ui-workspace` 的 `reconcileManualOrder` → `placeFork`),这个锚点依赖父会话仍在记账里.原会话要连记账一起摘掉,锚点随之消失 -- 手动排序模式下新会话会落到"手动排序之外"的位置(默认的按更新时间模式则按时间排序).置顶位与记录顺序仍然接管.
归档会先停掉在跑的一轮,之后存活实例不会再追加写入,因此日志可以当场删除;启动清单是兜底复核.

### 边界(不做的事)

- **不回滚副作用**:已写入的文件,已执行的命令不会撤销.
- **不回填附件**:只回填该轮 `user/message` 的文本;图片与文件附件需要重新选择.
- **不是时间旅行**:撤销的是"最后一轮",不是任意轮.

## 工具三:移除 dsh 自带 office 技能

桌面宿主在启动时用代码挂载 `@deepseek-ai/dsh-skill-office`,把 `office`,`office-docx`,
`office-pptx`,`office-xlsx`,`office-render`,`office-recalculate`,`office-export-pdf`
七个技能注册成 provider `dsh-office`(全局层,rank 600).这些技能不在 profile 配置里,
`.dsh` 的 patch 关不掉,所以本工具改在**读取面**上做屏蔽:

- 包装 `ctx.skills` 的 `list` / `snapshot` / `get`,命中判据的条目既不进技能目录,也加载不到;
- 判据:`provider === "dsh-office"`,或 `bundled` 来源的 `office` / `office-*`(provider 被改名时兜底);
- 用户自己的 `office-*`(`user-dsh` / `project-dsh` 来源)不受影响;
- 不注销 provider,不删安装目录里的 `SKILL.md`,不改状态文件以外的任何东西;关闭开关即还原三个入口.

宿主升级带来的 provider 改名会让"provider 判据"失效,此时 bundled + 名字判据仍然生效;
若两个判据都不命中(例如上游换了来源标签),开关会静默无效--真机验收时看 skill 目录即可发现.

## 预设:Nano Flow

`nano-flow` 是 toolkit 面板里的一个开关(默认关):打开时根插件调用
`ctx.agentPresets.register()` 把预设注册进 roster,关闭时注销.预设行挂载的也是本包的
唯一入口 `dist/index.mjs`,靠 `config.nanoFlowOnly: true` 只走预设内的那一半.预设的 standing mount 在独立
作用域里注册,所以**开关就是预设是否出现**:打开后预设选择器里才有"Nano Flow",选中它的
会话才有提示词,工具与 skill.

开关右侧的箭头按钮(`Nano Flow 设置`)只在开关打开时出现,点开是上限与轮转阈值的下拉面板.

挂载后会话里多出四样东西:

| 类别       | 内容                                                                                                    |
| ---------- | ------------------------------------------------------------------------------------------------------- |
| 固定提示词 | `prompts/agents.md` 与 `.agents/domains/GUIDE.md` 的当前快照拼接, 作为系统提示词段 `order: 1` 注入      |
| 每轮提示词 | `prompts/user.md`, 作为运行时上下文在每轮第一次 pre-step 后追加; 不冒充用户消息, UI 以 context 卡片显示 |
| 工具       | `nano_flow_create`(domain / plan / note 的目录与模板) 与 `nano_flow_check`(校验 + 生成全部索引)         |
| skill      | `skills/` 动态发现: `ask`,`do`,`to-skill`,`code-spec`,`learning`,`kaizen`                               |

**目录布局**

```text
.agents/domains/
├── GUIDE.md                       # 会话启动快照；后续流程产物，当前只保留空模板
├── CONTEXT-MAP.md                 # 生成：Contexts + Relationships
└── {domain-name}/
    ├── CONTEXT.md                 # 职责、术语、relations
    ├── questions/
    │   ├── index.md               # 生成
    │   └── 001-中文问题.md
    ├── adr/
    │   ├── index.md               # 生成
    │   └── 001-中文决策.md
    ├── workflows/
    │   ├── index.md               # 生成
    │   └── 001-中文工作流/
    │       └── 001-中文工作流.md
    └── plans/{active|reference|archived}/
        └── YYYY-MM-DD-中文工作名/
            ├── spec.md
            ├── notes_index.md     # 生成
            └── 001-中文标题.md
```

story 已并入 spec，不再创建 `story.md`。索引文件都是生成物，模型不需要手改；`nano_flow_check`
每次运行都会按源文档重新生成。

**YAML 头**

所有领域文档以 YAML 头开始，固定包含 `name` 与 `description`；自由扩展放进 `metadata`：

```yaml
---
name: 001-取消订单
description: 客户可以取消未发货订单。
status: pending
reason:
related_noted: []
next_step: 读取 spec 并确认接口契约
metadata:
  owner: 订单组
---
```

- `name` 是索引的唯一键；`adr` / `question` / `note` / `workflow` 的 name 必须带三位数字前缀，
  并与文件名或目录名一致；`related_noted` 引用同一个 Plan 里的 note name。
- CONTEXT 额外有 `relations: [{ to: 目标域目录名, description: 关系说明 }]`，`CONTEXT-MAP.md`
  由脚本汇总生成；跨域关系只在源域定义一次。
- ADR 可选 `status`：`proposed | accepted | deprecated | superseded`。
- spec 固定 `status`：`pending | in_progress | completed`，由全部 note 派生。
- note 固定 `status`：`pending | in_progress | blocked | completed`；`blocked` 时 `reason` 必填，
  其他状态不写；`next_step` 是单行下一步。`related_noted` 只表达关联，不构成 DAG。
- spec 正文自由组织，只在最后保留 `## 追踪 Note`；check 用未完成 note 自动生成该表。
  `notes_index.md` 收录全部 note（name / description / related_noted）。

**工具**

- `nano_flow_create`：`kind=domain` 建 `CONTEXT.md`、questions / adr / workflows 与 `GUIDE.md`；
  `kind=plan` 建 `spec.md` 与 `notes_index.md`；`kind=note` 建一条 note（可自动取下一个三位编号）。
  只补缺失文件，不覆盖已有内容。
- `nano_flow_check`：校验 YAML 头、三位 name、篇幅、status / reason / related_noted 与 spec 状态派生；
  同时生成/更新 `CONTEXT-MAP.md`、`questions/index.md`、`adr/index.md`、`workflows/index.md`、
  `notes_index.md` 与 spec 的 `## 追踪 Note`。可用 `domain` / `plan` 缩小范围，`strict=false`
  把旧格式文档记为警告并跳过。

**上限与轮转**

- 所有数字在 **开关旁的下拉设置面板**维护（持久化到 `$DSH_HOME/toolkit/nano-flow.json`）：
  spec / note / CONTEXT / question / ADR / workflow 体积与 description 字数，以及会话轮转阈值。
  体积字段在面板里以 **KB** 输入（1 KB = 1024 字节，存储仍是字节）。ADR 数量与追踪 Note
  行数不再限制；静态规则在 `prompts/limit.md`，具体值由脚本追加，启动时生成
  「篇幅限制」块拼在 `prompts/agents.md` + `GUIDE.md` 之后注入。spec 超过上限时，
  把细节下沉到 note 或领域文档，并在 `spec.md` 留下相对链接指针；note、question、
  ADR、workflow 超过上限时拆成多个独立编号的文档；CONTEXT 只压缩，不拆分。
- 预设不挂载压缩插件。轮转挂在**宿主半**：用户每发一条**排队**消息（queue）时，先按会话 id
  找到存活会话，再用日志里最后一条 `agent-preset/selected` 判断它是否跑 Nano Flow（live header
  的 `agentPreset` 在恢复会话时不可靠），然后读 `tokenMeter.contextPressure` 的
  `projectedTokens ?? pressureTokens`。达到 `rotateAt × contextWindow` 时创建新会话（同一 cwd
  与预设），把"上一会话已轮转，只读恢复当前 Plan"的种子与这条消息一起发给它，新 prompt
  被接受后**物理删除**旧会话（不是归档）。新会话创建或发送失败时回落到旧会话，消息不丢。
- 轮转种子只让新会话读 `spec.md` 与 `notes_index.md`，所以每轮结束前必须把检查点写回磁盘：
  spec 的进度与恢复入口、note 的 status / next_step。
- 轮转不写在预设行里：预设行读不到 `ctx.agent`（cordis 对服务属性做 inject 守卫），而根插件
  又不能声明 `agent` 依赖（根上下文里没有 agent）。`nano-flow-mount.json` 的 `stages` 记录每一步，
  挂载/轮转是否生效看这个文件即可。
- `nano-flow/scripts/check-domain.mjs` 是唯一校验与索引生成实现，`nano_flow_check` 用
  `process.execPath` 调用它，并把当前设置作为 `--limits` 传入。

**已删除的旧能力**

`nano_flow_read` / `nano_flow_write`、`notes.json` 与 notes DAG、`notes-guard` 的 fs/tools
收口、ready 面板与 `/api/toolkit/nano-flow-ready`、`story.md`、旧 `QUESTIONS.md` / `INDEX.md`、
`assets.lock.json`。文档改用普通文件工具读写；`nano_flow_check` 负责机器校验与索引。

**验证**

1. 重新构建并安装插件，重启宿主；新建会话时预设选择器出现"Nano Flow"。
2. 选中该预设：系统提示里出现 Nano Flow 规则；本轮首次请求的上下文中有一句
   `prompts/user.md`（UI 以 context 卡片显示，不显示为用户消息），后续每轮再追加一次。
3. 换一个预设：上述提示词、工具与 skill 全部消失。
4. 在空工作区让模型建 domain、plan、note：出现 `CONTEXT-MAP.md`、域文档骨架、`GUIDE.md`、
   `spec.md`、`notes_index.md`；`nano_flow_check` 通过并列出更新的索引。
5. 打开 toolkit 面板的"Nano Flow 设置"，改一个上限并保存；重启后值保持，下一次 check 生效。
6. 把轮转阈值调到很低（如 0.05），再发一条排队消息：旧会话被物理删除，新会话只读
   `spec.md` 与 `notes_index.md` 并报告进度。
7. 挂载诊断：`$DSH_HOME/toolkit/nano-flow-mount.json` 的 `stages` 应同时有 `entry`
   (`via: preset`)、`apply`、`ready` 与 `rotation`；缺哪个就说明哪一步没生效。
8. 把一条 note 置 `blocked` 但不写 `reason`：`nano_flow_check` 报"缺少 reason"；补上后通过，
   spec 的状态与 `## 追踪 Note` 自动更新。

## 配置

全部字段可选;写在 profile 的 cordis 配置里,面板开关写在状态文件中(见下).

| 字段                        | 默认                              | 含义                             |
| --------------------------- | --------------------------------- | -------------------------------- |
| `watch`                     | `true`                            | 监听扫描根以感知目录变化         |
| `watchUsePolling`           | `false`                           | 以轮询代替原生文件系统事件       |
| `watchPollIntervalMs`       | `100`                             | 轮询探测间隔                     |
| `watchStabilityThresholdMs` | `200`                             | 变更条目稳定窗口                 |
| `includeUserRoots`          | `true`                            | 是否扫描用户 `.agents` 根        |
| `agentsHome`                | `$DSH_AGENTS_HOME` \| `~/.agents` | 用户 agent 根                    |
| `excludedDirs`              | 见源码                            | 额外剪除的目录名                 |
| `extraRoots`                | `[]`                              | 以 `custom` 来源扫描的额外根     |
| `stateFile`                 | `$DSH_HOME/toolkit/state.json`    | 工具开关与待删除会话的文件位置   |
| `sessionsRoot`              | `$DSH_HOME/sessions`              | 会话日志根(撤回删除原会话时使用) |

状态文件形状:

```json
{
  "version": 1,
  "tools": { "nested-skill": true, "undo-turn": true, "office-skills": false },
  "pendingDeletes": [],
  "pendingUnarchives": []
}
```

`pendingDeletes` 是"会话仍存活,推迟到下次启动再删"的原会话 id;`pendingUnarchives` 是日志已删,还等着从归档集合里去掉的 id.启动时依次处理并清空.

启动时还会做一次清扫:归档集合里**既没有日志,也不存活**的 id 会被直接摘掉(历史上旧版本留下的占位由此自愈),有日志或仍存活的归档条目保持不动.

## 宿主路由

浏览器半通过连接服务的同源路由读写开关(`ctx.connection.fetch.register`,已鉴权):

| 路由                     | 方法 | 请求              | 响应                                               |
| ------------------------ | ---- | ----------------- | -------------------------------------------------- |
| `/api/toolkit/state`     | GET  | -                 | `{ tools: [{ id, title, description, enabled }] }` |
| `/api/toolkit/state`     | POST | `{ id, enabled }` | 同上(切换后的目录)                                 |
| `/api/toolkit/undo-turn` | GET  | `?sessionId=<id>` | `{ available, reason?, prompt? }`                  |
| `/api/toolkit/undo-turn` | POST | `{ sessionId }`   | `{ childSessionId, prompt }`                       |

错误体为 `{ error, message }`:`invalid-body`(400),`unknown-tool`(400),
`tool-disabled`(409),`no-previous-turn`(409),`session-not-live`(409),
`unsupported-host`(501).

## 兼容性

不钉宿主版本:DSH peers(`@deepseek-ai/dsh-fs`,`dsh-skill`,`dsh-home-paths`)只声明下限
`>=0.2.1-rc.3`,任何更新的宿主(预发布或稳定)都满足;没有 `engines.dsh`,因此 0.2.x 的
兼容性评估对每一版都通过.

客户端半的契约(slot 名,面板/按钮的 owner props,`uiWorkspace` 与 `conversation` 的入口,
平台模块表里的 `@deepseek-ai/dsh-client-ui-primitives`)按宿主 `0.2.1-rc.5` 的实装取证,
结构声明集中在 `src/client/contract.ts`;宿主升级后若形状漂移,会在真机验收暴露.

## 验证

1. 重启宿主后,左侧边栏出现 `toolkit` 行;点击打开面板,三个工具各有一个开关.
2. 关闭"嵌套 skill 发现"后新会话的 skill 目录里不再有嵌套 skill;重新打开后恢复.
3. 开启"移除 dsh 自带 office 技能"后新会话的 skill 目录里不再有 `office*`;
   `skill` 加载 `office-docx` 也拿不到内容;关闭开关后恢复.
4. 任意会话发一条消息,等它跑完,点"撤回"→ 确认:会话回到上一轮结束的状态,
   输入框出现刚才那条原文,侧边栏不再有被撤销的那条会话.
5. 再次点"撤回",若会话只剩一轮则按钮置灰.

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

打包用 `pnpm pack`:`prepack` 是 `vp run --no-cache build`,先跑一次完整 `build`,所以
tarball 一定带 `dist/nano-flow/`.`pnpm pack` 的生命周期只有 `prepack` / `prepare` /
`postpack`,**不执行 `prepublishOnly`**--把构建挂在那里的写法会让本地打包静默带上陈旧
`dist`(缺 nano-flow 资产,装进去运行时 `locateAssetsRoot()` 直接抛错).要禁用 `vp run`
的缓存,flag 必须写在脚本名之前(`vp run --no-cache build`),写在后面会被转发给被调脚本.
该契约由 `src/packaging.test.ts` 守住.

`build` 分两步:`vp pack` 出宿主半 `dist/index.mjs` 与客户端半的 CJS 中间产物,
`scripts/wrap-client.mjs` 把后者包成宿主模块载体的形态(`window.__ModuleLoader__.load`),
校验它只 require 平台模块表里的裸说明符,并真正执行一次确认导出了 `inject` / `apply`.
`react`,`react-dom` 与 UI 基座必须保持外部--它们由宿主页面提供,自带一份会拆开 hook 上下文.
