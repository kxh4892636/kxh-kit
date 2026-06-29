# 前后端项目架构梳理

## 前端 Web 应用

```txt
apps/web/
├── index.html                      # Web 入口 HTML
├── package.json                    # 应用依赖与脚本
├── vite.config.ts                  # Vite 构建配置
├── tsconfig.json                   # TypeScript 配置
└── src/
    ├── app/                        # 应用入口、路由、Provider、配置装配
    │   ├── main.tsx                # 应用启动入口
    │   ├── router.tsx              # 路由创建与注册
    │   ├── providers.tsx           # 全局 Provider 装配
    │   ├── config.ts               # 应用配置
    │   └── env.ts                  # 环境变量读取与校验
    ├── pages/                      # 页面级组合，按路由组织
    │   └── order/
    │       ├── OrderListPage.tsx   # 订单列表页
    │       ├── OrderDetailPage.tsx # 订单详情页
    │       └── route.ts            # 订单路由配置
    ├── features/                   # 页面内业务功能，按用例组织
    │   ├── order-list/
    │   │   ├── components/         # 订单列表用例组件
    │   │   ├── hooks/              # 订单列表用例状态与交互逻辑
    │   │   └── index.ts            # order-list 用例出口
    │   └── order-detail/
    │       ├── components/         # 订单详情用例组件
    │       ├── hooks/              # 订单详情用例状态与交互逻辑
    │       └── index.ts            # order-detail 用例出口
    ├── libs/                       # 外部服务交互封装：API、SDK、第三方 client
    │   ├── api/                    # HTTP/RPC client、请求错误处理
    │   └── analytics/              # 第三方统计、埋点 SDK 封装
    └── common/                     # 应用级通用能力：鉴权、布局、样式、工具
        ├── auth/                   # session、登录态、路由守卫
        ├── layout/                 # AppShell、Header、Sidebar 等应用布局
        ├── hooks/                  # 应用通用 hooks
        ├── styles/                 # 全局样式、主题变量
        └── utils/                  # 应用通用工具函数
```

## 领域 Kit

```txt
packages/domain-kit/
├── package.json                    # kit 依赖、导出与构建脚本
├── vite.config.ts                  # kit 构建配置
├── tsconfig.json                   # TypeScript 配置
└── src/
    ├── features/                   # kit 领域功能，与 web/features 对应
    │   └── order/                  # 示例领域模块：订单
    │       ├── model/              # 领域类型、schema、常量、错误
    │       ├── libs/               # 领域外部服务交互：API 契约、DTO 映射、query key
    │       ├── utils/              # 订单金额、状态、业务判断等纯函数
    │       ├── hooks/              # 双端共享的订单展示与动作逻辑
    │       ├── ui/                 # 双端共享的订单领域 UI
    │       └── index.ts            # order 模块出口
    ├── libs/                       # kit 内外部服务交互封装：API、SDK、第三方 client
    │   ├── api/                    # HTTP/RPC client、请求错误处理
    │   └── storage/                # 外部存储、缓存、持久化适配
    ├── common/                     # kit 内跨领域通用能力
    │   ├── model/                  # 通用类型：分页、结果、选项等
    │   ├── hooks/                  # kit 通用 hooks
    │   ├── ui/                     # kit 通用无领域 UI
    │   ├── utils/                  # kit 通用纯函数
    │   └── components/             # kit 通用组件
    └── index.ts                    # domain-kit 总出口
```

## 后端服务

基于当前 `apps/etf-service` 实际结构整理：

```txt
apps/etf-service/
├── main.go                         # 进程入口，内嵌 docs，调用 internal/app.Run
├── go.mod                          # Go 模块定义
├── go.sum                          # Go 依赖锁定
├── .env                            # 本地环境变量
├── .gitignore                      # Git 忽略规则
├── AGENTS.md                       # etf-service 项目层 Agent 规则
├── generate.sh                     # 生成 Go 代码和 API 文档
├── buf.yaml                        # Buf proto 配置
├── buf.gen.yaml                    # protobuf/connect Go 代码生成配置
├── buf.gen.doc.yaml                # API 文档生成配置
├── proto/                          # ConnectRPC API 契约源头
│   └── etf/v1/etf.proto
├── gen/                            # protobuf/connect 生成物，只读
│   └── etf/v1/
│       ├── etf.pb.go
│       └── etfv1connect/etf.connect.go
├── docs/                           # API 文档生成物，只读
│   └── index.html
├── data/                           # SQLite 运行数据
├── logs/                           # 本地运行日志
├── node_modules/                   # 文档/codegen 工具依赖
└── internal/
    ├── app/                        # 应用装配：DB、模块、路由、CORS、h2c、健康检查、优雅退出
    │   └── server.go
    ├── modules/
    │   └── market/                 # 行情业务模块
    │       ├── controller.go       # ConnectRPC handler，协议模型与领域模型转换
    │       ├── service.go          # 行情用例：缓存刷新、日期裁剪、查询编排
    │       ├── repository.go       # GORM 数据读写
    │       ├── model.go            # GORM model
    │       ├── types.go            # 领域类型
    │       ├── errors.go           # 领域错误
    │       └── service_test.go     # 行情 service 测试
    ├── integrations/
    │   └── hongsehuojian/          # 红色火箭行情源集成
    │       ├── client.go           # 行情源 HTTP client
    │       ├── parser.go           # K 线 JSON 解析
    │       └── parser_test.go      # 解析测试
    └── shared/
        ├── config/                 # 环境变量和支持证券配置
        │   ├── config.go
        │   ├── securities.go
        │   └── securities_test.go
        ├── db/
        │   └── database.go         # SQLite/GORM 打开逻辑
        └── utils/
            └── date.go             # 跨模块日期工具
```

