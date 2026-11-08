# Questions

<!-- 由 nano_flow_check 生成，请勿手改 -->

| Name | Description |
| --- | --- |
| [001-desktop-dump-config报错](001-desktop-dump-config%E6%8A%A5%E9%94%99.md) | 在 desktop profile 上执行 --dump-config 等 boot 类命令时报独占托管错误。 |
| [002-PATH上的dsh不能装desktop插件](002-PATH%E4%B8%8A%E7%9A%84dsh%E4%B8%8D%E8%83%BD%E8%A3%85desktop%E6%8F%92%E4%BB%B6.md) | PATH 上的 dsh 与 desktop 宿主版本不一致，装 desktop 插件会写错 profile。 |
| [003-desktop-profile报缺少peer](003-desktop-profile%E6%8A%A5%E7%BC%BA%E5%B0%91peer.md) | desktop profile 执行 pnpm peers check 时报缺少 @deepseek-ai/* peer。 |
| [004-插件被判定incompatible](004-%E6%8F%92%E4%BB%B6%E8%A2%AB%E5%88%A4%E5%AE%9Aincompatible.md) | dsh plugin add 输出插件与当前 DSH 版本不兼容时如何对齐声明。 |
| [005-DSH出站流量走本机代理](005-DSH%E5%87%BA%E7%AB%99%E6%B5%81%E9%87%8F%E8%B5%B0%E6%9C%AC%E6%9C%BA%E4%BB%A3%E7%90%86.md) | 系统代理已开启但 DSH 的 LLM / web 搜索 / web fetch / MCP 仍直连。 |
| [006-宿主不能原地删除或截断会话](006-%E5%AE%BF%E4%B8%BB%E4%B8%8D%E8%83%BD%E5%8E%9F%E5%9C%B0%E5%88%A0%E9%99%A4%E6%88%96%E6%88%AA%E6%96%AD%E4%BC%9A%E8%AF%9D.md) | 想让同一 session id 回到上一轮结束状态时，宿主没有原地截断能力。 |
| [007-恢复Plan为什么只读](007-%E6%81%A2%E5%A4%8DPlan%E4%B8%BA%E4%BB%80%E4%B9%88%E5%8F%AA%E8%AF%BB.md) | 恢复已有 Plan 时模型直接开工，未经确认就改文件或跑构建。 |
| [008-预设出现但提示词或工具缺失](008-%E9%A2%84%E8%AE%BE%E5%87%BA%E7%8E%B0%E4%BD%86%E6%8F%90%E7%A4%BA%E8%AF%8D%E6%88%96%E5%B7%A5%E5%85%B7%E7%BC%BA%E5%A4%B1.md) | Nano Flow 预设可选，但会话里没有提示词、nano_flow_* 工具或随包 skill。 |
| [009-第三方插件自定义会话事件导致历史加载失败](009-%E7%AC%AC%E4%B8%89%E6%96%B9%E6%8F%92%E4%BB%B6%E8%87%AA%E5%AE%9A%E4%B9%89%E4%BC%9A%E8%AF%9D%E4%BA%8B%E4%BB%B6%E5%AF%BC%E8%87%B4%E5%8E%86%E5%8F%B2%E5%8A%A0%E8%BD%BD%E5%A4%B1%E8%B4%A5.md) | 插件用 session.append 写自定义事件后，宿主重启冷读会话日志会拒绝整条历史。 |
