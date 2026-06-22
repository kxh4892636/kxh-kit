---
id: 3DD1C2D4-8B49-494E-B0AC-59A0D2895018
---

# Hertz 初学者入门学习笔记

## 学习定位

### 已知前提

#### 面向已有 Go、IDL、Node 后端经验

- Hertz 本质: Go HTTP Server/Client 框架, 角色接近 Node 生态中的 Express/Koa/Fastify, 但更依赖代码生成、`context.Context`、连接复用和公司基础设施;
- 学习目标: 能创建 Hertz 服务, 编写路由和 handler, 使用 Binding 接收参数, 写中间件, 正确使用 `RequestContext`, 调用 Kitex RPC, 使用 Hertz Client 调用 HTTP 下游;
- 不重复内容: Go 基础语法、IDL 基础语法、普通 HTTP 后端概念;
- 入门主线: `hertztool new` 生成骨架 -> 写 handler/router -> `build.sh` 编译 -> `bootstrap.sh` 启动 -> `curl` 验证 -> 补 Binding/Context/Client/Middleware 边界;

### 框架定位

#### Hertz 内外版本

- 概述: Hertz 已开源, 内部版主要复用开源 HTTP 内核并接入字节内部基础设施;
- 原因: 内外统一降低维护成本, 内部版补齐服务发现、Mesh、Tracing、Access Log、API Metrics、TCC 配置和默认中间件套件;
- 场景: 公司内部 HTTP 服务优先使用内部包 `code.byted.org/middleware/hertz`, 开源通用逻辑可参考 `github.com/cloudwego/hertz`;
- 实现机制:
  - 开源版 module: `github.com/cloudwego/hertz`, 版本通常为 `v0.x.y`;
  - 内部版 module: `code.byted.org/middleware/hertz`, 版本通常为 `v1.x.y`;
  - 内部增强目录: `byted`, 封装公司内部组件;
- 边界: 内部版常通过 type alias 或薄封装复用开源版, 排查底层行为时经常需要看开源源码;

## 快速启动

### 环境与工具

#### 前置条件

- 概述: Hertz 入门前需要准备 Go、`hertztool` 和可选的 Protobuf 工具链;
- 原因: Hertz 项目骨架、IDL 绑定和路由生成依赖工具链, Go module 配置错误会导致生成代码或依赖解析失败;
- 场景: 新建 HTTP 服务、基于 Thrift/Protobuf IDL 创建服务、已有 IDL 更新路由和模型;
- 实现机制:
  - Go 最低版本: 以开源版 `go.mod` 为准, 文档示例要求 Go 1.19+;
  - `hertztool`: `code.byted.org/middleware/hertztool/v3`, 负责生成 Hertz 骨架代码;
  - Protobuf 场景: 需要安装 `protoc` 3.0+ 和 `protoc-gen-go`;
- 示例:

  ```bash
  GO111MODULE=on go install code.byted.org/middleware/hertztool/v3@latest
  hertztool -v

  go install google.golang.org/protobuf/cmd/protoc-gen-go@latest
  ```

- 边界: `hertztool -v` 返回版本号大于等于 `v3.1.5` 才符合快速入门文档预期; `command not found` 通常是 `$GOPATH/bin` 未加入 `PATH`;

#### 私有依赖

- 概述: 内部 module 需要绕过公开 Go checksum/proxy;
- 原因: `code.byted.org/*` 不是公开 module, 默认 `sum.golang.org` 可能返回 `410 Gone`;
- 示例:

  ```bash
  export GOPRIVATE="code.byted.org/*"
  go mod tidy
  ```

- 边界: 依赖拉取错误优先检查 GoProxy、VPN、`GOPRIVATE` 和公司内部网络配置;

### 第一个 Server

#### 创建项目

