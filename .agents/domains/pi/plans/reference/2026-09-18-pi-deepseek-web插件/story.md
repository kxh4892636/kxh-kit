# pi-deepseek-web插件

> 由 spec 迁移生成（2026-11-07）；原 Plan 无独立 story。

## US-001 pi-deepseek-web插件

pi 没有内置 web 搜索。用户需要经 DeepSeek 获得 web 搜索能力，并显式要求插件有一个配置文件用于配置 DeepSeek API。参考 DeepSeek Harness 的 `web-search-deepseek` 与 `tool-web` 实现，另需补一个 web 抓取工具以读取具体页面。
