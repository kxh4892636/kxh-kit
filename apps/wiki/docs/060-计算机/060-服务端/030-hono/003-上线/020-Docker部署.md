---
id: 2daf01ff-6b55-410c-bc4c-9d1dcca218c7
---

# Docker 部署

## Dockerfile 怎么写才小且安全？

```dockerfile title="Dockerfile"
FROM node:22-alpine AS base

FROM base AS builder
RUN apk add --no-cache gcompat
WORKDIR /app
COPY package*.json tsconfig.json ./
COPY src ./src
RUN npm ci && npm run build && npm prune --production

FROM base AS runner
WORKDIR /app
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 hono
COPY --from=builder --chown=hono:nodejs /app/node_modules /app/node_modules
COPY --from=builder --chown=hono:nodejs /app/dist /app/dist
COPY --from=builder --chown=hono:nodejs /app/package.json /app/package.json
USER hono
EXPOSE 3000
CMD ["node", "/app/dist/index.js"]
```

- 多阶段构建：builder 保留编译工具链，runner 只带产物;
- 非 root 用户运行，减少容器逃逸风险;
- `alpine` 上的 `gcompat` 解决某些原生依赖的 glibc 兼容问题;
- `.dockerignore` 里排除 `node_modules`、`dist`、`.env`，避免把本地文件带进镜像;

## 容器里最容易踩的三个坑是什么？

| 坑               | 现象                 | 修法                                     |
| ---------------- | -------------------- | ---------------------------------------- |
| 监听 `127.0.0.1` | 容器外连不上         | `hostname: '0.0.0.0'`                    |
| 端口写死         | 平台注入 `PORT` 无效 | `port: Number(process.env.PORT ?? 3000)` |
| 无健康检查       | 流量打到未就绪实例   | 加 `/healthz`，配置 readiness            |

- 时区与 locale：需要本地时间时在镜像里设 `TZ`;
- 日志输出到 stdout/stderr，不要写文件，交给平台收集;
- 镜像里的时区、原生模块（如 sharp）架构要与运行环境一致;

## 上线前检查清单是什么？

- [ ] `DATABASE_URL`、`JWT_SECRET` 等敏感配置全部来自环境变量，且启动时校验;
- [ ] `app.onError` 记录日志但不泄漏堆栈给客户端;
- [ ] `bodyLimit`、`timeout` 按路由挂好;
- [ ] `compress()` 已挂（Node 不会自动压缩）;
- [ ] `secureHeaders()` + CORS 白名单已配;
- [ ] 优雅退出正确关闭 server 与连接池;
- [ ] `/healthz` 可用，日志带 `requestId`;
