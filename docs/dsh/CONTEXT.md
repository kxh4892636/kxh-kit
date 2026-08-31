# DSH

工作区自研 DeepSeek Harness 扩展插件的业务域：以独立插件包扩展 DSH 的技能发现与运行时能力，插件经 `dsh plugin` 安装到本机 profile，与上游仓库解耦。

## Language

### 技能发现

**嵌套 skill**:
位于 `.agents` 树中、处于内建一层形态之外的 `SKILL.md` 技能；由本域插件任意深度发现。
_Avoid_: 子 skill、深层 skill、二级 skill

**内建一层形态**:
`.agents/skills/<skill>/SKILL.md`（及根下平铺 `.md`），DSH 内建 provider 唯一发现的技能位置。
_Avoid_: 顶层 skill、直接子级 skill

**注册名**:
嵌套 skill 在 DSH 目录中的名称，取自 skill frontmatter 的 `name` 原样。
_Avoid_: 命名空间名、前缀名

**声明优先**:
同名师冲突时内建一层形态胜过嵌套 skill 的取胜规则；显式声明者胜。
_Avoid_: 嵌套优先、注册顺序优先

### 插件交付

**DSH 插件**:
以工作区独立包开发、经 `dsh plugin --profile <name> add` 安装的 DSH 扩展；本域产物。
_Avoid_: 上游补丁、改动 DSH 仓库

**发现根**:
参与嵌套 skill 扫描的 `.agents` 根：项目 `<gitRoot>/.agents` 与用户 `$DSH_AGENTS_HOME`（缺省 `~/.agents`）。
_Avoid_: skills 根、扫描目录
