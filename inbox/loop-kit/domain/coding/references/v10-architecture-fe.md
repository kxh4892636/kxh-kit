# V10 Architecture FE

体验分 H5/PC V10 与体验分领域 Kit 的前端架构、分层和依赖边界。V9 与 V10 共存时，先判断是否涉及 V10、Kit、迁移或 import 边界，再应用本文件。

## 适用范围

本文件只约束以下目录：

- `apps/experience-score-h5/src/v10`
- `apps/experience-score-pc/src/v10`
- `packages/experience-score/src`

历史目录如 `src/pages`、`src/components`、`src/services`、`src/utils`、`src/hooks`、`src/gql` 只允许做兼容、迁移入口或小修。新增或重构体验分业务时，优先落到 `src/v10` 或 `packages/experience-score/src`。

## 前端项目目录结构

```txt
apps/experience-score-h5/src
├── common
├── components
├── constants
├── gql
├── hooks
├── npm
├── pages
├── services
├── test-pages
├── types
├── utils
├── v10
│   ├── features
│   │   ├── formal-metric-analysis
│   │   ├── formal-metric-detail-list
│   │   ├── formal-metric-diagnosis
│   │   ├── formal-metric-explanation
│   │   ├── formal-metric-overview
│   │   ├── formal-score-detail
│   │   ├── formal-score-header
│   │   ├── formal-score-overview
│   │   ├── grow-metric-detail-list
│   │   ├── grow-metric-diagnosis
│   │   ├── grow-metric-explanation
│   │   ├── grow-metric-overview
│   │   ├── grow-score-detail
│   │   ├── grow-score-header
│   │   ├── grow-score-overview
│   │   ├── rule-center
│   │   └── video-center
│   └── pages
│       ├── experience-score
│       ├── experience-score-content-center
│       ├── experience-score-detail
│       ├── experience-score-grow-detail
│       ├── experience-score-grow-stage
│       ├── experience-score-rights
│       └── experience-score-rules
├── version-adaptor
│   ├── experience-score
│   ├── experience-score-content-center
│   ├── experience-score-detail
│   ├── experience-score-grow-detail
│   ├── experience-score-grow-stage
│   ├── experience-score-rights
│   └── experience-score-rules
└── vmok-entry
    └── render

apps/experience-score-pc/src
├── common
├── components
├── gql
├── hooks
├── npm
├── pages
├── services
├── types
├── typings
├── utils
├── v10
│   ├── features
│   │   ├── formal-metric-analysis
│   │   ├── formal-metric-detail-list
│   │   ├── formal-metric-diagnosis
│   │   ├── formal-metric-explanation
│   │   ├── formal-metric-overview
│   │   ├── formal-score-detail
│   │   ├── formal-score-header
│   │   ├── formal-score-overview
│   │   ├── grow-metric-detail-list
│   │   ├── grow-metric-diagnosis
│   │   ├── grow-metric-explanation
│   │   ├── grow-metric-overview
│   │   ├── grow-score-detail
│   │   ├── grow-score-header
│   │   ├── grow-score-overview
│   │   ├── rule-center
│   │   └── video-center
│   └── pages
│       ├── experience-score
│       ├── experience-score-detail
│       └── experience-score-rights
├── version-adaptor
│   ├── experience-score
│   ├── experience-score-detail
│   └── experience-score-rights
└── vmok-entry

packages/experience-score/src
├── common
│   ├── adapter
│   └── hooks
├── features
│   ├── formal-metric-analysis
│   ├── formal-metric-detail-list
│   ├── formal-metric-diagnosis
│   ├── formal-metric-explanation
│   ├── formal-metric-overview
│   ├── formal-score-detail
│   ├── formal-score-header
│   ├── formal-score-overview
│   ├── grow-metric-detail-list
│   ├── grow-metric-diagnosis
│   ├── grow-metric-explanation
│   ├── grow-metric-overview
│   ├── grow-score-detail
│   ├── grow-score-header
│   ├── grow-score-overview
│   ├── rule-center
│   └── video-center
└── libs
    └── api
```

## Web V10 分层

