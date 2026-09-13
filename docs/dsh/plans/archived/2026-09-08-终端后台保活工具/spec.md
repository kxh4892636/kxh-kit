---
status: completed
---

# 终端后台保活工具

## 问题

全新实现 TypeScript 终端工具 dsh-keep-alive：按端口启动 DSH，关闭终端后持续运行，异常退出后恢复，重复启动即重启，自动更新 DSH。用户已确认 manual 模式及设计，并将更新周期修改为 13 小时。

## 方案

每个端口一个独立后台 supervisor，CLI 请求启动、重启、停止或查询，得到结果后退出。版本安装与运行分离，先准备新版本，再切换；失败时恢复旧版本。

## 已排除的备选

- 沿用历史实现：用户要求全新实现，不读取或复用历史代码。
- 首版多平台、系统服务与开机自启：先交付可实测的 Windows 用户进程。
- 按工作目录区分实例：当前用户内端口唯一即可确定重启目标。
- 强制清理外部端口占用者：只管理可确认身份的受管实例。
- 空闲检测与手动更新确认：已接受下载后立即重启及任务中断。
- 只接受非预发布版本：跟随发布者 latest 标签，允许 rc。

## 实施决策

### 命令与实例

- 新包位于 packages/dsh-keep-alive；TypeScript 编译为 JS，提供 dsh-keep-alive npm bin，使用系统 Node.js。
- start --port N：N 必填、为 1–65535 整数。当前用户内同端口启动请求串行执行，每个成功请求完成一次启动或重启；不同端口独立。
- status [--port N] 展示端口、版本、运行状态、最近错误；stop --port N 停止受管实例并取消保活；logs --port N 查看日志；无参数显示帮助。
- 固定使用 web profile、127.0.0.1、--no-open；沿用调用时当前目录及 DSH_HOME 等环境，重复 start 使用本次目录和环境。
- 工具状态位于 LOCALAPPDATA/dsh-keep-alive，DSH 用户数据保持原位置；不迁移会话和插件。
- CLI 不继承终端 stdio 给 supervisor；后台进程不依赖 CLI 存活。内部控制通道校验实例身份，状态文件 PID 不能单独作为终止依据。

### 保活与就绪

- DSH 退出按 1/2/4/8/16/30 秒退避恢复，稳定运行 60 秒后重置退避。
- 启动就绪须同时满足受管进程存活、端口属于其进程树、HTTP 可达；60 秒超时报错并提供日志路径。
- 首次下载安装独立设 10 分钟超时，失败不报告启动成功。
- 重启和停止清理受管 DSH 进程树；清理失败不启动第二份，外部端口占用时报错。
- 每端口日志单文件上限 5 MiB，最多保留 3 个文件。

### 更新与恢复

- 更新对象为 @deepseek-ai/dsh；工具本身通过 npm 更新。
- 首次启动解析配置 registry 的 latest 并安装精确版本；已有可运行版本先启动，再立即后台检查，此后每 13 小时检查。
- 新版本在独立目录完成安装验证后，串行停止旧实例并启动新版本；60 秒未就绪则恢复上一可运行版本。
- 网络或安装失败保留当前服务；下个周期重试检查。切换失败的版本不每周期反复切换，latest 改变或用户重复 start 后允许重试。
- 自动切换可能中断任务。回退仅恢复二进制，不承诺逆转上游用户数据变更。
- 安装、启动、重启、stop 与更新切换不得交错产生双实例或停止后复活。

## 工作环境

Windows / PowerShell；仓库使用 pnpm 与 vite-plus，根 package.json 声明 Node.js >=22.12.0。DSH 实际发布包及依赖的最低 Node 版本须在 dev-gate 核实。需要访问 npm registry；测试使用临时状态目录、独立端口和 DSH_HOME。若创建 worktree，统一位于仓库 .worktrees。

## 范围

01 交付可使用的后台启动、重启、停止、保活、状态与有界日志，包含首次版本安装及 CLI 包装。
02 消费 01 的版本安装和受管生命周期契约，交付定时更新、切换、回退及相应状态与文档。
各项包含自己的测试、验证与提交；02 完成最终包与真实 DSH 更新相关冒烟。

## 非范围

macOS/Linux 支持、GUI、系统服务、开机自启、用户注销或系统重启后恢复、supervisor 被强杀后自动恢复、内嵌或升级 Node.js、工具自身自动更新、会话隔离、历史实现兼容迁移、模型调用测试。

