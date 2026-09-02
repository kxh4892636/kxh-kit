---
id: 46630d3f-5bd9-4a52-a0e4-020e4f8b7064
---

# Backend API 架构模式

何时启用 backend-patterns? REST URL 怎样建模? Repository、Service、Middleware 各自负责什么? 如何用 interface 和组合替代继承式写法?

## 适用范围

- backend-patterns: 面向 Node.js、Express、Next.js API routes 的后端架构、API 设计、数据库优化和服务端实践;
- 触发场景: REST / GraphQL endpoint、repository / service / controller 分层、N+1 / 索引 / 连接池优化、Redis / 内存 / HTTP 缓存、后台任务、错误校验、认证日志限流中间件;
- 实现风格: 使用 `interface + factory function + object composition`; 状态放闭包, 依赖由参数注入, 扩展通过包装对象完成;

## REST API Structure

- Resource URL: 路径表达资源, HTTP method 表达动作;
- Collection: `/api/markets` 表示 market 集合, `GET` 列表, `POST` 创建;
- Item: `/api/markets/:id` 表示单个 market, `GET` 读取, `PUT` 替换, `PATCH` 局部更新, `DELETE` 删除;
- Query string: 过滤、排序、分页用 query 参数, 例如 `status`、`sort`、`limit`、`offset`;

```text
GET    /api/markets
GET    /api/markets/:id
POST   /api/markets
PUT    /api/markets/:id
PATCH  /api/markets/:id
DELETE /api/markets/:id
GET    /api/markets?status=active&sort=volume&limit=20&offset=0
```

## Repository Pattern

- Repository: 数据访问边界; 上层只依赖能力接口, 不依赖 Supabase / ORM / SQL 细节;
- Minimal interface: 只放当前用例需要的方法, 常见方法是 `findAll`、`findById`、`create`、`update`、`delete`;
- Factory: 具体数据源由工厂函数创建, 数据库 client 注入闭包;
- Testability: 测试时可传 fake repository, 不需要真实数据库;

```typescript
interface MarketRepository {
  findAll(filters?: MarketFilters): Promise<Market[]>;
  findById(id: string): Promise<Market | null>;
  findByIds(ids: string[]): Promise<Market[]>;
  create(data: CreateMarketDto): Promise<Market>;
  update(id: string, data: UpdateMarketDto): Promise<Market>;
  delete(id: string): Promise<void>;
}

function createSupabaseMarketRepository(db: SupabaseClient): MarketRepository {
  return {
    async findAll(filters = {}) {
      let query = db.from("markets").select("id, name, status, volume");
      if (filters.status) query = query.eq("status", filters.status);
      if (filters.limit) query = query.limit(filters.limit);
      const { data, error } = await query;
      if (error) throw createApiError(500, error.message);
      return data;
    },
    async findById(id) {
      return readMarketById(db, id);
    },
    async findByIds(ids) {
      return readMarketsByIds(db, ids);
    },
    async create(data) {
      return insertMarket(db, data);
    },
    async update(id, data) {
      return updateMarket(db, id, data);
    },
    async delete(id) {
      await deleteMarket(db, id);
    },
  };
}
```

## Service Layer Pattern

- Service: 承载业务流程和业务规则, 编排 repository、embedding、vector search、排序等能力;
- Dependency injection: 所需能力全部作为 factory 参数传入, service 不创建基础设施;
- Closure helper: 私有辅助逻辑放在闭包内部, 不暴露给调用方;
- Boundary: repository 负责取数, service 负责业务排序和聚合;

```typescript
interface MarketService {
  searchMarkets(query: string, limit?: number): Promise<Market[]>;
}

function createMarketService(deps: {
  repo: MarketRepository;
  embed(query: string): Promise<number[]>;
  vectorSearch(embedding: number[], limit: number): Promise<SearchHit[]>;
}): MarketService {
  return {
    async searchMarkets(query, limit = 10) {
      const embedding = await deps.embed(query);
      const hits = await deps.vectorSearch(embedding, limit);
      const markets = await deps.repo.findByIds(hits.map((hit) => hit.id));
      const scoreById = Object.fromEntries(hits.map((hit) => [hit.id, hit.score]));
      return markets.sort((a, b) => (scoreById[b.id] ?? 0) - (scoreById[a.id] ?? 0));
    },
  };
}
```

## Middleware Pattern

- Middleware: 请求/响应处理管线; 横切能力用高阶函数包裹 handler;
- Auth wrapper: 认证中间件读取 bearer token, 验证后把 user 传给业务 handler;
- Failure path: 缺 token 返回 401, token 无效返回 401, 成功才进入 handler;
- Composition: 多个 wrapper 可按顺序组合, 例如 `withRateLimit(withAuth(handler))`;

```typescript
type AuthedHandler = (req: NextApiRequest, res: NextApiResponse, user: User) => Promise<void>;

function withAuth(verifyToken: (token: string) => Promise<User>) {
  return (handler: AuthedHandler): NextApiHandler =>
    async (req, res) => {
      const token = req.headers.authorization?.replace("Bearer ", "");
      if (!token) return res.status(401).json({ error: "Unauthorized" });
      try {
        return handler(req, res, await verifyToken(token));
      } catch {
        return res.status(401).json({ error: "Invalid token" });
      }
    };
}
```
