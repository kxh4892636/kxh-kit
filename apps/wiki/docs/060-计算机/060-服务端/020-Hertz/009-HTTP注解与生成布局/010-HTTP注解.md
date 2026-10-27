---
id: 5429f9ad-641e-45fc-b33e-28e72f21a516
anki: true
---

# HTTP 注解

## IDL 里怎么把 HTTP 方法和路径声明出来？

- 方法级注解: `api.get/post/put/delete` 定方法 + 路径，参数结构体上的注解定来源;

```thrift
struct Article {
  1: i64 id
}

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

- 一个注解对一个来源: 路径、查询、Header、body、form、raw_body 各有入口;

| 注解                      | 绑到什么        | 典型用途               |
| ------------------------- | --------------- | ---------------------- |
| `api.get/post/put/delete` | HTTP 方法与路径 | 方法级，一个方法一个   |
| `api.path`                | 路径变量        | 资源 ID，与 `:id` 对应 |
| `api.query`               | 查询串          | 分页、过滤、排序       |
| `api.header`              | Header          | 认证、幂等键           |
| `api.body`                | JSON body 字段  | 最常用                 |
| `api.form`                | 表单字段        | 上传元数据             |
| `api.raw_body`            | 原始请求体      | 自行解析               |

- 没有 `api.file` 注解；文件上传用 RequestContext 的文件 API，不要臆造注解;
