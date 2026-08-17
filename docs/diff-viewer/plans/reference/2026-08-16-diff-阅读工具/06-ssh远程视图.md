---
status: completed
blocked_by: ["03"]
---

# SSH 远程视图

## 交付

输入 `user@host[:port]` 与远程路径，打开远程目录：远端扫描嵌套仓库、远端执行 git、diff 数据传回本地渲染；远程视图中编辑器按钮经 vscode-remote 协议打开对应文件。

## 范围

做：

- executor 抽象：local = child_process，remote = spawn 本机 OpenSSH `ssh` CLI（ControlMaster 复用连接；路径与 rev 参数严格校验 + 单引号包裹防注入）；**完全复用本机 ssh 配置**——`~/.ssh/config` 的 Host 别名、密钥、agent、known_hosts，不自实现认证。
- 远端嵌套仓库扫描：经 ssh exec 执行 POSIX 命令，复用 03 的扫描器契约；远端假定 POSIX shell + git 在 PATH。
- 连接入口：ssh config 的 Host 别名或 `user@host[:port]`，加远程路径的表单，历史连接存 userData。
- 远程视图评论：存储键 = `ssh://user@host/path` + 对比。
- 编辑器按钮走 `vscode://vscode-remote/ssh-remote+host/...` 协议（实现受阻则 v1 禁用该按钮）。

不做：远端 Windows 主机、连接管理器界面、ssh2 库（降级预案）。

## 直接依赖

- 03：消费其扫描器契约与仓库树 UI，为其增加远程 executor 实现。

## 验收

- [x] 对一台 SSH 可达的主机完成：连接 → 扫描出嵌套仓库 → 渲染 diff（环境前提：存在可用于测试的 SSH 主机）。

## 交付物与证据

- 交付物：`src/main/remote/`（ssh-target 目标解析/校验/防注入、executor port、local-executor、ssh-executor（spawn 本机 OpenSSH，复用 ~/.ssh/config，ControlMaster）、remote-git-diff（DiffParser port 的远程实现）、ssh-connection-history（userData 落盘）、fake-ssh-executor（e2e 钩子））；`src/main/diff-parser.ts`（DiffParser port）与 `git-text-parse.ts`（本地/远程复用的纯解析）；`src/main/repo-scan/remote-repo-scanner.ts`（远端 find → 03 扫描契约）；`src/client/ssh-connect/ssh-connect-panel.tsx`（连接表单+历史）；`e2e/ssh-remote.spec.ts`；`scripts/ssh-smoke.mjs`（真实主机 smoke，target 须显式传入）。
- 合回：merge `f45f80a`（`2e51f2d` feat + `43336e8` 去除硬编码真实主机 IP，40 文件 +4356/-478）。
- 验证证据：837 单元/组件测试通过（1 skipped）；e2e 9/9（含 ssh-remote 全链路：连接 → 嵌套树 → 渲染 diff → 评论落盘 ssh:// 键 → vscode-remote URL → 历史重连）；真实主机 smoke PASS（连接/rev-parse/find 扫描/根+嵌套仓 diff 真实执行）；合回后 main `pnpm ready` exit 0。
- 验证环境：Windows 11 + Node 22 + pnpm 11 + 本机 OpenSSH；真实主机经本机 ssh 配置可达。
- code review 结论：Standards 无硬性违规（remote/ 恰 13 文件达上限未超；vendored 改动已登记 App.tsx 头注第 7 处；英文注释与静默 catch 系镜像本地 git-diff.ts 存量先例，判断接受）；Spec 无缺口，范围各项全覆盖。
- 接受偏差：win32 默认关闭 ControlMaster（smoke 实测 mux 在无控制台后台 spawn 下不可用，退化为逐命令建连，`controlPathDir` 为逃生舱，POSIX 不受影响）；编辑器按钮仅远程会话启用（本地打开属 07 范围）；e2e 用 fake executor（git 真执行、扫描走真解析器回路），真实传输层由 smoke 脚本兜底（手动脚本，未入门禁）。

## 上下文

- [spec.md](spec.md)

## 下一步

已完成
