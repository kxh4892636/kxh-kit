# 删除 pi-toolkit 及其相关 Plan

我不再维护 pi（pi harness）侧的扩展了，想把工作区里的 `@kxh4892636/pi-toolkit` 连同它在 `.agents` 里留下的域文档与 Plan 一起清掉，避免死代码、陈旧 ADR 与半途 Plan 继续占用注意力。

但删除是不可逆操作，我要在动手前看到**准确清单**：哪些文件、哪些 Plan、哪些本机配置会被删，哪些东西会因此失效（例如引用它路径的 `~/.pi/agent/settings.json`），以及哪些属于「删了也无所谓」的产物。

验收标准：清单逐项经我确认后才执行；删除后工作区仍能通过 `nano_flow_check` 的 `workspace` 与本仓 `vp check`，且没有指向已删除目录的悬空引用。