- 概述: `hertztool new` 根据 PSM 和 Go module 创建可运行的 Hertz Server 骨架;
- 原因: 生成结果包含公司默认配置、编译脚本、启动脚本、路由入口和示例 handler, 比手写骨架更少踩内部规范问题;
- 场景: 新 HTTP 服务、教学 demo、本地快速验证 Hertz 运行链路;
- 实现机制:
  - `--psm`: 服务标识, 线上服务应替换为真实 PSM;
  - `--mod`: Go module 名称, 应与项目 import path 一致;
  - 默认路由: `GET /ping`, 返回 `{"message":"pong"}`;
- 示例:

  ```bash
  mkdir -p ~/hellohertz
  cd ~/hellohertz

  hertztool new --psm=p.s.m --mod=hellohertz
  go mod tidy
  sh build.sh
  sh output/bootstrap.sh
  curl 127.0.0.1:6789/ping
  ```

- 边界: 本地出现 metrics agent 连接失败日志通常可忽略, 不影响本地验证;

#### 生成目录

- 概述: Hertz 项目按 `biz/handler`、`biz/router`、`conf`、入口文件和脚本分层;
- 原因: 生成代码和手写代码分离, 便于后续 `hertztool update` 增量更新;
- 示例:

  ```text
  .
  ├── biz
  │   ├── handler              # 业务 handler, 用户主要写这里
  │   │   └── ping.go
  │   └── router               # IDL 路由生成代码
  │       └── register.go
  ├── build.sh                 # 编译脚本
  ├── conf
  │   └── hertz.config.yaml    # 服务配置
  ├── go.mod
  ├── main.go                  # 程序入口
  ├── router.go                # 用户自定义路由注册
  ├── router_gen.go            # 汇总路由注册
  └── script
      └── bootstrap.sh         # 启动脚本
  ```

- 边界: `biz/router` 和 `router_gen.go` 往往由工具维护, 手写业务逻辑优先放在 `biz/handler` 和 `router.go`;

## Server 编程模型

### Handler 与 Context

#### Handler 签名

- 概述: Hertz handler 同时接收标准 `context.Context` 和 Hertz `*app.RequestContext`;
- 原因: 标准 `context.Context` 用于跨中间件、RPC、日志和超时链路传递; `RequestContext` 用于高性能读请求和写响应;
- 场景: 所有 Server handler 和 middleware;
- 实现机制:

  ```go
  type HandlerFunc func(ctx context.Context, c *app.RequestContext)
  ```

- 示例:

  ```go
  func Ping(ctx context.Context, c *app.RequestContext) {
      c.JSON(200, utils.H{"message": "pong"})
  }
  ```

- 边界: `RequestContext` 未实现 `context.Context` 接口, 需要传给 Kitex/Hertz Client 时使用第一个参数 `ctx`;

#### RequestContext 生命周期

- 概述: `RequestContext` 保存当前 HTTP 请求和响应, 请求结束后会被池化复用;
- 原因: 池化减少分配并提升性能, 但会带来异步和并发使用风险;
- 场景: 读取 query/path/header/body, 设置 status/body/json/header/cookie;
- 实现机制:
  - `RequestContext` 存请求级数据, 查询快, 底层有 map, 非协程安全;
  - `context.Context` 协程安全, 生命周期由链路控制;
  - 请求结束后原 `RequestContext` 可能被下一个请求复用;
- 示例:

  ```go
  func User(ctx context.Context, c *app.RequestContext) {
      id := c.Param("id")
      name := c.Query("name")
      c.JSON(200, utils.H{"id": id, "name": name})
  }
  ```

- 边界:
  - 禁止在 handler 返回后继续持有原始 `*app.RequestContext`;
  - 异步只读可使用 `c.Copy()` 获取副本, 但副本不能写回 response;
  - 更稳妥方式是在主协程提取所需字符串、header、body 拷贝后传入 goroutine;

#### 并发安全

