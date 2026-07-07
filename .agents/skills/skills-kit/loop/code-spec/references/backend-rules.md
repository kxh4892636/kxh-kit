# Backend Rules

读取本文件处理 Go 后端架构、API/RPC 路由、service/use case、repository、integration、middleware、数据库访问、后台任务和运行时配置。前端 TypeScript 规则不适用于本文件。

## 项目结构

Go 后端项目默认组织：

```text
.
├── main.go           # 实例装配、服务启动、路由/RPC 注册
├── proto/            # API/RPC 契约源文件，变更先改契约
├── gen/              # 生成代码，只读，不手写
├── internal/
│   ├── config/       # 环境变量、运行时配置、常量
│   ├── database/     # DB 打开、连接池、迁移辅助、基础设施初始化
│   ├── model/        # 数据库模型或持久化模型
│   ├── repository/   # 数据访问实现，封装 ORM/SQL
│   ├── integration/  # 第三方服务、外部协议、SDK/client 封装
│   ├── service/      # 业务用例、业务规则、事务边界
│   ├── middleware/   # 认证、CORS、日志、错误、request id 等中间件
│   └── job/          # 定时任务、队列消费者、后台处理
├── script/           # 初始化脚本、运维脚本
└── data/             # 本地开发数据文件，不放生产数据
```

## 核心模型

后端架构中心是业务用例，不是目录、ORM、框架或某个 service 结构体本身。先从用户请求或系统行为识别业务用例，再决定入口、业务流程、数据访问和外部集成如何拆分。

```text
Handler / Controller / RPC
        ↓
Service / Use Case
        ↓
Repository / Integration
        ↓
Database / Third-party
```

## 分层规则

- Handler / Controller / RPC 只做协议适配、入参校验、鉴权上下文读取、调用 service/use case、响应组装。
- Service / Use Case 承载业务流程、业务规则、依赖能力定义和事务边界，避免直接依赖具体 HTTP/RPC 框架对象。
- Repository 封装数据访问、ORM/SQL 查询和数据库模型映射，避免在 handler 或 service 中散落 SQL/ORM 细节。
- Integration / Client 封装第三方服务调用和外部协议，不承载核心业务规则。
- Middleware 只处理横切关注点，例如认证、CORS、日志、错误、request id。
- Config 负责环境变量解析和默认值，不要在业务函数中散落 `os.Getenv`。
- Main 只做实例创建、依赖装配、服务启动和路由/RPC 注册，不写业务流程细节。

## 实例装配

- 实例创建集中在启动层，由外向内装配依赖：config/logger/db/client → repository/integration → service/use case → handler/router。
- 业务对象通过 `NewXxx` 构造函数接收依赖，不在内部创建数据库连接、repository、logger、第三方 client 等基础设施。
- Service 依赖抽象能力，测试时可以替换 repository 或 integration 实现。
- 不要在 service 内部直接创建 repository 或读取全局基础设施；这会隐藏依赖、降低可测试性并扩大变更影响。
- 小项目可以依赖 `main.go` 装配暴露接口不匹配；分层严格或包循环风险高时，把 port/interface 放到独立边界包。

## 接口与能力设计

- Go 接口由使用方定义，结构体由实现方提供；service 需要什么能力，就在 service/use case 附近定义最小接口。
- Repository 方法从业务用例倒推，不预设完整 CRUD；例如列表用例只需要 `List(ctx)`，按 ID 查询和创建需求出现后再扩展。
- Service 接口只有在上层确实需要替换、mock 或多实现时再定义，不为形式感增加抽象。
- 实现层可以添加编译期接口断言来暴露方法缺失、签名不匹配和依赖装配错误；如果断言会制造包循环，就依赖启动层装配或抽出 port 包。

## API 与校验

- 请求体、query、params、headers、RPC request 和外部 webhook payload 必须在边界校验。
- Proto/RPC 变更先改契约源文件，再生成代码，最后更新 service、repository、客户端和文档。
- 响应结构、错误码和分页格式优先复用项目内约定。
- 接口兼容性变更先确认调用方、契约文件、生成代码和文档影响。

## 数据库与副作用

- 数据库方言、driver、连接池、事务和 migration 策略先查现有 Go 配置。
- `push`、`migrate`、`pull`、seed、truncate、批量更新、批量删除等影响真实数据的操作需要明确目标环境和回滚策略。
- 写操作优先由 service/use case 协调事务；repository/query 层保持可组合、可测试。
- 外部 API、消息队列、对象存储、邮件、支付等副作用要有超时、错误记录和幂等策略。
- 跨请求和外部调用传递 `context.Context`，不要在业务路径中丢失取消、超时和 request id。

## 后台任务

- 定时任务和队列消费者要明确重试、幂等、并发控制和失败告警。
- 长任务不要阻塞请求响应；需要异步处理时返回可追踪状态或任务 ID。
- 本地测试避免直接连接生产资源；需要远程资源时先确认环境。

## 测试与验证

- Handler/RPC 测试覆盖入参校验、错误响应和成功路径。
- Service 测试覆盖核心业务分支和副作用失败。
- Repository 测试使用项目已有测试数据库或 mock 策略，不临时发明生产连接。
- Go 后端验证优先使用项目已有 `go test`、生成脚本和相关 package 级检查。

## 审查判断

- 请求链路能从入口追到 service/use case、repository/integration、数据库或第三方依赖。
- 业务规则集中在 service/use case，不散落在 handler、SQL、脚本或 middleware 中。
- 数据访问集中在 repository/query，第三方协议集中在 integration/client。
- 实例装配集中在 main/app/启动层，业务层没有隐藏创建基础设施。
- 接口粒度来自业务用例真实需要，依赖方向保持上层依赖抽象能力、实现细节留在外层。
