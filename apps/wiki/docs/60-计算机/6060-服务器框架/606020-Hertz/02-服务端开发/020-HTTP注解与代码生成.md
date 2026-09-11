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

## 如何检查契约的参数边界？

- 路径与字段一致: `:id` 必须能映射到明确字段;
- body 与 path 分离: 更新接口的资源 ID 放 path，可修改内容放 body;
- 列表请求: page、page_size、filter 和 sort 放 query;
- 响应模型: 不直接复用数据库结构，避免泄露内部字段;

## 如何验证注解生成结果？

- model: 生成请求与响应 Go 类型;
- router: 生成路由注册代码;
- handler: 生成待实现的协议适配入口;
- 主动检查: 确认注解是否生成预期路径、方法和绑定逻辑;

## 需要核对具体用法时查哪里？

- 官方入口: [IDL 注解说明](https://github.com/cloudwego/cloudwego.github.io/blob/38744fc12990bb900765d0235c171a80c9fa2af9/content/zh/docs/hertz/tutorials/toolkit/annotation.md)、[hz 使用 (thrift)](https://github.com/cloudwego/cloudwego.github.io/blob/38744fc12990bb900765d0235c171a80c9fa2af9/content/zh/docs/hertz/tutorials/toolkit/usage-thrift.md);
