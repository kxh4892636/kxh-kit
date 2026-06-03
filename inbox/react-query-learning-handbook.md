---
id: 42333178-1C4A-4A65-B8ED-254D1DFE52F3
---

# React Query / TanStack Query 初学者学习手册

## 完成标准

- 能区分 server state 与 client state;
- 能创建 `QueryClient` 并用 `QueryClientProvider` 注入应用;
- 能用 `useQuery` 声明读取数据, 正确处理 `pending/error/success/fetching`;
- 能设计包含所有变量的 `queryKey`, 并写出会 throw 的 `queryFn`;
- 能解释默认 `staleTime/gcTime/retry/refetch` 行为;
- 能用 `enabled` 表达 lazy query 与 dependent query;
- 能用 `useMutation` 提交 create/update/delete, 并在成功后 `invalidateQueries`;
- 能判断 optimistic update 该用 UI-only 还是 cache update, 并知道 rollback 边界;

## 核心心智模型

### Server State

- Server state: 存在远端, 通过 async API 读取/写入, 可被其他人修改, 本地副本可能过期;
- Client state: 只属于当前 UI, 如 modal open、input draft、tab active, 不需要 React Query;
- React Query 定位: fetching、caching、synchronizing、updating server state;
- 主要收益: request dedupe、cache sharing、background refetch、stale 判断、garbage collection、mutation side effects;
- 判断规则: 数据来源是 server 且可过期, 用 React Query; UI 临时状态, 用 `useState`/store;

### 三个核心概念

| 概念 | 作用 | 初学者记法 |
| --- | --- | --- |
| `QueryClient` | 持有 query cache 与 mutation cache | 一个 app 级 server-state 管理器 |
| `useQuery` | 读取 server state | GET-like data dependency |
| `useMutation` | 写入 server state 或触发 side effect | POST/PUT/PATCH/DELETE-like action |
| `invalidateQueries` | 标记 query stale 并触发活跃 query 后台 refetch | mutation 后告诉相关读模型过期 |

## 最小应用骨架

### QueryClient

- `QueryClient`: cache、default options、mutation/query orchestration 的入口;
- `QueryClientProvider`: 把同一个 client 放入 React context;
- 创建位置: 通常在应用根外或稳定初始化处, 避免每次 render 创建新 cache;

```typescript
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query";

const queryClient = new QueryClient();

export const App = (): JSX.Element => {
  return (
    <QueryClientProvider client={queryClient}>
      <Todos />
    </QueryClientProvider>
  );
};

const Todos = (): JSX.Element => {
  const query = useQuery({
    queryKey: ["todos"],
    queryFn: fetchTodos,
  });

  if (query.isPending) return <span>Loading</span>;
  if (query.isError) return <span>{query.error.message}</span>;

  return <TodoList todos={query.data} />;
};
```

## useQuery 读取数据

### 最小签名

- `queryKey`: 必填, 顶层必须是 Array, 用来标识 cache entry;
- `queryFn`: 必填或由 default query function 提供, 必须返回 Promise;
- 成功值: 不能 resolve `undefined`; 没有数据时用 `null`;
- 失败值: 必须 throw 或返回 rejected Promise, React Query 才会进入 error state;

```typescript
type Todo = {
  id: string;
  title: string;
};

const fetchTodos = async (): Promise<Todo[]> => {
  const response = await fetch("/api/todos");

  // fetch 对 4xx/5xx 不会自动 throw, 需要手动转成 rejected query;
  if (!response.ok) {
    throw new Error("Failed to fetch todos");
  }

  return response.json() as Promise<Todo[]>;
};

const todosQuery = useQuery({
  queryKey: ["todos"],
  queryFn: fetchTodos,
});
```

### Query 状态

| 状态 | 含义 | 常见 UI |
| --- | --- | --- |
| `isPending` / `status === "pending"` | 还没有可用 data | 首屏 loading / skeleton |
| `isError` / `status === "error"` | queryFn throw/reject | error message / retry |
| `isSuccess` / `status === "success"` | 有可用 data | 正常渲染 |
| `isFetching` | queryFn 正在执行, 含后台 refetch | 小型 syncing indicator |
| `isLoading` | `isPending && isFetching` | lazy query 首次真正请求中 |
| `isRefetching` | `isFetching && !isPending` | 已有旧数据时后台刷新中 |

