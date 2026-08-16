---
id: e8eacb61-d332-4206-8374-9b5ea06da33c
---

# Twitter

Twitter 类社交系统如何设计？Newsfeed 如何生成和发布？搜索、排行、转推、通知、媒体如何处理？

## 什么是 Twitter

- Twitter: 社交媒体服务，用户可发布最多 280 字符的短消息（tweet）;
- 支持文本、图片、视频;
- 提供 Web、Android、iOS;

## 需求

### 功能需求

- 发布新推文（文本、图片、视频等）;
- 关注其他用户;
- Newsfeed 展示所关注用户的推文;
- 搜索推文;

### 非功能需求

- 高可用、最小延迟;
- 可扩展、高效;

### 扩展需求

- 指标和分析;
- 转推;
- 收藏推文;

## 估算与约束

假设: 10 亿总用户、2 亿 DAU，平均每个用户每天发 5 条推文。

### 流量

- 每天推文: 2 亿 × 5 = 10 亿条;
- 媒体: 10% 为媒体 → 1 亿个文件/天;
- RPS: 10 亿 / (24×3600) ≈ 12K/s;

### 存储

- 每条推文约 100B → 100 GB/天;
- 每个媒体约 50 KB → 5 TB/天;
- 10 年总存储: (5 TB + 0.1 TB) × 365 × 10 ≈ 19 PB;

### 带宽

- 每天入站约 5.1 TB;
- 最低带宽: 5.1 TB / (24×3600) ≈ 60 MB/s;

### 高层估算表

| 类型      | 估算     |
| --------- | -------- |
| DAU       | 2 亿     |
| RPS       | 12K/s    |
| 每日存储  | ~5.1 TB  |
| 10 年存储 | ~19 PB   |
| 带宽      | ~60 MB/s |

## 数据模型设计

### 表结构

- **users**: 用户信息，如 `name`、`email`、`dob`;
- **tweets**: 推文，如 `type`、`content`、`userID`;
- **favorites**: 用户与收藏推文映射;
- **followers**: 用户之间的关注关系（N:M）;
- **feeds**: 用户 feed 属性;
- **feeds_tweets**: feed 与推文映射（N:M）;

### 数据库选型

- 看似关系型，但不应单库;
- 按服务拆分，每个服务拥有自己的表;
- 可用 PostgreSQL 或 Cassandra;

## API 设计

### 发布推文

```tsx
postTweet(userID: UUID, content: string, mediaURL?: string): boolean
```

### 关注/取消关注

```tsx
follow(followerID: UUID, followeeID: UUID): boolean
unfollow(followerID: UUID, followeeID: UUID): boolean
```

### 获取 Newsfeed

```tsx
getNewsfeed(userID: UUID): Tweet[]
```

## 高层设计

### 架构

采用微服务架构:

- **User Service**: 用户认证和信息;
- **Newsfeed Service**: 生成和发布用户 feed;
- **Tweet Service**: 发推、收藏等;
- **Search Service**: 搜索;
- **Media Service**: 媒体上传;
- **Notification Service**: 推送通知;
- **Analytics Service**: 指标分析;

服务间通信:

- REST/HTTP 或 gRPC;
- 需要服务发现;
- 可用 Service Mesh;

### Newsfeed

#### 生成

1. 获取用户 A 关注的所有用户和实体（hashtag、topic 等）;
2. 拉取这些 ID 的相关推文;
3. 用排序算法按相关性、时间、互动等排序;
4. 分页返回给客户端;

- 生成是重操作，可预生成并缓存;
- 周期性更新 feed 并重新排序;

#### 发布

- **Pull Model（Fan-out on load）**: 用户刷新时实时组装 feed; 减少写放大，但读操作增加;
- **Push Model（Fan-out on write）**: 发推时立即推送到所有粉丝 feed; 读快但写放大;
- **Hybrid Model**: 粉丝少的用户用 Push，粉丝多的大 V 用 Pull;

### Ranking 排序算法

- 经典 Facebook EdgeRank: Rank = Affinity × Weight × Decay;
- Affinity: 用户与内容创作者的亲近度（互动越多越高）;
- Weight: 不同边类型的权重，如评论权重大于点赞;
- Decay: 时间衰减，越旧越低;
- 现代排序用 ML，考虑数千因素;

### Retweets 转推

- 简单实现: 创建新推文，userID 为转推用户，type 设为 tweet，content 为原推 id;

| id                  | userID              | type  | content                      | createdAt     |
| ------------------- | ------------------- | ----- | ---------------------------- | ------------- |
| ad34-291a-45f6-b36c | 7a2c-62c4-4dc8-b1bb | text  | Hey, this is my first tweet… | 1658905644054 |
| f064-49ad-9aa2-84a6 | 6aa2-2bc9-4331-879f | tweet | ad34-291a-45f6-b36c          | 1658906165427 |

- 更优做法: 独立 retweets 表;

### Search 搜索

- 传统 DBMS 不够快;
- 使用 Elasticsearch（基于 Lucene）实现近实时全文搜索;
- 热点话题: 缓存最近 N 秒高频搜索、hashtag、topic，每 M 秒批量更新; 可应用排序算法个性化;

### Notifications 通知

- 使用消息队列/消息代理（如 Kafka）;
- Notification Service 消费事件并转发 FCM/APNS;
- 细节可参考 WhatsApp 通知设计;

## 详细设计

### 数据分区

- 水平分区（Sharding）;
- 可选 Hash-Based、List-Based、Range-Based、Composite;
- 数据不均用一致性哈希;

### 共同好友

- 为每个用户构建社交图;
- 节点表示用户，有向边表示关注关系;
- 遍历粉丝图找到共同好友;
- 可用图数据库: Neo4j、ArangoDB;
- 提高准确性可引入 ML 推荐模型;

### 指标与分析

- 用 Kafka 发布事件;
- 用 Spark 处理大规模分析;

### 缓存

- 缓存热门 20% 推文;
- API 分页;
- 淘汰策略: LRU;
- 缓存未命中: 查数据库并回填;

### 媒体访问与存储

- 使用对象存储: S3、Azure Blob、GCS;
- 也可用 HDFS、GlusterFS;

### CDN

- 图片、视频走 CDN;
- 提升可用性和降低带宽成本;

## 识别并解决瓶颈

需要思考:

- 某个服务崩溃怎么办？
- 流量如何分发？
- 如何降低数据库负载？
- 如何提升缓存可用性？
- 如何让通知系统更健壮？
- 如何降低媒体存储成本？

韧性措施:

- 每个服务多实例;
- 客户端、服务器、数据库、缓存之间加负载均衡;
- 数据库多读副本;
- 分布式缓存多实例和多副本;
- 用 Kafka/NATS 强化通知;
- Media Service 增加压缩和处理能力;
