# React 子规范

本目录是 `fe-code-spec` 的 React 子参考内容，不是独立 skill。执行 React 组件、Hook、状态、数据请求、bundle 体积、首屏渲染、交互性能或代码评审任务时，从 `fe-code-spec/SKILL.md` 进入本目录，并按需读取具体规则文件。

内容改写自 `vercel-labs/agent-skills/skills/react-best-practices`，与 `fe-code-spec` 的项目结构、命名、组件、请求和工具链规范融合后使用。

## 渐进式读取

1. 先读 `fe-code-spec/SKILL.md`，确认项目结构、命名、组件、请求和检查规范。
2. 再读本文件，选择相关规则分类。
3. 读取 `rules/_sections.md` 理解分类优先级。
4. 只读取当前任务需要的 `rules/*.md` 单条规则。
5. 只有用户要求完整 React 性能审查时，才按分类读取多条 `rules/*.md`。

## 本地规范优先

规则文件中的示例主要说明性能模式。实际落地到本仓库时，优先转换为 `fe-code-spec` 的本地约定：

- 使用箭头函数、命名导出、明确的参数和返回值类型。
- 遵守现有目录、组件拆分、组件 props、组件库和样式规范。
- 网络请求优先复用 ConnectRPC、BAM、request 封装和项目已有 hook。
- 客户端查询优先复用 React Query、ahooks 或项目既有缓存层。
- 只在真实瓶颈或明确风险存在时引入 memo、缓存、动态导入或调度优化。

## 目录结构

- `README.md` - React 子规范入口、渐进读取和规则索引。
- `rules/` - 一条规则一个文件。
  - `_sections.md` - 规则分类、优先级和前缀映射。
  - `_template.md` - 新增规则模板。
  - `area-description.md` - 具体规则文件，包含说明和 incorrect/correct 示例。

## 规则分类

| 优先级 | 分类 | 影响 | 前缀 |
|--------|------|------|------|
| 1 | Eliminating Waterfalls | CRITICAL | `async-` |
| 2 | Bundle Size Optimization | CRITICAL | `bundle-` |
| 3 | Server Rendering and Endpoint Performance | HIGH | `server-` |
| 4 | Client-Side Data Fetching | MEDIUM-HIGH | `client-` |
| 5 | Re-render Optimization | MEDIUM | `rerender-` |
| 6 | Rendering Performance | MEDIUM | `rendering-` |
| 7 | JavaScript Performance | LOW-MEDIUM | `js-` |
| 8 | Advanced Patterns | LOW | `advanced-` |

## 规则索引

### 1. Eliminating Waterfalls

- `async-cheap-condition-before-await` - 先检查便宜同步条件，再等待远程值。
- `async-defer-await` - 把 `await` 移到真正需要结果的分支。
- `async-parallel` - 独立任务使用 `Promise.all()` 并行。
- `async-dependencies` - 部分依赖任务尽早启动 promise。
- `async-api-routes` - 避免 HTTP handler 中的请求瀑布。
- `async-suspense-boundaries` - 慢子树可用 Suspense 改善感知加载。

### 2. Bundle Size Optimization

- `bundle-barrel-imports` - 避免昂贵 barrel import，优先 typed direct import。
- `bundle-analyzable-paths` - 保持导入路径可静态分析。
- `bundle-dynamic-imports` - 用 React/Vite 模式懒加载重组件。
- `bundle-defer-third-party` - 首屏交互后加载非关键第三方 SDK。
- `bundle-conditional` - 仅在功能开启或使用时加载模块。
- `bundle-preload` - 根据 hover/focus 等用户意图预加载重模块。

### 3. Server Rendering and Endpoint Performance

- `server-auth-actions` - 服务端 mutation handler 内部做认证和授权。
- `server-after-nonblocking` - 把非关键副作用延后到响应关键路径之后。
- `server-cache-react` - 在单次 server render/request 内用 React cache 去重。
- `server-cache-lru` - 运行时允许时使用有界跨请求缓存。
- `server-dedup-props` - 避免重复 server-to-client props 序列化。
- `server-hoist-static-io` - 静态 I/O 提升到模块级。
- `server-no-shared-module-state` - 避免把请求数据放入共享模块状态。
- `server-parallel-fetching` - 用组合或提前启动 promise 并行服务端数据请求。
- `server-parallel-nested-fetching` - 嵌套请求按 item 串联，避免批量瀑布。
- `server-serialization` - 减少 server-to-client 序列化 payload。

