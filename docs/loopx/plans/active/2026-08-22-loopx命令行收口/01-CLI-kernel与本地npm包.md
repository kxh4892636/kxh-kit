---
status: completed
blocked_by: []
---

# CLI kernel 与本地 npm 包

## 交付

一个可本地打包、安装和运行的 `@kxh4892636/loopx` 包，以 deep CLI kernel 统一内建子命令的 options、help、JSON、错误和预演契约。

## 范围

- 建立 `packages/loopx/package.json`、TypeScript 配置、`src/main.ts`、bin 构建与包文件清单，保留已有 skill 源文件。
- 实现树状 `BuiltinCommand` interface，以 `group` / `command` / typed `option` 定义命令；DSL 不能表达 positional argument 或获取 raw Commander。
- 实现 query 与 `mutation.prepare() -> { preview, commit }`；预演绝不调用 `commit`，query 在预演中正常执行。
- 实现 build-time `src/builtins/*/index.ts` 自动发现、定义不变量检查和惰性 module factory 装配。
- 实现任意层级全局 `--dry-run`、`--compact`、`--debug`，各级 `--help` / version，JSON/JSON 事件流输出，以及 0/1/2 退出码。
- 以一个仅测试使用的 fixture 内建子命令证明「新增目录、不改 kernel」的接入契约；不交付第三方插件。

## 直接依赖

无，本 issue 是依赖图根节点。

## 验收

- [x] interface 级测试证明：命名 option 解析和互斥/必填校验、各级 help、query 预演、mutation 零 commit 预演、JSON 事件流、错误 JSON 与 0/1/2 退出码均通过。
- [x] 无效命令定义（重复路径、保留 option、mutation 缺阶段）在外部 adapter 建立前 fail fast。
- [x] 从本地 `.tgz` 安装到临时 npm prefix 后，`loopx --help`、fixture 各级 `--help` 和 fixture 预演均给出约定结果。
- [x] `vp run @kxh4892636/loopx#test`、`vp run @kxh4892636/loopx#build` 和 `vp check` 通过。

## 上下文

- [spec](spec.md)
- [用户故事](story.md)
- [LoopX 领域术语](../../../CONTEXT.md)
- [CLI 输出仅 JSON](../../../adr/0001-cli-输出仅-json.md)
- [单一 CLI 收口决策](../../../adr/0002-以单一cli收口内建子命令.md)

## 下一步

/implement

## 交付记录

- 交付物：`packages/loopx/package.json`、`packages/loopx/src/cli/`、build-time builtin discovery、fixture builtin 与可执行 `dist/main.mjs`。
- 验证证据：`vp run @kxh4892636/loopx#test`，13 个 interface 测试通过。
- 静态门禁：`vp run @kxh4892636/loopx#build` 与 `vp check` 通过；全仓仅保留既有 warning。
- 运行态门禁：本地 `.tgz` 安装到临时 npm prefix 后，root/group/leaf help、全局 options 与 compact dry-run mutation 均通过。
- 审查：相对 `6b071c1` 的 Standards/Spec 双轴复审均无阻断项。
