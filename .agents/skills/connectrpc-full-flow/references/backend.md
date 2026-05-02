# Go 后端开发

## Proto 编写

```protobuf
syntax = "proto3";
package <domain>.v1;
option go_package = "<module>/gen/<domain>/v1;<domain>v1";

service <Service> {
  rpc <Method>(<Method>Request) returns (<Method>Response);
}

message <Entity> {
  int32 id = 1;
  string name = 2;
  // ...
}
message <Method>Request {}
message <Method>Response {
  repeated <Entity> items = 1;
}
```

**关键字段：**
- `package`：决定 URL 路径 `/<package>.<Service>/<Method>`
- `go_package`：格式为 `<module-path>;<go-package-name>`，`;<name>` 是 Go 代码中的包别名

## 服务实现

在 `internal/service/` 中实现生成的接口：

```go
package service

import (
    "context"
    "connectrpc.com/connect"
    <domain>v1 "<module>/gen/<domain>/v1"
    "<module>/gen/<domain>/v1/<domain>v1connect"
)

type <Service> struct{}

// 编译期接口检查——删掉这行不影响运行，但保留它可以获得编译错误提示
var _ <domain>v1connect.<Service>Handler = (*<Service>)(nil)

func (s *<Service>) <Method>(
    ctx context.Context,
    req *connect.Request[<domain>v1.<Method>Request],
) (*connect.Response[<domain>v1.<Method>Response], error) {
    // 业务逻辑
    return connect.NewResponse(&<domain>v1.<Method>Response{}), nil
}
```

## main.go 注册

```go
package main

import (
    "net/http"
    "<module>/gen/<domain>/v1/<domain>v1connect"
    "<module>/internal/service"
)

func main() {
    mux := http.NewServeMux()
    mux.Handle(<domain>v1connect.New<Service>Handler(&service.<Service>{}))

    // CORS 中间件以允许前端跨域
    http.ListenAndServe(":8080", corsMiddleware(mux))
}
```

CORS 中间件至少需要允许以下请求头：
```go
w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Connect-Protocol-Version")
```

## URL 路由规则

ConnectRPC 的 URL 由 proto 自动生成，格式：

```
/<package>.<Service>/<Method>
```

例如 `package posts.v1; service PostsService { rpc GetPosts ... }` → `/posts.v1.PostsService/GetPosts`