- 概述: `RequestContext` 不是并发安全对象, 读接口也可能因为 lazy init 修改内部状态;
- 原因: 如 `URI()`、`PostArgs()` 首次读取时会解析并写入字段, 并发读也可能产生 race;
- 场景: handler 内起 goroutine、并行读取请求、异步打日志或上报;
- 实现机制:
  - 异步使用: handler 返回后 goroutine 仍读 `RequestContext`, 可能读到新请求数据;
  - 并发使用: 多个 goroutine 同时读写 `RequestContext`, 可能出现 data race;
  - 快速排查: `go test -race`, 或临时设置 `HERTZ_DISABLE_REQUEST_CONTEXT_POOL=1` 观察问题是否缓解;
- 示例:

  ```go
  func Handler(ctx context.Context, c *app.RequestContext) {
      path := string(c.URI().Path())
      go func(path string) {
          log.Printf("path=%s", path)
      }(path)

      c.String(200, "ok")
  }
  ```

- 边界: `ctx.Exile()` 只是不回收到池中, 不能让 `RequestContext` 变成并发安全对象, 不建议作为常规方案;

### 路由

#### 路由注册

- 概述: Hertz 提供 HTTP Method 对应注册方法, 也支持自定义 method 和静态文件;
- 原因: 路由把 HTTP method/path 映射到 handler;
- 场景: REST API、健康检查、静态资源、内部调试接口;
- 实现机制:
  - 常用方法: `GET`、`POST`、`PUT`、`DELETE`、`PATCH`、`HEAD`、`OPTIONS`;
  - 泛化方法: `Handle(method, path, handler)`;
  - 全 method: `Any(path, handler)`;
  - 静态文件: `Static`、`StaticFS`、`StaticFile`;
- 示例:

  ```go
  func customizedRegister(r *server.Hertz) {
      r.GET("/ping", handler.Ping)
      r.POST("/items", handler.CreateItem)
      r.Any("/debug", handler.Debug)
  }
  ```

- 边界: 匿名函数或装饰器注册时, 如需要准确 handler 名称, 使用 `GETEX`、`POSTEX` 等显式传入名称;

#### 路由组

- 概述: `Group` 按路径前缀组织路由, 可统一挂中间件;
- 原因: 路由组降低重复前缀和重复鉴权/日志/限流配置;
- 场景: `/api/v1`、`/admin`、`/internal` 等接口分组;
- 示例:

  ```go
  func customizedRegister(r *server.Hertz) {
      v1 := r.Group("/v1")
      v1.GET("/items/:id", handler.GetItem)
      v1.POST("/items", handler.CreateItem)
  }
  ```

- 边界: 组级中间件可在 `Group(prefix, middleware...)` 中传入, 也可通过 `Use` 注册;

#### 参数路由

- 概述: Hertz 支持静态路由、命名参数路由和通配参数路由;
- 原因: URL 中的资源 id 或可变路径需要被 handler 读取;
- 实现机制:
  - 静态路由: `/users/me`;
  - 命名参数: `/users/:id`, 只匹配单个路径段;
  - 通配参数: `/files/*path`, 匹配后续所有内容;
  - 优先级: 静态路由 > 命名参数路由 > 通配参数路由;
- 示例:

  ```go
  r.GET("/users/:id", func(ctx context.Context, c *app.RequestContext) {
      c.String(200, c.Param("id"))
  })

  r.GET("/assets/*path", func(ctx context.Context, c *app.RequestContext) {
      c.String(200, c.Param("path"))
  })
  ```

- 边界: `/user/:name` 不匹配 `/user/gordon/profile`; 通配参数才匹配多段路径;

### 中间件

#### Middleware 本质

- 概述: 中间件是包裹 handler 的 `app.HandlerFunc`, 可在业务 handler 前后执行逻辑;
- 原因: 认证、日志、打点、超时、跨域、恢复 panic 等横切逻辑不应散落在每个 handler;
- 场景: 全局中间件、路由组中间件、IDL 生成路由默认中间件;
- 实现机制:
  - `c.Next(ctx)` 前为 pre-handler;
  - `c.Next(ctx)` 调用下一个中间件或业务 handler;
  - `c.Next(ctx)` 后为 post-handler;
