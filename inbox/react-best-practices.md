---
id: fb97afc5-1c44-4ecd-8ba1-1474e9ead2d6
---

# React Best Practices

## 性能模型

### 优化维度

#### 分类

| 分类        | 核心问题       | 典型症状                  |
| ----------- | -------------- | ------------------------- |
| Waterfall   | 串行等待       | 接口耗时线性叠加          |
| Bundle      | 首屏包过大     | TTI/LCP 变差              |
| Server      | 服务端重复工作 | 响应慢, payload 大        |
| Client Data | 重复请求       | 多组件重复 fetch          |
| Re-render   | 无效渲染       | 输入卡顿, effect 重跑     |
| Rendering   | 浏览器工作过多 | layout/paint/hydration 慢 |
| JS Hot Path | 热路径重复计算 | 列表、循环、事件卡顿      |
| Advanced    | 特殊 Hook 模式 | stale closure, 订阅不稳定 |

#### 优先级

- Waterfall: 优先级最高, 每个串行 `await` 叠加完整网络延迟;
- Bundle: 首屏关键路径, 影响首包下载、解析、执行;
- Re-render: 交互关键路径, 影响输入、滚动、动画响应;
- JS Hot Path: 高频路径有效, 非热路径以可读性优先;

## Eliminating Waterfalls

### Await 位置

#### Cheap Condition Before Await

- 概述: 先执行便宜同步 guard, 再触发昂贵异步读取;
- 原因: guard 不通过时可直接跳过网络、远程配置或数据库成本;
- 场景: feature flag、权限判断、可选功能、提前返回分支;
- 实现机制;
  - Cheap condition: 本地变量、props、已加载状态、同步 guard;
  - Expensive async: 网络请求、远程配置、feature flag、数据库查询;
  - 顺序原则: cheap guard 先执行, async work 延迟到必要分支;

```typescript
// 远程 flag 请求; 即使 disabled 为 true, 也会发起网络请求;
const flag = await getFeatureFlag("rich-editor");

if (!disabled && flag.enabled) {
  openEditor();
}

// 便宜同步条件; 不满足时直接跳过远程请求;
if (!disabled) {
  // 昂贵异步值; 仅在分支需要时读取;
  const flag = await getFeatureFlag("rich-editor");

  if (flag.enabled) {
    openEditor();
  }
}
```

#### Defer Await

- 概述: promise 可先启动, `await` 延迟到真正使用结果的位置;
- 原因: 不需要结果的分支不应被异步结果阻塞;
- 场景: preview/edit 分支、条件渲染、按模式执行不同流程;
- 实现机制;
  - Await defer: promise 可先创建, 结果到使用点再等待;
  - Branch locality: 某分支不需要结果, 不应被该结果阻塞;

```typescript
interface RenderParams {
  mode: "preview" | "edit";
  userId: string;
}

export const renderPanel = async (params: RenderParams) => {
  // Promise 先启动; 不阻塞后续同步逻辑;
  const permissionPromise = fetchPermission(params.userId);

  if (params.mode === "preview") {
    // preview 分支不需要 permission; 不 await;
    return renderPreview();
  }

  // edit 分支真正需要 permission; 在使用点 await;
  const permission = await permissionPromise;

  if (!permission.canEdit) {
    return renderReadonly();
  }

  return renderEditor();
};
```

### Promise 并行

#### Independent Operations

- 概述: 互不依赖的异步任务并行启动并统一等待;
- 原因: 总耗时由最长任务决定, 不再由所有任务耗时相加决定;
- 场景: 页面聚合数据、多个独立接口、服务端 handler 聚合响应;
- 实现机制;
  - Promise.all(): 互不依赖任务并行;
  - Dependency: 只有输入依赖时才串行;
  - Error model: 任一 promise reject, `Promise.all()` 直接 reject;

```typescript
export const getDashboardData = async (params: { userId: string }) => {
  // 错误: 三个请求串行, 总耗时约为 A+B+C;
  const profile = await fetchProfile(params.userId);
  const messages = await fetchMessages(params.userId);
  const flags = await fetchFeatureFlags();

  return { flags, messages, profile };
};

export const getDashboardDataFast = async (params: { userId: string }) => {
  // 正确: 三个请求互不依赖, 同时启动;
  const [profile, messages, flags] = await Promise.all([
    fetchProfile(params.userId),
    fetchMessages(params.userId),
    fetchFeatureFlags(),
  ]);

  return { flags, messages, profile };
};
```

#### Partial Dependencies

- 概述: 用 dependency graph 安排 promise 启动时机;
- 原因: 部分任务只依赖局部结果, 不应等待整批任务完成;
- 场景: 订单页、详情页、父子资源、配置与业务数据混合加载;
- 实现机制;
  - Promise graph: 依赖图比代码顺序更重要;
  - Early start: 不依赖前置结果的任务立即启动;

```typescript
export const getOrderPage = async (params: { orderId: string }) => {
  // order 依赖 orderId;
  const orderPromise = fetchOrder(params.orderId);
  // config 不依赖 order; 立即启动;
  const configPromise = fetchCheckoutConfig();

  const order = await orderPromise;

  // payment 依赖 order.userId; 此时才可启动;
  const paymentPromise = fetchPaymentMethods(order.userId);

  // config 与 payment 并行等待;
  const [config, paymentMethods] = await Promise.all([configPromise, paymentPromise]);

  return { config, order, paymentMethods };
};
```

### HTTP Handler

#### Request Waterfall

- 概述: HTTP handler 内部也要消除无关串行等待;
- 原因: handler 响应时间直接影响用户等待和上游超时概率;
- 场景: BFF、RPC handler、聚合接口、SSR loader;
- 实现机制;
  - Handler waterfall: auth、config、data 串行导致响应慢;
  - Handler pattern: 独立 promise 先启动, 依赖值到位后再汇合;

```typescript
export const handleGetDashboard = async (request: Request) => {
  // auth 和 config 互不依赖; 同时启动;
  const sessionPromise = auth(request);
  const configPromise = fetchConfig();

  // data 依赖 session.user.id; 只能在 session 后启动;
  const session = await sessionPromise;
  const [config, data] = await Promise.all([configPromise, fetchDashboardData(session.user.id)]);

  return Response.json({ config, data });
};
```

### Suspense Boundary

#### Slow Subtree

- 概述: 用 Suspense 把慢区域隔离成局部等待边界;
- 原因: 页面外壳可先渲染, 避免整页被一个慢子树阻塞;
- 场景: 慢列表、图表、评论区、可延迟的详情模块;
- 实现机制;
  - Suspense: 让慢子树局部等待, 外壳先渲染;
  - Boundary granularity: 放在慢区域外层, 不包住整个页面;
  - Fallback: 稳定尺寸, 避免 layout shift;

