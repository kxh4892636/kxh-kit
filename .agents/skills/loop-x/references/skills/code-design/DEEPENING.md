# Deepening

如何根据依赖安全地 deepen 一组 shallow modules. 本文假定使用 [SKILL.md](SKILL.md) 中的 vocabulary - **module**, **interface**, **seam**, **adapter**.

## Dependency categories

评估 deepening 候选项时, 对它的依赖进行分类. category 决定如何跨越 seam 测试 deepened module.

### 1. In-process

纯计算, in-memory state, 无 I/O. 始终可以 deepen. 合并 modules, 直接通过新 interface 进行测试. 不需要 adapter.

### 2. Local-substitutable

拥有本地 test stand-ins 的依赖(Postgres 使用 PGLite, 文件系统使用 in-memory filesystem). 如果存在 stand-in, 就可以 deepen. 运行 test suite 时, 使用 stand-in 测试 deepened module. seam 是 internal 的, module 的 external interface 上没有 port.

### 3. Remote but owned (Ports & Adapters)

跨越网络边界的自有服务(microservices, internal APIs). 在 seam 上定义 **port**(interface). deep module 拥有逻辑, transport 以 **adapter** 形式注入. 测试使用 in-memory adapter. 生产环境使用 HTTP/gRPC/queue adapter.

推荐表达: _"在 seam 上定义 port, 为 production 实现 HTTP adapter, 为测试实现 in-memory adapter. 这样, 即使跨网络部署, 逻辑仍位于一个 deep module 中."_

### 4. True external (Mock)

不受你控制的第三方服务(Stripe, Twilio 等). deepened module 将外部依赖作为注入的 port 接收. 测试提供 mock adapter.

## Seam discipline

- **One adapter means a hypothetical seam. Two adapters means a real one.** 至少两个合理 adapters(通常是生产环境 + 测试)使 port 成为真实 seam；single-adapter 形态保持 inline.
- **Internal seams vs external seams.** 测试专用 variation 保持为 implementation 私有的 internal seam；调用方需要替换的 variation 才进入 external interface.

## Testing strategy: replace, don't layer

- 一旦 deepened module 的 interface 上有了测试, shallow modules 上的旧 unit tests 就变成浪费, 删除它们.
- 在 deepened module 的 interface 上编写新测试. **interface is the test surface**.
- 测试通过 interface 对可观察结果作出断言, 而不是对内部状态作出断言.
- 测试应该能经受内部重构. 它们描述行为, 而不是 implementation. 如果 implementation 变化时测试必须变化, 它测试的范围就越过了 interface.