- 示例:

  ```go
  func TraceMiddleware() app.HandlerFunc {
      return func(ctx context.Context, c *app.RequestContext) {
          start := time.Now()
          c.Next(ctx)
          hlog.CtxInfof(ctx, "cost=%s", time.Since(start))
      }
  }

  func main() {
      h := byted.Default(server.WithHostPorts(":8888"))
      h.Use(TraceMiddleware())
      h.Spin()
  }
  ```

- 边界: 中间件中起 goroutine 同样不能直接把原始 `RequestContext` 传出去;

## 参数绑定

### Binding 模型

#### BindAndValidate

- 概述: Binding 根据 Go struct tag 从 HTTP request 中取 header、path、query、form、json、body 等数据, 构造成结构体;
- 原因: 与 Node 手写 `req.query`/`req.body` 相比, Binding 把入参声明、解析和校验集中到结构体定义;
- 场景: Query 参数、Path 参数、Form、JSON body、Header、Cookie、文件上传;
- 实现机制:
  - Hertz Binding 基于 Go tag;
  - `hertztool` 可根据 IDL 注解生成 tag;
  - `json` 会提前 unmarshal, 主要参与 required 校验;
- 示例:

  ```go
  type GetItemReq struct {
      ID   int64  `path:"id" vd:"$>0"`
      Name string `query:"name" default:"anonymous"`
  }

  func GetItem(ctx context.Context, c *app.RequestContext) {
      var req GetItemReq
      if err := c.BindAndValidate(&req); err != nil {
          c.JSON(400, utils.H{"error": err.Error()})
          return
      }
      c.JSON(200, utils.H{"id": req.ID, "name": req.Name})
  }
  ```

- 边界: Binding 报错优先检查 tag、请求 Content-Type、字段类型和 required/default 语义;

#### Tag 优先级

- 概述: 多个来源都可绑定到同一字段时, Hertz 有固定优先级;
- 原因: 防止 query/form/json 同名字段造成结果不确定;
- 实现机制:

  ```text
  path > form > query > cookie > header > json > raw_body
  ```

- 边界:
  - 不加 tag 时会按默认来源逐级查找;
  - `form` 类似 HTTP 库的 `FormValue`, 会依次解释 `application/x-www-form-urlencoded`、`multipart/form-data` 和 query string;
  - Query 数组只支持 `?a=1&a=2&a=3` 这种重复 key 形式;

#### IDL 注解到 Go Tag

- 概述: 使用 IDL 注解可以让 `hertztool` 生成 Binding 所需 tag;
- 原因: HTTP 接口契约放到 IDL 中, 生成模型、路由和参数绑定, 降低手写不一致风险;
- 实现机制:
  - `api.query`: 生成 `query` tag;
  - `api.path`: 生成 `path` tag;
  - `api.header`: 生成 `header` tag;
  - `api.cookie`: 生成 `cookie` tag;
  - `api.body`: 生成 `json` 和 `form` tag;
  - `api.form`: 生成 `form` tag;
  - `api.raw_body`: 生成 `raw_body` tag;
  - `api.vd`: 生成校验 tag;
  - `go.tag` 或 `api.go_tag`: 透传自定义 Go tag;
- 示例:

  ```thrift
  struct UserInfoRequest {
      1: string NickName (api.query="nickname", go.tag="default:\"hertz\"");
  }
  ```

- 边界: `Required` 可理解为绑定时判断对端是否传了对应参数, 不是业务语义上的“永远非空”保证;

## hertztool

### 代码生成

#### New 与 Update

- 概述: `hertztool new` 创建项目, `hertztool update` 根据 IDL 变化增量更新模型、路由和新增 handler;
- 原因: IDL 驱动的 HTTP 项目需要持续同步接口定义和生成代码;
- 场景: 新服务、新接口、IDL 字段变化、路由变化、handler 分包;
- 实现机制:
  - `new`: 生成 layout、路由注册、handler、model、配置和脚本;
  - `update`: 重新生成 model/router, 增量新增 handler;
  - `.hertztool`: 标记工具生成项目并记录参数, `update` 依赖它识别 layout;