```tsx
import { Suspense } from "react";

export const ProjectPage = () => {
  return (
    <main>
      <Header />
      {/* 慢列表独立等待; Header 和工具栏不被阻塞; */}
      <Suspense fallback={<ProjectListSkeleton />}>
        <ProjectList />
      </Suspense>
    </main>
  );
};
```

## Bundle Size Optimization

### Import Path

#### Barrel Import

- 概述: 避免从大型聚合入口导入少量成员;
- 原因: barrel 可能迫使工具链分析大量 re-export, 拖慢 dev/build;
- 场景: UI 组件库、icon 库、工具函数库、按需导入场景;
- 实现机制;
  - Barrel file: `index.ts` 聚合 re-export, 可能加载大量未使用模块;
  - Direct import: typed subpath 可用时优先;
  - 类型安全: deep import 无类型声明时不强行使用;

```typescript
// 错误: 从大型入口导入, dev server 和构建可能分析大量 re-export;
import { Button, TextField } from "@mui/material";

// 正确: package 提供 typed subpath 时, 只加载所需模块;
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";

export const SearchForm = () => {
  return (
    <form>
      <TextField label="keyword" />
      <Button type="submit">Search</Button>
    </form>
  );
};
```

#### Analyzable Path

- 概述: 动态导入路径保持字面量或显式映射;
- 原因: bundler 只有能静态分析路径, 才能生成精确 chunk;
- 场景: 路由懒加载、模块插件、主题包、按功能加载模块;
- 实现机制;
  - Static analyzable: bundler 能在构建期枚举 import 范围;
  - Dynamic string: 拼接路径会扩大 bundle 或触发分析失败;

```typescript
type PageName = "home" | "settings";

// 错误: import 参数来自变量值, bundler 难以精确收敛范围;
const PAGE_PATHS = {
  home: "./pages/home",
  settings: "./pages/settings",
} as const;

export const loadPageBad = async (params: { page: PageName }) => {
  return import(PAGE_PATHS[params.page]);
};

// 正确: 显式函数映射, 每个 import 路径保持字面量;
const PAGE_MODULES = {
  home: () => import("./pages/home"),
  settings: () => import("./pages/settings"),
} as const;

export const loadPage = async (params: { page: PageName }) => {
  return PAGE_MODULES[params.page]();
};
```

### Lazy Loading

#### Heavy Component

- 概述: 首屏不需要的重组件通过 lazy chunk 延后加载;
- 原因: 减少主 bundle 下载、解析、执行成本;
- 场景: Monaco、富文本编辑器、图表库、地图、复杂设置面板;
- 实现机制;
  - React.lazy(): 首屏不需要的重组件延后加载;
  - Suspense fallback: 提供局部加载状态;
  - Named export: 通过 `.then()` 映射为 default;

```tsx
import { lazy, Suspense } from "react";

// named export 转 default; React.lazy 需要 default component;
const MonacoEditor = lazy(() =>
  import("./monaco-editor").then((mod) => ({
    default: mod.MonacoEditor,
  })),
);

export const CodePanel = (props: { code: string }) => {
  return (
    <Suspense fallback={<EditorSkeleton />}>
      <MonacoEditor value={props.code} />
    </Suspense>
  );
};
```

#### Conditional Module

- 概述: 模块只在功能开启、用户触发或意图明显时加载;
- 原因: 未使用功能不应占用首屏 bundle 和初始化时间;
- 场景: feature flag、弹窗编辑器、动画帧、付费功能、实验功能;
- 实现机制;
  - Conditional import: 功能开启后再加载大模块;
  - User intent preload: hover/focus 代表较强使用意图;
  - Non-blocking preload: `void import()` 不阻塞当前交互;

```tsx
export const EditorButton = (props: { onClick: () => void }) => {
  const preloadEditor = () => {
    // 预加载只表达意图; 不等待结果, 不阻塞 hover/focus;
    void import("./monaco-editor");
  };

  return (
    <button onFocus={preloadEditor} onMouseEnter={preloadEditor} onClick={props.onClick}>
      Open Editor
    </button>
  );
};
```

#### Third-party SDK

- 概述: 非关键第三方 SDK 退出首屏关键路径;
- 原因: analytics/log/monitoring 失败或延迟不应阻塞主要 UI;
- 场景: 埋点、监控、客服 SDK、广告 SDK、错误上报;
- 实现机制;
  - Non-critical SDK: analytics、log、monitoring 不进入首屏关键路径;
  - Idle loading: 空闲时加载, 失败只记录不影响主流程;

```tsx
export const AppShell = (props: { children: React.ReactNode }) => {
  useEffect(() => {
    const loadAnalytics = () => {
      void import("./analytics-sdk")
        .then((mod) => mod.initAnalytics())
        .catch((error) => {
          console.error("analytics init failed", error); // 非关键失败; 只记录;
        });
    };

    if ("requestIdleCallback" in window) {
      const id = window.requestIdleCallback(loadAnalytics);
      return () => window.cancelIdleCallback(id);
    }

    const id = window.setTimeout(loadAnalytics, 1_000);
    return () => window.clearTimeout(id);
  }, []);

  return <main>{props.children}</main>;
};
```

## Server Rendering And Endpoint Performance

### Security

#### Server Mutation

- 概述: 服务端写操作在入口内部完成认证、授权和输入校验;
- 原因: UI guard 和路由 guard 不能证明调用者有权执行 mutation;
- 场景: 删除、更新资料、提交表单、后台管理操作、RPC mutation;
- 实现机制;
  - Mutation handler: 服务端写操作入口, 必须内部校验权限;
  - Authorization: 用户身份合法不等于操作目标合法;
  - Input validation: 先缩小输入形状, 再进入业务写操作;

```typescript
const updateProfileSchema = z.object({
  userId: z.string().uuid(),
  name: z.string().min(1).max(100),
});

export const updateProfile = async (params: { data: unknown }) => {
  // 输入校验; 把 unknown 收窄为可信结构;
  const data = updateProfileSchema.parse(params.data);

  // 认证; 判断调用者是谁;
  const session = await verifySession();
  if (!session) {
    throw new Error("Unauthorized");
  }

  // 授权; 判断调用者能否修改目标用户;
  if (session.user.id !== data.userId) {
    throw new Error("Forbidden");
  }

  await db.user.update({
    where: { id: data.userId },
    data: { name: data.name },
  });

  return { success: true };
};
```

### Server Cache

#### React Cache

- 概述: 在单次 server render/request 内复用相同异步结果;
- 原因: 多个组件读取同一用户、权限、配置时避免重复查询;
- 场景: SSR 用户信息、权限检查、数据库查询、服务端昂贵计算;
- 实现机制;
  - React cache: 单次 server render/request 内去重;
  - Argument identity: object 参数按引用比较, primitive 更稳定;
  - Client side: 客户端不用 React cache, 用 React Query/ahooks;