## 依赖方向

```txt
apps/web -> packages/domain-kit
apps/web/features -> apps/web/libs
apps/web/features -> apps/web/common
packages/domain-kit/features/order -> packages/domain-kit/libs
packages/domain-kit/features/order -> packages/domain-kit/common

apps/etf-service/main.go -> internal/app
internal/app -> internal/modules/market
internal/app -> internal/integrations/hongsehuojian
internal/modules/market -> internal/shared
```

核心边界：

- `apps/web` 负责页面、路由、应用装配和端应用通用能力；外部服务交互统一放在 `libs`。
- `packages/domain-kit` 负责双端共享的领域类型、领域规则、领域工具、领域 hooks 和领域 UI。
- `apps/etf-service` 以 `proto/` 为 API 契约源头，`internal/app` 做装配，`internal/modules/market` 承载行情业务。

## 文件夹依赖规则

### 前端 Web

```txt
app -> pages
app -> common
app -> libs

pages -> features
pages -> common
pages -> libs
pages -> packages/domain-kit

features -> common
features -> libs
features -> packages/domain-kit

libs -> common
common -> 不依赖 app/pages/features/libs
```

规则说明：

- `app` 只做应用启动、路由注册、Provider 和全局配置装配，不承载具体业务规则。
- `pages` 负责页面级组合，可以编排 `features`、`common`、`libs` 和 `domain-kit`，但不要沉淀可复用业务规则。
- `features` 负责页面内业务用例，可以调用 `libs` 获取外部数据，可以复用 `common` 和 `domain-kit`。
- `libs` 只封装外部服务交互，例如 API、SDK、第三方 client、storage adapter；不要依赖页面和业务用例。
- `common` 只放端应用级通用能力，例如布局、鉴权、hooks、样式、工具函数；不要依赖 `app`、`pages`、`features`、`libs`。

禁止方向：

```txt
common -> features
common -> pages
common -> app
libs -> features
libs -> pages
features -> pages
packages/domain-kit -> apps/web
```

### 领域 Kit

```txt
features/* -> libs
features/* -> common

libs -> common
common -> 不依赖 features/libs
index.ts -> features
index.ts -> common
index.ts -> libs
```

规则说明：

- `features/*` 放双端共享的领域能力，例如领域类型、领域 UI、领域 hooks、领域规则和领域内 API 契约。
- `features/*/libs` 放当前领域自己的外部交互封装，例如 DTO mapper、query key、领域 API contract。
- `libs` 放 kit 内跨领域外部服务交互封装，例如通用 RPC client、storage adapter、SDK adapter。
- `common` 放 kit 内跨领域通用能力，例如通用类型、通用 hooks、通用 UI、纯函数。
- `index.ts` 只做稳定导出，不写业务逻辑。

禁止方向：

```txt
common -> features
common -> libs
libs -> features
packages/domain-kit -> apps/web
packages/domain-kit -> 具体端应用实现
```

### 后端服务

```txt
main.go -> internal/app

internal/app -> internal/modules/*
internal/app -> internal/integrations/*
internal/app -> internal/shared/*
internal/app -> gen/*

internal/modules/* -> internal/shared/*
internal/modules/* -> internal/integrations/*
internal/modules/* -> gen/*

internal/integrations/* -> internal/shared/*
internal/shared/* -> 不依赖 app/modules/integrations

proto -> gen
```

规则说明：

- `main.go` 只保留进程入口，调用 `internal/app`，不直接装配业务模块。
- `internal/app` 负责配置加载、依赖装配、路由注册、server 生命周期和基础中间件。
- `internal/modules/*` 承载业务模块，可以依赖生成的协议类型、共享基础设施和外部集成接口。
- `internal/integrations/*` 只封装第三方系统、外部数据源和远程服务，不反向调用业务模块。
- `internal/shared/*` 只放跨模块基础能力，例如 config、db、utils、logger、errors，不依赖业务模块。
- `proto/` 是 API 契约源头，`gen/` 是生成物，只读。

禁止方向：

```txt
internal/shared -> internal/modules
internal/shared -> internal/app
internal/integrations -> internal/modules
internal/modules/* -> internal/app
gen -> internal/*
手写 gen/
手写 docs/ 生成物
```
