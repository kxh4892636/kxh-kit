---
name: Context Map
description: 领域索引与关系。
---

# Context Map

<!-- 由 nano_flow_check 生成，请勿手改 -->

## Contexts

- [Common](./common/CONTEXT.md) - 由多个业务域共同贡献的基础业务域，承载跨业务域共享的基础约定。
- [DSH](./dsh/CONTEXT.md) - 工作区自研 DeepSeek Harness 扩展的业务域：独立插件包、可开关工具与 Nano Flow 预设。
- [ETF](./etf/CONTEXT.md) - ETF 行情产品：证券目录、日线缓存、图表与虚拟均线。
- [Music](./music/CONTEXT.md) - 本地古典曲库（Musopen 与本地收藏）与消费该曲库的随机播放站点。
- [Nano Flow](./nano-flow/CONTEXT.md) - Nano Flow 业务域：以单一 nnf CLI 提供 AnkiConnect 自动化与受管 skill 分发；文档流程已由 pi / dsh 域的 nano-flow 实现取代。
- [Pi](./pi/CONTEXT.md) - pi 编码代理的扩展业务域：一个 @kxh4892636/pi-toolkit 包按开关提供嵌套 skill 发现与 $ 引用、会话自动命名、DeepSeek 网页搜索与抓取、向用户提问、Nano Flow 交付流程。
- [video](./video/CONTEXT.md) - 把图片、文字稿与录音合成为可发布视频的代码化渲染管线。

## Relationships

- **DSH → Nano Flow**：DSH 工具集的嵌套 skill 工具使 Nano Flow 以嵌套 skill 形式分发的主流程 skill 能被发现与调用。
- **Nano Flow → Common**：Nano Flow 将跨业务域共享的基础约定贡献到 Common，并使用 Common 维护的共享基础能力。