```typescript
import { cache } from "react";

// 单次 server render 内, 多组件调用同一函数只执行一次;
export const getCurrentUser = cache(async () => {
  const session = await auth();
  if (!session?.user?.id) {
    return null;
  }

  return db.user.findUnique({
    where: { id: session.user.id },
  });
});

// primitive 参数; 更容易命中 cache;
export const getUserById = cache(async (userId: string) => {
  return db.user.findUnique({ where: { id: userId } });
});
```

#### LRU Cache

- 概述: 用有界 TTL cache 复用跨请求数据;
- 原因: 热数据重复读取成本高, 无界缓存又会造成内存风险;
- 场景: 字典数据、短期稳定配置、用户连续操作、低一致性要求数据;
- 实现机制;
  - Cross-request cache: 跨请求复用, 需要 TTL 和容量边界;
  - Cache key: 必须包含权限相关维度;
  - Consistency: 强一致数据不适合长 TTL;

```typescript
import { LRUCache } from "lru-cache";

const userCache = new LRUCache<string, User | null>({
  max: 1_000,
  ttl: 5 * 60 * 1_000,
});

export const getUser = async (params: { id: string }) => {
  const cached = userCache.get(params.id);

  // undefined 表示 cache miss; null 可能是合法缓存值;
  if (cached !== undefined) {
    return cached;
  }

  const user = await db.user.findUnique({ where: { id: params.id } });
  userCache.set(params.id, user);
  return user;
};
```

#### Static I/O

- 概述: 稳定文件或静态资源读取提升到模块级;
- 原因: 每个请求重复读文件会放大 I/O 与解析成本;
- 场景: 邮件模板、静态配置、字体、logo、schema、文案模板;
- 实现机制;
  - Static I/O: 稳定配置、模板、字体、logo 可提升到模块级;
  - Module scope: 进程内共享, 不放请求级用户数据;

```typescript
import fs from "node:fs/promises";

// 模块初始化时启动读取; 每次调用只等待已启动的 promise;
const configPromise = fs.readFile("./email-config.json", "utf-8").then(JSON.parse);
const templatePromise = fs.readFile("./template.html", "utf-8");

export const renderEmail = async (params: { data: EmailData }) => {
  const [config, template] = await Promise.all([configPromise, templatePromise]);

  return renderTemplate({
    config,
    data: params.data,
    template,
  });
};
```

### Server State

#### Request State

- 概述: 请求级数据必须留在当前请求上下文;
- 原因: 服务端模块变量为进程共享, 并发请求会互相污染;
- 场景: SSR 用户数据、权限、租户信息、locale、AB 实验桶;
- 实现机制;
  - Module state: 服务端模块级变量为进程共享;
  - Request data: 不放入共享变量, 通过 props/params 传递;
  - Safe exception: 静态配置、有界 cache、无请求数据的 singleton;

```tsx
// 错误: currentUser 会被并发请求互相覆盖;
let currentUser: User | null = null;

export const PageBad = async () => {
  currentUser = await auth();
  return <DashboardBad />;
};

const DashboardBad = () => {
  return <div>{currentUser?.name}</div>; // 可能读取到其他请求的用户;
};

// 正确: 请求数据保留在当前 render tree;
export const Page = async () => {
  const user = await auth();
  return <Dashboard user={user} />;
};

const Dashboard = (props: { user: User | null }) => {
  return <div>{props.user?.name}</div>;
};
```

### Server Payload

#### Serialization

- 概述: server-to-client 边界只传客户端实际使用字段;
- 原因: 多余字段增加网络 payload、解析成本和 hydration 工作量;
- 场景: SSR 传 props、客户端组件 view model、列表详情页;
- 实现机制;
  - Server-to-client props: 每个字段都增加 payload 和 hydration 成本;
  - DTO: 只传客户端实际使用字段;
  - Derived data: 客户端已有原始数据时, 在客户端派生;

```tsx
// 错误: Profile 只用 name, 但 user 全量跨边界传输;
export const PageBad = async () => {
  const user = await fetchUser();
  return <ProfileBad user={user} />;
};

const ProfileBad = (props: { user: User }) => {
  return <div>{props.user.name}</div>;
};

// 正确: server-to-client 边界只传必要字段;
export const Page = async () => {
  const user = await fetchUser();
  return <Profile name={user.name} />;
};

const Profile = (props: { name: string }) => {
  return <div>{props.name}</div>;
};
```

#### Duplicate Props

- 概述: 避免把同一数据及其派生副本同时跨边界传输;
- 原因: 派生数组/对象创建新引用, 会增加序列化体积;
- 场景: 排序列表、过滤列表、客户端可自行派生的 view state;
- 实现机制;
  - Reference duplication: 派生数组/对象会制造新引用;
  - Client derivation: 原始数据已传给客户端时, 派生放到客户端;

```tsx
export const UserPage = async () => {
  const usernames = await fetchUsernames();

  // 只传一次 usernames; 排序在客户端完成;
  return <ClientList usernames={usernames} />;
};

export const ClientList = (props: { usernames: string[] }) => {
  const sortedUsernames = useMemo(() => props.usernames.toSorted(), [props.usernames]);

  return <UserList usernames={sortedUsernames} />;
};
```

### Server Parallelism

#### Component Composition

- 概述: 独立服务端子树通过组合并行拉取数据;
- 原因: 父级先 await 会阻塞子组件开始请求;
- 场景: SSR 页面 Header/Sidebar/Main 并列区块、仪表盘、布局组件;
- 实现机制;
  - Parent await: 父组件先 await 会阻塞子组件开始请求;
  - Sibling composition: 独立区域拆成 sibling, 各自发起数据请求;

```tsx
const Header = async () => {
  const data = await fetchHeader();
  return <header>{data.title}</header>;
};

const Sidebar = async () => {
  const items = await fetchSidebarItems();
  return <nav>{items.map(renderItem)}</nav>;
};

export const Page = () => {
  return (
    <main>
      {/* Header 与 Sidebar 独立启动请求; */}
      <Header />
      <Sidebar />
    </main>
  );
};
```

#### Nested Fetch

- 概述: 嵌套依赖按 item 内部串联、item 之间并行;
- 原因: 等全部 parent 完成后再请求 child 会被最慢 parent 阻塞;
- 场景: 列表项作者、订单和商品详情、评论与用户资料;
- 实现机制;
  - Batch waterfall: 先等所有 parent, 再请求所有 child 会被最慢 parent 阻塞;
  - Per-item chain: 每个 item 内部串联, item 之间并行;

```typescript
export const getChatAuthors = async (params: { chatIds: string[] }) => {
  return Promise.all(
    params.chatIds.map((chatId) =>
      // 每个 chat 获取后立即获取 author; 不等待其他 chat;
      getChat({ chatId }).then((chat) => getUser({ userId: chat.authorId })),
    ),
  );
};
```