- `status`: 描述 data 是否存在;
- `fetchStatus`: 描述 queryFn 是否正在运行, 值为 `fetching/paused/idle`;
- 渲染顺序: 先处理 `isPending`, 再处理 `isError`, 最后把 `data` 视为已存在;

## queryKey 与 queryFn

### queryKey 规则

- Serializable: key 必须可被稳定序列化;
- Unique to data: 同一份数据同一 key, 不同数据不同 key;
- Variables in key: `queryFn` 依赖的变量必须进入 `queryKey`;
- Object order: object 属性顺序不影响 hash;
- Array order: array 元素顺序影响 hash;
- Prefix matching: `["todos"]` 可匹配 `["todos", { page: 1 }]`;

```typescript
const todoQuery = useQuery({
  queryKey: ["todo", todoId],
  queryFn: () => fetchTodo(todoId),
});

const filteredTodosQuery = useQuery({
  queryKey: ["todos", { status, page }],
  queryFn: () => fetchTodos({ status, page }),
});
```

### queryFn 规则

- Promise contract: resolve data 或 throw error;
- `fetch` 边界: `response.ok` 为 false 时自己 throw;
- `QueryFunctionContext`: 可从 `context.queryKey`、`context.signal`、`context.client` 读取上下文;
- AbortSignal: `signal` 可交给 `fetch` 支持 cancellation;

## 默认缓存行为

### Important Defaults

| 默认项 | 默认值 | 影响 |
| --- | --- | --- |
| `staleTime` | `0` | query 成功后立即 stale |
| stale refetch | mount / window focus / reconnect | stale query 会后台 refetch |
| `gcTime` | `5 * 60 * 1000` | inactive query 5 分钟后被清理 |
| query retry | client 默认 3 次 | 失败后指数退避重试 |
| mutation retry | 默认 0 次 | 写操作默认不重试 |
| structural sharing | 默认开启 | JSON-compatible data 未变时保持引用稳定 |

- Fresh: `staleTime` 未过期, 不因 mount/focus/reconnect 自动 refetch;
- Stale: 可展示旧数据, 但会在触发点后台 refetch;
- Inactive: 没有组件订阅的 query, 等待 `gcTime` 后 garbage collect;
- `staleTime: Infinity`: 不自动 stale, 但手动 invalidation 仍生效;
- `staleTime: "static"`: 不因 invalidation 或 always refetch 触发更新, 仅用于运行期不变数据;

## enabled 与依赖查询

### Lazy Query

- `enabled: false`: 不自动 mount fetch, 不后台 refetch, 也会忽略可触发 refetch 的 invalidation/refetchQueries;
- `refetch()`: `enabled: false` 时可手动请求, 但不能传新参数;
- 推荐用法: 参数进入 state 与 `queryKey`, 用 `enabled` 控制何时具备请求条件;
- TypeScript 替代: `skipToken` 可类型安全禁用, 但 `refetch()` 不适用;

```typescript
const [filter, setFilter] = useState("");

const todosQuery = useQuery({
  queryKey: ["todos", { filter }],
  queryFn: () => fetchTodos({ filter }),
  enabled: filter.length > 0,
});
```

### Dependent Query

- Dependent query: 后一个 query 依赖前一个 query 的结果;
- Hook 规则: 不要条件调用 hook, 始终调用 `useQuery`, 用 `enabled` 控制执行;
- 初始状态: 无 data 且 disabled 时通常 `status: "pending"`、`fetchStatus: "idle"`;
- 性能边界: dependent query 是 request waterfall, 能改 API 并行时优先改 API;

```typescript
const userQuery = useQuery({
  queryKey: ["user", email],
  queryFn: () => fetchUserByEmail(email),
});

const userId = userQuery.data?.id;

const projectsQuery = useQuery({
  queryKey: ["projects", userId],
  queryFn: () => fetchProjectsByUser(userId),
  enabled: Boolean(userId),
});
```

## useMutation 写入数据

### mutation 基础

- `useMutation`: 用于 create/update/delete 或 server side-effect;
- `mutationFn`: 接收 `mutate(variables)` 传入的单个变量对象, 返回 Promise;
- 状态: `idle/pending/error/success`;
- `mutate`: fire-and-forget, 回调返回值会被忽略;
- `mutateAsync`: 返回 Promise, 适合 `await` 串联 side effects;
- Retry: mutation 默认不 retry, 需要显式配置;

