---
status: in_progress
blocked_by: []
---

# vp 与 vitest 基建迁移

## 交付

`packages/dsh-keep-alive` 使用仓库统一的 vp 工具链：`vp pack` 构建、`vp check` 检查、`vp test` 测试、`vp test --run --coverage` 覆盖率；四条命令全部通过，且行为与迁移前一致。

## 范围

新增包内 `vite.config.ts`；替换 `package.json` scripts 与 devDependencies；移除 c8、`tsconfig.test.json`、`tsconfig.build.json` 与 `.test-dist`，`tsconfig.json` 简化为类型检查用途并同步 `.gitignore`；把 9 个 `node:test` 测试文件迁移到 vitest（断言语义等价、测试串行不变）；bin 与 supervisor 自启动入口改为 `dist/main.mjs`。不改变命令名、默认端口与 class 形态。

## 直接依赖

无。Plan 级 /dev-gate ready 后可领取。

## 验收

- [ ] `pnpm --filter dsh-keep-alive check`、`build`、`test`、`test:coverage` 四条命令全部通过，仓库内无 c8 依赖与 `.test-dist` 残留。
- [ ] 迁移后 32 个测试断言与迁移前等价（含真实进程启动、并发、退避、回退、日志轮转、控制通道场景），无新增跳过。
- [ ] 覆盖率四指标 ≥80%，include/exclude 与门槛和迁移前口径一致，报告可复现。
- [ ] `vp pack` 产物 `dist/main.mjs` 可直接执行：`node dist/main.mjs --help` 与 supervisor 自启动路径都可用。
- [ ] 按当前代码临时打包安装到独立目录后，bin 可执行且帮助正常。
- [ ] 用户可见行为不变：命令仍为 `dsh-keep-alive`，`--port` 仍必填。
- [ ] 真实 Windows 冒烟 start/status/logs/stop 通过，不触碰 `%LOCALAPPDATA%\dsh-keep-alive\3080` 的运行实例。

## 上下文

- [执行契约](spec.md)。
- 迁移前基线：`pnpm --filter dsh-keep-alive test` 32 项通过（node:test，约 16 s）；`check` 通过。
- 参考：[dsh-nested-skill 配置](../../../../../packages/dsh-nested-skill/vite.config.ts)。

## 下一步

/code-delivery；领取前须 Plan 级 /dev-gate ready。

## 交付记录

（完成登记前填写交付物与验证证据链接。）
