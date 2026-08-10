---
id: 5264ada6-692e-41fa-80bb-8ff8100d5818
---

# 运行首个 HTTP 服务

最小程序是什么？运行应该如何完成？自检是什么？

## 最小程序

```go
package main

import (
	"context"

	"github.com/cloudwego/hertz/pkg/app"
	"github.com/cloudwego/hertz/pkg/app/server"
	"github.com/cloudwego/hertz/pkg/protocol/consts"
)

func main() {
	h := server.Default()
	h.GET("/ping", func(ctx context.Context, c *app.RequestContext) {
		c.JSON(consts.StatusOK, map[string]string{"message": "pong"})
	})
	h.Spin()
}
```

## 运行

```powershell
go mod init example.com/hertz-start
go get github.com/cloudwego/hertz
go run .
curl.exe http://127.0.0.1:8888/ping
```

- `server.Default`: 创建带常用默认中间件的 Engine;
- `GET`: 将 HTTP 方法和路径映射到 Handler;
- `c.JSON`: 设置状态码、内容类型并序列化响应;
- `Spin`: 阻塞运行服务并处理退出信号;

## 自检

- 正常请求: `/ping` 返回 200 和 JSON;
- 错误方法: `POST /ping` 不应进入 GET Handler;
- 错误路径: `/missing` 返回未匹配路由响应;
- 进程退出: 开发阶段可使用 Ctrl+C; 生产阶段还需设置明确的关闭预算;
