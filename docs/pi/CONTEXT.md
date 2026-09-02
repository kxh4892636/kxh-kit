# Pi

Pi 扩展业务域以可安装 package 扩展 Pi coding agent。本域拥有 package 中的 extension、模型工具及其用户级配置，不拥有 Pi 上游运行时。

## Language

**Pi package**:
通过 `package.json` 的 `pi` manifest 声明 extension 等资源、可由 Pi 以 local、npm 或 git 来源安装的交付单元。
_Avoid_: Pi 插件包、单文件扩展

**Pi extension**:
由 Pi 加载的 TypeScript factory；它通过 `ExtensionAPI` 注册模型工具和其他运行时扩展点。
_Avoid_: 插件进程、provider

**全局插件配置**:
位于 Pi `getAgentDir()` 下、由一个 Pi package 跨项目共享的用户级配置；`pi-deepseek-web` 使用 `pi-deepseek-web.json`。
_Avoid_: 项目配置、package-local 配置

**原生网页搜索**:
通过 DeepSeek Anthropic-compatible Messages API 的 server-side `web_search` 工具产生结构化来源的搜索操作；每个查询消耗一次独立模型调用。
_Avoid_: URL 抓取、搜索摘要

**结构化搜索来源**:
来自 `web_search_tool_result` 的 URL、标题与日期，以及按 URL 关联的 citation snippet；provider prose 不属于来源。
_Avoid_: 模型回答、prose fallback

**公共网页抓取**:
不携带凭据地读取公共 HTTP(S) 文本资源，并把连接固定到已验证的公共地址；它不是浏览器执行环境。
_Avoid_: 浏览器访问、内网抓取、DeepSeek 抓取
