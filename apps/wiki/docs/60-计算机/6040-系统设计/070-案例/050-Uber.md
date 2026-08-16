---
id: 4fff1b64-c906-48e5-bc3f-8a6dda7b500e
---

# Uber

Uber 类叫车系统如何设计？位置追踪、司机匹配、行程状态、支付、通知、缓存和分区如何实现？

## 什么是 Uber

- Uber: 出行服务提供商，允许用户叫车并由司机接送;
- 支持 Web、Android、iOS;

## 需求

### 功能需求

**顾客**

- 查看附近车辆、ETA 和价格;
- 叫车到目的地;
- 查看司机位置;

**司机**

- 接受或拒绝顾客请求;
- 接受后看到顾客上车点;
- 到达目的地后标记行程完成;

### 非功能需求

- 高可靠;
- 高可用、最小延迟;
- 可扩展、高效;

### 扩展需求

- 行程结束后评价;
- 支付处理;
- 指标和分析;

## 估算与约束

假设: 1 亿 DAU、100 万司机、每天 1000 万行程。

### 流量

- 每个用户平均 10 次操作 → 10 亿请求/天;
- RPS: 10 亿 / (24×3600) ≈ 12K/s;

### 存储

- 每个请求约 400B → 400 GB/天;
- 10 年总存储: 400 GB × 365 × 10 ≈ 1.4 PB;

### 带宽

- 每天入站约 400 GB;
- 最低带宽: 400 GB / (24×3600) ≈ 5 MB/s;

### 高层估算表

| 类型      | 估算    |
| --------- | ------- |
| DAU       | 1 亿    |
| RPS       | 12K/s   |
| 每日存储  | ~400 GB |
| 10 年存储 | ~1.4 PB |
| 带宽      | ~5 MB/s |

## 数据模型设计

### 表结构

- **customers**: 顾客信息，如 `name`、`email`;
- **drivers**: 司机信息，如 `name`、`email`、`dob`;
- **trips**: 行程，如 `source`、`destination`、`status`;
- **cabs**: 车辆信息，如注册号、类型（Uber Go、Uber XL 等）;
- **ratings**: 行程评分和反馈;
- **payments**: 支付数据，关联 `tripID`;

### 数据库选型

- 按服务拆分，每个服务拥有自己的表;
- 可用 PostgreSQL 或 Cassandra;

## API 设计

### 请求行程

```tsx
requestRide(customerID: UUID, source: Tuple<float>, destination: Tuple<float>, cabType: Enum<string>, paymentMethod: Enum<string>): Ride
```

### 取消行程

```tsx
cancelRide(customerID: UUID, reason?: string): boolean
```

### 接受或拒绝行程

```tsx
acceptRide(driverID: UUID, rideID: UUID): boolean
denyRide(driverID: UUID, rideID: UUID): boolean
```

### 开始或结束行程

```tsx
startTrip(driverID: UUID, tripID: UUID): boolean
endTrip(driverID: UUID, tripID: UUID): boolean
```

### 评价行程

```tsx
rateTrip(customerID: UUID, tripID: UUID, rating: int, feedback?: string): boolean
```

## 高层设计

### 架构

采用微服务架构:

- **Customer Service**: 顾客认证和信息;
- **Driver Service**: 司机认证和信息;
- **Ride Service**: 司机匹配和四叉树聚合;
- **Trip Service**: 行程管理;
- **Payment Service**: 支付;
- **Notification Service**: 推送通知;
- **Analytics Service**: 指标分析;

服务间通信:

- REST/HTTP 或 gRPC;
- 需要服务发现;
- 可用 Service Mesh;

### 服务预期工作流程

1. 顾客请求行程，指定起点、终点、车型、支付方式;
2. Ride Service 注册请求、查找附近司机、计算 ETA;
3. 请求广播给附近司机，司机接受或拒绝;
4. 司机接受后，顾客看到司机实时位置和 ETA;
5. 上车后司机开始行程;
6. 到达目的地后司机标记完成并收款;
7. 支付完成后顾客可评价;

### 位置追踪

- Pull 模型: 客户端定期 HTTP 请求; 不可扩展、空响应多;
- Push 模型: WebSocket 长连接，服务端推送; 全双工、低延迟;
- 后台应用需有后台任务持续上报 GPS;

### 司机匹配

#### SQL

```sql
SELECT * FROM locations WHERE lat BETWEEN X-R AND X+R AND long BETWEEN Y-R AND Y+R
```

- 简单但不适合大数据集;

#### Geohashing

- 将经纬度编码为短字符串;
- 用顾客 geohash 与司机 geohash 比较;
- 将司机 geohash 索引并存在内存中以提升性能;

#### Quadtree

- 每个内部节点 4 个孩子，递归划分二维空间;
- 支持高效二维范围搜索;
- 每次收到司机位置更新时更新四叉树;
- 用 Redis 缓存最新更新;
- 配合 Hilbert curve 做高效范围查询;

#### 竞态条件

- 大量顾客同时叫车会产生竞态;
- 用 Mutex 包裹匹配逻辑;
- 每个操作应具有事务性;

#### 找最佳司机

- 对附近司机排序: 平均评分、相关性、历史反馈;
- 优先广播给最佳司机;

#### 高需求

- 动态加价（Surge Pricing）;
- 根据需求增加和供应有限临时提高价格;

### 支付

- 使用第三方支付处理器: Stripe、PayPal;
- 支付完成后重定向回应用;
- 设置 Webhook 捕获支付数据;

### 通知

- 使用消息队列/消息代理（Kafka）;
- Notification Service 消费并转发 FCM/APNS;
- 细节参考 WhatsApp 通知设计;

## 详细设计

### 数据分区

- 水平分区（Sharding）;
- 可按现有分区方案或按区域分区;
- 如按 zip code 分区，将同一区域数据固定到节点;
- 数据不均用一致性哈希;

### 指标与分析

- 从各服务采集数据;
- 使用 Spark 做大规模分析;
- 存储关键元数据;

### 缓存

- 缓存顾客和司机最近位置;
- 淘汰策略: LRU;
- 缓存未命中: 查数据库并回填;

## 识别并解决瓶颈

需要思考:

- 某个服务崩溃怎么办？
- 流量如何分发？
- 如何降低数据库负载？
- 如何提升缓存可用性？
- 如何让通知系统更健壮？

韧性措施:

- 每个服务多实例;
- 客户端、服务器、数据库、缓存之间加负载均衡;
- 数据库多读副本;
- 分布式缓存多实例和多副本;
- 用 Kafka/NATS 强化通知;
