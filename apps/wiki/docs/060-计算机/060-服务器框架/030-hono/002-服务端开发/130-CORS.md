---
id: 024ec724-9661-4681-91d7-5c43a41bdd30
---

# CORS

## CORS 该怎么配才安全？

```ts
import { cors } from "hono/cors";

app.use("/api/*", cors()); // 默认 origin: '*'，仅适合公开接口

app.use(
  "/api2/*",
  cors({
    origin: ["https://app.example.com", "https://admin.example.com"],
    allowMethods: ["GET", "POST", "PUT", "DELETE"],
    allowHeaders: ["Content-Type", "Authorization"],
    exposeHeaders: ["X-Total-Count"],
    maxAge: 600,
    credentials: true,
  }),
);
```

| 选项            | 含义                     | 默认         |
| --------------- | ------------------------ | ------------ |
| `origin`        | 允许来源，可传数组或函数 | `*`          |
| `allowMethods`  | 允许方法，可传函数       | 全部常见方法 |
| `allowHeaders`  | 允许请求头               | `[]`         |
| `exposeHeaders` | 允许前端读取的响应头     | `[]`         |
| `maxAge`        | 预检结果缓存秒数         | —            |
| `credentials`   | 是否允许带 Cookie        | —            |

## 顺序与动态配置要注意什么？

```ts
// 必须在路由之前挂
app.use("/api/*", cors());
app.route("/api", apiRoutes);

// 按环境注入来源
app.use("*", (c, next) => cors({ origin: c.env.CORS_ORIGIN })(c, next));
```

- CORS 没挂在路由之前，预检请求会命不中，浏览器报跨域失败;
- 动态来源不要写死在应用里;
- 只想放行子域名时用函数判断，务必校验协议与结尾：

```ts
app.use(
  "/api/*",
  cors({
    origin: (origin) => (origin.endsWith(".example.com") ? origin : "https://app.example.com"),
  }),
);
```

## 和 Vite、反向代理一起用有什么坑？

- 用 Vite 开发代理时，关掉 Vite 自带的 CORS（`server.cors: false`），避免两层头打架;
- 反向代理若也加 CORS 头，会出现重复 `Access-Control-Allow-Origin`，浏览器直接拒绝;
- 只在一层配 CORS：应用层配了就让代理层别管，反之亦然;
- `credentials: true` 时 `origin` 不能是 `*`，必须回显具体来源;
