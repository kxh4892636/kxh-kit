---
id: 1D38D1DE-81E9-4967-9782-18A03D6F1C52
---

# Kitex 初学者入门学习笔记

## 学习定位

### 已知前提

#### 面向已有 Go、IDL、Node 后端经验

- Kitex 本质: Go 微服务 RPC 框架, 负责把本地方法调用抽象成跨进程、跨机器的强类型服务调用;
- 学习目标: 能理解 RPC 调用链路, 用 IDL 生成 Server/Client 代码, 实现 handler, 运行服务, 发起 RPC 调用, 配置连接、超时、日志和基础治理;
- 不重复内容: Go 基础语法、Thrift/Protobuf IDL 语法细节、Node 后端通用分层;
- 入门主线: 写 IDL -> `kitex` 生成代码 -> 实现 `handler.go` -> `build.sh` 编译 -> `bootstrap.sh` 启动 Server -> Client 调用 -> 补连接、超时、治理和观测边界;

### 框架定位

#### Kitex

- 概述: Kitex 是公司 Go 微服务 RPC 框架, 支持 Thrift、Kitex Protobuf、gRPC 协议;
- 原因: 微服务间需要稳定的强类型接口、序列化、网络通信、服务发现、负载均衡、超时、重试、限流、熔断、日志、监控和链路追踪;
- 场景: Go 服务之间的 RPC 调用, HTTP API 服务调用下游 RPC 服务, 内部服务治理接入;
- 实现机制:
  - 消息协议: Thrift、Kitex Protobuf、gRPC;
  - 传输协议: TTHeader、HTTP2;
  - 网络库: Netpoll;
  - 代码生成: 根据 IDL 生成 model、client、server、序列化和脚手架代码;
  - 内部增强: 内部库在开源 Kitex 基础上集成公司基础设施;
- 边界: 内部用户应使用内部库 `code.byted.org/kite/kitex`, 通用原理可参考开源 `github.com/cloudwego/kitex`;

## RPC 心智模型

### 调用链路

#### 一次 RPC 调用

- 概述: RPC 是 Remote Procedure Call, 本地代码调用远端服务方法并获取响应;
- 原因: 分布式服务需要像调用本地函数一样调用远端能力, 同时隐藏序列化、网络和服务治理细节;
- 场景: A 服务调用 B 服务的 `GetItem`, API 服务调用 Item 服务, 后端服务聚合多个下游;
- 实现机制:
  - Client 构造请求参数;
  - Client 通过服务发现和负载均衡选择 Server 实例;
  - Client 将请求序列化为二进制数据;
  - Client 通过网络发送数据;
  - Server 接收并反序列化请求;
  - Server handler 执行业务逻辑;
  - Server 序列化响应并返回;
  - Client 反序列化响应并返回给业务代码;
- 示例:

  ```text
  client code -> generated client -> discovery/loadbalance -> codec -> network
      -> generated server -> handler.go -> response
  ```

- 边界: 服务发现、负载均衡、ACL、熔断、限流等属于服务治理能力, 不是 IDL 或 Thrift 自带能力;

### IDL 与生成代码

#### 为什么需要生成代码

- 概述: IDL 定义服务签名, `kitex` 根据 IDL 生成 Go 代码;
- 原因: RPC 框架需要稳定的类型定义、序列化逻辑、client/server 调用入口和框架元信息;
- 场景: 新 RPC 服务、给现有服务生成 client、IDL 变更后同步模型和接口;
- 实现机制:
  - IDL struct -> Go struct 和 getter/setter;
  - IDL service/method -> `NewClient`、`NewServer`、service interface 和 invoker;
  - 序列化 -> `FastRead`、`FastWrite` 等静态生成代码;
  - 框架功能 -> `KitexServiceInfo`、Unknown Field、Field Mask 等能力依赖生成信息;
- 示例:

  ```thrift
  namespace go kitex.example.item

  struct GetItemRequest {
      1: i64 id,
  }

  struct GetItemResponse {
      1: string title,
  }

  service ItemService {
      GetItemResponse GetItem(1: GetItemRequest req),
  }
  ```

