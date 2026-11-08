# Context Map

## Contexts

- [etf](./.agents/domains/etf/CONTEXT.md) - ETF 行情产品：证券目录、日线缓存、图表与虚拟均线。

- [common](./.agents/domains/common/CONTEXT.md) - 由多个业务域共同贡献的基础业务域。
- [nano-flow](./.agents/domains/nano-flow/CONTEXT.md) - Nano Flow 业务域：从想法路由到经门禁验证交付的 Flow，以单一 CLI 收口内建子命令并管理 Nano Flow 与 CLI 路由 skill。
- [dsh](./.agents/domains/dsh/CONTEXT.md) - DSH 扩展业务域：工作区自研的 DeepSeek Harness 工具集插件（技能发现、会话撤回）。

- [music](./.agents/domains/music/CONTEXT.md) - 本地免版权古典曲库与消费该曲库的随机播放站点。

## Relationships

- **Nano Flow → Common**：Nano Flow 将跨业务域共享的基础约定贡献到 Common，并使用 Common 维护的共享基础能力。
- **DSH → Nano Flow**：DSH 工具集的嵌套 skill 工具使 Nano Flow 以嵌套 skill 形式分发的主流程 skill 能被发现与调用。
- [video](./.agents/domains/video/CONTEXT.md) - video 域：把图片、文字稿与录音合成为可发布视频的代码化渲染管线。
