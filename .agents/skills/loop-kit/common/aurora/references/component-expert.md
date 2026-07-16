# Aurora 组件专家

当任务涉及当前 Aurora 组件知识或基于组件的实现时，读取本文件。典型场景包括：

- 为某个 UI 选择合适的 Aurora 组件
- 查询 props、events、types、subcomponent props 或示例
- 使用 `@ecom/aurora` 写代码
- 使用 `classNames`、`styles` 或 theme token 定制组件样式
- 对比 `Select`、`Menu`、`Drawer`、`Tag`、`InputTag`、`Table`、`Form`、上传/图片类组件等组件的用法选择

不要把本文件作为 Auxo 迁移的主流程。迁移诊断和 codemod 使用 `migration-assistant.md`。不要把本文件作为 ECOP 业务物料召回的主流程，业务物料召回使用 `material-recall.md`。

## 目标

所有 Aurora 组件回答都必须基于版本化的 Aurora knowledge pack。CLI 会按当前项目实际使用的 `@ecom/aurora` 版本解析对应的知识包，而不是固定使用随 CLI 分发的内置数据。Agent 不应凭 Ant Design、Auxo、旧版 Aurora 或记忆编造 props 和行为。

## 知识包解析机制

CLI 按以下顺序解析当前应使用的 knowledge pack：

1. 探测项目的 `@ecom/aurora` 版本：依次检查 `node_modules/@ecom/aurora/package.json`、`packages/aurora/package.json`、`package.json` 中声明的依赖版本，并逐级向上查找父目录。
2. 按该版本解析知识文件：
   - 优先本地随包/开发态的 `aurora-<version>.json`；
   - 其次本地缓存 `~/.cache/aurora-cli/knowledge/@ecom/aurora/<version>/aurora.json`；
   - 仍缺失时，从 `@ecom/aurora-knowledge@<version>` 远程拉取（默认 registry `https://bnpm.byted.org/`），解出 `dist/aurora.json` 并写入缓存。
3. 探测不到项目版本时，回退到随包内置的最新知识包。
4. 项目版本与实际加载的知识包版本不一致时，CLI 会打印告警，应据此提示用户对齐版本或确认 `@ecom/aurora-knowledge@<version>` 是否已发布。

因此回答前应确保目标项目已声明或安装对应的 `@ecom/aurora` 版本，才能拿到匹配该版本的知识。相关环境变量：

- `AURORA_CLI_DISABLE_REMOTE_KNOWLEDGE=1`：禁用远程拉取，强制使用随包内置数据（离线或受限网络场景）。
- `AURORA_CLI_KNOWLEDGE_REGISTRY`：覆盖知识包拉取使用的 registry。
- `AURORA_CLI_KNOWLEDGE_CACHE_DIR`：覆盖知识包缓存目录。
- `AURORA_CLI_DEBUG_KNOWLEDGE=1`：打印知识包解析过程的调试日志。

如果远程拉取失败或网络不可用，先排查项目 `@ecom/aurora` 版本与 `@ecom/aurora-knowledge` 是否对应发布，必要时设置 `AURORA_CLI_DISABLE_REMOTE_KNOWLEDGE=1` 退回内置数据，并在回答中说明使用的是内置版本而非项目版本知识。

## 优先 MCP 工作流

当 Aurora MCP tools 可用时，回答前优先调用它们：

1. 组件名不明确，或用户只描述 UI 模式时，先用 `aurora_list` 找候选组件。
2. 查询 props、events、value shape、subcomponent props、type name 时，用 `aurora_info`。
3. 写非平凡代码前先用 `aurora_demo`。如果不知道 demo name，先列出 demos，再获取最相关的 demo。
4. 行为细节、FAQ、使用限制，或 API 表不足以判断时，用 `aurora_doc`。
5. 主题定制和 component token name 查询，用 `aurora_token`。
6. `classNames` / `styles` 定制点查询，用 `aurora_semantic`。

