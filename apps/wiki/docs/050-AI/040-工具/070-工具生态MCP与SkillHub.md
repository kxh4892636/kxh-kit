---
id: 3e2265fe-1af7-454f-b1d4-1db152a289e0
---

# 工具生态：MCP 与 Skill Hub

## MCP 解决什么问题？

- 背景: 每个 Agent 框架定义工具的方式都不一样——OpenAI 的 function calling 格式、Anthropic 的 tool use 格式、LangChain 的 Tool 抽象，工具开发者需要为不同框架重复适配;
- 定义: **Model Context Protocol（MCP）** 是 Anthropic 于 2024 年底发布的开放标准，旨在统一 AI 模型与外部工具、数据源之间的通信协议;
- 架构: 客户端-服务器——**MCP 服务器**暴露一组工具，**MCP 客户端**（通常是 Agent 框架或 IDE）通过标准化协议与服务器通信;

## MCP 的关键设计决策有哪些？

- 工具描述格式标准化: 每个工具通过 JSON Schema 定义输入参数的类型、约束与描述，确保不同客户端都能正确理解工具的使用方式;
- 传输层灵活: 同一个服务器既可作本地进程运行（本地传输用 stdio，即标准输入输出），也可部署为远程服务（远程传输用 Streamable HTTP，早期的 SSE 方案已弃用）;
- 资源与工具分离: 除可执行工具外还定义只读的**资源**（如文件内容、数据库记录），客户端可浏览和读取资源而无需调用工具，使 Agent 能区分“获取信息”与“执行操作”;
- 三类原语: tools 对应“模型可执行的操作”、resources 对应“应用可读取的数据”、prompts（提示模板）对应“用户可选用的模板”，后者是由服务器提供的可复用提示词模板;

## MCP 的生态价值是什么？

- 一次开发，处处可用: 一个 MCP 服务器可以同时被 Cursor、Claude Desktop、OpenClaw 等任何兼容客户端使用，工具开发者无需关心上游 Agent 框架的差异;
- 现状: MCP 已被多个主流 Agent 框架和 IDE 采纳，正在成为工具互操作的重要标准;

## Skill 通过什么机制分发？

- 机制: MCP 统一的是**专用工具**的接入方式；Skill 不需要协议——一个 skill 就是一个装着 `SKILL.md` 的文件夹，分发机制是**注册表**（registry）;
- 例子: Vercel 于 2026 年 1 月上线的 skills.sh，一条 `npx skills add <owner>/<repo>` 命令即可安装；OpenClaw 生态则有自己的 ClawHub;
- 互通: MCP 官方在推动 skill 经由 MCP 被发现和传递，同一个 skill 既可以躺在 Skill Hub 里等 `npx` 来装，也可以由一台 MCP 服务器供给;

## 接入一条能力的 token 成本如何比较？

- MCP 接入: 运行时建立一条连接，客户端通过 `tools/list` 拿到它暴露的全部工具定义；这些定义是否全部进入**每一次会话**的上下文，取决于宿主的披露策略——早期或简单的宿主全量注入完整 schema，Claude Code 的 MCP Tool Search、Codex 的工具允许列表则只在启动时放入名称或索引;
- Skill 接入: 只是往磁盘上拷一个文件夹，常驻上下文的只有目录里的 `name` 和 `description`;
- 对比: 全量注入配置下，一批专用工具往往比同等数量的 Skill 目录项多占一到两个数量级的 token；启用按需加载后，两者的差距就不能仅凭“是否通过 MCP 接入”来判断了;