### 4. Client-Side Data Fetching

- `client-query-dedup` - 使用项目查询/缓存层去重请求。
- `client-event-listeners` - 去重全局事件监听。
- `client-passive-event-listeners` - scroll/touch/wheel 使用 passive listener。
- `client-localstorage-schema` - localStorage 数据版本化并最小化。

### 5. Re-render Optimization

- `rerender-derived-state-no-effect` - render 期间派生值，不用 state 镜像。
- `rerender-dependencies` - effect 依赖收窄到 primitive 或稳定引用。
- `rerender-functional-setstate` - 基于当前 state 更新时使用 functional setState。
- `rerender-lazy-state-init` - 昂贵初始 state 使用 lazy initializer。
- `rerender-memo` - 把真实昂贵工作抽成 memoized component。
- `rerender-memo-with-default-value` - 默认非 primitive props 提升为常量。
- `rerender-simple-expression-in-memo` - 不 memo 简单 primitive 表达式。
- `rerender-split-combined-hooks` - 拆分独立 hook 计算。
- `rerender-move-effect-to-event` - 用户操作副作用放进事件处理函数。
- `rerender-transitions` - 非紧急更新使用 `startTransition`。
- `rerender-use-deferred-value` - 输入驱动的昂贵派生渲染使用 `useDeferredValue`。
- `rerender-use-ref-transient-values` - 非 UI 临时值放入 ref。
- `rerender-defer-reads` - 延迟动态读取到真正需要的 callback。
- `rerender-derived-state` - 订阅派生片段而非噪声原始状态。
- `rerender-no-inline-components` - 不在组件内部定义组件。

### 6. Rendering Performance

- `rendering-animate-svg-wrapper` - 动画 wrapper，不直接驱动复杂 SVG 内部。
- `rendering-content-visibility` - 长内容使用 `content-visibility` 或虚拟列表。
- `rendering-hoist-jsx` - 静态 JSX 和静态对象提升到组件外。
- `rendering-svg-precision` - 降低不必要 SVG 精度。
- `rendering-conditional-render` - 使用显式条件渲染。
- `rendering-usetransition-loading` - UI-only pending state 优先用 transition。
- `rendering-resource-hints` - 合理使用资源提示。
- `rendering-script-defer-async` - 原始 script tag 使用 `defer` 或 `async`。
- `rendering-hydration-no-flicker` - SSR/hydration 项目避免客户端数据闪烁。
- `rendering-hydration-suppress-warning` - 只抑制预期 hydration mismatch。
- `rendering-activity` - 仅在项目 React 版本支持时使用 Activity。

### 7. JavaScript Performance

- `js-batch-dom-css` - 批量读写 DOM/CSS，避免 layout thrashing。
- `js-index-maps` - 重复查找先构建 map。
- `js-cache-property-access` - 热循环缓存重复属性读取。
- `js-cache-function-results` - 纯昂贵函数结果缓存需有失效策略。
- `js-cache-storage` - 处理外部变化前提下缓存 storage 读取。
- `js-combine-iterations` - 热路径合并重复数组遍历。
- `js-length-check-first` - 昂贵比较前先比较 length。
- `js-early-exit` - 昂贵工作前尽早 return。
- `js-hoist-regexp` - 静态正则提升。
- `js-min-max-loop` - min/max 使用单次遍历而非排序。
- `js-set-map-lookups` - 重复 membership check 使用 `Set`/`Map`。
- `js-tosorted-immutable` - 用 `toSorted()` 或复制保持 React state 不变性。
- `js-flatmap-filter` - 可读时用 `flatMap` 单次完成 map+filter。
- `js-request-idle-callback` - 非关键后台工作延迟到 idle。

### 8. Advanced Patterns

- `advanced-effect-event-deps` - effect event 不放进依赖数组。
- `advanced-event-handler-refs` - 事件处理器存入 ref 以保持订阅稳定。
- `advanced-init-once` - 应用级服务每次应用加载只初始化一次。
- `advanced-use-latest` - 用 latest-value ref 或 effect event 实现稳定 callback。

## 规则文件格式

每个 `rules/*.md` 保持与来源规则库一致的结构：

- YAML frontmatter: `title`、`impact`、`impactDescription`、`tags`
- 规则原因和适用场景
- Incorrect / Correct 代码示例
- 必要的 caveat、例外和参考链接