MCP/CLI 输出是事实来源。如果输出缺失或不完整，明确说明缺失内容，并在给出确定结论前检查本地代码或文档。

## CLI fallback

如果 MCP tools 不可用，使用本地 CLI 命令：

```bash
aurora_cli list
aurora_cli info <Component>
aurora_cli info <Component> --detail
aurora_cli demo <Component>
aurora_cli demo <Component> <demoName>
aurora_cli doc <Component>
aurora_cli token <Component>
aurora_cli semantic <Component>
```

需要程序化解析时使用 `--format json`：

```bash
aurora_cli --format json info Select
aurora_cli --format json demo Select responsive
aurora_cli --format json token Select
aurora_cli --format json semantic Menu
```

## 回答规则

- 明确组件名和 package import，通常是 `import { Component } from '@ecom/aurora'`。
- 需要图标组件时使用 `@ecom/aurora-icons`。除非用户明确询问 legacy code，否则不要推荐 `@ant-design/icons`。
- 日期/时间组件的新代码使用 `dayjs` value 和示例，不要使用 `moment`。
- popup/dropdown 定制以 Aurora knowledge output 里的当前 popup API 为准。不要默认假设旧 `dropdown*` 或 `overlay*` props 仍是推荐用法，除非知识包明确列出。
- 样式定制优先使用组件 `classNames` / `styles` Semantic DOM API 和 `ConfigProvider theme` token。避免 Less variables 和硬编码内部 class selector。
- `Select`、`Menu`、`Cascader`、`TreeSelect`、`Table` 等 options-based components，优先使用文档化的数据驱动 API。
- 如果某个 prop 出现在 Ant Design 但不在 Aurora knowledge output 中，不要说它受支持。应说明当前 Aurora knowledge pack 未找到该 prop。
- 如果某个组件的 structured Props 数据为空，不要自行推断 props。先查 demos 和 docs，再说明 structured Props data 缺失。

## 实现工作流

处理编码任务时：

1. 识别目标组件。
2. 每个非平凡组件都先查询 `aurora_info` 或 `aurora_cli info`。
3. 查询主要交互或布局模式对应的 demos。
4. 如果用户要求样式定制，查询 tokens 或 Semantic DOM。
5. 按项目现有 React/TypeScript 风格和 package manager 实现。
6. 项目有 typecheck/build/test 时尽量运行。

如果用户只要求解释，不要编辑文件。只要答案依赖当前 API 细节，仍然需要查询 Aurora knowledge commands。

## 高风险组件

以下组件写代码前必须先检查 API 和 demos：

- `Select`，尤其是 `mode`、`search`、`popupRender`、`maxTagCount`、`selectAll`、remote search、自定义 option rendering
- `Menu`，尤其是 `items`、selection/open state、popup render、Semantic DOM customization
- `Drawer` 和 `Modal`，尤其是 open/close props、footer actions、lifecycle behavior
- `Form`，尤其是 value binding、validation、nested fields
- `DatePicker`、`TimePicker`、`Calendar`，尤其是 Dayjs value shape 和 locale behavior
- `Upload`、`ImgUpload`、`ImgCrop`、`ImgPreview`、`Image`，尤其是 file value shape 和 preview/crop flows
- `Table`，尤其是 columns、expandable rows、row selection、virtual scroll、自定义 cells
- `Tag`、`InputTag` 和 `Select` tags，尤其是视觉一致性和 token/Semantic DOM styling

## 输出要求

向用户汇报时包含：

- 使用了哪些 Aurora MCP tools 或 CLI commands。
- 结论依赖的具体 API 或 demo facts。
- 不确定点，例如缺失 Props data、缺失 Semantic DOM data，或仍需通过代码验证的行为。
- 已运行的验证命令，或无法运行的原因。

除非用户明确要求 raw output，否则不要粘贴大段 docs 或完整 JSON。总结相关字段，并标注 component/demo name。
