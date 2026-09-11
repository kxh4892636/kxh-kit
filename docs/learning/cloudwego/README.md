# Kitex / Hertz 服务端开发笔记重构记录

- 目标：以使用和快速上手为主，能够新增服务端接口、实现存储、处理错误并验证结果。协议内部结构、复杂流式模型和底层扩展只保留按需入口。
- 来源：[CloudWeGo 文档仓库快照](https://github.com/cloudwego/cloudwego.github.io/tree/38744fc12990bb900765d0235c171a80c9fa2af9)，提交 `38744fc12990bb900765d0235c171a80c9fa2af9`。
- 范围：原有 Kitex / Hertz 的 60 个 Markdown 文件，其中正文 48 篇、导航 12 篇；没有把整个官方站点扩成必学内容。
- 身份：48 个旧 UUID 均保留，目录迁移后更新相对链接；新目录深度不超过二级，每个末级目录不超过 13 个 Markdown 文件。
- 篇幅：普通正文平均约 52 行，最长 81 行；两篇完整实战分别 784、993 行，按用户要求豁免实战的行数限制。

## 阅读入口

| 笔记 | 主线 | 按需内容 |
| --- | --- | --- |
| [Kitex](../../../apps/wiki/docs/60-计算机/6060-服务器框架/606010-Kitex/README.md) | 快速上手 → 服务端开发 → 完整实战 | 协议速查、特殊需求；服务发现与容量治理按部署需要使用 |
| [Hertz](../../../apps/wiki/docs/60-计算机/6060-服务器框架/606020-Hertz/README.md) | 快速上手 → 服务端开发 → 完整实战 | 上线检查、出站调用和特殊能力 |

## 覆盖账本

[coverage.json](./coverage.json) 记录 1052 条源条目，包括普通知识点、表格行和代码块；合并重复职责说明后为 1024 个归属条目。

- `originals`：旧路径、新路径、原文 SHA256、原 UUID。
- `knowledge.sources`：全部旧来源文件、行号与原小节；合并项还保留原始表述 `variants`。
- `knowledge.target`：唯一主归属文件与问题标题。
- `reference-only-per-user-scope`：按用户要求收缩复杂内容，目标为按需查阅入口，不表示仍在正文展开原理。
- `references`：各篇对应的官方页面；业务模型、分层、CRUD、配置优先级和迁移命令属于笔记的应用示例，不冒充框架规定。

账本中的行号指重构前材料；核对时使用旧版本或其 SHA256，不应拿新文件同一行号作比较。

## 修正的上手障碍

- Kitex 实战补齐 package、import、领域转换、TableName、数据库配置、迁移、测试和 Dockerfile。
- 按实际生成结果使用 Kitex `Id` 字段，避免把领域 `ID` 直接当作生成字段名。
- 普通 Kitex RPC 的超时传播明确要求 TTHeader、双方 MetaHandler 和服务端 `WithEnableContextTimeout(true)`。
- BizStatus 明确协议前提，以及中间件需要从 RPCInfo 读取业务状态的行为。
- Hertz 固定兼容的 Apache Thrift v0.13.0，修正无定义的 `api.thrift` include 与 `api.file` 注解。
- Hertz 保留根目录入口及生成路由，补齐 CRUD、JWT 校验、本地 Token 工具、错误响应、请求 ID、数据库与迁移。
- MySQL Row 显式指定表名；相同内容的 PUT 使用 `clientFoundRows=true` 避免误报不存在。
- 修正将 Hertz `OnShutdown` 当作所有 Handler 结束后清理数据库的错误表述。

## 验证证据与限制

| 检查 | 结果 | 范围 |
| --- | --- | --- |
| UUID | 通过 | 48 个旧值不变，检查整个实时 Wiki 的 UUID 重复 |
| 结构与链接 | 通过 | 60 文件的内部链接、问题式 H2、非空答案、代码围栏、目录与行数约束 |
| MDX 编译语法 | 通过 | 用当前安装的 MDX 编译器检查 60 文件 |
| Kitex 代码生成 | 通过 | tool v0.16.3 / thriftgo v0.4.5；重复生成无代码变化 |
| Hertz 代码生成 | 通过 | hz v0.9.7；`hz update` 后无代码变化 |
| `go test ./...` | 两套通过 | Kitex Service、Handler 与真实 TCP/TTHeader 业务异常；Hertz Engine CRUD、401、403、404、输入限制及副作用 |
| `go vet ./...` | 两套通过 | 完整实战代码 |
| `go build ./...` | 两套通过 | 完整实战代码，Go 1.26.8 / Windows amd64 |
| MySQL / Compose | 未执行 | 当前环境没有 Docker；fake Repository 测试不能代替真实数据库验收 |
| `go test -race` | 未执行 | 当前环境没有可用的 C 编译器 |
| Wiki 完整构建 | 环境阻断 | prebuild 的 Vite+ 原生绑定无法加载；绕过 prebuild 后，Jieba 原生绑定也无法加载 |

完整构建已尝试 `pnpm --filter @kxh4892636/wiki build` 和 `pnpm --filter @kxh4892636/wiki exec docusaurus build`。未修改项目配置来隐藏失败，也未把 MDX 语法检查报告为完整站点构建成功。

实战代码通过不表示全部生产能力已经部署：本例注册发现、真实认证服务、观测平台与容器验收按实际环境接入；迁移中途失败需要核对 MySQL DDL 和版本记录。
