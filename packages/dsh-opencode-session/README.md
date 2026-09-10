# dsh-opencode-session

为所有 provider 的模型请求添加 `x-opencode-session: <DSH 会话 id>`，不限制 OpenCode provider。

## 安装

构建并打包后，将本地产物安装到需要启用的 DSH profile：

```sh
pnpm --filter @kxh4892636/dsh-opencode-session build
pnpm --filter @kxh4892636/dsh-opencode-session pack
dsh plugin --profile <profile> add /absolute/path/to/kxh4892636-dsh-opencode-session-0.1.0.tgz
```

包自带 `cordis.patch.yml`，无额外配置。适配 DSH `0.1.5-rc.1` 的 `llm/stream` 接口。

## 行为

- 使用当前模型调用的 `sessionId`，覆盖已有同名请求头；不生成 UUID。
- 不按 provider、模型、域名过滤。同一会话的多轮调用与重试使用同一 ID，并发会话分别隔离。
- 没有 `sessionId` 或值为空时不添加请求头，也不继承外层模型调用的会话 ID。
- 保留其他请求头、请求体、取消信号与 fetch 的头部优先级；不修改传入的 `Request` 或 `init`。
- 流创建、迭代、异常注入和关闭均保留会话上下文；错误按原样向上传递。
- 插件卸载后停止注入，移除事件监听，并在没有后续 fetch 包装时恢复原 fetch。

## 覆盖边界

使用 `llm/stream` 和 `AsyncLocalStorage` 将会话绑定到 `globalThis.fetch` 请求。模型适配器在该异步上下文内发起的 fetch（包括重试）会携带此头；普通工具联网、遥测等不在模型调用上下文内的请求不变。模型适配器若在同一上下文内请求辅助资源，这些 fetch 也会带头。

独立 HTTP 客户端、子进程，以及插件加载前已缓存原 fetch 的第三方适配器不经过此包装，需要单独接入。缺失会话 ID 的手工模型调用无法推导真实会话。

实现机制参考 [dsh-opencode-session@0.1.0](https://www.npmjs.com/package/dsh-opencode-session)，此包使用独立 scoped 名称，并扩展到所有 provider。

## 开发验证

```sh
pnpm --filter @kxh4892636/dsh-opencode-session check
pnpm --filter @kxh4892636/dsh-opencode-session test:coverage
pnpm --filter @kxh4892636/dsh-opencode-session build
```