适用于：

- `apps/experience-score-h5/src/v10`
- `apps/experience-score-pc/src/v10`

依赖方向：

```txt
app -> pages
app -> common
app -> libs

pages -> features
pages -> common
pages -> libs
pages -> @govern-public/experience-score

features -> common
features -> libs
features -> @govern-public/experience-score

libs -> common
common -> 不依赖 app/pages/features/libs
```

职责说明：

- `app`：应用启动、路由注册、Provider 和全局配置装配，不承载具体业务规则。
- `pages`：页面级组合、路由参数适配、页面级 loading/error/empty 和 feature 编排，不沉淀可复用业务规则。
- `features`：页面内业务用例、业务组件、业务 hooks、状态编排和领域规则，可以调用 `libs` 获取外部数据。
- `libs`：只放与外部第三方服务或外部系统存在交互的函数与适配层，例如 API/RPC client、SDK 调用、JSBridge、storage、埋点/监控 client、环境能力读取。
- `common`：端应用级通用能力，例如布局、鉴权、hooks、样式、通用 UI、纯工具函数；不依赖业务用例或外部服务封装。

禁止方向：

```txt
common -> features
common -> pages
common -> app
common -> libs
libs -> features
libs -> pages
features -> pages
```

## 领域 Kit 分层

适用于 `packages/experience-score/src`。这是体验分领域 Kit，对应 Web V10 规则中的 `domain-kit`。

依赖方向：

```txt
features/* -> libs
features/* -> common

libs -> common
common -> 不依赖 features/libs
index.ts -> features
index.ts -> common
index.ts -> libs
```

职责说明：

- `features/*`：双端共享的体验分领域能力，例如领域类型、领域 UI、领域 hooks、领域规则和领域内 API 契约。
- `features/<domain>/libs`：当前领域与外部第三方服务或外部系统交互的封装。
- `libs`：Kit 内跨领域外部服务交互封装，例如通用 RPC client、storage adapter、SDK adapter。
- `common`：Kit 内跨领域通用能力，例如通用类型、通用 hooks、通用 UI、纯函数。
- `index.ts`：只做稳定导出，不写业务逻辑、不发请求、不读运行时环境。

禁止方向：

```txt
common -> features
common -> libs
libs -> features
packages/experience-score -> apps/experience-score-h5
packages/experience-score -> apps/experience-score-pc
packages/experience-score -> 具体端应用实现
```

每个 `features/<domain>` 内部可以继续分 `common`、`libs`、`ui`、`hooks`、`model`、`utils`、`index.ts` 等子目录。禁止 `features/a` 随意深层依赖 `features/b` 的内部文件；跨领域复用应下沉到 Kit `common`，或通过稳定出口导入。

## V10 引用边界

`src/v10/**` 的仓库内部源码引用只能来自：

- 当前应用自己的 `src/v10/**`
- `@govern-public/experience-score`
- 其他 `@govern-public/*` 基础设施或通用包，例如 `@govern-public/kits`、`@govern-public/request`、`@govern-public/monitor`、`@govern-public/identity`、`@govern-public/adaptor`、`@govern-public/components`、`@govern-public/components-h5`、`@govern-public/components-pc`

允许外部 npm 包，例如 `react`、`react-router-dom`、`@tanstack/react-query`、UI 组件库等。

禁止 `src/v10/**` 直接引用同应用历史源码目录，例如：

- `@src/pages/*`
- `@src/components/*`
- `@src/services/*`
- `@src/utils/*`
- `@src/hooks/*`
- `@src/gql/*`
- 通过相对路径逃逸到 `src/v10` 外部的历史目录

## Kit 导出规则

- H5/PC 的 `src/v10` 优先从 `@govern-public/experience-score` 根入口导入。
- 需要深层导入前，先判断是否应该补充 `packages/experience-score/src/index.ts` 稳定导出。
- 不要让端应用直接绑定到 Kit 内部实现目录，除非该文件明确是内部实现且不会形成公共 API。
- 新增导出保持命名稳定，避免把 H5/PC 单端特有命名泄漏到 Kit API。
