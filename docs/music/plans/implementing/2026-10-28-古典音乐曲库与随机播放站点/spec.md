---
status: in_progress
---

# 古典音乐曲库与随机播放站点

## 问题

用户要把 Internet Archive 上的 Musopen 镜像整包下载到本地，并在此之上做一个随机播放网站。关联 [US-001](story.md#us-001-整包落到本地并可校验)、[US-002](story.md#us-002-打开即随机播放)、[US-003](story.md#us-003-曲目信息来自索引而非文件名)。

已知约束：

1. 数据体积 9.61 GB / 580 个文件，不适合进 Git，仓库只留脚本与文档。
2. 本机对外网络必须经 `127.0.0.1:7890` 代理（直连 `archive.org` 超时），下载与后续任何回源都受此约束。
3. 条目许可为 CC Public Domain Mark 1.0，可自由复制；站点需标注来源。
4. 曲目元数据在来源侧只有文件名、`length`、`title` 等字段，需要自建索引层。

## 方案

分两段推进，先让曲库「完整且可核对」，再让站点「只读索引 + 本地音频」：

1. **曲库落地**（[01](01-曲库落地与校验.md)）：用 8 路并发、断点续传、md5 校验的 HTTP 抓取，把条目的 580 个文件落到 `C:\Users\kxh\Music\musopen-flac`，保留目录结构（`<作品目录>/<文件>`）。BT 路径已实测淘汰，理由见下。
2. **曲目索引**（[03](03-曲目索引生成.md)）：从 Internet Archive 元数据、ffprobe 与目录结构派生 `works` / `tracks` 两张表写进 SQLite，作为站点唯一数据源。
3. **站点**（[02](02-站点形态与技术选型.md) → [04](04-随机播放站点实现.md)）：前端静态产物由 Hono 托管，音频由 `@hono/node-server/serve-static` 以 Range/206 流式直出 FLAC；随机与历史全在前端 store。

## 已排除的备选

- **BitTorrent P2P 下载整包**：实测该条目 swarm 已死——45 秒内 peers 1–3、seeds 0–1、速率 2.6–4.1 KB/s、下载量 0 B；按此速率 9.61 GB 需数周。种子来自 2012 年众筹项目，做种者早已离线。
- **libtorrent + HTTP 代理走 web seed**：可行但仅约 300 KB/s（单 web seed 连接），比并行 HTTP 慢一个数量级；且 libtorrent 的代理只覆盖 tracker/web seed，peer 连接无法走 SOCKS5 的 UDP。
- **webtorrent-cli（Node）**：同样受 swarm 规模限制，且需额外安装 npm 包；没有比 libtorrent 更优的证据。
- **单连接 curl 顺序下载**：实测 0.22 MB/s，580 个文件要 12 小时以上；并发后提升到 1.2–3.3 MB/s。
- **直接调用 Musopen 官网接口**：官网免费账号每天 5 首、仅 MP3，拿不到 FLAC，也不覆盖镜像里的整批曲目。

## 实施决策

- **下载器**：`.temp/musopen/fetch_all.py`，标准库 + `curl.exe` 子进程，8 线程；每个文件 `-C -` 续传、`--retry 3`、完成后按 IA 元数据的 md5 校验，不一致删除重下（最多 4 轮）。
- **状态与错误**：`.temp/musopen/status.json`（总数/完成数/字节数/更新时间）、`.temp/musopen/errors.json`（失败清单），供恢复与验收读取。
- **落盘布局**：保留源目录层级，例如 `Bach_GoldbergVariations/JohannSebastianBach-01-GoldbergVariationsBwv.988-Aria.flac`；同目录并存 `.mp3`、`.ogg`、`.png`（封面）。
- **不用数据库**（2026-11-01 用户定稿）：服务端无状态，不引入 SQLite/Kysely，也就不需要迁移与连接生命周期。
- **曲目索引形状**：静态 `tracks.json`，`{ item, license, source, tracks[], works[] }`；每条曲目含 `id`（路径 sha1 前 12 位）、`composer`、`work`、`movement`、`track_no`、`title`、`artist`、`bytes`、`seconds`、`sample_rate`、`bits`、`cover`、`path`、`source_url`、`md5`、`license`。生成脚本 `.temp/musopen/build_index.py`，**由后端持有**：文件落 `apps/music/server/data/tracks.json`（可用 `TRACKS_FILE` 覆盖），经 `GET /api/tracks` 提供，不参与前端构建。
- **随机策略**：洗牌袋（Fisher–Yates 洗一轮，抽完再洗），状态在前端内存；重洗后首项若等于刚播曲目则与次项交换。
- **播放历史**：前端 `localStorage`（`zustand/persist`，`partialize` 只存 `history`），`{ id, playedAt }[]`，同曲先去重再 `slice(0, 13)`；写入时机为 `<audio>` 的 `playing` 事件。
- **音频交付**：FLAC 直出，走 Range/206 渐进加载与按需分片；已验证 `@hono/node-server@2.1.1` 的 `serve-static` 自带该能力。曲库与封面统一挂 `/media/*` → `MUSIC_ROOT`（默认 `C:\Users\kxh\Music\musopen-flac`），前端拼接 `path`/`cover`。
- **许可标注**：页面固定展示「来源 Internet Archive / Musopen，CC PD Mark 1.0」及条目链接。
- **界面风格**（2026-11-01，[05](05-界面视觉方向.md)）：单屏只有「当前曲目 + 最近听过」，无曲目列表，传输条位于曲目信息下方；Hallmark 的 Bloom 主题——暖纸 `oklch(97% 0.010 72)`、赭石 `oklch(53% 0.145 36)`、Ranade（400/500/700，自托管）、纸张网格只出现在波形块并向右淡出；签名是「录音自己的波形 + 走过的赭石进度线」，波形由 IA 封面 PNG 的 alpha 反相成剪影后 `mask-image` 着色；控制件 44px，强调色只落在播放帽、当前行、进度线与悬停动作。

## 工作环境

- 主机：Windows，工作区 `C:\Users\kxh\kxh-awesome\projects\kxh-kit`（仓库），曲库在仓库外 `C:\Users\kxh\Music\musopen-flac`。
- 网络：`HTTP_PROXY/HTTPS_PROXY/ALL_PROXY = http://127.0.0.1:7890`；直连 archive.org 8 秒超时，必须走代理。
- 工具：Python 3.12（uv 管理，仓库内 `.temp/musopen/venv` 装过 libtorrent 2.1.1 供探针用）、`curl.exe`、Node 24 + pnpm（仓库既有 `vite-plus` 工具链）。
- 磁盘：C 盘剩余约 628 GB，9.6 GB 曲库无压力。
- 领域文档校验：`node .agents/skills/nano-flow/scripts/check-domain.mjs .`。

## 范围

- 曲库：整包下载、md5 校验、失败重试、断点续传、落地目录与状态清单。
- 索引：由元数据与目录生成 `tracks.json`。
- 站点：随机播放、下一首、当前曲目信息、许可标注；先在本机可跑通。
- 领域文档：本 Plan（story / spec / notes）与 `music` 域 CONTEXT。

## 非范围

- 不做音乐推荐算法、社交、账号体系、播放列表编辑。
- 不做音频转码流水线的产品化（仅在需要时一次性转 Opus）。
- 不改动曲库源文件内容（不重命名、不写 ID3），信息一律进索引。
- 不做公网部署、CDN、鉴权；部署范围确认前不引入服务端。

## 执行约束

- **模式**：manual。下载执行可自动推进；站点形态与界面需要用户拍板，按 [02](02-站点形态与技术选型.md) 逐轮澄清。
- **授权**：用户 2026-10-28 指令授权「下载 + 建 Plan」；站点实现待 [02](02-站点形态与技术选型.md) 收敛后另行确认。
- **质量门禁最小集**：580/580 文件且 md5 全过 → `tracks.json` 可生成且曲目数与曲库一致 → 站点 `pnpm build` 通过、首次播放成功、连点「下一首」20 次无重复（未抽空时）。
- **停止点**：dev gate 停等用户确认；下载未完成前不进入站点实现（索引与选型可并行推进）。

## 待定

- ~~部署范围~~：2026-11-01 已定——暂只本机 `127.0.0.1`。
- ~~功能边界~~：2026-11-01 已定——随机播放 + 下一首 + 近 13 条播放历史。
- ~~格式策略~~：2026-11-01 已定——FLAC 直出，配 Range 流式/分片。
- ~~是否自建~~：2026-11-01 已定——完全自建（TS / React 静态前端 / Hono，范式参考 `apps/etf`）。
- ~~逐层框架~~：2026-11-01 已定稿，见「实施决策」与 [02](02-站点形态与技术选型.md)。
- ~~数据库~~：2026-11-01 已定——不用数据库；索引为静态 `tracks.json`，历史与洗牌全在前端。
- **音频交付细节**：Range 渐进加载为当前方案；HLS 切片不在范围（需 ffmpeg 转码，体积约翻倍），若日后要移动端自适应再单开 Plan。

## 上下文

- [故事](story.md)、[01 曲库落地与校验](01-曲库落地与校验.md)、[02 站点形态与技术选型](02-站点形态与技术选型.md)、[03 曲目索引生成](03-曲目索引生成.md)、[04 随机播放站点实现](04-随机播放站点实现.md)
- [领域语言](../../../CONTEXT.md)
- 来源条目：[archive.org/details/MusopenCollectionAsFlac](https://archive.org/details/MusopenCollectionAsFlac)
- 下载脚本与状态：`.temp/musopen/fetch_all.py`、`.temp/musopen/status.json`、`.temp/musopen/errors.json`

## 当前进度

2026-11-01 20:12：01 曲库、02 选型、03 索引、05 界面视觉方向均已 `completed`；05 经独立评审（结论 fix）逐条修复后复验通过。05 交付了 Hallmark Bloom 样张（`docs/music/design/ui-comp/`，sloplint 静态与 render 两档 0 FAIL / 0 REFLEX / 0 WARN，1440 与 390 截图在 `docs/music/design/shots/`）。剩余 [04](04-随机播放站点实现.md)：dev gate 基线已列，等待确认后开工。

## 恢复入口

1. 读 [story.md](story.md) 与本 spec 的「实施决策」，再读 [01](01-曲库落地与校验.md) 的探针结论与检查点。
2. 核对现场：`C:\Users\kxh\Music\musopen-flac` 应为 580 个文件 / 9,607,881,823 字节；`.temp/musopen/tracks.json` 应为 145 曲 / 37 作品；`apps/music` 尚未创建。
3. 下一动作：按 [04](04-随机播放站点实现.md) 的 dev gate 基线开工，先建 `apps/music` 骨架与 `/media` 的 206 冒烟，再落 `tracks.json` 与播放器。
4. 停止条件：dev gate 未确认不动代码；206 或自动播放失败时先查 `MUSIC_ROOT` 与实际路径，不放宽验收口径。

## Notes

| #   | Notes                                          | 状态      | 阻塞于 | 下一步                                  |
| --- | ---------------------------------------------- | --------- | ------ | --------------------------------------- |
| 01  | [曲库落地与校验](01-曲库落地与校验.md)         | completed | —      | —                                       |
| 02  | [站点形态与技术选型](02-站点形态与技术选型.md) | completed | —      | —                                       |
| 03  | [曲目索引生成](03-曲目索引生成.md)             | completed | 01     | —                                       |
| 04  | [随机播放站点实现](04-随机播放站点实现.md)     | pending   | 03     | dev gate 停等确认后搭 `apps/music` 骨架 |