## Client-Side Data Fetching

### Query Cache

#### Request Dedup

- 概述: 用查询缓存层共享相同请求结果;
- 原因: 多组件重复 fetch 会浪费网络、解析和状态更新成本;
- 场景: 列表复用、页面多个组件读同一实体、tab 切换、mutation 后刷新;
- 实现机制;
  - Query key: 相同 key 共享请求与缓存;
  - Query function: 复用项目 request/ConnectRPC/BAM 封装;
  - Mutation: 成功后 invalidate 相关 query;

```tsx
export const useUsers = () => {
  return useQuery({
    queryKey: ["users"],
    queryFn: requestUsers,
  });
};

export const UserList = () => {
  const { data = [] } = useUsers();
  return <UserTable users={data} />;
};

export const useUpdateUser = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateUser,
    onSuccess: () => {
      // mutation 后刷新依赖 users 的视图;
      void queryClient.invalidateQueries({ queryKey: ["users"] });
    },
  });
};
```

### Browser Subscription

#### Global Listener

- 概述: 全局事件监听集中注册, 组件只注册回调;
- 原因: N 个组件重复监听同一事件会放大回调次数和 cleanup 风险;
- 场景: keyboard shortcut、resize、visibilitychange、online/offline;
- 实现机制;
  - Duplicate listener: 多组件重复 `addEventListener` 造成额外回调和内存占用;
  - Shared subscription: 模块级 registry 维护回调集合;
  - Cleanup: 最后一个订阅移除后解绑全局 listener;

```tsx
const keyCallbacks = new Map<string, Set<() => void>>();
let cleanupGlobalKeydown: (() => void) | undefined;

const ensureGlobalKeydown = () => {
  if (cleanupGlobalKeydown) {
    return;
  }

  const handler = (event: KeyboardEvent) => {
    keyCallbacks.get(event.key)?.forEach((callback) => callback());
  };

  window.addEventListener("keydown", handler);
  cleanupGlobalKeydown = () => window.removeEventListener("keydown", handler);
};

export const useKeyboardShortcut = (key: string, callback: () => void) => {
  useEffect(() => {
    ensureGlobalKeydown();

    const callbacks = keyCallbacks.get(key) ?? new Set<() => void>();
    callbacks.add(callback);
    keyCallbacks.set(key, callbacks);

    return () => {
      callbacks.delete(callback);

      if (callbacks.size === 0) {
        keyCallbacks.delete(key);
      }

      if (keyCallbacks.size === 0) {
        cleanupGlobalKeydown?.();
        cleanupGlobalKeydown = undefined;
      }
    };
  }, [callback, key]);
};
```

#### Passive Listener

- 概述: 滚动相关监听显式声明不会阻止默认行为;
- 原因: 浏览器可跳过等待 handler, 减少滚动延迟;
- 场景: scroll、touchmove、wheel、移动端手势监听;
- 实现机制;
  - Passive listener: 告诉浏览器不会 `preventDefault`;
  - Scroll path: scroll/touch/wheel 监听器默认考虑 passive;

```tsx
export const useScrollY = () => {
  const [scrollY, setScrollY] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      setScrollY(window.scrollY);
    };

    // passive: true; 浏览器无需等待 handler 判定是否阻止滚动;
    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  return scrollY;
};
```

### Storage

#### Versioned Schema

- 概述: 持久化到 storage 的数据必须带版本和解析防护;
- 原因: 旧结构、坏数据、手动修改会破坏运行时假设;
- 场景: localStorage UI 状态、用户偏好、表单草稿、缓存配置;
- 实现机制;
  - localStorage schema: 持久化数据必须版本化;
  - Minimal fields: 只存 UI 恢复所需字段;
  - Parse guard: 读取失败时清理或回退默认值;

```typescript
interface SidebarStateV1 {
  collapsed: boolean;
  version: 1;
}

const SIDEBAR_KEY = "sidebar-state";

export const readSidebarState = (): SidebarStateV1 => {
  try {
    const raw = localStorage.getItem(SIDEBAR_KEY);
    if (!raw) {
      return { collapsed: false, version: 1 };
    }

    const data = JSON.parse(raw) as Partial<SidebarStateV1>;

    // version guard; 旧结构不继续使用;
    if (data.version !== 1 || typeof data.collapsed !== "boolean") {
      localStorage.removeItem(SIDEBAR_KEY);
      return { collapsed: false, version: 1 };
    }

    return data as SidebarStateV1;
  } catch (error) {
    console.error("read sidebar state failed", error);
    return { collapsed: false, version: 1 };
  }
};
```

## Re-render Optimization

### Derived State

#### Render Derivation

- 概述: 可由当前 props/state 计算的值在 render 阶段派生;
- 原因: effect 镜像 state 会多一次 render, 还可能产生状态漂移;
- 场景: fullName、过滤条件、布尔派生、展示标签、简单计算字段;
- 实现机制;
  - Derived state: 可由 props/state 计算的值不进 state;
  - Effect mirror: `useEffect + setState` 会多一次 render 且可能漂移;

```tsx
export const FullName = () => {
  const [firstName, setFirstName] = useState("Ada");
  const [lastName, setLastName] = useState("Lovelace");

  // 派生值; 每次 render 由当前 state 同步计算;
  const fullName = `${firstName} ${lastName}`;

  return (
    <form>
      <input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
      <input value={lastName} onChange={(e) => setLastName(e.target.value)} />
      <p>{fullName}</p>
    </form>
  );
};
```

#### Narrow Dependencies

- 概述: effect 依赖只包含实际参与副作用的稳定值;
- 原因: 依赖整个对象会让无关字段变化也触发 effect;
- 场景: 埋点、订阅、请求参数、DOM 操作、外部系统同步;
- 实现机制;
  - Dependency width: 依赖对象导致任意字段变化都重跑;
  - Primitive dependency: 只依赖实际使用字段;

```tsx
export const UserTracker = (props: { user: User }) => {
  useEffect(() => {
    trackUser(props.user.id);
    // 只依赖 id; name/avatar 变化不会触发该 effect;
  }, [props.user.id]);

  return null;
};
```

### State Update

#### Functional SetState

- 概述: 基于当前 state 计算 next state 时使用函数式更新;
- 原因: 减少 callback 依赖, 避免闭包捕获旧 state;
- 场景: add/remove item、计数器、队列、toggle 集合、批量更新;
- 实现机制;
  - Functional update: 基于当前 state 计算 next state;
  - Stable callback: 不依赖 state 变量, callback 更稳定;
  - Stale closure: 避免闭包捕获旧 state;

```tsx
export const TodoList = (props: { initialItems: TodoItem[] }) => {
  const [items, setItems] = useState(props.initialItems);

  const addItem = useCallback((item: TodoItem) => {
    // curr 为最新 state; 不依赖外层 items;
    setItems((curr) => [...curr, item]);
  }, []);

  const removeItem = useCallback((id: string) => {
    setItems((curr) => curr.filter((item) => item.id !== id));
  }, []);

  return <TodoEditor items={items} onAdd={addItem} onRemove={removeItem} />;
};
```

