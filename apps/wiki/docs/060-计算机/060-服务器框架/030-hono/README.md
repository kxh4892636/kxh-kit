# Hono 服务端开发

- 学习目标: 在 Node.js 上用 Hono 独立交付一个 HTTP 后端服务——路由、读取请求、处理错误、校验参数、接认证、上线部署;
- 最快入口: [初始化项目](./001-快速上手/030-初始化项目.md) → [启动与验证](./001-快速上手/040-启动与验证.md)，十分钟内跑出可 curl 的接口;
- 开发主线: [001-快速上手](./001-快速上手/README.md) 打基础，[002-服务端开发](./002-服务端开发/README.md) 补齐工程能力;
- 上线前: [003-上线](./003-上线/README.md) 做构建、部署、静态文件与性能确认;
- 查手册: [090-按需查阅](./090-按需查阅/README.md) 放中间件/Helper 速查、RPC 客户端与 JSX 渲染;
- 范围: 只覆盖 Node.js 运行时；Cloudflare Workers、Deno、Bun、AWS Lambda、Vercel 等平台差异按需再查官方文档;
- 来源: [honojs/website/docs](https://github.com/honojs/website/tree/main/docs) 与 [@hono/node-server README](https://github.com/honojs/node-server)；目录组织、分层建议与验收步骤是应用整理，不是官方规范;
- 版本: 内容基于 Hono v4 文档；Node.js 官方建议 20 及以上（网站文档给出 18.14.1+ 的下限）;

## 这套笔记怎么读？

```text
先跑通 → 001/030 初始化项目 → 001/040 启动验证
再理解 → 001/010 是什么 → 001/020 请求生命周期
补能力 → 002/ 校验、认证、中间件、CORS、缓存、上传、测试
要上线 → 003/ 构建、Docker、优雅退出、静态文件、日志
按需查 → 090/ 速查表与 RPC/JSX/流式/WebSocket
```

- 每篇只讲一个概念，目标 55 行左右，最长不超过 144 行;
- 跨篇引用只做指向，完整解释只出现在一处;

## 这份手册覆盖了哪些原始资料？

- 已覆盖: `api/*`、`concepts/*`、`getting-started/{basic,nodejs}`、`guides/{middleware,validation,rpc,testing,best-practices,jsx,helpers,create-hono}`、`helpers/*`、`middleware/builtin/*`、`index.md`;
- 排除: 各平台部署文档（aws-lambda、azure-functions、cloudbase、cloudflare-*、bun、deno、fastly、lambda-edge、netlify、nextjs、service-worker、supabase-functions、vercel、webassembly-wasi、ali-function-compute、google-cloud-run）——非 Node 运行时;
- 排除: `guides/jsx-dom`（客户端 DOM 渲染）、`api/index`、`guides/examples`、`guides/others`（索引与社区页，无独立知识点）;
- 部分覆盖: `agents/*`（Hono CLI 用法已收进 [用 CLI 做行为回归](./090-按需查阅/050-用CLI做行为回归.md)）；`guides/migrating-to-v5`（只保留弃用项速查）；`helpers/ssg`、`helpers/css`（仅速查级）;