- 边界:
  - 如无特殊需求, 不建议使用 `required` 修饰字段, 避免兼容性和演进问题;
  - `kitex_gen` 是生成目录, 不应手动修改;
  - 删除 IDL 文件后, `kitex` 可能不会自动删除旧 `kitex_gen` 目录, 需要按需手动清理;

## 快速入门

### 环境与工具

#### 前置条件

- 概述: Kitex 入门需要 Go、Go module、`kitex` 命令行工具和内部依赖访问能力;
- 原因: Server/Client 代码生成、依赖解析和运行脚本都依赖这些工具;
- 场景: 本地 demo、业务服务新建、已有服务生成 client;
- 实现机制:
  - 操作系统: macOS 或 Linux;
  - Go 版本: 入门文档要求 Go 1.18+;
  - 依赖管理: 使用 Go module;
  - 命令行工具: `code.byted.org/kite/kitex/tool/cmd/kitex`;
- 示例:

  ```bash
  go install -v code.byted.org/kite/kitex/tool/cmd/kitex@latest
  kitex -h
  ```

- 边界:
  - 安装时不要加 `-u`, 避免拉到不兼容依赖;
  - `command not found` 通常是 `$GOPATH/bin` 未加入 `PATH`;
  - 内部域名解析失败先检查 VPN、GoProxy 和内部网络;

### A -> B 单服务调用

#### 创建项目

- 概述: A -> B demo 在一个仓库中同时放 Server 和 Client, 便于学习完整调用;
- 原因: 初学者先降低跨仓库和服务发现复杂度, 专注 RPC 基本链路;
- 场景: 本地 ping-pong RPC demo;
- 示例:

  ```bash
  export EXAMPLE_PATH=$HOME/kitex_example
  mkdir -p $EXAMPLE_PATH
  cd $EXAMPLE_PATH
  go mod init code.byted.org/your_name/kitex_example
  ```

- 边界: 真实项目中 Client 和 Server 通常属于不同服务仓库, demo 放一起只是为了教学;

#### 编写 IDL

- 概述: IDL 定义请求、响应和 service method;
- 原因: Client 和 Server 必须共享同一份接口契约;
- 示例:

  ```thrift
  namespace go toutiao.kitex.demo
  include "base.thrift"

  struct HelloRequest {
      1: string Message,
      255: optional base.Base Base,
  }

  struct HelloResponse {
      1: string Message,
      255: optional base.BaseResp BaseResp,
  }

  service GreetService {
      HelloResponse SayHello(1: HelloRequest request),
  }
  ```

- 边界: 公司内部示例常包含 `base.thrift`, 本地 demo 需要把 `base.thrift` 放到 IDL 搜索路径可见的位置;

#### 生成 Server 代码

- 概述: 带 `-service` 参数会生成可运行 Server 脚手架;
- 原因: Server 需要 `main.go`、`handler.go`、`build.sh`、配置和启动脚本;
- 实现机制:
  - `-module`: 必须与 `go.mod` module 名一致;
  - `-service`: 指定服务名, 建议用服务端 PSM;
  - IDL 文件: 必须是命令最后一个参数;
- 示例:

  ```bash
  kitex -module code.byted.org/your_name/kitex_example \
      -service kitex.thrift.example idl/kitex_greet.thrift

  go mod edit -replace=github.com/apache/thrift=github.com/apache/thrift@v0.13.0
  go mod tidy
  ```

- 边界:
  - 不带 `-service` 只生成 `kitex_gen`, 常用于 Client 代码;
  - `github.com/apache/thrift` v0.14.0 起有 breaking change, Thrift 场景常固定到 v0.13.0;

#### 生成目录

- 概述: `kitex` 生成 Server 入口、handler、编译脚本和 `kitex_gen`;
- 原因: 生成代码承担 RPC 框架 glue code, 用户只需填业务逻辑;
- 示例:

  ```text
  .
  ├── build.sh            # 编译脚本
  ├── conf
  │   └── kitex.yml       # 启动配置
  ├── handler.go          # 用户实现业务逻辑
  ├── idl
  ├── kitex_gen           # IDL 生成代码, 不手改
  ├── main.go             # 创建并运行 Kitex Server
  └── script
      └── bootstrap.sh    # 启动脚本
  ```

