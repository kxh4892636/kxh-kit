| D5  | 存储放 **workspace 根目录** `.story/`                      | 用户指定                           |
| D6  | 分片按**语义**，不按体积；模型运行时按需 read              | 用户指定                           |
| D7  | **L2 用独立模型**                                          | 用户指定                           |
| D8  | **规则不做版本化，始终用最新**                             | 用户指定                           |
| D9  | engine 全纯函数                                            | 可单测、可重放                     |
| D10 | 规则必须进上下文（Brief）                                  | v0 最大教训                        |
| D11 | **工具面恒定四个**；新机制只扩张 schema 与校验规则         | 用户指定，避免工具无限膨胀         |
| D12 | 迁移不占工具位，做成一次性脚本 `scripts/import-v0.mjs`     | 迁移是低频动作，不值得常驻工具     |

---

## 八、验收

1. `story_scaffold` 建出完整骨架，`story_check` 全绿。
2. 模型直接用 `write` 改 `clock.json` 把时间往前调 → `story_check` 报「时间倒退」并指出位置。
3. 模型把 `beats.json` 里已过期的节点改成「开窗」→ `story_check` 报状态与时间窗不符。
4. 模型写正文时忘了改 `cursor` → `story_check` 报「章节与 cursor 不一致」。
5. 故意在正文里写「隔壁张阿姨看出了什么」→ `story_check --deep` 由独立模型判红，附原文 evidence。
6. `story_open` 的 Brief 含：通用规则要点 + RULES.md 要点 + 禁忌 + 称呼约束 + 「下一步」。
7. `scripts/import-v0.mjs` 迁移 `.tmp/mama-story`：18 章逐字保留，guard 全绿。
8. engine 单测全覆盖；端到端：scaffold → 写 3 章 → 改 state/clock/beats → check 全绿，零手工修补。
9. **工具总数 = 4**，代码里有断言守住这条。

---

## 九、实现状态（2026-10-31）

已交付 `packages/dsh-infinite-story@0.1.0`，构建通过，已装入 `desktop` profile，v0 故事已迁移到 `.story/mama-story`（23 章，guard 无 error）。

### 与设计的差异

| 项           | 设计                           | 实现                              | 原因                                                                                             |
| ------------ | ------------------------------ | --------------------------------- | ------------------------------------------------------------------------------------------------ |
| 工具数       | 4（open/write/check/scaffold） | **4**（mode/open/write/check）    | scaffold 并入 `story_mode action=new`；开关本身必须常驻，否则关闭后无法再开                      |
| 会话开关     | 会话页 UI toggle               | **工具 `story_mode`**             | 未找到 web client 的会话头部扩展点；先以工具交付，UI 待接                                        |
| 关闭语义     | 工具不可见                     | **`story_mode` 之外全部 dispose** | `tools.register` 返回 disposer，关闭时真正移除；仅开关本身保留                                   |
| 可见性作用域 | 会话级                         | **进程级（工作区级）**            | `tools.restrict()` 要求 agent-scoped context，全局限制会抛错                                     |
| L2 语义检查  | 插件直调独立模型               | **输出工单，由会话委派 subagent** | 服务端 subagent 需 provider + 结构化结果路由，同步等待不现实；工单方式同样隔离上下文且用同一模型 |
| 规则版本化   | 不做（用最新）                 | 同                                | —                                                                                                |
| 分片         | 语义分片                       | 同（5 个 shard）                  | —                                                                                                |

### 已验证

- `pnpm build` 通过，产物 external 全部 `@deepseek-ai/*`
- `pnpm test` 7 项通过，含**对迁移后真实数据的 guard 断言（0 error）**
- `dsh plugin --profile desktop add` 成功，profile 内可见
- 迁移：23 章逐字复制、state/clock/beats/foreshadows 重排、markdown 正典拆成 shards

### 未验证（需重启桌面端）

- 插件在运行中的 host 里真正加载
- `story_mode` 的 on/off 是否如期增删工具
- 系统提示段是否注入且前缀稳定
