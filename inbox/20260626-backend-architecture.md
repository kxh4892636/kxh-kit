---
id: 8bb96f50-8a0f-4f8f-8f89-5fa9e53bb1a0
---

# 后端项目架构要点

## 核心模型

### 业务用例

- 架构中心: 业务用例, 不是目录、ORM、框架或 service 结构体本身;
- Service / Use Case: 业务用例的常见承载位置, 负责表达功能要做什么;
- Repository / Integration: service 所需能力的实现细节, 负责数据或外部系统访问;
- Handler / Controller / RPC: 请求入口适配器, 负责协议解析、参数转换和响应返回;

```text
Handler / Controller / RPC
        ↓
Service / Use Case
        ↓
Repository / Integration
        ↓
Database / Third-party
```

### 职责边界

| 层级                       | 主要职责                                   | 不应承担                             |
| -------------------------- | ------------------------------------------ | ------------------------------------ |
| Handler / Controller / RPC | 请求入口、协议适配、参数校验、响应返回     | 业务规则、SQL 细节                   |
| Service / Use Case         | 业务流程、业务规则、依赖能力定义、事务边界 | 路由解析、数据库实现、第三方底层协议 |
| Repository                 | 数据访问、ORM/SQL 查询、数据库模型映射     | 业务规则、HTTP/RPC 协议              |
| Integration / Client       | 第三方服务调用、外部协议封装               | 核心业务规则                         |
| App / Main                 | 实例创建、依赖装配、服务启动、路由注册     | 业务流程细节                         |

## 实例创建

### 装配位置

- 实例创建: 集中在启动层, 由外向内装配依赖;
- 业务对象: 通过构造函数接收依赖, 不在内部创建依赖;
- 基础设施: DB、logger、config、第三方 client 在启动层创建;
- 可测试性: service 依赖接口后, 测试可替换 repository 实现;

```go
db := database.Open(...)
postsRepository := repository.NewPostsRepository(db)
postsService := service.NewPostsService(postsRepository)
handler := postsv1connect.NewPostsServiceHandler(postsService)
```

### 反例

```go
type PostsService struct {
	postsRepository *repository.PostsRepository
}

func NewPostsService() *PostsService {
	return &PostsService{
		postsRepository: repository.NewPostsRepository(...), // service 泄漏 repository 创建细节
	}
}
```

## 接口设计

### 接口归属

- Go 接口原则: 接口由使用方定义, 结构体由实现方提供;
- Service 依赖 repository: repository 接口通常定义在 service 附近;
- Repository 实现接口: repository 包提供具体 GORM/SQL 实现;
- Service 接口: 只有当上层需要替换或 mock service 时再定义;

```go
type PostsRepository interface {
	List(ctx context.Context) ([]model.Post, error)
}
```

### 方法来源

- 方法来源: 从业务用例倒推出 repository 方法, 不是先预设 CRUD;
- `GetPosts` 用例: 需要列出文章, 所以定义 `List(ctx)` 方法;
- 新需求驱动扩展: 按 ID 查询时再添加 `GetByID(ctx, id)`, 创建文章时再添加 `Create(ctx, post)`;
- 最小接口: 只暴露 service 当前真实需要的能力;

```text
GetPosts 业务用例
  → service 需要“列出文章”能力
  → 定义 PostsRepository.List
  → GORM repository 实现 List
```

## 编译期约束

### 接口实现检查

- 编译期断言: 显式要求某个类型实现某个接口;
- 意图表达: 让读代码的人直接看到结构体目标接口;
- 错误位置: 方法签名错误时, 错误更靠近实现文件;
- 非必需性: 如果装配处已经把具体类型传给接口参数, Go 也会报错;

```go
var _ postsv1connect.PostsServiceHandler = (*PostsService)(nil)
```

### Repository 检查取舍

- 可添加检查: `var _ service.PostsRepository = (*PostsRepository)(nil)`;
- 优点: repository 包自身编译时即可发现方法缺失;
- 代价: repository 需要 import service, 可能增加循环依赖风险;
- 小项目做法: 依赖 `main.go` 装配时的接口赋值检查;
- 严格分层做法: 将接口放入独立 `internal/port` 包, 让 service 和 repository 都依赖 port;

