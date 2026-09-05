# Deepening

按依赖类别 deepen shallow modules；术语见 [SKILL.md](SKILL.md)。

## Dependency categories

| 类别                    | 合并与依赖策略                                                                                                     | 测试                   |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------ | ---------------------- |
| **In-process**          | 纯计算、内存状态、无 I/O；可直接合并，无须 adapter                                                                 | 通过新 interface 测试  |
| **Local-substitutable** | 有本地 stand-in（如 Postgres/PGLite、内存文件系统）即可 deepen；seam 保持 internal，external interface 不暴露 port | 用 stand-in 运行 suite |
| **Remote but owned**    | 自有远程服务使用 Ports & Adapters：module 拥有逻辑，port 定义契约，注入 HTTP/gRPC/queue transport adapter          | in-memory adapter      |
| **True external**       | 不受控制的第三方服务通过注入 port 接入                                                                             | mock adapter           |

## Seam discipline

- **Two adapters make a real seam**：至少两个合理 adapter（通常为生产与测试）才构成真实 port；single-adapter 形态保持 inline。
- 仅测试需要的 variation 留作 implementation 私有的 internal seam；调用方需要替换的 variation 才进入 external interface。

## Replace, don't layer

在 deepened module 的 interface 上迁移测试，通过可观察结果验证行为。原有行为覆盖迁移后，删除 shallow modules 上被替代的旧 unit tests，避免层层叠加。

内部重构而行为不变时测试应继续通过；需随 implementation 改动的断言，检查是否越过 interface 或依赖内部状态。
