---
id: 843cda8b-9451-4d94-8170-ac2bf6c981fd
anki: true
---

# hz 与 IDL

## hz 的作用是什么？版本不一致会怎样？

- `hz` 决定模型、路由、Handler 骨架与目录布局, 版本不同生成物不同;

```bash
go install github.com/cloudwego/hertz/cmd/hz@v0.9.7
hz --version
```

## IDL 里怎么把 HTTP 方法和路径声明出来？

- 方法级注解: `api.get/post/put/delete` 定方法与路径;
- 参数结构体注解: 定参数来源;

```thrift
struct GetArticleRequest {
  1: required i64 id (api.path="id")
}

struct CreateArticleRequest {
  1: required string title (api.body="title")
}

struct DeleteArticleResponse {}

service ArticleService {
  Article Create(1: CreateArticleRequest req) (api.post="/api/v1/articles")
  Article Get(1: GetArticleRequest req)       (api.get="/api/v1/articles/:id")
  DeleteArticleResponse Delete(1: GetArticleRequest req)
      (api.delete="/api/v1/articles/:id")
}
```

## api.* 注解各绑到请求的哪一部分？

| 注解                      | 绑到什么        | 典型用途               |
| ------------------------- | --------------- | ---------------------- |
| `api.get/post/put/delete` | HTTP 方法与路径 | 方法级, 一个方法一个   |
| `api.path`                | 路径变量        | 资源 ID, 与 `:id` 对应 |
| `api.query`               | 查询串          | 分页、过滤、排序       |
| `api.header`              | Header          | 认证、幂等键           |
| `api.body`                | JSON body 字段  | 最常用                 |
| `api.form`                | 表单字段        | 上传元数据             |
| `api.raw_body`            | 原始请求体      | 自行解析               |

- 没有 `api.file` 注解: 文件上传用 RequestContext 的文件 API;
- 反例: 不要臆造注解;
- 注解写错: 不报错, 只生成错路由或绑不到的字段;
- 验证: 用 `hz` 路由表与 `ut.PerformRequest` 各验一次;

## hz 生成的目录里哪些能改、哪些不能？如何只定义路由？

- 可改: `biz/handler` 的实现与根 `main.go`;
- 生成物: `biz/model`、`biz/router`、`router_gen.go`;
- 约定: 生成物只看 diff, 不写业务;

```text
article-api/
├─ idl/article.thrift
├─ biz/handler/article/   # Handler 骨架与实现的交界
├─ biz/model/article/     # IDL 生成的请求/响应模型
├─ biz/router/article/    # 生成的路由注册
├─ router_gen.go          # 汇总生成路由
├─ router.go              # 用户自定义路由
└─ main.go                # Engine 组装与进程入口
```

- 入口可以搬到 `cmd/`, 但要自己在 `main` 里调用生成的注册函数:;

```go
func main() {
	h := server.Default()
	register(h) // router_gen.go 生成的注册入口
	h.Spin()
}
```

- `hz update`: 不记 `new` 时传的 `model_dir` 与 `handler_dir`;
- 要求: 每次带相同参数, 否则目录会重排;
- 自定义路由: 写 `router.go`;
- 反例: 塞进 `router_gen.go` 会在下次生成时被覆盖;

## IDL 改完契约怎么更新？

- 一条命令重生成, 随后看生成 diff、再跑测试;

```bash
hz update -idl idl/article.thrift
git diff -- biz router.go
go test ./...
```