```text
service -> port
repository -> port
main -> service + repository
```

## 推荐目录

### 按业务模块组织

```text
src 或 internal/
├── app/                 # 应用启动、依赖装配、路由注册
├── modules/             # 按业务模块聚合 controller/service/repository/model
├── shared/              # 跨模块共享能力, 如 db/config/logger/errors/utils
├── integrations/        # 外部系统接入, 如 payment/email/storage/行情源
└── tests/               # 跨模块或端到端测试
```

- 目录核心: 不是按技术层全局分散文件, 而是先按业务模块聚合变化;
- `app`: 只做启动与装配, 不写业务规则;
- `modules/<domain>`: 一个业务模块内同时放入口、用例、持久化、模型和错误;
- `shared`: 真正跨模块复用的基础能力, 禁止放业务规则;
- `integrations`: 第三方系统 adapter, 隔离外部协议、字段和异常;

### ETF Go 后端落地结构

```text
apps/etf-service/
├── main.go                         # 进程入口, 内嵌 docs, 调用 app.Run
├── proto/                          # ConnectRPC API 契约
├── gen/                            # protobuf/connect 生成物
├── docs/                           # API 文档生成物
├── data/                           # SQLite 运行数据
└── internal/
    ├── app/
    │   └── server.go               # DB/config/client/service/handler 装配, 路由注册
    ├── modules/
    │   └── market/
    │       ├── controller.go        # ConnectRPC handler 适配层
    │       ├── service.go           # 行情业务用例
    │       ├── repository.go        # GORM 数据访问
    │       ├── model.go             # GORM 表模型
    │       ├── types.go             # 模块领域类型 / DTO
    │       ├── errors.go            # 模块错误
    │       └── service_test.go      # service 单元测试
    ├── shared/
    │   ├── config/                 # 环境变量和支持证券配置
    │   ├── db/                     # SQLite/GORM 打开逻辑
    │   └── utils/                  # 日期工具
    └── integrations/
        └── hongsehuojian/
            ├── client.go           # 红色火箭 HTTP client
            ├── parser.go           # K 线 JSON 解析
            └── parser_test.go      # parser 单元测试
```

- 实际取舍: 当前只有行情业务, 只创建 `modules/market`, 不制造空的 `user/order` 示例模块;
- 类型合并: `Security`、`DailyBar` 等领域类型放在 `modules/market/types.go`;
- 模型区分: GORM 表模型使用 `SecurityModel`、`DailyBarModel`、`TradingCalendarModel`, 避免和领域类型同名;
- 外部数据源: 红色火箭解析和 HTTP 细节留在 `integrations/hongsehuojian`, service 只依赖 `RemoteFetcher` 能力;
- 启动装配: `internal/app/server.go` 创建 DB、repository、service、integration client 和 ConnectRPC handler;
- 入口瘦身: `main.go` 不直接关心数据库、路由和业务依赖;

### 目录选择规则

| 场景                         | 推荐放置                 |
| ---------------------------- | ------------------------ |
| 单个业务模块内部使用         | `modules/<domain>/`      |
| 多个业务模块共享且无业务语义 | `shared/`                |
| 第三方系统协议、client、解析 | `integrations/<system>/` |
| 进程启动、依赖装配、路由注册 | `app/`                   |
| protobuf / OpenAPI 生成物    | `gen/`、`docs/`          |

## 判断标准

- 请求链路: 能从入口追到 service、repository、DB 或第三方依赖;
- 业务规则: 集中在 service/use case, 不散落在 handler、SQL 和脚本中;
- 数据访问: 集中在 repository, 不污染 service;
- 实例装配: 集中在 main/app, 不在业务层到处 `new`;
- 接口粒度: 来自业务用例需要, 不预设完整 CRUD;
- 依赖方向: 上层依赖抽象能力, 实现细节留在外层或 adapter;
- 编译反馈: 接口断言或装配处能暴露方法缺失、签名不匹配等问题;
