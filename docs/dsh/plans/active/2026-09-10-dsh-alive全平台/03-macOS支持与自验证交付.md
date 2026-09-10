---
status: pending
blocked_by: ["02"]
---

# macOS 支持与自验证交付

## 交付

macOS 上 `dsh-alive` 走同一 CLI 与控制协议，不再被平台检查拒绝；用户可执行 README 中的一条命令自行验证，未实机验证的事实被显式记录。

## 范围

- macOS 平台适配器：`ps -eo pid=,ppid=,lstart=,args=`（`LC_ALL=C`）一次取全表并解析为与 Linux 相同的 `Identity`；`lstart` 解析为 ISO 出生时间；端口监听者复用 `lsof`；终止复用 POSIX 路径。
- macOS 状态目录 `~/Library/Application Support/dsh-keep-alive`；控制通道沿用 POSIX socket 规则。
- `ps` 解析层接受注入文本，用录制的 BSD 输出覆盖成功与畸形输入分支。
- README：三平台支持矩阵、macOS 自验证命令与判定标准、以及「macOS 未实机验证」的显式标注。
- 仓库级收尾证据：`git diff --check`、领域文档校验、Windows 条件跳过策略说明、跨平台回归测试结果。

不做：macOS 实机验收（无环境）、LaunchAgent 或其他系统级集成。

## 直接依赖

- 02: 消费其 POSIX 控制通道与状态目录实现、`lsof` 端口归属、POSIX 终止路径与 README 结构；macOS 只替换进程表来源与数据目录根。

## 验收

- [ ] `process.platform === "darwin"` 时选择 macOS 适配器，不再出现「仅支持 Windows」错误；未知平台给出可读错误。
- [ ] `ps` 解析层对录制 BSD 输出给出正确的 pid、ppid、出生时间与命令行；对缺列、时间格式异常、空输出返回可读错误。
- [ ] macOS 状态目录解析到 `~/Library/Application Support/dsh-keep-alive`（可用环境变量覆盖数据根以便测试）。
- [ ] macOS 代码被测试执行且纳入覆盖率，未因「无实机」被排除。
- [ ] README 给出 macOS 自验证命令（安装 → `start` → 关闭终端 → HTTP 可达 → `stop`）与判定标准，并显式标注未实机验证。
- [ ] Windows 专属测试仅在 win32 运行、POSIX 专属测试仅在 POSIX 运行，三平台测试集互相不误报失败。
- [ ] `check`、`test:coverage`、`build`、`pnpm exec vp run -r --no-cache test`、`git diff --check`、领域文档校验通过。
- [ ] 交付记录如实列出本机可验证项与不可验证项（Windows 与 macOS 实机行为），不含未经执行的验证主张。

## 上下文

- [执行契约](spec.md) 的「macOS（BSD ps）」「状态目录与控制通道」「待定」。
- 上游 issue：[02 Linux 全功能支持](02-Linux全功能支持.md)。
- 用户故事 [US-002、US-003](story.md)。

## 下一步

/code-delivery。

## 交付记录

待填写：交付物与验证证据。