#### Lazy Init

- 概述: 昂贵初始值通过函数延迟到 mount 时执行一次;
- 原因: 普通表达式会随每次 render 重新计算;
- 场景: storage 读取、JSON parse、复杂默认配置、大对象初始化;
- 实现机制;
  - Lazy initializer: 初始值函数只在 mount 时执行;
  - Expensive init: JSON parse、storage read、大对象构造适用;

```tsx
export const SettingsPanel = () => {
  const [settings, setSettings] = useState(() => {
    // lazy initializer; 不会在每次 render 重新读取 storage;
    return readSettingsFromStorage();
  });

  return <SettingsForm settings={settings} onChange={setSettings} />;
};
```

### Memoization

#### Memo Boundary

- 概述: 把真实昂贵子树放入稳定的 memo 边界;
- 原因: memo 只有跳过明显计算或重渲染时才有收益;
- 场景: 头像计算、图表、复杂列表项、频繁父组件 render;
- 实现机制;
  - memo boundary: 只对昂贵子树或高频父 render 有意义;
  - Early return: 把昂贵计算放到 memoized child 中, 让 loading 分支跳过;

```tsx
const UserAvatar = memo((props: { user: User }) => {
  // 昂贵计算被限制在 memoized child 内;
  const avatarId = useMemo(() => computeAvatarId(props.user), [props.user]);
  return <Avatar id={avatarId} />;
});

export const Profile = (props: { loading: boolean; user: User }) => {
  if (props.loading) {
    return <ProfileSkeleton />;
  }

  return <UserAvatar user={props.user} />;
};
```

#### Default Value

- 概述: 默认数组、对象、函数等非 primitive 引用提升为常量;
- 原因: 每次 render 新建引用会破坏 memo 和依赖比较;
- 场景: memo 组件默认 props、Hook 默认 options、空数组/空对象;
- 实现机制;
  - Non-primitive default: `[]`、`{}`、`() => {}` 每次 render 新引用;
  - Hoist constant: 默认引用稳定, memo 才有效;

```tsx
const EMPTY_TAGS: string[] = [];

export const TagList = memo((props: { tags?: string[] }) => {
  // 默认数组引用稳定; 不破坏 memo 比较;
  const tags = props.tags ?? EMPTY_TAGS;
  return (
    <ul>
      {tags.map((tag) => (
        <li key={tag}>{tag}</li>
      ))}
    </ul>
  );
});
```

#### Useless Memo

- 概述: 简单 primitive 表达式不使用 `useMemo`;
- 原因: memo 本身有依赖比较和闭包维护成本;
- 场景: 字符串拼接、布尔判断、轻量条件、简单数值计算;
- 实现机制;
  - Primitive expression: 简单字符串/布尔/数字计算不需要 `useMemo`;
  - Memo cost: 依赖比较和闭包也有成本;

```tsx
export const StatusText = (props: { count: number }) => {
  // 简单 primitive 表达式; 直接计算更清晰;
  const label = props.count > 0 ? "active" : "empty";

  return <span>{label}</span>;
};
```

### Event Logic

#### Move Effect To Event

- 概述: 用户动作触发的副作用直接放入事件处理器;
- 原因: 用 state flag 转发事件会让 effect 受无关依赖影响并可能重复执行;
- 场景: submit、click、drag、toast、手动埋点、用户确认操作;
- 实现机制;
  - Event side effect: click/submit 触发的副作用放在 handler;
  - State flag anti-pattern: 用 state 表示事件会引入重复 effect;

```tsx
export const RegisterForm = () => {
  const theme = useTheme();

  const handleSubmit = async () => {
    await postRegister();
    showToast({ theme, title: "Registered" }); // 行为由 submit 触发;
  };

  return <button onClick={handleSubmit}>Submit</button>;
};
```

#### Defer Reads

- 概述: 只在 callback 中需要的数据延迟到 callback 内读取;
- 原因: 组件无需订阅该动态数据变化, 可减少无效 render;
- 场景: 分享按钮读取 URL、点击时读取 storage、一次性读取 DOM 状态;
- 实现机制;
  - Callback-only data: 只在点击时需要的数据, 点击时再读;
  - Subscription reduction: 避免组件订阅无关动态状态;

```tsx
export const ShareButton = (props: { chatId: string }) => {
  const handleShare = () => {
    // 点击时读取 URL; URL 变化不导致组件重渲染;
    const params = new URLSearchParams(window.location.search);
    const ref = params.get("ref");

    shareChat(props.chatId, { ref });
  };

  return <button onClick={handleShare}>Share</button>;
};
```

### Transition

#### Non-urgent Update

- 概述: 把不必立即完成的 UI 更新标记为低优先级;
- 原因: 输入和点击应优先响应, 昂贵派生渲染可滞后;
- 场景: 搜索过滤、大图表更新、滚动派生状态、tab 内重列表;
- 实现机制;
  - startTransition: 标记非紧急更新, 保持输入/点击优先;
  - useDeferredValue: 输入实时更新, 昂贵派生滞后更新;

```tsx
export const Search = (props: { items: Item[] }) => {
  const [query, setQuery] = useState("");

  // query 立即更新; deferredQuery 可滞后以保护输入响应;
  const deferredQuery = useDeferredValue(query);

  const filtered = useMemo(
    () => props.items.filter((item) => fuzzyMatch({ item, query: deferredQuery })),
    [deferredQuery, props.items],
  );

  const isStale = query !== deferredQuery;

  return (
    <>
      <input value={query} onChange={(e) => setQuery(e.target.value)} />
      <div style={{ opacity: isStale ? 0.7 : 1 }}>
        <ResultList items={filtered} />
      </div>
    </>
  );
};
```

### Component Identity

#### Inline Component

- 概述: 组件定义保持在父组件 render 外部;
- 原因: render 内定义会产生新 component type, 导致子树 remount;
- 场景: 表单输入失焦、动画重启、子组件 effect 频繁 cleanup/setup;
- 实现机制;
  - Component type identity: 函数组件定义在 render 内, 每次都是新类型;
  - Remount symptom: input 失焦、effect 重跑、动画重启、scroll reset;

```tsx
// 正确: 子组件定义在外部, 通过 props 接收父级数据;
const Avatar = (props: { src: string; theme: "light" | "dark" }) => {
  return <img className={`avatar-${props.theme}`} src={props.src} />;
};

export const UserProfile = (props: { theme: "light" | "dark"; user: User }) => {
  return <Avatar src={props.user.avatarUrl} theme={props.theme} />;
};
```

### Ref State

#### Transient Value