```typescript
const createTodoMutation = useMutation({
  mutationFn: createTodo,
});

createTodoMutation.mutate({ title: "Read TanStack Query docs" });
```

### mutation callbacks

| Callback | 时机 | 常见用途 |
| --- | --- | --- |
| `onMutate` | mutationFn 前 | optimistic update、snapshot、cancel queries |
| `onSuccess` | 成功后 | invalidate、set cache、toast、navigate |
| `onError` | 失败后 | rollback、error toast |
| `onSettled` | 成功或失败后 | cleanup、最终 invalidate |

- Promise callback: callback 返回 Promise 时会被 await, 下一个 callback 等它完成;
- Consecutive mutations: `useMutation` 上的 handler 每次都会跑, `mutate(..., callbacks)` 的额外 callback 可能只对最后一次且组件仍 mounted 时运行;

### mutation 错误处理

- 错误来源: `mutationFn` 返回 rejected Promise 或 throw error 后, mutation 才会进入 `error` 状态;
- Fetch 边界: 原生 `fetch` 遇到 HTTP 4xx/5xx 不会自动 throw, 需要手动判断 `response.ok`;
- UI 状态: 用 `isError/error/failureCount/failureReason` 展示失败原因和重试次数;
- `onError`: 处理 rollback、toast、日志、表单错误映射等副作用;
- `onSettled`: 成功或失败都会执行, 适合 cleanup、关闭 pending 状态、最终 invalidate;
- `reset`: 清空 mutation 的 `error/data/status`, 适合用户修改输入后移除旧错误;
- Retry: mutation 默认 `retry: 0`, 只有幂等或可安全重复的操作才显式开启 retry;

```typescript
type Todo = { id: string; title: string };
type ApiError = Error & { status?: number };

const createTodo = async (input: { title: string }): Promise<Todo> => {
  const response = await fetch("/api/todos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const error: ApiError = new Error("Create todo failed");
    error.status = response.status;
    throw error;
  }

  return response.json();
};

const createTodoMutation = useMutation({
  mutationFn: createTodo,
  onError: (error: ApiError, variables) => {
    console.error("create todo failed", { error, variables });
  },
});
```

#### `mutate` vs `mutateAsync`

- `mutate`: 适合按钮点击等 fire-and-forget 场景, 错误通过 `isError/error/onError` 处理;
- `mutateAsync`: 返回 Promise, 成功 resolve, 失败 throw, 适合提交流程需要 `try/catch/finally`;
- 局部 callbacks: `mutate(variables, { onError })` 只适合组件局部副作用, 组件 unmounted 后不会执行;
- 公共 callbacks: `useMutation({ onError })` 更适合必须稳定执行的 rollback、cache、日志逻辑;

```typescript
const mutation = useMutation({ mutationFn: createTodo });

const handleSubmit = async (title: string): Promise<void> => {
  try {
    const todo = await mutation.mutateAsync({ title });
    console.log("created", todo.id);
  } catch (error) {
    console.error("submit failed", error);
  } finally {
    console.log("submit finished");
  }
};
```

#### Error Boundary

- `throwOnError: true`: mutation error 会在 render phase 抛给最近的 error boundary;
- `throwOnError(error)`: 可按错误类型决定是交给 error boundary, 还是留在 `mutation.error` 状态中由当前 UI 展示;
- 使用边界: 预期业务错误通常留在表单或 toast 中展示, 非预期系统错误才更适合 error boundary;

```typescript
const updateTodoMutation = useMutation({
  mutationFn: updateTodo,
  throwOnError: (error: ApiError) => {
    return (error.status ?? 500) >= 500;
  },
});
```

## invalidateQueries

### Mutation 后刷新读模型

- Invalidation 含义: 标记 matched query stale, 覆盖 `staleTime`;
- Active query: 当前正在被组件订阅的 query 会后台 refetch;
- Targeted invalidation: 用 key prefix 或 exact 匹配相关 query;
- 设计判断: server 返回 canonical data 且影响范围不止一处, 优先 invalidation;

```typescript
const queryClient = useQueryClient();

const createTodoMutation = useMutation({
  mutationFn: createTodo,
  onSuccess: async () => {
    await queryClient.invalidateQueries({ queryKey: ["todos"] });
  },
});
```

### 匹配粒度

