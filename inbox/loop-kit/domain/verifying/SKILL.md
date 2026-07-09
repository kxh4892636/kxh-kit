---
name: verifying
description: 体验分验证：用户要求交付验证、验收、走查、联调、E2E、接口排错、等待 BITS/PPE/BOE 部署、查看 Huatuo 覆盖率，或代码修改后需要“检查 → 修复 → 最小重验”闭环时使用。
---

# 体验分 Verifying

体验分验证是“检查 → 修复 → 最小重验”的交付闭环：先确认影响范围，再按风险选择静态检查、流水线守护、商家态、真实浏览器 E2E、接口排障和覆盖率证据。验收不是一次性检查；任何失败都要进入修复，并只回到失败项及受影响相邻项重验，直到得到通过、待确认或阻塞结论。

## 验收循环

1. **检查**：运行当前分支需要的最小可信验证项。完成标准：失败点、证据和影响范围已记录。
2. **修复**：只修改导致失败的代码、配置、数据或环境问题。完成标准：修复动作能对应失败证据，不引入无关改动。
3. **最小重验**：只重验失败项和受修复影响的相邻项。完成标准：重验通过；或因权限、数据、仓库、部署能力等缺口标为待确认/阻塞。

## 分支

1. **静态交付检查**：代码修改后需要本地验证、lint、build 或 HMR 结果时执行。完成标准：已确定受影响 workspace；`pnpm` 使用仓库声明版本；`biome` 或 `lint:changed`、受影响 workspace 的 `emo build` 或 HMR 编译结果已有通过、失败修复后通过、或阻塞结论。
2. **流水线守护**：本轮 agent push、用户给出 BITS develop URL、dev-id、pipeline ID，或要求等待 PPE/BOE 部署时，读取 [pipeline-guard.md](references/pipeline-guard.md)。完成标准：目标项目流水线已确认 PPE/BOE 部署完成，或已定位失败节点并进入代码修复、平台重试、待确认或阻塞。
3. **真实浏览器验收**：用户要求页面验收、走查、联调、截图、交互、网络请求检查，或静态/流水线之后需要验收时，调用 e2e skill 的跑真实路径分支。完成标准：同一条用户路径里的 UI 断言、接口断言、证据、结论和失败重验范围已记录。
4. **商家态准备**：验收前需要测试商家、fake login、指定 `shopId`、线上真实商家或附身时，调用 doudian-login skill。完成标准：目标 `shopId`、域名、页面路径和商家态结果已明确，再进入浏览器验收。
5. **接口排障**：E2E 中发现网络错误、业务错误、页面与接口数据不一致，或用户要求按 `logId` / TraceID 排查时，读取 [backend-troubleshooting.md](references/backend-troubleshooting.md)。完成标准：失败请求上下文、logId/traceId、Argos 诊断结论、前后端责任边界和重验结果已记录。
6. **覆盖率证据**：用户要求前端覆盖率、MR/分支覆盖率、未覆盖行、Huatuo 证据时，读取 [huatuo-coverage.md](references/huatuo-coverage.md)。完成标准：覆盖率口径、整体结果、文件结果、覆盖/未覆盖插桩行已给出。

## 共同契约

- 验证循环始终是“检查 → 修复 → 最小重验”。只重验失败项和受修复影响的相邻项；已经通过且未受影响的项不重复执行。
- 每次先确认影响范围：app、workspace、页面 URL、业务域、端型、路由、商家态和访问前置条件。缺少关键输入时先从代码、配置或用户提供信息补齐。
- 运行 `pnpm` 前读取根 `package.json.packageManager`。优先使用 `corepack pnpm ...`；直接使用 `pnpm` 前必须确认版本一致，避免把工具链版本问题误判为代码失败。
- 静态检查优先小范围：变更文件少时运行 `corepack pnpm biome check <file...>`；跨模块或文件很多时运行 `corepack pnpm lint:changed`；build 只对受影响 workspace 执行 `emo build <workspace-name>`。
- 与根 `AGENTS.md` 保持一致：如果目标 workspace 已有 `emo start` 运行态服务，默认等待 HMR 编译并用浏览器/E2E 结果验收；没有运行态服务时，再按风险执行 workspace build。
- 浏览器验收必须使用真实浏览器和用户可观察断言。接口验证和 UI 验证在同一条用户路径里完成，发现接口问题时再进入接口排障 reference。
- 流水线默认守护 PPE；只有用户明确 BOE 时才切换 BOE。PPE/BOE 部署完成后继续浏览器验收，后置人工确认节点不阻塞 E2E。
- 结论前置：写明通过、失败、待确认或阻塞；列出证据、修复动作、重验范围和剩余风险。

## References

| 场景 | 读取 |
| --- | --- |
| Huatuo 前端覆盖率、MR/分支覆盖率、前端未覆盖行 | [huatuo-coverage.md](references/huatuo-coverage.md) |
| push 后等待流水线、BITS develop URL、pipeline ID、确认 PPE/BOE 部署完成 | [pipeline-guard.md](references/pipeline-guard.md) |
| E2E 中发现接口报错、logId、Argos、后端错误定位、后端修复后 PPE 重验 | [backend-troubleshooting.md](references/backend-troubleshooting.md) |
| 测试商家、fake login、指定 shopId、线上商家附身 | 调用 doudian-login skill |
| 通用浏览器验收、页面验证、截图、交互、HMR、DevServer、业务专项 E2E | 调用 e2e skill |

只读取当前分支需要的 reference。