- 边界: 业务逻辑主要写在 `handler.go`; `kitex_gen` 变更来自重新执行 `kitex`;

#### 实现 Server Handler

- 概述: `handler.go` 中的实现类型满足 IDL service 生成的 interface;
- 原因: 生成代码负责协议和框架调用, handler 负责业务响应;
- 示例:

  ```go
  type GreetServiceImpl struct{}

  func (s *GreetServiceImpl) SayHello(ctx context.Context, req *demo.HelloRequest) (*demo.HelloResponse, error) {
      return &demo.HelloResponse{
          Message: "I am happy to receive your message!",
      }, nil
  }
  ```

- 边界: handler 入参 `ctx` 承载超时、trace、元信息等链路上下文, 调下游时应继续传递;

#### 编写 Client

- 概述: Client 使用生成的 service client 发起 RPC;
- 原因: 业务代码不直接处理序列化和网络连接, 只调用生成方法;
- 场景: 本地测试、另一个服务调用当前服务、Hertz handler 调用 Kitex 服务;
- 示例:

  ```go
  func main() {
      cli := greetservice.MustNewClient(
          "kitex.thrift.example",
          client.WithHostPorts("localhost:8888"),
      )

      resp, err := cli.SayHello(context.Background(), &demo.HelloRequest{
          Message: "Hello",
      })
      if err != nil {
          fmt.Printf("failed: %s\n", err.Error())
          return
      }
      fmt.Printf("OK: %s\n", resp.Message)
  }
  ```

- 边界:
  - 本地测试可用 `client.WithHostPorts`;
  - 线上调用应把 `destService` 设置为被调用方 PSM, 由服务发现选择实例;
  - 不要每次请求都创建 Kitex Client, 应为每个下游 Service 创建并缓存一个 Client;

#### 运行验证

- 概述: 先启动 Server, 再运行 Client;
- 原因: RPC Client 需要连接正在监听的 Server;
- 示例:

  ```bash
  go mod tidy
  sh build.sh
  sh output/bootstrap.sh

  go run client/main.go
  ```

- 边界:
  - 本地缺少 metrics、consul、远程配置时会出现 warning, 基本 demo 可忽略;
  - 可用 `METRICS_LOG_LEVEL=none` 降低本地 metrics 输出;

## 链式调用

### A -> B -> C

#### 服务分层

- 概述: A -> B -> C demo 包含调用方、API 服务和 Item 服务;
- 原因: 真实业务通常不是单点 RPC, 而是上游服务调用中间服务, 中间服务再调用底层数据/业务服务;
- 场景: HTTP API/Hertz 服务调用 Kitex API 服务, Kitex API 服务调用 Item 服务;
- 实现机制:
  - C: `ItemService`, 提供 `GetItem`;
  - B: `ApiService`, 调用 C 并返回结果;
  - A: 测试调用方或上游服务;
- 示例:

  ```text
  A client -> B ApiService.GetItem -> C ItemService.GetItem
  ```

- 边界: 先让 C 跑起来, 再启动或测试 B; 否则 B 调 C 会失败;

#### C: Item 服务

- 概述: Item 服务实现底层业务数据返回;
- 示例:

  ```go
  type ItemServiceImpl struct{}

  func (s *ItemServiceImpl) GetItem(ctx context.Context, req *item.GetItemRequest) (*item.GetItemResponse, error) {
      resp := item.NewGetItemResponse()
      resp.Item = item.NewItem()
      resp.Item.Id = 1024
      resp.Item.Title = "Hello KiteX!"
      resp.Item.Content = "KiteX is the best framework!"
      return resp, nil
  }
  ```

- 边界: 本地调试可打开 Console 日志, 线上不建议开启过多 Console 输出;

#### B: API 服务调用 C

