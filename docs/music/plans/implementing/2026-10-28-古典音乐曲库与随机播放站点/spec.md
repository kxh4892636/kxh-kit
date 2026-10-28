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
2. **曲目索引**（[03](03-曲目索引生成.md)）：从 Internet Archive 元数据（`title`、`length`、`md5`、文件路径）与目录结构派生 `tracks.json`，作为站点唯一数据源。
3. **站点**（[02](02-站点形态与技术选型.md) → [04](04-随机播放站点实现.md)）：静态前端 + 静态音频（构建期复制或符号链接到 `public/audio`），`<audio>` 直接播 FLAC；随机用洗牌袋，不在播放中重复。

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
- **曲目索引形状**（草案，待 [03](03-曲目索引生成.md) 定稿）：`{ id, composer, work, movement, title, format, bytes, seconds, cover, path, sourceUrl, license }`；`path` 相对曲库根，站点按需拼成可被静态服务器 Range 提供的 URL。
- **随机策略**：洗牌袋（Fisher–Yates 洗一轮，抽完再洗），可选「同作曲家不相邻」约束；不使用 `Math.random()` 直接抽（会连续重复）。
- **音频交付**：优先 FLAC（Chrome/Firefox/Safari 均支持），必要时构建期转 Opus 兜底；静态服务器必须支持 `Accept-Ranges`（Vite dev / `serve` / nginx 默认满足）。
- **许可标注**：页面固定展示「来源 Internet Archive / Musopen，CC PD Mark 1.0」及条目链接。

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

- **部署范围**：仅本机 `localhost`，还是局域网其他设备也能访问？影响是否引入服务端与监听地址。
- **功能边界**：只要随机播放，还是需要按作曲家/时期筛选、收藏、历史？
- **格式策略**：FLAC 直出（省事、体积大）还是构建期转 Opus（省流量、多一步）。
- **是否自建**：Navidrome / Jellyfin 等开源音乐服务器已含随机播放与现成客户端；自建换取的是界面与随机策略的完全掌控。待用户在 [02](02-站点形态与技术选型.md) 中拍板。

## 上下文

- [故事](story.md)、[01 曲库落地与校验](01-曲库落地与校验.md)、[02 站点形态与技术选型](02-站点形态与技术选型.md)、[03 曲目索引生成](03-曲目索引生成.md)、[04 随机播放站点实现](04-随机播放站点实现.md)
- [领域语言](../../../CONTEXT.md)
- 来源条目：[archive.org/details/MusopenCollectionAsFlac](https://archive.org/details/MusopenCollectionAsFlac)
- 下载脚本与状态：`.temp/musopen/fetch_all.py`、`.temp/musopen/status.json`、`.temp/musopen/errors.json`

## 当前进度

2026-10-28 19:47：曲库下载进行中——目标 580 个文件 / 9,607,881,823 字节（约 9.61 GB），当时已完成 55 个文件、125 MB，速率约 1.25 MB/s。BT 探针与取舍已完成并记录在 [01](01-曲库落地与校验.md)。站点与索引尚未开始（notes 02–04 pending）。阻塞：无。

## 恢复入口

1. 读 [story.md](story.md) 与本 spec 的「实施决策」，再读 [01](01-曲库落地与校验.md) 的探针结论与检查点。
2. 核对现场：`.temp/musopen/status.json` 的 `done_files/total_files` 与 `C:\Users\kxh\Music\musopen-flac` 实际文件数、体积是否一致；后台任务是否仍在跑（`job_list`）。
3. 下一动作：下载未完成则轮询状态（脚本可安全重跑，只补缺）；完成后按 [03](03-曲目索引生成.md) 生成 `tracks.json`，同时用 [02](02-站点形态与技术选型.md) 向用户收敛四个待定。
4. 停止条件：出现 md5 反复不一致或大量 404 时，先核对 IA 元数据是否变更，不要放宽校验；`errors.json` 非空即视为未完成。

## Notes

| #   | Notes                                          | 状态        | 阻塞于 | 下一步                                         |
| --- | ---------------------------------------------- | ----------- | ------ | ---------------------------------------------- |
| 01  | [曲库落地与校验](01-曲库落地与校验.md)         | in_progress | —      | 轮询 `status.json` 直到 580/580 且 errors 为空 |
| 02  | [站点形态与技术选型](02-站点形态与技术选型.md) | pending     | —      | `/questing` 收敛部署范围、功能、格式、是否自建 |
| 03  | [曲目索引生成](03-曲目索引生成.md)             | pending     | 01     | 用 IA 元数据与目录派生 `tracks.json`           |
| 04  | [随机播放站点实现](04-随机播放站点实现.md)     | pending     | 02, 03 | `/delivery` dev gate 停等确认                  |