## 待定

无未决产品选项。实际发布包帮助、共享 DSH_HOME 双实例及 alpha.2 → rc.1 切换已验证，证据分别记录在 Issue 01/02；二进制回退不保证逆转上游数据变更。

## 执行基线

状态：2026-09-08 用户通过 go 确认基线，授权按 01 → 02 实现、验证与本地提交。

### 工作环境

- Windows / PowerShell，系统 Node.js v24.19.0、pnpm 11.22.0；首版运行支持基线为 Node.js >=24.19.0，不内嵌或升级 Node。此下限是本工具的已测支持选择，不是上游声明的最低版本。
- 现场执行 npm exec --yes --package=@deepseek-ai/dsh@0.1.2-rc.1 -- dsh web --help 成功，确认 --host、--port、--no-open 均存在；npm 元数据没有 engines 字段，不据此推定更低版本兼容。
- Get-NetTCPConnection 与 Get-CimInstance 可用；用于真实端口归属和进程身份验证。测试仅启动自行创建的实例，使用临时状态目录、DSH_HOME 与空闲端口。
- extensions/QUESTIONS.md 与 extensions/workflows/README.md 已完整读取，现场均为空，没有额外问题或 workflow 约束。

### 执行契约

- 固定比较点：0d536569b58e177d4c5d78c6e127ea5761196bde；初始工作区变更仅为本 Flow 的领域文档与 Plan。
- 在当前工作区全新实现 packages/dsh-keep-alive，包名与命令均为 dsh-keep-alive，版本从 0.0.1 开始；不读取历史实现。按 01 → 02 顺序完成。
- 交付生产代码、行为测试、使用文档、可安装 npm tarball、验证记录；相关锁文件和工作区配置调整归入交付。
- 基线确认同时授权每项通过门禁后本地 Git 提交；不包含 npm 发布或 Git push。两项之间按 Flow 自动领取，无额外设计门槛时继续完成。
- scope 改变、关键实测失败需要降低标准、或运行环境前置无法满足时停止对应工作并回到 dev-gate。

### 质量门禁

- 静态与构建：遵循 code-spec；本包 check、build 和 tarball 安装后 CLI 帮助成功。实现时建立 pnpm --filter dsh-keep-alive check/build/test/test:coverage 入口。
- 行为测试：通过 CLI public interface 验证 start/status/stop/logs；关键 seams 为进程生命周期、版本来源、时钟及文件系统。可控替身验证退避、13 小时更新、并发、身份与端口冲突、超时、日志轮转和回退。
- 覆盖率：code-test 要求本包完整测试通过，全部新增生产代码的 statements、branches、functions、lines 各 >=80%；不排除进程入口或 Windows 代码来提高比例。coverage 报告与命令写入验证记录。
- 真实 Windows 验收：关闭独立启动终端后从另一个进程访问 HTTP；异常退出恢复、重复启动旧树消失、stop 后不复活、不同端口独立。实际 DSH 使用隔离 home，不触发模型调用。
- 真实包兼容：01 检验共享 home 多实例；02 检验实际版本切换影响。故障注入使用替身；真实包证据与替身证据分别记录。
- 回归：执行仓库完整测试 pnpm exec vp run -r --no-cache test；若存在与本改动无关的失败，记录比较点证据并返回 dev-gate，不把局部通过作为全部通过。
- 交付：check-domain、git diff --check、code-review 的 Standards/Spec 双轴审查无阻塞项，验证记录支持每项主张后才提交并 report completed。

## 上下文

- [领域语言](../../../CONTEXT.md)。
- 设计确认记录：工作区 .flow/quest/2026-09-08-终端后台保活工具.md，含用户 13 小时修改意见；本 spec 为后续执行契约。
- [官方 DSH CLI 参考](https://github.com/deepseek-ai/deepseek-harness/blob/master/apps/cli/reference/README.md)。
- [Node.js 子进程文档](https://nodejs.org/api/child_process.html)。
- 既有 DSH ADR 属于插件能力，无本工具适用的执行 workflow；不读取历史实现。

## Issue

| #   | Issue                                          | 状态      | 阻塞于 | 下一步         |
| --- | ---------------------------------------------- | --------- | ------ | -------------- |
| 01  | [后台启动重启与保活](01-后台启动重启与保活.md) | completed | —      | /code-delivery |
| 02  | [自动更新与失败回退](02-自动更新与失败回退.md) | completed | 01     | /code-delivery |
