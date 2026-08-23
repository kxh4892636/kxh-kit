---
status: in_progress
blocked_by: ["02", "05"]
---

# 孤儿 Worktree 清理

## 交付

`workspace remove` 删除仓库配置并保留本机覆盖后，用户仍可按返回提示用 `workspace worktree remove --name <name> --path <path>` 清理该孤儿仓库的已注册 worktree，再手动清理克隆存储。

## 范围

- `worktree remove` 在 `workspace.yaml` 已无目标 name 时，从 `workspace.local.yaml` 的孤儿记录解析 clone_path。
- 仅扩展 remove 的孤儿清理入口；switch/list/prune 的目标选择契约不变。
- 修复集成 Standards 审查发现的早期 workspace 回调类型和文件存在性错误处理。

## 直接依赖

- 02: 消费其 remove 保留本机覆盖并返回清理提示的契约。
- 05: 消费其 `worktree remove` 路径校验、Git 删除与分支保留契约。

## 验收

- [x] 配置 remove 后，残留 clone_path 对应的 worktree 仍可按 name/path 删除。
- [x] 非 ENOENT 的文件访问失败不会被误判为不存在，新增箭头函数参数与返回值符合代码规范。
- [x] `pnpm --filter @kxh4892636/loopx check`、test 与 build 通过。

## 上下文

- [spec.md](spec.md)
- [02-添加与移除仓库](02-添加与移除仓库.md)
- [05-Worktree 子命令](05-worktree子命令.md)

## 下一步

/code-review

## 交付记录

交付物：`worktree remove` 可从本机孤儿记录解析 clone_path；switch/list/prune 的目标选择契约保持不变。文件存在性检查仅吞掉 ENOENT，并补齐早期 workspace 回调的显式类型。

证据：新增真实 Git 集成测试，红灯退出码 1，修复后目标测试 14/14 通过；check 153 files、全量测试 249 项、build 通过。Standards 与 Spec 双轴审查均无阻断；重复诊断辅助逻辑和 `allowOrphan` 布尔参数作为非阻断判断项保留。
