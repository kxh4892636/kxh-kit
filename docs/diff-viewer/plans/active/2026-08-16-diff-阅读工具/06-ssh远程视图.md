---
status: pending
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

- [ ] 对一台 SSH 可达的主机完成：连接 → 扫描出嵌套仓库 → 渲染 diff（环境前提：存在可用于测试的 SSH 主机）。

## 上下文

- [spec.md](spec.md)

## 下一步

/implement
