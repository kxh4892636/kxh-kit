# Backend Troubleshooting

本 reference 用于 E2E 过程中发现接口问题后的后端定位。它负责收集失败请求上下文、提取 logId/traceId、调用 Argos 诊断、判断前后端责任边界，并在用户授权后衔接后端修复和 PPE 重验。接口排障仍是“检查 → 修复 → 最小重验”的循环；诊断不是结束点，修复后的失败接口路径重验才是闭环。

PPE/BOE 部署状态判断复用 [pipeline-guard.md](pipeline-guard.md)，不要在本文件另起判定口径。

## 触发场景

- 页面网络请求 HTTP 非 2xx、超时、CORS、请求取消或网关错误。
- HTTP 成功但业务 `code` 非成功、`message` 异常或核心 `data` 缺失。
- 页面展示和接口数据不一致，需要判断后端返回是否正确。
- 用户要求根据 `logId`、TraceID 或 request ID 排查。
- 用户明确要求修复后端并等待 PPE/BOE 部署后重验。

## 完成标准

- 已记录失败请求上下文：URL、method、关键 query/body、HTTP 状态、业务 code/message、环境、时间、页面操作路径。
- 已提取可用的 `logId`、`x-tt-logid`、`x-tt-trace-id`、`x-request-id` 或等价 request/trace 字段；没有时已说明缺失位置。
- 已用 Argos skill 或 Argos CLI 完成诊断，或明确记录能力、登录、权限、数据缺失导致的阻塞。
- 已判断问题在前端、后端、环境、权限、数据或待确认范围内。
- 后端修复只在用户授权边界满足时进入；修复后已等待目标 PPE/BOE 部署完成，并只重验失败接口对应的 E2E 路径及受影响入口。

## 请求证据

调用 `browser-use` skill，并使用 CDP 网络能力查看失败请求详情。优先从 response headers 提取：

- `logId`
- `x-tt-logid`
- `x-tt-trace-id`
- `x-request-id`
- 其他同义 trace/request 字段

同时记录：

- 请求 URL、method、query/body 的关键字段。
- HTTP 状态码。
- 业务 code/message。
- 核心 `data` 缺失或异常字段。
- 发生时间和环境。
- 页面操作路径和用户可见异常。

## Argos 诊断

优先调用当前环境已安装的 `argos` skill。不要读取 sibling skill 的文件路径；`verifying` 作为单独发布包安装时，`argos` 可能不在同一目录中。

如果没有安装 `argos` skill，但 Argos CLI 可用，直接使用 CLI 诊断。若 skill 和 CLI 都不可用，将缺失的 Argos 能力标为环境依赖。

交给 Argos 的输入必须包含已知材料：

- logId、TraceID 或 request ID。
- 请求 URL、method、query/body 的关键字段。
- HTTP 状态、业务 code/message、核心 data 异常。
- 发生时间、环境、页面操作路径。
- 已知 psm、接口名或服务 owner；未知则标记为未知。

Argos 诊断完成标准：

- 已完成 LogID、TraceID、关键词或自然语言诊断路径中的一种。
- 已记录诊断摘要和 session ID。
- 已判断证据是否足以进入后端修复；证据不足时，列出需要后端 owner 补充的信息。

## 责任边界

根据证据归类：

- 前端问题：请求参数、路由、权限上下文、状态处理、接口数据消费或 UI 渲染错误。修复前端后，只重验失败接口对应的 E2E 步骤及受影响入口。
- 后端问题：日志、Trace、服务代码或 owner 反馈证明接口实现、数据处理、依赖调用或配置错误。只有满足“后端修复边界”后才修改后端。
- 环境/权限/数据问题：登录态、商家态、PPE 环境、白名单、测试数据或外部依赖导致。记录待确认项和可执行下一步。
- 证据不足：缺少 logId、Trace、复现路径、权限或 owner 信息。标为待确认，不猜测结论。

## 后端修复边界

默认只定位问题，不修改后端代码。只有同时满足以下条件，才进入后端修复：

1. 用户明确要求修复后端。
2. 用户提供后端仓库路径，或当前工作区已包含对应后端代码。
3. 用户确认目标分支、提交权限和 push 方式。
4. 问题已通过 logId、日志、Trace 或代码定位到可修改的后端实现。

不满足条件时，不进入后端修复。

## 后端修复与重验

进入后端修复后：

1. 读取后端仓库规范和相关代码，最小化修改。完成标准：修复点与诊断证据对应，不跨范围重构。
2. 执行后端仓库对应测试。完成标准：相关测试通过，或失败原因已解释为阻塞/非本次范围。
3. 按用户确认的方式提交并 push。完成标准：目标分支包含修复提交。
4. 获取 BITS develop URL、dev-id 或 pipeline IDs 后，读取 [pipeline-guard.md](pipeline-guard.md)。完成标准：目标 PPE/BOE 部署完成，或部署阻塞已记录。
5. 回到触发该接口的 E2E 用户路径，只重验失败接口对应的步骤及受影响入口。完成标准：接口 HTTP 状态、业务 code/message、核心 data 恢复正常，前端 UI 正确消费新响应。

如果后端修复影响多个前端入口，补充重验受影响入口；不影响的已通过流程不重复。

`bytedcli` 查询命令以当前可用帮助为准。命令不确定时先运行：

```bash
bytedcli bits --help
```
