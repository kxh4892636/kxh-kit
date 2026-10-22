---
id: 6b7c8d9e-0f1a-4b2c-9d3e-4f5a6b7c8d9e
---

# HTTPException

## 如何主动抛出一个带状态码的错误？

```ts
import { HTTPException } from "hono/http-exception";

throw new HTTPException(401, { message: "Unauthorized" });

// 自定义响应体或响应头
throw new HTTPException(401, {
  res: new Response("Unauthorized", { headers: { Authenticate: 'error="invalid_token"' } }),
});

// 附加原始错误，便于日志排查
throw new HTTPException(401, { message: "登录失败", cause });
```

- 状态码以构造函数参数为准，`res` 里的 status 会被忽略;
- `err.getResponse()` 按 status + message（或自定义 `res`）生成响应;

## 在 `onError` 里怎么处理它最省事？

```ts
app.onError((err, c) => {
  if (err instanceof HTTPException) return err.getResponse();
  console.error(err);
  return c.json({ ok: false, error: "internal_error" }, 500);
});
```

- 一行 `instanceof` 就能让所有业务异常自动带上正确状态码与消息;
- 注意: `getResponse()` 不感知 `Context`，`c.header()` 设过的头不会自动带过去;
- 需要统一错误体结构时，在 `onError` 里改写而不是抛异常时写;

## 业务代码里该不该到处 `throw`？

| 位置                        | 建议                                     |
| --------------------------- | ---------------------------------------- |
| 深层 Service / 第三方库封装 | ✅ 抛 `HTTPException`，让上层统一映射    |
| Handler 里的参数判断        | ❌ 直接 `return c.json(..., 400)` 更直观 |
| 流式响应内部                | ❌ 响应已发出，改用事件通知              |

- 抛异常的价值在于「跨层跳过」，能跳过就跳过，不能跳过就返回;
- 自定义错误码建议集中定义，避免字符串散落各文件。