```typescript
// 所有 todos 前缀, 如 ["todos"] 与 ["todos", { page: 1 }];
queryClient.invalidateQueries({ queryKey: ["todos"] });

// 只匹配完全等于 ["todos"] 的 query;
queryClient.invalidateQueries({ queryKey: ["todos"], exact: true });

// 只匹配 done 列表;
queryClient.invalidateQueries({ queryKey: ["todos", { type: "done" }] });
```

## Optimistic Update

### UI-only optimistic update

- 适用场景: 只在当前列表临时展示 pending item;
- 数据来源: 使用 mutation result 的 `variables/submittedAt/isPending/isError`;
- 优点: 不改 cache, 无需 rollback cache;
- 边界: 其它组件看不到临时数据;

### Cache optimistic update

- 适用场景: 多处 UI 都要立刻看到同一份临时数据;
- 必要步骤: cancel outgoing queries, snapshot old cache, setQueryData, error rollback, settled invalidate;
- 失败边界: 如果 refetch 无法修复错误状态, 必须用 snapshot rollback;
- 并发边界: 多个 optimistic mutation 并发时要考虑提交顺序、唯一临时 id、rollback 覆盖问题;

```typescript
const queryClient = useQueryClient();

const updateTodoMutation = useMutation({
  mutationFn: updateTodo,
  onMutate: async (nextTodo) => {
    await queryClient.cancelQueries({ queryKey: ["todos", nextTodo.id] });

    const previousTodo = queryClient.getQueryData<Todo>(["todos", nextTodo.id]);
    queryClient.setQueryData(["todos", nextTodo.id], nextTodo);

    return { previousTodo };
  },
  onError: (_error, nextTodo, context) => {
    queryClient.setQueryData(["todos", nextTodo.id], context?.previousTodo);
  },
  onSettled: (_data, _error, variables) => {
    return queryClient.invalidateQueries({ queryKey: ["todos", variables.id] });
  },
});
```

## 常见误区

- 把 React Query 当 Redux/Zustand: 错, 它主要管理 server state, 不替代本地 UI 状态;
- `queryFn` 用了变量但 `queryKey` 漏变量: 会缓存串数据或不按预期 refetch;
- `fetch` 不检查 `response.ok`: 4xx/5xx 也会被当成功, `isError` 不会触发;
- query 成功 resolve `undefined`: 非法成功缓存值, 用 `null` 表达空结果;
- 组件里条件调用 `useQuery`: 违反 hooks 规则, 用 `enabled` 或 `skipToken`;
- 永久 `enabled: false`: 放弃自动 refetch、background sync 和 invalidation refetch;
- 过早 optimistic cache update: rollback 与并发没想清楚时优先 invalidation 或 UI-only optimistic;
- 全量关闭 refetchOnWindowFocus: 先理解 `staleTime`, 再决定是否关触发点;
- 乱设 `staleTime: "static"`: 会让 invalidation 也失效, 仅用于运行期不可变数据;
- mutation 成功后忘记 invalidation: UI 继续展示旧 cache;

## 最小学习路径

| 步骤 | 学习目标 | 验收方式 |
| --- | --- | --- |
| 1 | `QueryClientProvider` + `useQuery` 拉列表 | pending/error/success 都能渲染 |
| 2 | `queryKey` 包含所有变量 | filter/page 变化会命中新 key |
| 3 | 理解 `staleTime/gcTime/refetch` | focus/refetch 行为能解释 |
| 4 | `enabled` 做 lazy/dependent query | disabled 时不 fetching, 条件满足才请求 |
| 5 | `useMutation` + `invalidateQueries` | create 后列表自动更新 |
| 6 | optimistic update 边界 | 默认 UI-only, 多处同步才改 cache |

## API 速查

| API | 最小用途 | 初学默认选择 |
| --- | --- | --- |
| `new QueryClient()` | 创建 cache client | app 根部单例 |
| `<QueryClientProvider client={client}>` | 注入 client | 包住应用 |
| `useQuery({ queryKey, queryFn })` | 读数据 | queryKey 包含全部变量 |
| `useMutation({ mutationFn })` | 写数据 | 成功后 invalidate |
| `useQueryClient()` | 取当前 client | mutation callback 中常用 |
| `queryClient.invalidateQueries({ queryKey })` | 标记 stale 并 refetch active query | mutation 成功后首选 |
| `queryClient.setQueryData(queryKey, updater)` | 直接写 cache | 只在响应足够或 optimistic 明确时用 |
| `queryClient.cancelQueries({ queryKey })` | 取消正在飞的 refetch | cache optimistic 前用 |