- 概述: API 服务生成自身 Server 代码, 同时为 Item IDL 生成 Client 代码;
- 原因: B 既是 Server 又是 Client, 需要两套生成入口;
- 实现机制:
  - `kitex -service kitex.example.api idl/kitex_example_api.thrift`: 生成 B 的 server;
  - `kitex ../example_item/idl/kitex_example_item.thrift`: 生成调用 C 的 client 代码;
  - `clients/item.go`: 初始化 C 的 client;
- 示例:

  ```go
  var ItemClient itemservice.Client

  func init() {
      var err error
      ItemClient, err = itemservice.NewClient(
          "kitex.example.item",
          client.WithLongConnection(connpool.IdleConfig{
              MaxIdlePerAddress: 100,
              MaxIdleGlobal:     100,
              MaxIdleTimeout:    600 * time.Second,
          }),
          client.WithTransportProtocol(transport.TTHeaderFramed),
      )
      if err != nil {
          panic(err)
      }
  }
  ```

  ```go
  func (s *ApiServiceImpl) GetItem(ctx context.Context, req *api.GetItemApiRequest) (*api.GetItemApiResponse, error) {
      itemReq := item.NewGetItemRequest()
      itemReq.Id = req.GetId()

      itemResp, err := clients.ItemClient.GetItem(ctx, itemReq, callopt.WithHostPort("127.0.0.1:8888"))
      if err != nil {
          resp := api.NewGetItemApiResponse()
          resp.BaseResp = base.NewBaseResp()
          resp.BaseResp.StatusCode = -10086
          resp.BaseResp.StatusMessage = err.Error()
          return resp, nil
      }

      resp := api.NewGetItemApiResponse()
      resp.Item = itemResp.GetItem()
      return resp, nil
  }
  ```

- 边界:
  - `callopt.WithHostPort("127.0.0.1:8888")` 只适合本地联调;
  - 线上代码不能写死本地地址, 应依赖 PSM 服务发现;
  - 业务错误通常通过业务定义的负数状态码或 BizStatusError 表达, 不要混淆框架错误和业务错误;

## Kitex Tool

### 命令行参数

#### `-module`

- 概述: 指定生成代码所属 Go module;
- 原因: 生成代码里的 import path 依赖 module 名;
- 场景: 当前目录不在 `$GOPATH/src`, 或显式使用 go module;
- 实现机制:
  - 若不存在 `go.mod`, `kitex` 会调用 `go mod init`;
  - 若存在 `go.mod`, `-module` 必须与其中 module 名一致;
- 示例:

  ```bash
  kitex -module code.byted.org/team/demo idl/demo.thrift
  ```

- 边界: 当前目录不在 `$GOPATH/src` 且未指定 `-module` 会报 `Outside of $GOPATH`;

#### `-service`

- 概述: 指定服务名并生成 Server 脚手架;
- 原因: Server 需要 `main.go`、`handler.go`、`build.sh` 和启动脚本;
- 场景: 创建可运行 RPC Server;
- 示例:

  ```bash
  kitex -module code.byted.org/team/demo -service p.s.m idl/demo.thrift
  ```

- 边界: 不带 `-service` 时只生成 `kitex_gen`, 更适合生成 Client 侧代码;

#### `-I`

- 概述: 添加 IDL 搜索路径;
- 原因: IDL 可能 `include` 公共 `base.thrift` 或其他仓库中的文件;
- 示例:

  ```bash
  kitex -module code.byted.org/team/demo -I idl -I common idl/demo.thrift
  ```

- 边界: 支持 `git@`、`http://`、`https://` 前缀拉远程仓库, 但大仓库拉取可能很慢, 建议手动下载或本地缓存;

#### `-use`

- 概述: 使用已有 `kitex_gen` 包, 只生成 Server 脚手架;
- 原因: 公共生成代码可能由独立仓库维护, 业务服务不希望重复生成 model;
- 场景: 公共 IDL 产物复用、规范化生成代码仓库;
- 示例:

  ```bash
  kitex -service p.s.m -use code.byted.org/team/public/kitex_gen idl/demo.thrift
  ```

- 边界: `-use` 必须配合 `-service` 使用;

### Protobuf

#### `go_package`