- 示例:

  ```bash
  hertztool new --psm=p.s.m --mod=code.byted.org/team/app --idl idl/hello.thrift
  hertztool update --idl idl/hello.thrift
  ```

- 边界:
  - 同一 IDL 重复 update 时, `handler_dir`、`model_dir`、`router_dir` 应与 new 时一致, 否则可能生成冗余代码;
  - `biz/router/${namespace}/${idlName}.go` 每次基于 IDL 重生成, 不要手改;
  - Thrift 代码生成依赖 `github.com/apache/thrift@v0.13.0`;

#### 生成结构

- 概述: hertztool v3 将业务、model、router、配置、入口和脚本分离;
- 原因: 明确哪些代码可改、哪些代码由工具重生成;
- 示例:

  ```text
  biz/
  ├── handler/                 # 用户实现 IDL method 对应 handler
  ├── model/                   # IDL struct 生成的 Go model
  └── router/                  # IDL method 注解生成的路由注册
  main.go                      # 初始化 byted 与 server
  router.go                    # 用户自定义非 IDL 路由
  router_gen.go                # 汇总自定义路由与生成路由
  ```

- 边界: `handler` 文件通常是用户主要维护点, `model` 和 `router` 生成文件应避免手动修改;

## Client 调用

### Hertz Client

#### Client 类型

- 概述: Hertz 有开源 HTTP 能力的 `client.Client` 和集成公司内部组件的 `byted.Client`;
- 原因: 普通 HTTP 能力和公司服务治理能力解耦, 内部服务调用通常需要 Mesh、Tracing、服务发现和 ctx 透传;
- 场景: 服务内调用下游 HTTP 服务、访问 PSM、接入 Mesh 出流量代理;
- 实现机制:
  - `client.Client`: 只提供 HTTP 能力;
  - `byted.Client`: 集成 Mesh、BytedTrace、服务发现、ctx 透传等;
  - 一个 Client 可请求多个 URL, 不需要每个 URL 创建一个 Client;
- 示例:

  ```go
  c, err := byted.NewClient()
  if err != nil {
      return
  }

  req := &protocol.Request{}
  resp := &protocol.Response{}
  req.SetRequestURI("http://example.com")
  err = c.DoTimeout(context.Background(), req, resp, time.Second)
  ```

- 边界:
  - Mesh 环境下 `byted.NewClient()` 的错误不要忽略, 可能意味着 Egress 端口或 UDS 配置异常;
  - 请求结束后可调用 `protocol.ReleaseRequest(req)` 和 `protocol.ReleaseResponse(resp)` 减少分配;
  - URL 中需保留 `%2F` 等转义字符时, 设置 `req.URI().DisablePathNormalizing = true`;

#### 超时

- 概述: `DoTimeout`/`DoDeadline` 的超时会与 Mesh 联动;
- 原因: 内部 Mesh 需要知道请求级 deadline 才能正确做出流量超时控制;
- 场景: 调用下游 HTTP 服务时设置单请求超时;
- 实现机制:
  - `config.WithRequestTimeout`: 请求级选项, 但 `Do` 搭配它时不与 Mesh 联动;
  - `DoTimeout`: 超时会传递给 Mesh, 以代码超时为准;
- 示例:

  ```go
  err := c.DoTimeout(ctx, req, resp, 1*time.Second)
  ```

- 边界: `DoTimeout` 不支持重定向, 需要重定向时使用 `DoRedirects` 或 `Get*` 方法;

### 服务发现与 Mesh

#### HTTP 下游服务发现