- 概述: 不影响 UI 的高频临时值存入 `useRef`;
- 原因: state 更新会触发 render, ref 写入不会触发 render;
- 场景: 拖拽坐标、timer id、上一帧值、WebSocket 实例、AbortController;
- 实现机制;
  - useRef: 保存不影响 UI 的可变值;
  - State misuse: 高频状态更新会触发大量 render;

```tsx
export const DragTracker = () => {
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);

  const handlePointerMove = (event: React.PointerEvent) => {
    // 拖拽中间值不参与 UI; 写入 ref 避免每帧 render;
    lastPointRef.current = {
      x: event.clientX,
      y: event.clientY,
    };
  };

  return <div onPointerMove={handlePointerMove} />;
};
```

## Rendering Performance

### Browser Work

#### Conditional Rendering

- 概述: 条件渲染使用明确 boolean 或三元表达式;
- 原因: `&&` 会把 `0`、`NaN` 等 falsy 数值渲染成文本;
- 场景: badge 数量、列表长度、金额、可选提示、空状态;
- 实现机制;
  - `&&` pitfall: `0 && <Badge />` 会渲染 `0`;
  - Explicit conditional: 先归一化为 boolean 或三元表达式;

```tsx
export const CartBadge = (props: { count: number }) => {
  return (
    <div>
      {/* count 为 0 时渲染 null, 不渲染数字 0; */}
      {props.count > 0 ? <Badge count={props.count} /> : null}
    </div>
  );
};
```

#### Content Visibility

- 概述: 让浏览器跳过屏幕外复杂内容布局和绘制;
- 原因: 长列表或长页面一次性布局会阻塞主线程;
- 场景: feed 卡片、长文档、折叠区块、非首屏内容;
- 实现机制;
  - `content-visibility`: 跳过屏幕外复杂内容渲染;
  - Intrinsic size: 预留尺寸, 减少滚动条跳动;

```css
.feed-card {
  /* 屏幕外内容延迟布局和绘制; */
  content-visibility: auto;
  /* 估算尺寸; 避免元素尚未渲染时滚动高度塌陷; */
  contain-intrinsic-size: 240px;
}
```

#### Static JSX

- 概述: 不依赖响应式数据的 JSX 提升到组件外;
- 原因: 避免每次 render 创建相同 React element 和对象引用;
- 场景: empty state、静态 icon、固定提示、静态配置对象;
- 实现机制;
  - Static JSX: 不依赖 props/state 的 JSX 可提升到组件外;
  - Reference stability: 避免每次 render 创建新对象/元素;

```tsx
const EMPTY_STATE = (
  <div className="empty-state">
    <p>No result</p>
  </div>
);

export const ResultPanel = (props: { items: Item[] }) => {
  if (props.items.length === 0) {
    return EMPTY_STATE;
  }

  return <ResultList items={props.items} />;
};
```

#### SVG Animation

- 概述: 对 SVG 外层 wrapper 做 transform/opacity 动画;
- 原因: wrapper 动画更容易进入合成层, 避免复杂 SVG 内部重绘;
- 场景: loading logo、复杂插画、图标旋转、装饰动效;
- 实现机制;
  - SVG internals: 直接动画复杂 SVG 属性成本高;
  - Wrapper transform: wrapper 使用 transform/opacity 更容易合成层优化;

```tsx
export const LoadingLogo = () => {
  return (
    // transform 动画作用于 wrapper;
    <div className="spin-wrapper">
      <ComplexLogoSvg />
    </div>
  );
};
```

```css
.spin-wrapper {
  animation: spin 800ms linear infinite;
  will-change: transform;
}
```

### Resource Loading

#### Resource Hints

- 概述: 提前声明即将使用的连接或资源;
- 原因: DNS、TCP、TLS、字体和模块加载可提前并行;
- 场景: 首屏 API 域名、关键字体、CDN、下一步高概率路由;
- 实现机制;
  - preconnect: 提前建立跨域连接;
  - preload: 当前页即将使用的关键资源;
  - prefetch: 可能的后续资源, 优先级更低;

```tsx
import { preconnect, preload } from "react-dom";

export const App = () => {
  // API 域名首屏会用到; 提前连接;
  preconnect("https://api.example.com");

  // 当前页面关键字体; 提前请求;
  preload("/fonts/inter.woff2", {
    as: "font",
    crossOrigin: "anonymous",
    type: "font/woff2",
  });

  return <MainRouter />;
};
```

#### Script Loading

- 概述: 原始 script 标签避免阻塞 HTML parsing;
- 原因: 同步 script 下载和执行会推迟 FCP 与 TTI;
- 场景: 独立 analytics、DOM 依赖脚本、第三方脚本接入;
- 实现机制;
  - defer: 并行下载, HTML 解析后按顺序执行;
  - async: 并行下载, 就绪后立即执行, 不保证顺序;

```tsx
export const DocumentHead = () => {
  return (
    <head>
      {/* analytics 独立执行; 可 async; */}
      <script async src="https://example.com/analytics.js" />
      {/* utils 依赖 DOM; 用 defer; */}
      <script defer src="/scripts/utils.js" />
    </head>
  );
};
```

### Hydration

#### No Flicker

- 概述: SSR/hydration 项目避免客户端专属数据导致首帧闪烁;
- 原因: server 输出和 client 初始 render 不一致会产生 mismatch 或视觉跳变;
- 场景: theme、locale、timezone、storage 偏好、cookie 派生 UI;
- 实现机制;
  - Client-only data: localStorage/cookie 等只在客户端可读;
  - Hydration mismatch: SSR 输出与客户端首次 render 不一致;
  - Strategy: SSR 项目中用稳定默认值或预水合脚本;

```tsx
export const ThemeText = () => {
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    // hydration 后读取客户端数据; 可能有一次视觉变化;
    const saved = localStorage.getItem("theme");
    if (saved === "dark" || saved === "light") {
      setTheme(saved);
    }
  }, []);

  return <span>{theme}</span>;
};
```

#### Suppress Warning

- 概述: 仅对预期不一致的局部文本抑制 hydration warning;
- 原因: 局部时间等天然不一致, 但大范围抑制会掩盖真实 bug;
- 场景: 时间戳、随机展示文案、locale 格式化文本;
- 实现机制;
  - suppressHydrationWarning: 仅用于预期不一致的局部文本;
  - Bug hiding: 不用于掩盖真实数据错配;

```tsx
export const Timestamp = () => {
  return <span suppressHydrationWarning>{new Date().toLocaleString()}</span>;
};
```

## JavaScript Hot Path

### Data Structure

#### Map Index

- 概述: 将重复线性查找转换为一次建索引、多次 O(1) 读取;
- 原因: 嵌套 `find` 会在大列表上形成 O(n²) 成本;
- 场景: 列表 join、id 到实体映射、权限表、字典映射;
- 实现机制;
  - Repeated lookup: 循环中反复 `find` 为 O(n²);
  - Map index: 一次建索引, 多次 O(1) 查询;

