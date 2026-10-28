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
