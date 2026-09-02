---
id: adce371b-8438-44fb-bd3a-cd665a009991
---

# Backend 数据库与缓存模式

查询为什么要选择列? N+1 如何批量消除? 事务如何保证多写一致性? Redis caching layer 与 cache-aside 如何组合到 repository?

## Query Optimization

- Column projection: 只读取所需列, 避免 `select('*')` 带来网络、解析和内存浪费;
- Server-side work: 过滤、排序、limit 下推到数据库, 避免应用层全量扫描;
- Indexing: 高频过滤和排序字段应考虑索引, 否则 limit 前仍可能扫描大量数据;
- Connection pooling: 高并发服务应复用连接, 避免连接创建成本和数据库连接耗尽;

```typescript
const { data } = await supabase
  .from("markets")
  .select("id, name, status, volume")
  .eq("status", "active")
  .order("volume", { ascending: false })
  .limit(10);
```

## N+1 Query Prevention

- N+1: 先查 N 条主记录, 再对每条记录单独查关联对象, 总查询数变成 `1 + N`;
- Batch fetch: 收集关联 ID 后一次性查询关联数据, 再在内存中合并;
- Mapping: 使用 id 到对象的索引表, 让合并过程保持 O(n);
- 场景: 列表页补作者、详情页聚合、权限信息补齐、统计数据补齐;

```typescript
const markets = await getMarkets();
const creators = await getUsers(markets.map((market) => market.creator_id));
const creatorById = Object.fromEntries(creators.map((user) => [user.id, user]));

return markets.map((market) => ({
  ...market,
  creator: creatorById[market.creator_id],
}));
```

## Transaction Pattern

- Transaction: 多个写操作要么全部成功, 要么全部回滚;
- 原子性场景: 创建 market 与创建 position 必须绑定, 防止只写入一半;
- Supabase RPC: 复杂事务放数据库函数中执行, 由数据库保证事务边界;
- Error surface: RPC 错误转换成应用错误, 调用方只处理事务整体失败;

```typescript
async function createMarketWithPosition(
  marketData: CreateMarketDto,
  positionData: CreatePositionDto,
) {
  const { data, error } = await supabase.rpc("create_market_with_position", {
    market_data: marketData,
    position_data: positionData,
  });
  if (error) throw createApiError(500, "Transaction failed");
  return data;
}
```

```sql
CREATE OR REPLACE FUNCTION create_market_with_position(
  market_data jsonb,
  position_data jsonb
) RETURNS jsonb LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO markets VALUES (market_data);
  INSERT INTO positions VALUES (position_data);
  RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
```

## Redis Caching Layer

- Wrapper repository: 缓存层包裹基础 repository, 复用基础方法, 只覆盖需要缓存的方法;
- Cache hit: 命中时反序列化返回, 不访问数据库;
- Cache miss: 未命中时查数据库, 再按 TTL 写入 Redis;
- Invalidation: 写操作后删除相关 key, 防止旧数据长期返回;

```typescript
interface CachedMarketRepository extends MarketRepository {
  invalidateCache(id: string): Promise<void>;
}

function createCachedMarketRepository(
  base: MarketRepository,
  redis: RedisClient,
): CachedMarketRepository {
  return {
    ...base,
    async findById(id) {
      const key = `market:${id}`;
      const cached = await redis.get(key);
      if (cached) return JSON.parse(cached);
      const market = await base.findById(id);
      if (market) await redis.setex(key, 300, JSON.stringify(market));
      return market;
    },
    async invalidateCache(id) {
      await redis.del(`market:${id}`);
    },
  };
}
```

## Cache-Aside Pattern

- Cache-aside: 应用先读缓存, miss 后读数据库并回填缓存;
- TTL: 300 秒适合读多写少、短暂不一致可接受的数据;
- Not found: 数据库无记录时抛业务错误, 避免把空结果当有效对象;
- HTTP cache headers: 对可公开或可短期复用的 API 响应, 也可用 header 让客户端或 CDN 缓存;
