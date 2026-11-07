# DSH 常见问题

## 为什么 `dsh --profile desktop --dump-config` 报错？

- 适用条件与现象：在 desktop 版 DSH 上用自带 CLI 执行 `--dump-config`（或任何 boot 类命令）指向 `desktop` profile，得到 `error: profile "desktop" is managed exclusively by the Electron application`，退出码 1。
- 原因：desktop 应用把 `~/.dsh/profiles/desktop` 视为独占托管；CLI 只放开 `plugin` 子命令（转发 pnpm）等运维入口，不复制宿主的组合逻辑。
- 解决方法：用「profile 清单 + 运行中宿主」代替组合层证据——读 `~/.dsh/profiles/desktop/package.json` 的 `dependencies` 与 `dsh.profile.bundles`，再看运行中会话的 skill 目录是否出现插件的产物（如嵌套 skill）。
- 验证：2026-10-27 安装 `@kxh4892636/dsh-nested-skill@0.1.3` 后，`package.json` 的 bundles 末项出现该包，且本会话 skill 目录随即出现 6 个嵌套 skill。
- 来源：[2026-10-27-dsh插件装进desktop宿主](plans/reference/2026-10-27-dsh插件装进desktop宿主/03-打包安装与宿主验证.md)。

## PATH 上的 `dsh` 能用来装 desktop 插件吗？

- 适用条件与现象：`Get-Command dsh` 命中 `C:\Users\kxh\AppData\Local\vite-plus\bin\dsh.cmd`，`dsh --version` 是 `0.1.6-alpha.1`，与 desktop 宿主的 `0.2.1-rc.3` 不一致；用它 `plugin --profile desktop add` 会按旧代规则写 profile。
- 原因：该入口属于 vite-plus 的 js_runtime 安装，是独立的 dsh 副本，不认 desktop 的 profile 约定与 bundle 模板。
- 解决方法：desktop 场景一律用应用自带 CLI：`<install dir>\resources\runtime\cli\bin\dsh.cmd`（`ELECTRON_RUN_AS_NODE` 拉起 `dsh-desktop-host/lib/cli.js`，`--version` 与宿主同值）。
- 验证：`& "$env:LOCALAPPDATA\Programs\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd" --version` 输出 `0.2.1-rc.3`。
- 来源：[2026-10-27-dsh插件装进desktop宿主](plans/reference/2026-10-27-dsh插件装进desktop宿主/01-取证与兼容性比对.md)。

## 为什么 desktop profile 的 `pnpm peers check` 报缺少 `@deepseek-ai/*` peer？

- 适用条件与现象：插件装好后在 `~/.dsh/profiles/desktop` 执行 `pnpm peers check`，列出 `missing peer @deepseek-ai/cordis|dsh-fs|dsh-home-paths|dsh-skill`。
- 原因：profile 的 `pnpm-workspace.yaml` 设了 `autoInstallPeers: false`；插件声明的 DSH peer 由宿主运行时提供，本就装进 profile 里。
- 解决方法：不要为了消警告把它们加成 profile 依赖（会造成双份 dsh 包、版本混装）；以「插件是否被宿主加载、能否发现 skill」为准。
- 验证：本次安装后 `peer` 警告仍在，但宿主正常加载插件并发现嵌套 skill。
- 来源：[2026-10-27-dsh插件装进desktop宿主](plans/reference/2026-10-27-dsh插件装进desktop宿主/03-打包安装与宿主验证.md)。

## 插件被宿主判定 incompatible 时怎么办？