- 概述: Hertz Client 可通过目标 PSM 和 discovery option 调用下游 HTTP 服务;
- 原因: 线上环境不应写死 IP, 应由服务发现、负载均衡和 Mesh 管理实例选择;
- 场景: Hertz Server 调用另一个 Hertz HTTP 服务;
- 示例:

  ```go
  var client, _ = byted.NewClient()

  func Send(ctx context.Context, c *app.RequestContext) {
      req := &protocol.Request{}
      resp := &protocol.Response{}
      req.SetRequestURI("http://hertz.example.serversd/echo?msg=hello")
      req.SetOptions(
          discovery.WithSD(true),
          discovery.WithDestinationCluster("default"),
          discovery.WithDestinationIDC("boe2"),
          discovery.WithDestinationENV("prod"),
      )

      if err := client.Do(ctx, req, resp); err != nil {
          c.JSON(500, utils.H{"error": err.Error()})
          return
      }
      c.JSON(200, string(resp.Body()))
  }
  ```

- 边界:
  - `cluster`、`IDC`、`ENV` 对应 TCE 平台服务详情中的集群、VDC、环境;
  - TCE 上开启 Service Mesh 出流量代理通常不需要改 Hertz 代码;
  - PSM 命名带下划线且开启 Mesh 后遇到 HTTP 400, 需查 Mesh/Hertz Client 对 PSM 的限制文档;

## 调用 Kitex RPC

### Hertz -> Kitex

#### 调用链路

- 概述: Hertz HTTP handler 内创建或复用 Kitex Client, 把 HTTP 请求转换为 RPC 请求, 调用 Kitex Server;
- 原因: 网关/API 层通常是 HTTP, 内部业务服务常用 RPC;
- 场景: HTTP API 聚合下游 RPC 服务、BFF、轻量 API 服务;
- 实现机制:
  - 编写下游 Kitex IDL;
  - `kitex -module <module> idl/xxx.thrift` 生成 client 代码;
  - 初始化全局 Kitex Client;
  - handler 内用标准 `context.Context` 调用 RPC;
  - 把 RPC response 转为 HTTP JSON response;
- 示例:

  ```go
  package caller

  import (
      "time"

      "code.byted.org/kite/kitex/client"
      "code.byted.org/kite/kitex/pkg/connpool"
      "hellohertz/kitex_gen/kitex/example/item/itemservice"
  )

  var ItemClient itemservice.Client

  func RpcInit() {
      var err error
      ItemClient, err = itemservice.NewClient(
          "kitex.example.item",
          client.WithLongConnection(connpool.IdleConfig{
              MaxIdlePerAddress: 100,
              MaxIdleGlobal:     100,
              MaxIdleTimeout:    600 * time.Second,
          }),
          client.WithHostPorts("127.0.0.1:8888"),
      )
      if err != nil {
          panic(err)
      }
  }
  ```

  ```go
  func Rpc(ctx context.Context, c *app.RequestContext) {
      rpcReq := &item.GetItemRequest{Id: 12345}
      rpcResp, err := caller.ItemClient.GetItem(ctx, rpcReq)
      if err != nil {
          c.JSON(200, utils.H{"error": err.Error()})
          return
      }
      c.JSON(200, utils.H{"rpcResp": rpcResp.Item})
  }
  ```

- 边界:
  - 本地联调可用 `client.WithHostPorts("127.0.0.1:8888")`;
  - 线上服务应使用 PSM 和服务发现, 不应保留本地调试地址;
  - Kitex Server 必须先启动, 否则 Hertz handler 只能得到 RPC 调用错误;

## 配置与运行

### 本地启动

#### 编译运行链路

- 概述: Hertz 生成项目通过 `build.sh` 编译, 通过 `output/bootstrap.sh` 启动;
- 原因: 编译产物、配置和启动脚本进入 `output/`, 更接近线上运行结构;
- 示例:

  ```bash
  go mod tidy
  sh build.sh
  sh output/bootstrap.sh
  ```

- 边界:
  - `output/bin` 下是真正可执行文件;
  - `output/conf` 是本次编译复制出的配置;
  - 本地 metrics/TCC/agent 报错多为环境缺失, 不影响基本 handler 验证;