- 概述: Kitex Protobuf 只支持 proto3, 且要求合理设置 `go_package`;
- 原因: `go_package` 决定生成代码 import path 后缀;
- 示例:

  ```protobuf
  syntax = "proto3";
  package hello;
  option go_package = "hello/world";
  ```

- 边界:
  - 完整 import path 必须匹配当前 module 下的 `kitex_gen`;
  - 可用 `--protobuf Msome.proto=your/package/kitex_gen/path` 覆盖某个 proto 文件的 `go_package`;

## 基础特性

### 消息类型

#### PingPong、Oneway、Streaming

- 概述: Kitex 支持同步请求响应、单向请求和流式通信;
- 原因: 不同业务对响应、吞吐和交互方式要求不同;
- 场景:
  - PingPong: 常规 RPC, 请求后等待响应;
  - Oneway: 只发送不等待响应, 仅 Thrift 支持;
  - Streaming: 一次或多次请求与响应, 支持 gRPC/Protobuf, Thrift Streaming 有单独文档;
- 实现机制:

  | 消息类型 | 编码协议 | 传输协议 |
  | --- | --- | --- |
  | PingPong | Thrift / Protobuf | TTHeader / HTTP2(gRPC) |
  | Oneway | Thrift | TTHeader |
  | Streaming | Protobuf | HTTP2(gRPC) |

- 边界: 默认入门优先掌握 PingPong, Oneway 和 Streaming 属于进阶特性;

### 连接类型

#### 短连接

- 概述: 每次请求创建一次连接;
- 原因: 兼容性最好, 但性能差;
- 场景: 上游实例数过多、下游不适合维持长连接、历史兼容场景;
- 示例:

  ```go
  cli := xxxservice.MustNewClient("destServiceName", client.WithShortConnection())
  ```

- 边界: 通常不建议主动选择短连接, 除非明确知道业务约束;

#### 长连接池

- 概述: Client 复用到每个下游地址的连接池;
- 原因: 减少建连开销, 降低延迟和资源消耗;
- 场景: 高频 RPC、稳定下游实例、非 Mesh 出流量代理场景;
- 实现机制:
  - `MaxIdlePerAddress`: 每个后端实例最大空闲连接数;
  - `MaxIdleGlobal`: 全局最大空闲连接数;
  - `MaxIdleTimeout`: 空闲超过该时长关闭连接, 最小 3s, 默认 30s;
  - `MinIdlePerAddress`: 每个实例保持的最小空闲连接数, 最大 5;
- 示例:

  ```go
  cli := xxxservice.MustNewClient(
      "destServiceName",
      client.WithLongConnection(connpool.IdleConfig{
          MaxIdlePerAddress: 10,
          MaxIdleGlobal:     1000,
          MaxIdleTimeout:    60 * time.Second,
          MinIdlePerAddress: 2,
      }),
  )
  ```

- 边界:
  - `MaxIdlePerAddress` 可按 `qps_per_dest_host * avg_response_time_sec` 估算;
  - 开启 Mesh 后长连接由 Mesh 接管, Kitex Client 侧长连接配置可能不生效;
  - 内部默认未开 Mesh 时走短连接, 历史原因是兼容旧 Python 服务;

## 治理与配置

### 超时

#### Client 超时

- 概述: Client 有连接超时和 RPC 请求超时;
- 原因: 网络连接和业务调用需要独立限制, 防止调用无限等待;
- 实现机制:
  - `ConnTimeout`: 建立新连接最大等待时间, 默认 50ms;
  - `RPCTimeout`: 一次 RPC 调用最大用时, 默认 1s;
  - 超时错误: 未开 Mesh Egress 通常为 Kitex 103, 开 Mesh Egress 通常为 Mesh 1204;
  - 判断方法: `kerrors.IsTimeoutError(err)`;
- 示例:

  ```go
  cli := xxxservice.MustNewClient(
      "destServiceName",
      client.WithConnectTimeout(100*time.Millisecond),
      client.WithRPCTimeout(2*time.Second),
  )

  resp, err := cli.YourMethod(ctx, req,
      callopt.WithConnectTimeout(100*time.Millisecond),
      callopt.WithRPCTimeout(2*time.Second),
  )
  ```

