---
id: c9a7ccb9-eea7-4222-8a44-cff89233e1f4
---

# Netflix

Netflix 类视频流媒体系统如何设计？视频处理流水线、流媒体、搜索、推荐、地理限制、缓存和存储怎么实现？

## 什么是 Netflix

- Netflix: 订阅制流媒体服务，用户可在联网设备上观看电视和电影;
- 支持 Web、iOS、Android、TV 等平台;

## 需求

### 功能需求

- 用户可流媒体播放和分享视频;
- 内容团队可上传新视频;
- 用户可按标题或标签搜索视频;
- 用户可评论视频;

### 非功能需求

- 高可用、最小延迟;
- 高可靠，上传不能丢失;
- 可扩展、高效;

### 扩展需求

- 内容地理限制（Geo-blocking）;
- 从上次位置续播;
- 记录视频指标和分析;

## 估算与约束

假设: 10 亿总用户、2 亿 DAU，平均每个用户每天看 5 个视频。

### 流量

- 每天观看: 2 亿 × 5 = 10 亿次;
- 读写比 200:1 → 每天上传 500 万个视频;
- RPS: 10 亿 / (24×3600) ≈ 12K/s;

### 存储

- 每个视频平均 100 MB → 500 TB/天;
- 10 年总存储: 500 TB × 365 × 10 ≈ 1,825 PB;

### 带宽

- 每天入站约 500 TB;
- 最低带宽: 500 TB / (24×3600) ≈ 5.8 GB/s;

### 高层估算表

| 类型      | 估算      |
| --------- | --------- |
| DAU       | 2 亿      |
| RPS       | 12K/s     |
| 每日存储  | ~500 TB   |
| 10 年存储 | ~1,825 PB |
| 带宽      | ~5.8 GB/s |

## 数据模型设计

### 表结构

- **users**: 用户信息，如 `name`、`email`、`dob`;
- **videos**: 视频，如 `title`、`streamURL`、`tags`、`userID`;
- **tags**: 视频标签;
- **views**: 视频观看记录;
- **comments**: 视频评论;

### 数据库选型

- 按服务拆分，每个服务拥有自己的表;
- 可用 PostgreSQL 或 Cassandra;

## API 设计

### 上传视频

```tsx
uploadVideo(title: string, description: string, data: Stream<byte>, tags?: string[]): boolean
```

### 流媒体播放

```tsx
streamVideo(videoID: UUID, codec: Enum<string>, resolution: Tuple<int>, offset?: int): VideoStream
```

- 支持指定编码、分辨率、可选偏移量用于续播;

### 搜索视频

```tsx
searchVideo(query: string, nextPage?: string): Video[]
```

### 添加评论

```tsx
comment(videoID: UUID, comment: string): boolean
```

## 高层设计

### 架构

采用微服务架构:

- **User Service**: 用户认证和信息;
- **Stream Service**: 视频流媒体;
- **Search Service**: 搜索;
- **Media Service**: 视频上传和处理;
- **Analytics Service**: 指标分析;

服务间通信:

- REST/HTTP 或 gRPC;
- 需要服务发现;
- 可用 Service Mesh;

### 视频处理流水线

上传后进入消息队列，由处理流水线消费。

1. **File Chunker 文件分块**
   - 把视频拆成小块;
   - 可消除重复数据、减少网络传输;
   - Netflix 按场景切块，而不是固定时间，降低播放中断概率;

2. **Content Filter 内容过滤**
   - 检查是否符合平台内容政策;
   - Netflix 按内容分级预审，YouTube 严格审查;
   - ML 模型做版权、盗版、NSFW 检查;
   - 有问题的任务进 Dead-letter Queue（DLQ）供人工审核;

3. **Transcoder 转码**
   - 将原始数据解码为中间未压缩格式，再编码为目标格式;
   - 支持不同 codec，进行码率调整、降采样、重编码;
   - 可用 FFmpeg 或 AWS Elemental MediaConvert;

4. **Quality Conversion 质量转换**
   - 转成 4K、1440p、1080p、720p 等分辨率;
   - 处理完成后存入 HDFS、GlusterFS 或对象存储（S3）;
   - 可增加字幕、缩略图生成;

为什么用消息队列:

- 视频处理是长任务;
- 解耦上传与处理;
- 可用 SQS 或 RabbitMQ;

### 视频流媒体

- 使用 CDN 避免用户重复回源;
- Netflix Open Connect: 与 ISP 合作，将流量本地化;
  - 约 95% 全球流量通过 Open Connect 与 ISP 直连;
  - Open Connect Appliance（OCA）部署在全球 1000+ 位置;
  - 故障时可 failover 到 Netflix 服务器;
- 自适应码率流媒体: HLS 根据网络条件动态调整;
- 续播: 使用 views 表中的 `offset` 定位场景块并恢复播放;

### 搜索

- 使用 Elasticsearch 提供近实时搜索;
- 热点内容: 缓存最近 N 秒高频搜索，每 M 秒批量更新;

### 分享

- 可集成 URL Shortener 生成短链接;

## 详细设计

### 数据分区

- 水平分区（Sharding）;
- 可选 Hash-Based、List-Based、Range-Based、Composite;
- 数据不均用一致性哈希;

### 地理限制

- 按 IP 或用户区域设置判断位置;
- CloudFront 提供地理限制;
- Route53 提供地理位置路由策略;
- 不可用区域返回错误页;

### 推荐

- 使用 ML 模型基于观看历史预测;
- 可用的协同过滤（Collaborative Filtering）;
- Netflix 推荐引擎跟踪:
  - 用户画像（年龄、性别、位置）;
  - 浏览和滚动行为;
  - 观看时间和日期;
  - 使用的设备;
  - 搜索次数和关键词;

### 指标与分析

- 从各服务采集数据;
- 使用 Spark 做大规模分析;
- views 表存储关键元数据;

### 缓存

- 尽可能缓存静态媒体内容;
- 淘汰策略: LRU;
- 缓存未命中: 查数据库并回填;

### 媒体存储与流媒体

- 使用 HDFS、GlusterFS 或对象存储（S3）;
- Media Service 负责上传和处理;

### CDN

- 图片、视频走 CDN;
- 可用 CloudFront、Cloudflare;

## 识别并解决瓶颈

需要思考:

- 某个服务崩溃怎么办？
- 流量如何分发？
- 如何降低数据库负载？
- 如何提升缓存可用性？

韧性措施:

- 每个服务多实例;
- 客户端、服务器、数据库、缓存之间加负载均衡;
- 数据库多读副本;
- 分布式缓存多实例和多副本;
