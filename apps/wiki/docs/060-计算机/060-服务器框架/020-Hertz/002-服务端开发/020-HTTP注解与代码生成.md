---
id: 5429f9ad-641e-45fc-b33e-28e72f21a516
---

# HTTP 注解与代码生成

## 如何用 Thrift 声明 HTTP 接口？

```thrift
namespace go article

struct CreateArticleRequest {
  1: required string title   (api.body="title")
  2: required string content (api.body="content")
}

struct Article {
  1: i64 id
  2: string title
  3: string content
}

struct GetArticleRequest {
  1: required i64 id (api.path="id")
}

service ArticleService {
  Article CreateArticle(1: CreateArticleRequest req)
      (api.post="/api/v1/articles")
  Article GetArticle(1: GetArticleRequest req)
      (api.get="/api/v1/articles/:id")
}
```

## 如何把注解映射到 HTTP 字段？

- `api.get/post/put/delete`: 将 service method 映射到 HTTP 方法和路径;
- `api.path`: 将路径变量绑定到字段;
- `api.query`: 将查询字符串绑定到字段;
- `api.header`: 将 Header 绑定到字段;
- `api.body`: 将 JSON body 字段绑定到字段;
- `api.form` / `api.raw_body`: 分别映射表单与原始请求体；文件上传用 RequestContext 的文件 API，不虚构 `api.file` 注解;