- 边界:
  - 超时配置优先级: 代码配置 > 平台配置或文件配置 > 框架默认值;
  - Call Option 优先级高于 Client Option;
  - 开 Mesh 时部分代码配置可能被 Neptune/Mesh 配置接管;
  - 超时默认不会自动重试;

#### Server 超时

- 概述: Server 有读写超时、退出等待时间和可选的上游超时透传;
- 原因: 防止异常连接卡住协程, 控制服务退出时请求处理窗口;
- 实现机制:
  - `ReadWriteTimeout`: 连接上读写数据等待时间, 默认 5s, 不是 handler 执行超时;
  - `ExitWaitTime`: 收到退出信号后等待在途请求的时间, 默认 5s;
  - `EnableContextTimeout`: 从请求头读取上游 RPCTimeout 并写入 server handler 的 `ctx`;
- 示例:

  ```go
  svr := xxx.NewServer(
      handler,
      server.WithReadWriteTimeout(5*time.Second),
      server.WithExitWaitTime(5*time.Second),
      server.WithEnableContextTimeout(true),
  )
  ```

- 边界: 旧版本非 Streaming Server 不支持 handler 执行超时; 如需自定义 handler timeout, 可用 middleware 自行给 `ctx` 注入更短 timeout;

### 负载均衡

#### 默认策略

- 概述: Kitex 默认使用 `WeightedRoundRobin`;
- 原因: 默认策略根据权重轮询, 使下游实例有较小的 inflight 请求数, 降低过载风险;
- 场景: 绝大多数普通服务调用;
- 实现机制:
  - `WeightedRoundRobin`: 默认;
  - `InterleavedWeightedRoundRobin`: 权重总和很大时更省空间;
  - `WeightedRandom`: 按权重随机;
  - `ConsistentHash`: 相同 key 尽量打到同一实例;
- 边界: 除非理解算法差异和副作用, 不建议替换默认负载均衡;

#### 一致性哈希

- 概述: `ConsistentHash` 让相同 key 的请求尽量命中同一实例;
- 原因: 适合依赖实例本地缓存或上下文的业务;
- 示例:

  ```go
  func keyFunc(ctx context.Context, request interface{}) string {
      return "user-id"
  }

  cli := xxxservice.MustNewClient(
      "destServiceName",
      client.WithLoadBalancer(
          loadbalance.NewConsistBalancer(
              loadbalance.NewConsistentHashOption(keyFunc),
          ),
      ),
  )
  ```

- 边界:
  - `GetKey` 为 nil 或 `VirtualFactor` 为 0 会 panic;
  - key 不能为空串, 否则可能导致流量倾斜;
  - 开 Mesh Egress 时不要直接使用 `client.WithLoadBalancer(loadbalance.NewConsistBalancer(...))`, 需用 Mesh 对应配置和平台策略;

### 启动配置

#### `conf/kitex.yml`

- 概述: 内部 Kitex 默认从 `conf/kitex.yml` 读取启动配置;
- 原因: 监听地址、debug、runtime metric、日志和远程配置需要随环境变化;
- 实现机制:
  - 配置目录: `KITEX_CONF_DIR`, 默认 `conf/`;
  - 配置文件: `KITEX_CONF_FILE`, 默认 `kitex.yml`;
  - 只用 Kitex Client 时默认不会加载启动配置, 如需配置可在 Client 初始化前调用 `config.Init()`;
- 示例:

  ```yaml
  Network: "tcp"
  Address: ":8888"
  ExitWaitTimeout: "5s"
  ReadWriteTimeout: "3s"
  EnableDebugServer: true
  DebugServerPort: "18888"
  EnableRuntimeMetric: true
  RemoteConfigCenter:
    Source: "Byted"
  Log:
    Dir: log
    Loggers:
      - Name: default
        Level: info
        Outputs:
          - File
          - Agent
      - Name: rpcAccess
        Level: trace
        Outputs:
          - File
          - Agent
      - Name: rpcCall
        Level: trace
        Outputs:
          - File
          - Agent
  ```

