---
id: b6752dd8-31fd-4e86-b878-c30172588237
---

# WhatsApp

WhatsApp 类即时消息系统如何设计？需要哪些服务？实时消息、已读回执、最后上线、通知、媒体存储分别怎么实现？

## 什么是 WhatsApp

- WhatsApp: 即时消息应用，支持一对一聊天、群聊、文件分享;
- 用户规模: 超过 20 亿用户，覆盖 180+ 国家;
- 提供 Web、Android、iOS 等客户端;

## 需求

### 功能需求

- 支持一对一聊天;
- 群聊（最多 100 人）;
- 支持文件分享（图片、视频等）;

### 非功能需求

- 高可用、最小延迟;
- 可扩展、高效;

### 扩展需求

- 消息已发送、已送达、已读回执;
- 显示用户最后上线时间;
- 推送通知;

## 估算与约束

假设: 5000 万 DAU，平均每个用户每天向 4 个不同的人发送 10 条消息。

### 流量

- 每天消息: 5000 万 × 40 = 20 亿条;
- 媒体: 5% 消息为媒体 → 1 亿个文件/天;
- RPS: 20 亿 / (24×3600) ≈ 24K/s;

### 存储

- 每条消息约 100B → 200 GB/天;
- 每个媒体约 100 KB → 10 TB/天;
- 10 年总存储: (10 TB + 0.2 TB) × 365 × 10 ≈ 38 PB;

### 带宽

- 每天入站约 10.2 TB;
- 最低带宽: 10.2 TB / (24×3600) ≈ 120 MB/s;

### 高层估算表

| 类型      | 估算      |
| --------- | --------- |
| DAU       | 5000 万   |
| RPS       | 24K/s     |
| 每日存储  | ~10.2 TB  |
| 10 年存储 | ~38 PB    |
| 带宽      | ~120 MB/s |

## 数据模型设计

### 表结构

- **users**: 用户信息，如 `name`、`phoneNumber`;
- **messages**: 消息，如 `type`（text/image/video）、`content`、投递时间戳，关联 `chatID` 或 `groupID`;
- **chats**: 两个用户之间的私聊，包含多条消息;
- **users_chats**: 用户与私聊的多对多映射;
- **groups**: 群组，包含多个用户;
- **users_groups**: 用户与群组的多对多映射;

### 数据库选型

- 数据模型看似关系型，但不应把所有数据放单库;
- 按服务拆分，每个服务拥有自己的表;
- 可用 PostgreSQL 或分布式 NoSQL（Cassandra）;

## API 设计

### 获取所有聊天或群组

```tsx
getAll(userID: UUID): Chat[] | Group[]
```

### 获取消息

```tsx
getMessages(userID: UUID, channelID: UUID): Message[]
```

### 发送消息

```tsx
sendMessage(userID: UUID, channelID: UUID, message: Message): boolean
```

### 加入或离开频道

```tsx
joinGroup(userID: UUID, channelID: UUID): boolean
leaveGroup(userID: UUID, channelID: UUID): boolean
```

## 高层设计

### 架构

采用微服务架构，每个服务拥有自己的数据模型。

- **User Service**: HTTP 服务，处理认证和用户信息;
- **Chat Service**: 使用 WebSocket 处理聊天/群消息; 用缓存跟踪活跃连接，判断用户在线;
- **Notification Service**: 发送推送通知;
- **Presence Service**: 跟踪最后上线状态;
- **Media Service**: 处理媒体上传;

服务间通信:

- 一般 REST/HTTP 够用;
- 可改用 gRPC 提升轻量高效;
- 需要服务发现;
- 可用 Service Mesh 提供可管理、可观测、安全的通信;

### 实时消息

- Pull 模型: 客户端定期 HTTP 请求或长轮询; 不可扩展，大量空响应浪费资源;
- Push 模型: 客户端保持长连接，服务端有数据立即推送;
- 推荐: WebSocket，全双工、低延迟;
- SSE 只支持单向，不适合双向聊天;

### Last seen 最后上线

- 心跳机制: 客户端定期 ping 服务端;
- 用缓存存储最后活跃时间:

| Key    | Value               |
| ------ | ------------------- |
| User A | 2022-07-01T14:32:50 |
| User B | 2022-07-05T05:10:35 |
| User C | 2022-07-10T04:33:25 |

- Presence Service + Redis/Memcached 实现;
- 也可惰性更新: 用户超过阈值（如 30 秒无操作）标记离线;

### 通知

- 发消息后判断接收者是否活跃;
- 不活跃则 Chat Service 向消息队列写入事件，附带设备平台等元数据;
- Notification Service 消费事件，转发 FCM（Android）或 APNS（iOS）;
- 也支持 email/SMS;
- 为什么用消息队列: 提供尽力有序和至少一次投递;
- 为什么不是经典 Pub/Sub: 移动端通知由 FCM/APNS 外部处理，不是后端 fanout;

### 已读回执

- 等待客户端 ACK，更新 `deliveredAt`;
- 用户打开聊天时更新 `seenAt`;

### 基本设计图

- 客户端 → API Gateway → 各微服务;
- 实时消息走 WebSocket 到 Chat Service;
- 通知走 Notification Service → FCM/APNS;

## 详细设计

### 数据分区

- 水平分区（Sharding）;
- 可选 Hash-Based、List-Based、Range-Based、Composite;
- 数据不均用一致性哈希;

### 缓存

- 用户期待最新数据，但群聊中大量用户请求相同旧消息;
- 可缓存旧消息;
- API 加分页，减少网络传输;
- 淘汰策略: LRU;
- 缓存未命中: 查数据库并回填;

### 媒体访问与存储

- 媒体占大部分存储;
- 使用对象存储: S3、Azure Blob、GCS;
- 也可用分布式文件存储: HDFS、GlusterFS;
- 产品策略: WhatsApp 在用户下载后删除服务器媒体;

### CDN

- 图片、视频等静态文件走 CDN;
- 提升可用性、冗余、降低带宽成本;
- 可用 CloudFront、Cloudflare;

### API Gateway

- 系统涉及 HTTP、WebSocket、TCP/IP 多协议;
- 为每种协议单独部署 L4/L7 LB 成本高;
- API Gateway 可统一支持多协议;
- 同时提供认证、授权、限流、节流、API 版本管理;

## 识别并解决瓶颈

需要思考:

- 某个服务崩溃怎么办？
- 流量如何分发？
- 如何降低数据库负载？
- 如何提升缓存可用性？
- API Gateway 是否单点？
- 如何让通知系统更健壮？
- 如何降低媒体存储成本？
- Chat Service 职责是否过重？

韧性措施:

- 每个服务多实例;
- 客户端、服务器、数据库、缓存之间加负载均衡;
- 数据库多读副本;
- 分布式缓存多实例和多副本;
- API Gateway 备用副本;
- 用 Kafka/NATS 等消息代理强化通知系统;
- Media Service 增加媒体处理和压缩能力;
- 将 Group Service 从 Chat Service 中拆出，进一步解耦;