- 适用条件与现象：`dsh plugin add` 输出 `Plugin … is incompatible with dsh <版本>: requirements …`，提示可用 `dsh plugin allow-version` 或插件管理器给「精确版本豁免」。
- 原因：0.2.x 按 manifest 评估兼容性——有 `engines.dsh` 只看它，否则要求每个 `@deepseek-ai/dsh*` peer 范围满足运行版本（`dsh-app-boot` 的 `unmetRequirements`）。
- 解决方法：把 peer 精确改到宿主实装版本并重装依赖、重打包、重装；不要用豁免掩盖声明漂移（ADR-0003：声明等于已在本机验证的版本）。
- 验证：本包由 `0.2.1-rc.2` 钉到 `0.2.1-rc.3` 后，安装不再报 incompatible。
- 来源：[2026-10-26-dsh插件适配0.2.1-rc.2](plans/reference/2026-10-26-dsh插件适配0.2.1-rc.2/01-版本取证与兼容性比对.md)、[2026-10-27-dsh插件装进desktop宿主](plans/reference/2026-10-27-dsh插件装进desktop宿主/02-声明对齐到rc.3.md)。

## 怎么让 DSH 出站流量走本机代理（如 Clash 7890）？

- 适用条件与现象：系统代理已启用（如 Clash `127.0.0.1:7890`），但 DSH 的 LLM / web 搜索 / web fetch / MCP 仍直连；`~/.dsh/.env` 不存在。
- 原因：DSH 只认**启动环境**与 `$DSH_HOME/.env`（harness home 层）里的 `http(s)` 代理，并只认 `HTTP_PROXY`/`HTTPS_PROXY`/`ALL_PROXY`/`NO_PROXY` 四个名字；它不读操作系统代理设置，且代理策略在进程启动时解析一次。
- 解决方法：在 `$DSH_HOME/.env`（默认 `~/.dsh/.env`）写 `HTTP_PROXY=http://127.0.0.1:7890`、`HTTPS_PROXY=http://127.0.0.1:7890`、`ALL_PROXY=http://127.0.0.1:7890`，再重启 DSH。代理名不能写进项目 `.env`（启动器拒绝启动），SOCKS 与 PAC 不被支持。
- 验证：`node -e "..."` 用 `util.parseEnv` 读回三项；重启后启动器在挂载插件前安装该策略（`dsh/lib/profile-boot-*.js` 的 `runProfile`），可再用一次需要代理的 web fetch 观察行为。2026-10-28 本机已按此法写入并核对文件内容与解析结果。
- 来源：[ADR-0005](adr/0005-fake-ip解析经代理声明修正.md)；本机核对：`~/.dsh/.env` 缺失、Windows `ProxyEnable=1` / `ProxyServer=127.0.0.1:7890`。

## 宿主能原地删除或截断一轮会话吗？

- 适用条件与现象：想让某个会话回到上一轮结束的状态，并要求「同一个 session id 变短」（原地撤销）。
- 原因：会话日志是仅追加的事件源记录，删除/截断事件与会话的 API 都不存在（`sessionController` 只有 `cancel/create/fork/list/prompt/rename/search/selectModel/updateQueue/...`）；存活会话优先于磁盘（`dsh-session-query`："A known live target never consults persistence"）；改文件后存活会话继续按旧游标追加，读取端会因 seq gap 判定损坏（`dsh-session-format-v1-to-v2`）；zstd 帧内切不会整轮丢弃；`workspace` 把「会话删除」列为尚未提供的能力。
- 解决方法：用 `session/fork` 复制 `atSeq` 闭区间前缀得到等价历史，再归档原会话（`workspaceRegistry.archiveSession(id, { stopActivity: true })`），需要「删除」时用 `WorkspaceRecord.detachSession` 摘除记账、删除 `$DSH_HOME/sessions/<slug>/<sessionId>/`、最后 `unarchiveSession` 去掉归档占位；会话仍存活时日志删除与撤销归档都排队到下次启动（`state.json` 的 `pendingDeletes` / `pendingUnarchives`），启动时还会清扫「归档集合里既无日志、也不存活」的历史 id。细节见 [07-撤回语义收敛与彻底删除](plans/reference/2026-11-04-dsh-toolkit插件/07-撤回语义收敛与彻底删除.md)。
- 验证：`packages/dsh-toolkit` 的 `undoTurn` 单测覆盖 fork 切点、归档、detach、立即删除与推迟删除两条路径、撤销归档；`purge` 单测覆盖队列的两阶段处理与孤儿归档清扫。
- 来源：[01-拷问与方案定案](plans/reference/2026-11-04-dsh-toolkit插件/01-拷问与方案定案.md)、`packages/dsh-toolkit/README.md`「为什么是「新会话 + 删除原会话」而不是原地截断」。

