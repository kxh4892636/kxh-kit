# Experience Score Commands

体验分前端常用命令 reference。用于前端启动、构建、依赖、BAM 和静态检查命令；分层、复用和验收分别读取对应 architecture、development、verification 专题。

命令默认在 `repos/govern-public-fe-mono` 仓库根目录执行。该仓使用 EMO 管理 monorepo；启动、构建、workspace 脚本优先使用 `emo`，workspace 名以各目录 `package.json` 的 `name` 字段为准。

运行 `pnpm` 前读取根 `package.json.packageManager`。优先使用 `corepack pnpm ...`；直接使用 `pnpm` 时先确认版本与声明一致。

## 环境与依赖

- 安装依赖：`emo i`
- 清理依赖：`emo clean`
- 重置依赖：`emo reset`
- 添加依赖：`emo add <package>`
- 为指定 workspace 安装依赖：`emo i <package> --filter=<workspace-name>`

完成标准：依赖命令只作用于目标 workspace 或仓库根，不顺手更新无关依赖。

## 体验分应用

- 启动 H5：`emo start experience-score-h5`
- 构建 H5：`emo build experience-score-h5`
- 启动 PC：`emo start experience-score-pc`
- 构建 PC：`emo build experience-score-pc`

完成标准：能说明本次验证覆盖 H5、PC 还是双端。

## 体验分共享包

- 领域 Kit 开发监听：`emo run dev --filter @govern-public/experience-score`
- 领域 Kit 构建：`emo build @govern-public/experience-score`

完成标准：Kit 改动至少能用共享包构建或贴近改动面的检查命令验证。

## API 与质量检查

- 更新 BAM 生成的 API 代码：`emo run bam:update`
- 安装 BAM 生成的 API 包：`emo run bam:install`
- 增量 Lint 检查：`pnpm lint:changed`
- 全量 Lint 检查：`pnpm lint`
- 格式化修复：`pnpm format:changed` / `pnpm format`
- 单文件检查：`pnpm biome check <file-path>`
- 单文件修复：`pnpm biome check --write <file-path>`
- 样式检查：`emo run lint:style`

BAM 接口创建或更新还必须读取 [api-fe.md](api-fe.md)，以确认 BAM 包落点、生成物边界和端应用消费方式。

完成标准：只对本次 git change 相关文件执行检查和修复；若未执行命令，记录未执行原因。