```typescript
export const attachUsers = (params: { posts: Post[]; users: User[] }) => {
  // userId -> User; 一次 O(n) 建索引;
  const usersById = new Map(params.users.map((user) => [user.id, user]));

  return params.posts.map((post) => ({
    ...post,
    author: usersById.get(post.authorId),
  }));
};
```

#### Set Lookup

- 概述: 重复成员判断使用 `Set`;
- 原因: `Array.includes` 每次线性扫描, 大列表成本累积明显;
- 场景: selectedIds、黑白名单、权限集合、去重判断;
- 实现机制;
  - Membership: 多次 `includes` 在线性数组上重复扫描;
  - Set: 适合重复 membership check;

```typescript
export const filterSelected = (params: { items: Item[]; selectedIds: string[] }) => {
  const selectedIdSet = new Set(params.selectedIds);

  return params.items.filter((item) => selectedIdSet.has(item.id));
};
```

### Array Work

#### Combine Iterations

- 概述: 热路径合并连续数组遍历;
- 原因: 多次 `filter/map/reduce` 会产生中间数组和重复循环;
- 场景: 大列表渲染前处理、数据导出、图表数据转换;
- 实现机制;
  - Multiple pass: 连续 `filter().map()` 产生中间数组;
  - Single pass: 热路径可用 `reduce` 或循环合并;

```typescript
export const getVisibleLabels = (params: { items: Item[] }) => {
  return params.items.reduce<string[]>((labels, item) => {
    if (!item.visible) {
      return labels;
    }

    labels.push(item.label);
    return labels;
  }, []);
};
```

#### FlatMap Filter

- 概述: 用 `flatMap` 单次完成过滤和映射;
- 原因: 空数组表示丢弃, 单元素数组表示转换后保留;
- 场景: 路由过滤、菜单构建、列表清洗、可选项展开;
- 实现机制;
  - `flatMap`: 返回空数组表示过滤, 单元素数组表示保留并转换;

```typescript
export const getEnabledRoutes = (params: { routes: RouteConfig[] }) => {
  return params.routes.flatMap((route) => {
    if (!route.enabled) {
      return [];
    }

    return [{ path: route.path, title: route.title }];
  });
};
```

#### Immutable Sort

- 概述: React state 或 props 排序时保持不可变;
- 原因: `sort()` 原地修改会污染上游引用并破坏变更检测;
- 场景: 列表排序、表格排序、客户端派生排序、memo 计算;
- 实现机制;
  - `sort()`: 原地修改数组, 会破坏 React state 不变性;
  - `toSorted()`: 返回新数组, 保持原数组不变;

```tsx
export const UserList = (props: { users: User[] }) => {
  const sortedUsers = useMemo(
    () => props.users.toSorted((a, b) => a.name.localeCompare(b.name)),
    [props.users],
  );

  return <Table dataSource={sortedUsers} />;
};
```

### Loop Hot Path

#### Early Exit

- 概述: 昂贵计算前先执行廉价失败条件;
- 原因: 早返回能减少无意义循环、比较和后续分支;
- 场景: 数组比较、权限 guard、搜索过滤、输入校验;
- 实现机制;
  - Guard clause: 无需执行昂贵逻辑时尽早返回;
  - Length check: 昂贵比较前先比较长度;

```typescript
export const areIdsEqual = (params: { left: string[]; right: string[] }) => {
  if (params.left.length !== params.right.length) {
    return false; // 长度不同; 不进入逐项比较;
  }

  return params.left.every((id, index) => id === params.right[index]);
};
```

#### Cache Property Access

- 概述: 热循环中缓存重复深层属性读取;
- 原因: 减少重复 property lookup, 同时让循环逻辑更聚焦;
- 场景: 大数组聚合、渲染前转换、购物车计算、图表数据处理;
- 实现机制;
  - Hot loop: 深层属性重复访问可缓存局部变量;
  - Readability: 仅在热路径使用;

```typescript
export const sumVisiblePrice = (params: { items: CartItem[] }) => {
  let total = 0;

  for (const item of params.items) {
    const product = item.product;

    if (!product.visible) {
      continue;
    }

    total += product.price * item.quantity;
  }

  return total;
};
```

#### Min Max

- 概述: min/max 用单次遍历计算;
- 原因: 为求极值而排序是 O(n log n), 且可能改变数组顺序;
- 场景: 图表坐标范围、价格区间、时间范围、统计摘要;
- 实现机制;
  - Sort for min/max: O(n log n) 且改变顺序风险;
  - Single pass: O(n);

```typescript
export const getRange = (params: { values: number[] }) => {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;

  for (const value of params.values) {
    min = Math.min(min, value);
    max = Math.max(max, value);
  }

  return { max, min };
};
```

### Cache

#### Function Result

- 概述: 对纯且昂贵的函数结果做 key-based cache;
- 原因: render 或循环中重复计算相同输入会浪费 CPU;
- 场景: slugify、格式化、编译正则、权限派生、重计算标签;
- 实现机制;
  - Pure function cache: 相同输入得到相同输出;
  - Invalidation: cache 必须有边界或清理策略;

```typescript
const slugCache = new Map<string, string>();

export const cachedSlugify = (params: { text: string }) => {
  const cached = slugCache.get(params.text);
  if (cached) {
    return cached;
  }

  const result = slugify(params.text);
  slugCache.set(params.text, result);
  return result;
};
```

#### Storage Cache

- 概述: 缓存频繁读取的 storage 值并处理外部失效;
- 原因: storage 读取不可响应且重复解析会增加主线程成本;
- 场景: token、偏好设置、主题、实验配置、跨 tab 同步;
- 实现机制;
  - Storage read: localStorage/sessionStorage 读取可能重复且不可追踪;
  - External changes: storage 事件或 visibilitychange 时失效;

```typescript
const storageCache = new Map<string, string | null>();

export const getStorageItem = (params: { key: string }) => {
  if (storageCache.has(params.key)) {
    return storageCache.get(params.key) ?? null;
  }

  const value = localStorage.getItem(params.key);
  storageCache.set(params.key, value);
  return value;
};

window.addEventListener("storage", (event) => {
  if (event.key) {
    storageCache.delete(event.key);
  }
});
```

### DOM/CSS

#### Layout Thrashing

- 概述: DOM layout 读取和样式写入分批执行;
- 原因: 读写交错会强制浏览器反复同步布局;
- 场景: 卡片对齐、拖拽布局、测量高度、批量样式更新;
- 实现机制;
  - Layout read: `getBoundingClientRect`、`offsetHeight`;
  - Layout write: `style`、class mutation;
  - Batch: 先读后写, 不交错;