- 边界:
  - `Address` 中 TCP 端口要带冒号, 如 `":8888"`;
  - TCE 环境存在 `TCE_PRIMARY_PORT` 时会覆盖配置中的 `Address`;
  - `DebugServerPort` 可能被 `TCE_DEBUG_PORT` 或运行时环境影响;
  - 如果要修改某个 logger 字段, 需要补完整 `Log` 配置;

### 日志与指标

#### 日志

- 概述: Kitex 提供默认日志, 也可用 `klog.SetLogger` 注入自定义 logger;
- 原因: 本地排查和线上观测需要统一的框架日志、access log 和 call log;
- 场景: 本地调试、链路排查、框架错误定位;
- 实现机制:
  - `default`: 应用日志;
  - `rpcAccess`: 服务端访问日志;
  - `rpcCall`: 客户端调用日志;
  - 输出: `File`、`Console`、`Agent`;
- 边界:
  - `Console` 适合本地 debug, 线上谨慎开启;
  - `rpcAccess` 和 `rpcCall` 的 trace 级别不建议随意修改, 可能影响调用链构建;

#### Metrics

- 概述: Kitex 默认上报 RPC 基础指标和 runtime 指标;
- 原因: 线上排障需要观察 QPS、Latency、出入流量、错误状态码和调用双方标签;
- 场景: 监控 P99、错误率、上下游关系、超时、panic、连接池复用;
- 实现机制:
  - Server QPS: `bytedtrace.sdk.span.server.rate`;
  - Server Latency: `bytedtrace.sdk.span.server.latency.us`;
  - Client QPS: `bytedtrace.sdk.span.client.rate`;
  - Client Latency: `bytedtrace.sdk.span.client.latency.us`;
  - Panic: `runtime.go.panics`;
  - 常见 tags: `_psm`、`_method`、`_to_service`、`_status_code`、`_is_error`、`mesh`、`retry`;
- 边界: 本地缺少 metrics agent 会有输出报错, 基本 demo 可忽略;

## 注意事项

### Client 复用

#### 不要每个请求创建 Kitex Client

- 概述: Kitex Client 应按下游 Service 维度创建并复用;
- 原因: Client 管理远程配置、服务发现缓存、连接池和后台 goroutine, 高频创建会导致 CPU 升高、服务发现/远程配置超时和 goroutine 暴涨;
- 场景: Server handler 内调用下游 RPC;
- 示例:

  ```go
  var itemClient itemservice.Client

  func Init() {
      itemClient = itemservice.MustNewClient("kitex.example.item")
  }

  func (s *Service) Handle(ctx context.Context, req *api.Request) (*api.Response, error) {
      return itemClient.GetItem(ctx, &item.GetItemRequest{Id: req.Id})
  }
  ```

- 边界: 同一个 Client 可并发安全使用, 不需要每个请求 new;

### RPCInfo

#### 不要异步使用原 RPCInfo

- 概述: Kitex `RPCInfo` 默认生命周期是请求开始到请求返回, 之后可能被 `sync.Pool` 复用;
- 原因: 异步 goroutine 继续读原 RPCInfo 可能读到脏数据或空指针 panic;
- 场景: handler 中异步打日志、异步上报、启动 goroutine;
- 实现机制:
  - 推荐: `rpcinfo.FreezeRPCInfo(ctx)` 创建只读副本并挂到新 context;
  - 兜底: `KITEX_DISABLE_RPCINFO_POOL=true` 禁用回收;
- 示例:

  ```go
  ctx2 := rpcinfo.FreezeRPCInfo(ctx)
  go func(ctx context.Context) {
      ri := rpcinfo.GetRPCInfo(ctx)
      _ = ri
  }(ctx2)
  ```

- 边界: 禁用 RPCInfo pool 会牺牲性能, 常规代码应复制需要的信息或冻结 RPCInfo;

### 依赖问题

#### Apache Thrift 版本

