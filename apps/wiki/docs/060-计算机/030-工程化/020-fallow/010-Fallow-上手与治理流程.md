---
id: 8517385e-62cc-4bb1-9589-ac443a0b205a
---

# Fallow 上手与治理流程

## Fallow 解决什么问题？

- Fallow: 面向 TypeScript 与 JavaScript 的代码库级智能分析器;
- 核心: 构建完整模块图, 而不是只检查单个文件;
- 结构能力: 死代码、依赖问题、循环与架构边界;
- 复杂度能力: 圈复杂度、认知复杂度、维护性指数与变更热点;
- 其他能力: 重复逻辑、特性开关、样式与设计令牌漂移;
- 边界: 格式化器管外观, linter 管文件内规则;
- 类型: TypeScript 管类型检查;
- Fallow 管: 跨文件的连接、可达性与结构风险;

## 如何安装并完成首次分析？

- 体验: 直接执行 `npx fallow`;
- 常用安装: `npm install -g fallow`;
- 其他渠道: pnpm、Yarn、Cargo、Docker 与 GitHub Release 预编译二进制;
- 起步: 零配置即可运行;
- 固化: 需要入口、忽略、阈值或规则时执行 `fallow init`;

```bash
npx fallow
npx fallow dead-code
npx fallow dupes
npx fallow health
npx fallow review
npx fallow fix --dry-run
```

## 常用命令如何按任务选择？

| 任务         | 命令                                          | 简述                                              |
| ------------ | --------------------------------------------- | ------------------------------------------------- |
| 综合扫描     | `fallow`                                      | 一次运行核心静态分析                              |
| 死代码       | `dead-code`                                   | 查不可达文件、导出、依赖、循环、边界等            |
| 重复代码     | `dupes`                                       | 查 token clone 与 clone family                    |
| 语义相似     | `similar-code`                                | 本地模型生成待审核的相似函数候选                  |
| 健康度       | `health`                                      | 复杂度、MI、CRAP、hotspot、target、score 与 trend |
| 变更守门     | `audit`                                       | 对比 base, 输出 pass / warn / fail                |
| 审查导航     | `review` / `decision-surface`                 | 生成关注地图与少量关键结构判断                    |
| 定点调查     | `inspect` / `trace` / `trace-error`           | 聚合某文件、符号、调用图或堆栈帧证据              |
| 开发前约束   | `guard`                                       | 查某文件所属 zone、允许 import 与抑制 token       |
| 特性开关     | `flags`                                       | 找环境变量、SDK 和配置开关                        |
| 安全复核     | `security`                                    | 输出未验证候选、可达性和 verifier packet          |
| 运行时覆盖   | `coverage` / `license`                        | 配置采集、分析或上传, 管理运行时许可              |
| 自动修复     | `fix --dry-run`                               | 预览可移除的 export、依赖、枚举成员和 catalog 项  |
| 项目诊断     | `doctor` / `list` / `config` / `plugin-check` | 查根目录、配置、workspace、入口、插件与缓存准备度 |
| 初始化与建议 | `init` / `recommend` / `migrate`              | 生成配置、获取项目建议或迁移旧工具                |
| 机器自省     | `schema` / `explain`                          | 输出能力 manifest 或某 issue 的理由与修复指南     |
| 例外审计     | `suppressions`                                | 列出抑制的位置、类型、原因与过期交叉引用          |
| 持续与报表   | `watch` / `report` / `impact`                 | 监听变更、重渲染 JSON 结果、跟踪长期价值          |
| 可视化与遥测 | `viz` / `telemetry`                           | 输出互动代码地图; 查看或管理默认关闭的遥测        |

## 如何接入 Agent？

- CLI: 通用回退方式, 用 `--format json --quiet` 拿结构化输出;
- MCP: 给支持 MCP 的 Agent 提供类型化工具;
- MCP 工具面: analyze、check_changed、audit、health;
- MCP 也提供: dupes、security、inspect;
- Agent Skills: 教 Agent 何时跑哪个命令、如何解读、避免误用;
- 一键接入: `fallow agent install --dry-run` 先预览;
- 安装内容: AGENTS.md 任务映射、skill、MCP 与 commit/push gate;
- Claude Code: 用 `fallow hooks install --target agent`;
- 预览: 先加 `--dry-run`;
- 效果: 安装 PreToolUse 门禁;

## 日常开发如何形成闭环？

- 编码前: `fallow guard <file>` 查架构边界;
- 影响面: `fallow inspect <symbol>` 查影响证据;
- 编码中: VS Code / Neovim 实时提示, 或 `fallow watch` 重跑;
- 提交前: `fallow review` 找审查重点;
- 守门: `fallow audit --base <ref>` 给出 pass / warn / fail;
- 修复后: 重跑分析, 再执行项目自身的 lint、类型检查、测试与构建;
- 团队层: 用 baseline 或 `audit.gate: "new-only"` 渐进接入;
- 反例: 提高全局阈值只会把少数热点藏起来;
