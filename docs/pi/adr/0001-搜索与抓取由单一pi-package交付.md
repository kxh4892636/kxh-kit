# 搜索与抓取由单一 Pi package 交付

`pi-deepseek-web` 以一个 Pi package 注册稳定的 `web_search` 与 `web_fetch` 模型工具：前者通过 DeepSeek 原生网页搜索获得结构化来源，后者通过匿名公共 HTTP(S) provider 抓取页面。两项能力共享交付、配置入口与外部内容信任提示，但不共享 provider 或凭据。

## Considered Options

- **单一 package 同时交付（选定）**：与 DeepSeek Harness 的模型工具集合对齐，安装一次即可完成搜索后阅读来源。
- **只交付搜索**：范围较小，但模型无法读取搜索结果指向的完整页面；被用户明确拒绝。
- **拆成 search 与 fetch 两个 package**：provider 边界更显式，但增加安装、启用与版本配对成本，不符合一个插件完成 web 访问的目标。

## Consequences

- package 名包含 DeepSeek，但只有 `web_search` 使用 DeepSeek API；`web_fetch` 始终匿名且不得发送搜索凭据。
- 任一工具可独立演进内部模块，但模型可见名称与全局配置文件保持统一。