- 概述: Thrift 生成代码常依赖 `github.com/apache/thrift@v0.13.0`;
- 原因: v0.14.0 起接口 breaking change 会导致生成代码编译失败;
- 常见错误:
  - `not enough arguments in call to iprot.ReadStructBegin`;
  - `ambiguous import: found package github.com/apache/thrift/lib/go/thrift in multiple modules`;
- 示例:

  ```bash
  go mod edit -droprequire=github.com/apache/thrift/lib/go/thrift
  go mod edit -replace=github.com/apache/thrift=github.com/apache/thrift@v0.13.0
  go mod tidy
  ```

- 边界: 避免对 Kitex/Thrift 依赖执行无脑 `go get -u`;

## 入门路径

### 最小学习路线

#### 第 1 步: 跑通 A -> B

- 完成点: `kitex -service`, 实现 `SayHello`, Server 启动, Client 打印 `OK`;
- 关注点: `-module`、`-service`、`kitex_gen`、`handler.go`;

#### 第 2 步: 拆成真实服务分层

- 完成点: C 服务提供 `GetItem`, B 服务调用 C, 用单测或 Client 验证 B;
- 关注点: 生成 server 和 client 的两类命令, `WithHostPorts` 只用于本地;

#### 第 3 步: 固化 Client 初始化模式

- 完成点: 为每个下游 Service 初始化一次 Client, handler 中复用;
- 关注点: 连接池、超时、transport、服务发现;

#### 第 4 步: 接入配置与观测

- 完成点: 理解 `conf/kitex.yml`, 知道日志和 metrics 看什么;
- 关注点: `Address`、`DebugServerPort`、`rpcAccess`、`rpcCall`、QPS、Latency、错误码;

#### 第 5 步: 学治理配置

- 完成点: 理解默认负载均衡、RPCTimeout、ConnTimeout 和 Neptune/Mesh 配置优先级;
- 关注点: 代码配置优先级、超时错误 103/1204、Mesh 与非 Mesh 差异;

## 常见问题

### 入门高频坑

#### 工具链

- `kitex` 找不到: 检查 `$GOPATH/bin` 是否在 `PATH`;
- 内部域名解析失败: 检查 VPN、GoProxy、内部网络;
- 当前目录不在 `$GOPATH/src`: 使用 go module 并显式传 `-module`;
- `--kitex_out: no service defined`: IDL 中没有定义 service;

#### 生成代码

- 只生成了 `kitex_gen`: 命令缺少 `-service`, 这是 Client-only 生成模式;
- `kitex_gen` 编译失败: 检查 IDL include、namespace/go_package、Thrift 版本;
- 删除 IDL 后旧代码还在: 按需手动清理旧 `kitex_gen`;

#### 运行调用

- Client 调用失败: 确认 Server 已启动, 地址/PSM/端口正确;
- 本地启动有 metrics/consul warning: 本地缺少内部组件, 基本调用可先忽略;
- 单测调用 B 服务失败: 先启动 C 服务, 再跑 B 的测试;

#### 线上化

- 线上代码出现 `127.0.0.1`: 移除本地调试地址, 使用 PSM 服务发现;
- 每个请求都 new Client: 改为全局或生命周期稳定的 Client 缓存;
- 随意改负载均衡: 默认 `WeightedRoundRobin` 足够大多数场景;
- 异步读 RPCInfo: 使用 `rpcinfo.FreezeRPCInfo`;

## 资料覆盖

### 已读取的核心文档

#### Kitex

- `Kitex`;
- `前置知识：理解 RPC 与 IDL`;
- `搭建 A -> B 服务 | Build A -> B Service`;
- `搭建 A -> B -> C 服务`;
- `Part 2. 创建第一个项目`;
- `Part 3. 运行 Item 服务（C）`;
- `Part 4. 编写 Api 服务（B）`;
- `Part 5. 调用 Api 服务（A）`;
- `KiteX Tool 代码生成工具使用文档`;
- `Kitex - 连接类型`;
- `Kitex - 消息类型`;
- `Kitex - 超时配置`;
- `Kitex - 启动配置`;
- `Kitex - 负载均衡使用指南`;
- `Kitex - 日志`;
- `Kitex - Metric 指标`;
- `Kitex - 使用注意事项`;