## 为什么恢复已有 Plan 时只读、不自动执行？

- 适用条件与现象：用户说"恢复""继续"打开一个有 Plan 的会话，模型读完恢复包就直接挑一条 note 开工，未经确认就改文件、跑构建。
- 原因：旧固定提示词把"继续"直接映射到 do 循环，"恢复与轮转"要求"从首个未完成步骤或可推进队列继续"；`nano_flow_read` 的 resume 文案与 `rotate.ts` 的轮转种子也写着"从可推进队列继续 / 继续执行当前 Plan"，四处口径叠加，恢复即执行。
- 解决方法：模式循环区分"恢复已有 Plan"（只读）与"接续已报告过的 Plan"（do）；恢复轮严格只读——只允许 `nano_flow_read`、读文件与取证命令，不写 Plan、不动文件、不执行 note、不跑构建测试或安装；恢复报告之后用户第一条消息即放行（新澄清需求仍走 ask）。resume 文案与轮转种子同步改成只读口径。
- 验证：`rotate.test` 断言种子含"只读报告"；241 项测试、`vp check`、`vp pack` 通过；desktop profile 装 0.4.2，安装目录的 `dist/index.mjs` 与 `dist/nano-flow/prompt.md` 均与仓库 dist 同哈希。重启宿主后的新会话行为待真机确认。
- 来源：[2026-11-07-预设提示词评审](plans/archived/2026-11-07-预设提示词评审/spec.md) 的 note 09 / 10。

## 为什么 note 不能直接从 in_progress 标完成？

- 适用条件与现象：`nano_flow_write` 的 `complete` 在 `in_progress` 的 note 上报错，提示先 `status=waiting` 且 `needs=review`。
- 原因：写完不等于用户确认；「正在改」与「等用户」都留在 `in_progress` 时界面分不清，轮转与交接也看不出卡在哪。等待分两种：等验收（`review`）与等用户回答（`answer`）。
- 解决方法：完成后置 `status=waiting` 并给 `needs`：`review` 时写「待验证」小节，`answer` 时写「待回答」小节；用户回复后 `complete`（只接受 `review`）或回 `in_progress`。`waiting` 仍算未完成，Plan 不能迁 reference；旧文档的 `awaiting_verification` 读入时折成 `waiting + needs=review`。
- 验证：`runtime.test` 覆盖 complete 门槛（`in_progress`、`waiting/answer` 均拒绝）与 resume 的「等待回答 / 等待确认」分段；249+ 项测试、`vp check`、build 通过。
- 来源：[2026-11-08-nano-flow等待确认状态](plans/active/2026-11-08-nano-flow等待确认状态/spec.md)、旧 Plan 的 note 11 / 12。

## `notes.json` 校验失败、Plan 读不出来怎么办？

- 适用条件与现象：`nano_flow_read` / `nano_flow_write` 报「description 超过 144 字」「note 正文超过 …」之类的校验错误，Plan 打不开。
- 原因：`notes.json` 是唯一权威，工具读入即校验；工具不会自动截断摘要、也不会自动删索引项，超限字段的取舍必须由模型判断。
- 解决方法：先 `nano_flow_read op=inspect` 看原始 note 与 index，再 `nano_flow_write op=repair` 提交 `repairs`（按 id 的 title/description/content）与 `ids`（新 index），工具重新校验后落盘。JSON 语法错误无法 repair，只能人工修文件（notes-guard 会拦常规文件工具）。
- 验证：`runtime.test` 覆盖「坏摘要 → inspect → repair → resume」链路。
- 来源：[2026-11-08-nano-flow等待确认状态](plans/active/2026-11-08-nano-flow等待确认状态/spec.md) 的 note 03。

