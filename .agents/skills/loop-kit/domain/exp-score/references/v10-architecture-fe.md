# Experience Score V10 Architecture

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
│   │   ├── formal-metric-analysis         # 详情页-正式分指标图表分析
│   │   ├── formal-metric-detail-list      # 详情页-正式分指标明细列表
│   │   ├── formal-metric-diagnosis        # 详情页-正式分指标诊断
│   │   ├── formal-metric-explanation      # 详情页-正式分指标说明
│   │   ├── formal-metric-overview         # 详情页-正式分指标概览
│   │   ├── formal-score-detail            # 首页-正式分详情
│   │   ├── formal-score-header            # 首页-正式分头部
│   │   ├── formal-score-overview          # 首页-正式分概览
│   │   ├── grow-metric-detail-list        # 详情页-成长分指标明细列表
│   │   ├── grow-metric-diagnosis          # 详情页-成长分指标诊断
│   │   ├── grow-metric-explanation        # 详情页-成长分指标说明
│   │   ├── grow-metric-overview           # 详情页-成长分指标概览
│   │   ├── grow-score-detail              # 首页-成长分详情
│   │   ├── grow-score-header              # 首页-成长分头部
│   │   ├── grow-score-overview            # 首页-成长分概览
│   │   └── content-center
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
│   │   ├── formal-metric-analysis         # 详情页-正式分指标图表分析
│   │   ├── formal-metric-detail-list      # 详情页-正式分指标明细列表
│   │   ├── formal-metric-diagnosis        # 详情页-正式分指标诊断
│   │   ├── formal-metric-explanation      # 详情页-正式分指标说明
│   │   ├── formal-metric-overview         # 详情页-正式分指标概览
│   │   ├── formal-score-detail            # 首页-正式分详情
│   │   ├── formal-score-header            # 首页-正式分头部
│   │   ├── formal-score-overview          # 首页-正式分概览
│   │   ├── grow-metric-detail-list        # 详情页-成长分指标明细列表
│   │   ├── grow-metric-diagnosis          # 详情页-成长分指标诊断
│   │   ├── grow-metric-explanation        # 详情页-成长分指标说明
│   │   ├── grow-metric-overview           # 详情页-成长分指标概览
│   │   ├── grow-score-detail              # 首页-成长分详情
│   │   ├── grow-score-header              # 首页-成长分头部
│   │   ├── grow-score-overview            # 首页-成长分概览
│   │   └── content-center
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
│   ├── formal-metric-analysis         # 详情页-正式分指标图表分析
│   ├── formal-metric-detail-list      # 详情页-正式分指标明细列表
│   ├── formal-metric-diagnosis        # 详情页-正式分指标诊断
│   ├── formal-metric-explanation      # 详情页-正式分指标说明
│   ├── formal-metric-overview         # 详情页-正式分指标概览
│   ├── formal-score-detail            # 首页-正式分详情
│   ├── formal-score-header            # 首页-正式分头部
│   ├── formal-score-overview          # 首页-正式分概览
│   ├── grow-metric-detail-list        # 详情页-成长分指标明细列表
│   ├── grow-metric-diagnosis          # 详情页-成长分指标诊断
│   ├── grow-metric-explanation        # 详情页-成长分指标说明
│   ├── grow-metric-overview           # 详情页-成长分指标概览
│   ├── grow-score-detail              # 首页-成长分详情
│   ├── grow-score-header              # 首页-成长分头部
│   ├── grow-score-overview            # 首页-成长分概览
│   └── content-center
└── libs
    └── api
```

## V10 通用分层

适用于：

- `apps/experience-score-h5/src/v10`
- `apps/experience-score-pc/src/v10`
- `packages/experience-score/src`

下文的 `domain-kit` 指 `@govern-public/experience-score`，源码位于 `packages/experience-score/src`。除明确标注的 Web/Kit 入口外，`features`、`libs`、`common` 均指当前作用域内的同名层。

### 依赖方向

```txt
# Web V10 入口
app -> pages
app -> common
app -> libs

# Kit 入口
index.ts -> features
index.ts -> common
index.ts -> libs

# 通用层级
pages -> features
pages -> common
pages -> libs
pages -> domain-kit

features -> common
features -> libs
features -> domain-kit  # 仅 Web V10

libs -> common
common -> libs
```

### 职责说明

- `app`：Web 应用启动、路由注册、Provider 和全局配置装配，不承载具体业务规则。
- `pages`：Web 页面级组合、路由参数适配、页面级 loading/error/empty 和 feature 编排，不沉淀可复用业务规则。
- `features`：Web V10 中承载页面内业务用例、业务组件、业务 hooks、状态编排和领域规则；Kit 中承载双端共享的领域类型、领域 UI、领域 hooks、领域规则和领域内 API 契约。
- `features/<domain>/libs`：Kit 当前领域与外部第三方服务或外部系统交互的封装。
- `libs`：当前作用域内的外部服务交互封装；Web 包括 API/RPC client、SDK、JSBridge、storage、埋点/监控和环境能力，Kit 包括跨领域 RPC client、storage adapter 和 SDK adapter。
- `common`：当前作用域内的通用能力；Web 包括布局、鉴权、hooks、样式、通用 UI 和纯工具函数，Kit 包括跨领域通用类型、hooks、UI 和纯函数。
- `index.ts`：Kit 稳定导出入口，不写业务逻辑、不发请求、不读运行时环境。

### 禁止方向

```txt
common -> app
common -> pages
common -> features

libs -> pages
libs -> features

features -> pages

domain-kit -> apps/experience-score-h5
domain-kit -> apps/experience-score-pc
domain-kit -> 具体端应用实现
```

### 领域 Kit Features 模块约束

- 业务模块层级固定为 feature 模块和可选的一层子模块，子模块路径为 `features/<feature>/<sub-feature>`。`common`、`hooks`、`components`、`utils` 等技术目录不计为业务子模块；子模块内部只按技术职责继续分目录。
- `<feature>` 和 `<sub-feature>` 中间可以抽象一层业务无关的布局目录，例如 `features/<feature>/<layout>/<sub-feature>`。
- 多个子模块共享的内容放在当前 feature 的 `common`；跨 feature 共享的内容下沉到 Kit 顶层 `common`。
- 除模块组件外，`common` 和子模块内的实现按职责归入 `hooks`、`components`、`utils` 等常规目录。
- 子模块的 PC/H5 模块组件分别命名为 `<feature-name>-pc.tsx` 和 `<feature-name>-h5.tsx`，其中 `<feature-name>` 与子模块目录名一致并使用 kebab-case。
- feature 模块根目录使用 `index.ts` 统一导出稳定 API；跨 feature 依赖通过目标 feature 的稳定出口导入。

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