```typescript
export const alignCards = (params: { cards: HTMLElement[] }) => {
  // 读取阶段; 浏览器只需计算一次布局;
  const heights = params.cards.map((card) => card.offsetHeight);
  const maxHeight = Math.max(...heights);

  // 写入阶段; 不与读取交错;
  for (const card of params.cards) {
    card.style.minHeight = `${maxHeight}px`;
  }
};
```

#### Idle Work

- 概述: 非关键后台任务延迟到浏览器空闲时间;
- 原因: 让输入、点击、渲染等用户可感知任务优先执行;
- 场景: 预计算、非关键缓存、轻量分析、低优先级日志;
- 实现机制;
  - requestIdleCallback: 非关键后台任务延后;
  - Fallback: 不支持时用 `setTimeout`;

```typescript
export const scheduleNonCriticalWork = (task: () => void) => {
  if ("requestIdleCallback" in window) {
    const id = window.requestIdleCallback(task);
    return () => window.cancelIdleCallback(id);
  }

  const id = window.setTimeout(task, 1_000);
  return () => window.clearTimeout(id);
};
```

## Advanced Patterns

### Stable Callback

#### useLatest

- 概述: 用 ref 保存最新值, 对外保持稳定 callback 或 listener;
- 原因: 避免订阅因 handler identity 改变频繁重建;
- 场景: window event、WebSocket listener、第三方 SDK callback;
- 实现机制;
  - Latest ref: callback 身份稳定, 内部读取最新值;
  - Subscription: 避免 effect 因 callback 变化频繁重建;

```tsx
export const useLatest = <TValue,>(value: TValue) => {
  const ref = useRef(value);

  useEffect(() => {
    ref.current = value;
  }, [value]);

  return ref;
};

export const useWindowEvent = (type: keyof WindowEventMap, handler: (event: Event) => void) => {
  const handlerRef = useLatest(handler);

  useEffect(() => {
    const listener = (event: Event) => {
      handlerRef.current(event);
    };

    window.addEventListener(type, listener);
    return () => window.removeEventListener(type, listener);
  }, [handlerRef, type]);
};
```

#### Handler Ref

- 概述: 定时器或订阅回调通过 ref 读取最新逻辑;
- 原因: interval/listener 生命周期不应跟随每次 callback 变化重启;
- 场景: interval、polling、拖拽监听、长期订阅;
- 实现机制;
  - Handler registry: 外部订阅保持稳定, 内部逻辑可更新;
  - Ref write: 不触发 render;

```tsx
export const useInterval = (callback: () => void, delay: number) => {
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    const id = window.setInterval(() => {
      callbackRef.current();
    }, delay);

    return () => window.clearInterval(id);
  }, [delay]);
};
```

### App Init

#### Init Once

- 概述: 应用级服务使用幂等初始化保护;
- 原因: StrictMode 或重复挂载可能让 effect 执行两次;
- 场景: analytics、monitoring、全局 SDK、单例连接、全局配置;
- 实现机制;
  - App-wide service: 监控、SDK、全局配置只初始化一次;
  - StrictMode: development 下 effect 可能重复执行;

```typescript
let analyticsInitialized = false;

export const initAnalyticsOnce = () => {
  if (analyticsInitialized) {
    return;
  }

  analyticsInitialized = true;
  initAnalytics();
};
```

```tsx
export const AppProviders = (props: { children: React.ReactNode }) => {
  useEffect(() => {
    initAnalyticsOnce();
  }, []);

  return <>{props.children}</>;
};
```

### Effect Event

#### Dependency Rule

- 概述: effect event 读取最新值, 但不作为 effect 生命周期依赖;
- 原因: 事件逻辑更新不应触发订阅重建或连接重连;
- 场景: 连接成功 toast、订阅事件回调、读取最新主题或配置;
- 实现机制;
  - Effect event: 用于 effect 内读取最新非响应式逻辑;
  - Dependency array: effect event 本身不放入依赖数组;
  - Compatibility: 仅在项目 React 版本和 lint 规则支持时使用;

```tsx
export const ChatRoom = (props: { roomId: string; theme: Theme }) => {
  const onConnected = useEffectEvent(() => {
    // theme 保持最新; 不让连接 effect 因 theme 变化重连;
    showToast({ theme: props.theme, title: "Connected" });
  });

  useEffect(() => {
    const connection = createConnection(props.roomId);
    connection.on("connected", onConnected);
    connection.connect();

    return () => connection.disconnect();
    // onConnected 不放入依赖数组; roomId 才是连接生命周期依赖;
  }, [props.roomId]);

  return null;
};
```

## 评审清单

### Checklist

#### Async

- 概述: 审查异步链路是否存在可避免等待;
- 原因: 每个多余串行点都会放大端到端响应时间;
- 场景: 接口聚合、SSR 数据加载、页面初始化、复杂 handler;
- 实现机制;
  - Waterfall: 是否存在可并行却串行的 `await`;
  - Branch await: 是否提前等待了只在某分支使用的数据;
  - Nested fetch: 是否被最慢 parent 阻塞所有 child 请求;

#### Bundle

- 概述: 审查首屏 bundle 是否包含非首屏必要内容;
- 原因: 下载、解析、执行都会阻塞可交互时间;
- 场景: 引入新库、页面首屏变慢、构建体积异常、HMR 变慢;
- 实现机制;
  - Import: 是否从大型 barrel 入口导入;
  - Dynamic import: 重组件是否进入首屏 bundle;
  - Third-party: 非关键 SDK 是否阻塞首屏交互;

#### State

- 概述: 审查 state、effect、memo 是否制造无效 render;
- 原因: React 性能问题常来自错误依赖、冗余状态和不稳定引用;
- 场景: 输入卡顿、effect 重跑、子组件 remount、memo 无效;
- 实现机制;
  - Derived state: 是否用 effect 镜像可计算值;
  - Dependencies: effect 是否依赖过宽对象;
  - Closure: callback 是否捕获旧 state;
  - Inline component: 是否导致子组件 remount;

#### Rendering

- 概述: 审查浏览器 layout、paint、hydration 和订阅成本;
- 原因: React render 之外的浏览器工作也会阻塞主线程;
- 场景: 滚动卡顿、长列表、SSR 闪烁、DOM 测量和样式批量更新;
- 实现机制;
  - Conditional: `&&` 是否可能渲染 `0` 或 `NaN`;
  - DOM/CSS: 是否交错读写触发布局抖动;
  - Storage/listener: 是否重复读取 storage 或重复注册全局 listener;

#### Server

- 概述: 审查服务端请求状态、缓存和序列化边界;
- 原因: 服务端重复工作和 payload 过大会同时影响响应和 hydration;
- 场景: SSR、BFF、RPC handler、服务端缓存、server-to-client props;
- 实现机制;
  - Request data: 是否放入模块级可变状态;
  - Payload: server-to-client props 是否过大或重复;
  - Cache: cache key 是否包含权限维度且有失效边界;
