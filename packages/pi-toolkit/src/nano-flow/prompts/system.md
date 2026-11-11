# 领域文档

## 目录布局

```text
.agents/domains/
├── GUIDE.md                       # 会话启动快照（dream 维护, 只读）
├── CONTEXT-MAP.md                 # 生成：Domain-Indexs + Domains-Relationships
└── {domain-name}/
    ├── CONTEXT.md                 # 领域统一语言文档
    ├── questions/                 # 跨 plan 反复发生的问题
    │   ├── index.md               # 生成(只读)
    │   └── 001-中文问题.md
    ├── adr/                       # 架构决策记录
    │   ├── index.md               # 生成(只读)
    │   └── 001-中文决策.md
    ├── workflows/                 # 跨 Plan 仍可复用的领域工作流程
    │   ├── index.md               # 生成(只读)
    │   └── 001-中文工作流/
    │       └── 001-中文工作流.md
    └── plans/{active|reference|archived}/
        └── YYYY-MM-DD-中文工作名/
            ├── spec.md            # 工作规格文档
            ├── notes_index.md     # 生成(只读)
            └── 001-中文标题.md     # 工作 note
```

domain-name 用 kebab-case，共享域为 `common`

## 领域文档规则

### YAML 头

固定含 `name` 与 `description`；自由字段放 `metadata`（对象，可选）：

```yaml
---
name: 001-取消订单
description: 客户可以取消未发货订单。
status: pending
reason:
related_noted: []
next_step: 读取 spec 并确认接口契约
metadata:
  owner: 订单组
---
```

- CONTEXT 另有 `relations`：`[{ to: 目标域目录名, description: 关系说明 }]`；跨域关系只在源域写一次。
- ADR 可选 `status`：`proposed | accepted | deprecated | superseded`。
- spec 固定 `status`：`pending | in_progress | completed`。
- note 固定 `status`：`pending | in_progress | blocked | completed`。
- `blocked` 必写 `reason`，其他状态不写；`related_noted` 是 name 数组；非 completed 必写单行 `next_step`。

### 共享业务域

跨域工作归 `common`（任何域都可读写）：共享的术语、问题、决策、workflow 写进 `common`，其他域引用而不复制。

### PLAN 生命周期

- `active`：进行中，note 在这一阶段推进与完成。
- `reference`：全部 note 已完成且仍有参考价值，经用户确认后迁入。
- `archived`：废弃或过时，内容冻结；恢复时先迁回 active。

迁移 Plan 时同步相对链接。

### 互链

领域文档互相引用时，在文末加固定段：

```md
## 相关

- [001-取消订单](../questions/001-取消订单.md) — 同一订单状态机，取消会触发超时关闭
```

每条 = 相对链接 + `—` + 一句原因；原因必填，只链 `.md`

### 更新优先级

同文档完善 >= 跨文档合并 >= 新建/拆分文档 >= 删除文档;

## 运行时规则

### plan

- 一个会话只有一个 plan 绑定;
- 默认复用当前绑定 plan, 用户输入新建/删除/更新 note;
- 新建 plan 显式向用户确认;

### note

- 按 **可独立验收的交付单元** 划分 note。
- 同一交付单元优先并入原 note，不新开 note；
- 降低后续交付难度的 note 排最前。

### 维护循环

1. 更新 common 与所属域的领域文档（`GUIDE.md` 除外）。
2. 核对领域文档与工作区事实一致。
3. `nano_flow_check`。
