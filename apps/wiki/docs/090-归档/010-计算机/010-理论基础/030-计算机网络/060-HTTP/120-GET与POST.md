---
id: 5eb7733a-b279-4d94-98ef-36e8649663b6
---

# GET 与 POST

## GET 与 POST 有哪些区别？

| 维度     | GET                   | POST                     |
| -------- | --------------------- | ------------------------ |
| 应用场景 | 幂等请求              | 非幂等请求               |
| 缓存     | 会缓存                | 不会缓存                 |
| 传参方式 | 查询字符串            | 请求体                   |
| 安全性   | 参数在 URL 中明文可见 | 参数位于请求体           |
| 请求长度 | 受浏览器 URL 长度限制 | 无限制                   |
| 参数类型 | ASCII 字符            | 支持二进制等更多数据类型 |

- 浏览器 URL 长度上限: IE 2083 字节、Chrome 8182、Firefox 65535、Safari 80000、Opera 190000;
- 说明: 该上限由浏览器与服务器实现决定, 并非协议规定;

## 常见的 Content-Type 有哪些？

| 值                                  | 用途         |
| ----------------------------------- | ------------ |
| `application/json`                  | JSON 数据    |
| `application/x-www-form-urlencoded` | 表单编码     |
| `multipart/form-data`               | 带文件的表单 |
| `text/plain`                        | 纯文本       |
| `text/html`                         | HTML 文档    |
| `image/jpeg` / `image/png`          | 图片         |