### 服务端端口

#### 端口来源

- 概述: Hertz 服务端口可来自配置、启动环境或平台注入;
- 原因: 本地、TCE、FaaS 等环境对端口管理不同;
- 场景: 本地调试固定 `:6789` 或 `:8888`, 线上由平台指定;
- 边界: 线上端口优先级需查对应“服务端口设置优先级”文档, 不应只依赖本地配置推断线上端口;

## 入门路径

### 最小学习路线

#### 第 1 步: 跑通 HTTP Server

- 完成点: `hertztool new`, `curl /ping` 返回 `{"message":"pong"}`;
- 关注点: module、PSM、`build.sh`、`bootstrap.sh`、默认目录结构;

#### 第 2 步: 写手工路由和 handler

- 完成点: 在 `router.go` 注册 `GET /items/:id`, 在 `biz/handler` 读取 path/query 并返回 JSON;
- 关注点: `context.Context` 和 `RequestContext` 分工;

#### 第 3 步: 用 IDL 驱动 Binding 和路由

- 完成点: 用 Thrift/Protobuf 注解生成 model、router、handler, 使用 `BindAndValidate`;
- 关注点: tag 优先级、required/default、`hertztool update` 行为;

#### 第 4 步: 写中间件

- 完成点: 写一个日志/耗时中间件并挂到全局或路由组;
- 关注点: `c.Next(ctx)` 前后逻辑, 不把 `RequestContext` 异步传出;

#### 第 5 步: 调下游

- 完成点: Hertz handler 调用 Kitex Server 或 Hertz HTTP 下游;
- 关注点: Client 复用、超时、服务发现、Mesh、本地 `WithHostPorts` 与线上 PSM 的差异;

## 常见问题

### 入门高频坑

#### 工具链

- `hertztool` 找不到: 检查 `$GOPATH/bin` 是否在 `PATH`;
- 内部依赖 `410 Gone`: 设置 `GOPRIVATE="code.byted.org/*"`;
- Protobuf 生成失败: 检查 `protoc` 和 `protoc-gen-go`;
- Thrift 生成/编译异常: 固定 `github.com/apache/thrift@v0.13.0`;

#### 生成代码

- `hertztool update` 生成冗余代码: 检查 `handler_dir`、`model_dir`、`router_dir` 是否与 `new` 时一致;
- 手改生成 router 丢失: 生成文件会被 update 重写, 自定义逻辑放到 handler 或自定义 router;
- 没有 `.hertztool`: 工具可能认为当前目录不是 hertztool 项目;

#### 请求处理

- 偶发 400/404 或 path/header 错乱: 优先怀疑异步或并发使用 `RequestContext`;
- goroutine 里需要请求数据: 在主协程复制字符串/byte slice, 或使用 `c.Copy()` 只读副本;
- Query 数组不生效: 使用 `?a=1&a=2&a=3` 形式;

#### 下游调用

- 本地 Kitex 调用失败: 先确认 Kitex Server 已启动, 端口与 `WithHostPorts` 一致;
- 线上仍保留 `127.0.0.1`: 移除本地调试地址, 使用 PSM 和服务发现;
- Mesh 环境 `byted.NewClient()` 返回错误: 不要忽略, 检查 Egress 配置;

## 资料覆盖

### 已读取的核心文档

#### Hertz

- `Hertz 用户手册总览 | Overview of User Manual`;
- `Part 1. Hertz Server 快速入门`;
- `Part 2. Hertz 调用下游 Kitex RPC Server`;
- `Part 3. Hertz Client 服务发现 & mesh`;
- `Server API 示例`;
- `Client API 示例`;
- `Hertztool v3 使用手册`;
- `hertz binding 使用手册`;
- `请求上下文`;
- `Hertz 并发/异步 使用 RequestContext 问题`;
- `路由注册详解`;
- `实现一个简单的中间件`;

