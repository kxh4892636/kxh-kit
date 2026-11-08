---
name: '002-Remotion工程与分镜编排'
description: 'Remotion 工程、分镜与混音交付'
status: completed
reason: ''
related_noted: []
next_step: ''
---

# 002-Remotion工程与分镜编排

> 迁移自旧 notes.json / story.md / spec.md；正文保留历史记录，旧工具、状态名与路径不再适用。
## 交付

`.temp/video/` 下可渲染的 Remotion 工程：竖屏 9:16 全构图、9 个镜头 (其中 3 个为多图拼接，16 张照片全部使用)、8 句逐句字幕、电影质感层 (调色/颗粒/暗角/漏光/缓慢推拉与漂浮运镜)、标题卡、混音音轨 (旁白 loudnorm + Carefree 闪避)。

## 分镜表 (16 图全部使用)

| # | 帧区间 | 布局 | 图片 |
| --- | --- | --- | --- |
| 1 | 0–150 | 单图 | img-14 博物馆入口 |
| 2 | 150–243 | 2×2 | img-07 青铜器 / img-06 金器 / img-05 展柜 / img-04 孝悌忠信墙 |
| 3 | 243–330 | 2×2 | img-09 读展签 / img-13 书架 / img-12 大同理想碑 / img-01 书架近景 |
| 4 | 330–456 | 单图 | img-02 文创店 |
| 5 | 456–540 | 单图 | img-03 折扇 |
| 6 | 540–636 | 单图 | img-00 博物馆外景 |
| 7 | 636–714 | 单图 | img-15 草地自拍 |
| 8 | 714–780 | 单图 | img-10 写「仁」互动桌 |
| 9 | 780–819 | 左右分屏 | img-11 印章画 / img-08 互动屏 |

## 排版

- 标题卡: 「A LITTLE MUSEUM STORY」26px + 「MY FAVOURITE PLACE」74px Georgia + 「孔子博物馆 · 2026」34px，1.5s;
- 常驻左上标签: 「KONGZI MUSEUM · 2026」36px + 金色短线, 第 50 帧淡入;
- 字幕: Georgia 58px, `text-wrap: balance`, 底部安全区 bottom 300, 逐句淡入上浮。

## 混音

- 旁白: loudnorm -16 LUFS, 延迟 1.5s, 尾部补 1s;
- BGM: Kevin MacLeod「Carefree」(CC BY 4.0) 截取 27.3s, loudnorm **-30 LUFS** (2026-11-07 用户要求下调 4dB), 音量包络淡入 1.0s / 淡出 1.6s; 旧版 Suk《Meditation》音轨保留为 `public/bgm_ready_suk.wav` / `public/final_audio_suk.wav`; Carefree 初版 (-26 LUFS) 保留为 `final_audio_carefree.wav` / `out/museum-carefree.mp4`;
- 闪避: 逐句区间用 Python 包络压低 11dB (attack 80ms / release 450ms), 后混音并限幅;
- 成品: 旁白段 -16.3 LUFS, BGM-only 段 -29.5 LUFS, 全片 -16.8 LUFS, 真峰 -1.44 dBTP。

## 范围

- 做: 工程骨架与依赖、素材命名、分镜与字幕数据、视觉组件、混音链、抽帧验证。
- 不做: 通用 CLI、测试基建、多平台版本。

## 验收

- [x] 工程可 bundle 并渲染单帧成功
- [x] 分镜表覆盖 16 张图, 每图仅用一次
- [x] 字幕 8 句与录音时间对应
- [x] 混音完成, 响度达标 (BGM 已按要求下调)
- [x] 无占位素材
- [x] 成片渲染成功 (见 note 03/04/05)

## 直接依赖

- **01**: 已定案 (路线/规格/元素/素材路径)

## 上下文

- Plan 目录: `.agents/domains/video/plans/active/2026-11-07-图片文字录音剪辑为视频/`
- 工程文件: `src/Museum.tsx`、`src/data.ts`、`src/Root.tsx`、`src/index.ts`
- 素材: `.temp/video/public/assets/img-00..15.jpg`、`public/final_audio.wav`、`public/grain.png`
- BGM 源: `https://incompetech.com/music/royalty-free/mp3-royaltyfree/Carefree.mp3` (CC BY 4.0, Kevin MacLeod)
- 抽帧证据: `out/v4-170.png`、`out/v4-480.png`、`out/v4-660.png`、`out/v4-800.png`、`out/v9-170.png`；成片抽帧在 `out/verify22/`、`out/verify-carefree/`

## 决策

- **竖构图优先**: 照片 3:4 竖幅, 全屏 cover 裁切 (主要裁左右), 不做横带 letterbox——用户明确要求。
- **多图拼接承担内容密度**: 24.8s 内 16 张图, 用 2×2 网格与左右分屏承载「很多老物件与照片」「读故事」与结尾蒙太奇, 其余单图全屏。
- **隐藏手机水印**: 单图 scale ≥1.12、网格 cell scale ≥1.14 并把底部约 5% 裁掉, 避免 HONOR 水印入画。
- **环境坑**: Remotion 自带 ffmpeg 无法写系统 `%TEMP%` (Permission denied → `write EOF`), 渲染前把 `TEMP`/`TMP` 指到 `.temp/video/tmp`。

## 迁移前的证据
- 工程可 bundle 并单帧渲染通过: out/v9-170.png (顶标签/拼贴), out/v8-35.png (标题卡)
- 分镜表覆盖 16 张图、每图一次: note 02 表; 抽帧 out/v4-170.png / v4-480.png / v4-660.png / v4-800.png
- 混音: 旁白 -16 LUFS, BGM -28 LUFS 段, 成品 -17.2 LUFS / -1.4 dBTP
- 成片渲染 819/819 帧: out/render-crf22.log (+ out/museum.mp4)
