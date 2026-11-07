# 图片文字录音剪辑为视频 — 规格

## 目标

把「图片集 + 文字稿 + 该文字对应的录音」合成为一个可发布的 mp4。交付形态为一次性成品, 不做通用工具。

## 已定结论 (最终)

- 实现路线: Remotion (React 时间轴, Chromium 渲染); 自带轻量 ffmpeg, 无需系统安装;
- 画布: 竖屏 9:16, 1080×1920, 30fps, 819 帧 (27.3s);
- 视觉: **竖屏全构图**——照片 3:4 竖幅全屏 cover, 不做 2.35:1 横带; 电影质感 = 微调色 + 胶片颗粒 + 暗角 + 漏光 + 缓慢推拉/漂浮运镜 + 标题卡 + 字幕动效;
- 图片: 16 张全部使用且各用一次 (9 个镜头, 其中 2×2 网格 ×2、左右分屏 ×1 承担内容密度);
- 文字: 8 句逐句字幕, 由 `silencedetect` 切分对齐录音, 第 4 句含句内停顿, 跨两段合并;
- 结构: 1.5s 标题卡 + 正文 + 尾部留白, 共 27.3s;
- 音频: 旁白 loudnorm 至 -16 LUFS; BGM 为 Kevin MacLeod「Carefree」(CC BY 4.0, incompetech.com, 欢快吉他/乌克丽丽), **BGM 目标 -30 LUFS**, 侧链闪避后混音; 旁白段 -16.3 / BGM-only 段 -29.5 / 全片 -16.8 LUFS, 真峰 -1.44 dBTP; 片尾署名「CAREFREE BY KEVIN MACLEOD · CC BY 4.0 · INCOMPETECH.COM」;
- 旧版回退: 初版 BGM 为 Suk《Meditation》(Musopen, CC PD Mark 1.0), 成片与音轨保留在 `C:\Users\kxh\Pictures\kxr\museum-suk.mp4`、`public/final_audio_suk.wav`;
- 验收物: 一个 mp4 成品 + 可读的 Remotion 工程代码。

## 素材

- 源: `C:\Users\kxh\Pictures\kxr`——16 张 1279×1706 (最后一张 1024×1366) 照片 + 1 个 m4a 录音 (24.78s);
- 录音文案: 8 句英文 (museum 主题), 用户原文提供;
- BGM (现行): Kevin MacLeod「Carefree」, `https://incompetech.com/music/royalty-free/mp3-royaltyfree/Carefree.mp3`, 205s / 256kbps, CC BY 4.0;
- BGM (已弃用): `C:\Users\kxh\Music\musopen-flac\Suk_Meditation\JosefSuk-Meditation.flac` (405s, 公共领域)。


## 环境事实 (2026-11-07 取证)

- pnpm monorepo; Node v24.21.0, pnpm 11.22.0;
- 系统无 ffmpeg/ffprobe, 无 winget/scoop/choco; Remotion v4.0.541 自带轻量 ffmpeg (缺 afade/sidechaincompress, 故闪避用 Python 包络实现);
- Chromium 由 `npx remotion browser ensure` 安装;
- 工作区 wiki 已有结论: 视频编辑应走代码/API 而非 GUI。

## 为什么放弃 FFmpeg 直管线 (路径 A)

用户明确选择 Remotion: 电影感分镜需要逐帧合成 (相机运动、光效、转场、字幕动效), 纯滤镜链编排成本高于 React 时间轴; 代价 (下载 Chromium、渲染慢) 已获知悉。

## 当前进度

- 已完成: 域与 Plan 初始化; 工作区取证; 两轮拷问与定案 (含 BGM、竖构图、全图使用、字号四次修订); 工程与分镜; 混音; 渲染; 成片验收; BGM 换为 Carefree 并重渲染; **BGM 音量下调 4dB (-30 LUFS) 并 remux**。
- 成品: `C:\Users\kxh\Pictures\kxr\museum.mp4` (1080×1920, 30fps, 27.307s, 28.4MiB, Carefree 版); 旧 BGM 版 `museum-suk.mp4` 同目录。
- 待办: 无。2026-11-07 用户确认归档到 `archived`；同时按用户指示删除工程目录 `.temp/video`（Remotion 工程、`src/`、`public/`、混音与颗粒脚本），仅留成品 mp4。

## 排版与实现约束

- 标题卡: 「A LITTLE MUSEUM STORY」26px + 「MY FAVOURITE PLACE」74px Georgia + 中文 34px, 1.5s 淡入淡出;
- 左上角常驻标签: 「KONGZI MUSEUM · 2026」36px + 金色短线, 第 50 帧起淡入;
- 字幕: Georgia 58px, `text-wrap: balance`, 底部安全区 (bottom 300), 逐句淡入上浮;
- 环境坑: Remotion 自带 ffmpeg 无法写系统 `%TEMP%` (Permission denied → `write EOF`), 渲染前把 `TEMP`/`TMP` 指向 `.temp/video/tmp` 即可。

## 恢复入口

> 工程已删除：`.temp/video` 于 2026-11-07 清掉，本 spec 里「改 `src/data.ts` 后重渲染」的承诺随之失效，需要重跑时只能从本 spec 重建工程。

- Plan 目录: `.agents/domains/video/plans/archived/2026-11-07-图片文字录音剪辑为视频/`
- 再读 note 01 (拷问与定案) 与 note 02 (工程与分镜) 了解当时的实现选择。
- 成品: `C:\Users\kxh\Pictures\kxr\museum.mp4` 与 `museum-suk.mp4`。

## 待定

- 无。素材源与录音仍在 `C:\Users\kxh\Pictures\kxr`，但渲染工程与脚本已删除。