## 为什么 `read` 读不到 Plan 的 `notes.json`？

- 适用条件与现象：在 Nano Flow 会话里让模型直接 `read`（或 `write` / `edit`，或 `pwsh` 的 `Get-Content`）Plan 的 `notes.json`，返回「notes.json 只能经 nano_flow_read / nano_flow_write 读写」。
- 原因：toolkit 根插件给 `notes.json` 装了策略级收口——`tools.guard` 拦工具参数里的显式路径（`file_path` / `path` / `target`，以及 shell 的 `command` / `script` 里的字面路径），再就地包装 `ctx.fs` 的六个内容读写方法按**已解析 target** 拦；`nano_flow_*` 自己用 `node:fs`，不受影响。正文类参数（`content` / `old_string` / `pattern`）不扫，所以写文档提到路径、搜代码里的 `notes.json` 都照常。
- 解决方法：读写 Plan 状态一律走 `nano_flow_read` / `nano_flow_write`；这层是策略而不是安全边界，`pwsh` / `bash` 子进程、`jobs`、ripgrep 泛搜与编码路径仍可绕过。
- 验证：`notes-guard.test`（12 项）覆盖路径判定、工具闸门与 fs 包装；`index.test` 覆盖入口安装与卸载；真机在装包后的 Nano Flow 会话里复验「读 notes.json 被拒、读其它文件正常」。
- 来源：[2026-11-07-预设提示词评审](../../.agents/domains/dsh/plans/active/2026-11-07-预设提示词评审/spec.md) 的 note 06 / 07。

## 为什么 Nano Flow 预设里 persona 在、固定提示词和 `nano_flow_*` 却缺失？

- 适用条件与现象：新会话选中 Nano Flow 后，系统提示只有 persona 前缀「本会话运行 Nano Flow…」，没有固定提示词正文，工具目录里没有 `nano_flow_read` / `nano_flow_write` / `nano_flow_check`，随包 skill 也不出现；预设选择器正常、无报错，预设注册表也不报 broken。
- 原因：预设行的 `ctx.inject(["tools","systemPrompt"], …)` 回调里直接读了 `ctx.agent`（`a6f6b7cc` 为轮转引入）。cordis 对未在 `inject` 声明的服务属性有守卫，读取抛 `cannot get property "agent" without inject`；异常发生在注册提示词/工具/skill 之前，子 fiber 失败只写宿主日志。预设注册表只审计行自身的 inject（本行是 `skills`），不审计行内 `ctx.plugin` 子 fiber，所以整条预设仍显示可用。
- 解决方法：预设半不再读 `ctx.agent`；会话轮转移到根插件，按会话日志最后一条 `agent-preset/selected` 判定会话是否运行本预设，再包装 `sessionController.prompt`。改后必须重打包、重装并**重启宿主**——预设的 standing mount 在启动时建立，换文件不会刷新已在内存里的挂载。
- 验证：`$DSH_HOME/toolkit/nano-flow-mount.json` 依次出现 `entry` / `apply` / `ready` / `rotation`，`ready.promptBytes = 13041` 且 `tools` / `systemPrompt` / `skills` 为 true；`pnpm --filter @kxh4892636/dsh-toolkit check` 与 241 项测试通过。
- 来源：[2026-11-07-预设提示词评审](../../.agents/domains/dsh/plans/active/2026-11-07-预设提示词评审/spec.md)、[plugin.ts](../../packages/dsh-toolkit/src/nano-flow/plugin.ts)、[rotate.ts](../../packages/dsh-toolkit/src/nano-flow/rotate.ts)。
