# Codin D2C CLI Skill — 使用指南

## 目录

1. [这个 D2C CLI Skill 能做什么？](#这个-d2c-cli-skill-能做什么)
2. [快速开始](#快速开始)
3. [使用方式详解](#使用方式详解)
4. [Token 获取与配置](#token-获取与配置)
5. [完整工作流示例](#完整工作流示例)
6. [FAQ](#faq)
7. [v4.0 变更说明](#v40-变更说明)
8. [v3.3.0 变更说明](#v330-变更说明)
9. [v3.0.0 → v3.0.1 变更说明](#v300--v301-变更说明)
10. [v2.2 → v2.3 变更说明](#v22--v23-变更说明)

---

## 这个 D2C CLI Skill 能做什么？

这个 Skill 面向 **Trae，Claude Code、Codex、Gemini CLI** 等具备命令执行能力的 AI Agent，
用于把 Figma 设计稿稳定地转成可交付的 UI 代码。

它解决的不是“怎么调用一个命令”，而是让 Agent 按照**正确的 D2C 工作流**完成整套任务：

- 先识别目标项目平台（web / iOS / Android / Lynx）
- 再拉取设计稿的 XML DSL 和预览图
- 同时利用结构数据和视觉截图理解设计意图
- 按需下载图标资源
- 生成页面代码
- 在代码完成后执行 Code Review 验证
- 应用本地运行后，按需对运行页面做 Runtime Design Review（截图比对 Figma）：默认 `--live-screenshot` 传运行页截图绝对路径；用户只在对话里贴了图、手里没有文件时，用 `paste-screenshot` 从系统剪贴板抓图落盘再传；有问题用 design-review-fix 生成修复建议，最多 3 轮
- 最后清理临时文件（在 design-review 回环结束后）

相比直接把 CLI 命令零散地告诉 Agent，这个 Skill 的价值在于：

- **保证流程顺序正确**：避免漏掉 verify-code、提前 cleanup 等关键错误
- **提升生成效果**：明确要求 Agent 同时读取 XML 和预览图，而不是只看 DSL
- **降低调用出错率**：对齐最新命令参数、输入格式和错误恢复方式
- **更适合生产使用**：把“拿到设计稿 → 生成代码 → 校验质量”固化成可复用流程

### Skill 文件结构

```
d2c-skill/
└── codin-d2c-cli/
    ├── SKILL.md       ← Agent 读取的核心指令文件
    └── README.md      ← 本文档（给人类阅读）
```

---

## 快速开始

### 前置条件

1. **Node.js >= 18**（检查：`node -v`）
2. **两个 Token**（见下方[Token 获取与配置](#token-获取与配置)）

### 快速上手

```bash
# 1. 设置环境变量
export CODIN_D2C_TOKEN=<你的 D2C Token>
export FIGMA_ACCESS_TOKEN=<你的 Figma Token>

# 2. 将 SKILL.md 交给 Agent
#    方式 A：放到 Agent 的 skill 目录下（推荐）
#    方式 B：直接在对话中贴给 Agent
#    方式 C：在 prompt 中引用文件路径

# 3. 告诉 Agent 你想做什么
#    例如："请根据这个 Figma 设计稿实现页面：https://www.figma.com/design/xxx"
```

Agent 会自动：
1. 安装（或通过 npx 调用）`codin-d2c` CLI
2. 先检查 CLI 版本是否满足 Skill 要求，不足时自动切到 `npx -y --registry=https://bnpm.byted.org --package @byted/codin-d2c-mcp@latest`
3. 检测目标项目平台
4. 获取设计稿数据（XML DSL + 预览图）
5. 同时读取 XML、预览图和 DSL `CodeGenGuid`，理解设计意图
6. 下载图标资源（如 XML 中存在图标）
7. 对 Lynx 项目，在 XML DSL、预览图和 DSL `CodeGenGuid` 都已读取后，先用 `discover` 查看 `componentsMenu`（如需要），再用 `implement` 拉取 `rulesMarkdown`
8. 生成 UI 代码
9. 对 Lynx 项目，仅当 `rulesMarkdown` 之外仍需要完整 props 或特殊场景时，从 `deepDive.availableTopics[].queryKey` 复制 `queryKeys`，用 `query-ui-rules --stage generation-detail-example` 拉取 `topicMarkdown`
10. 执行 Code Review（Lynx 传入 LLM 总结的自然语言 `ruleContext`）
11. （可选，应用本地运行后）对运行页面做 Runtime Design Review：默认把运行页截图存到 `.d2c_temp/design-review/inbox/` 后用 `--live-screenshot` 传绝对路径与 Figma 比对（用户只在对话里贴了图、没有磁盘文件时，先 `codin-d2c paste-screenshot --directory <abs> --reveal` 从系统剪贴板抓图落盘，再把 `saved_path` 传给 `--live-screenshot`）；有 critical/warning 时，本机可直接读 `analysis_path`/`issues_path` 修，或手握报告 URL 时用 `design-review-fix` 生成 diff 建议；修复后重启应用重跑验证，最多 3 轮
12. 清理临时文件（在 design-review 回环结束后；web-h5 与无运行应用时直接清理）

---

## 使用方式详解

### 方式 A：放到 Agent Skill 目录（推荐）

不同的 Agent 有不同的 skill 目录约定：

| Agent | Skill 目录 | 操作 |
|-------|-----------|------|
| **Claude Code** | `.claude/skills/` 或 项目根目录 | 复制 `codin-d2c-cli/` 文件夹到 skill 目录 |
| **Gemini CLI** | `.gemini/skills/` 或 `.agent/skills/` | 同上 |
| **Codex** | 项目根目录或 `.agent/` | 同上 |
| **自定义 Agent** | 取决于框架约定 | 参考框架文档 |

```bash
# 示例：Claude Code
mkdir -p .claude/skills/
cp -r /path/to/codin-d2c-cli .claude/skills/codin-d2c-cli

# 示例：通用（项目根目录下）
mkdir -p _agent/skills/
cp -r /path/to/codin-d2c-cli _agent/skills/codin-d2c-cli
```

放好后，Agent 会在上下文初始化时**自动发现**并加载这个 Skill。

### 方式 B：在对话中直接引用

如果不想改目录结构，可以在给 Agent 的消息中直接引用：

```
请阅读这个 Skill 文件并按照说明执行：
@[/path/to/codin-d2c-cli/SKILL.md]

然后根据以下 Figma 设计稿生成代码：
https://www.figma.com/design/xxxxx
```

### 方式 C：通过 System Prompt 注入

在 Agent 的 system prompt 或自定义指令中添加：

```
你有一个可用的 Skill：Codin D2C CLI。
当用户提供 Figma URL 并要求实现代码时，读取 SKILL.md 文件获取完整使用说明。
Skill 路径：/path/to/codin-d2c-cli/SKILL.md
```

---

## Token 获取与配置

### CODIN_D2C_TOKEN（D2C 服务令牌）

1. 打开 <https://design-space.bytedance.net/d2c>
2. 登录后在设置中获取 Token
3. 设置环境变量：`export CODIN_D2C_TOKEN=<token>`

### FIGMA_ACCESS_TOKEN（Figma 个人令牌）

1. 打开 <https://www.figma.com/settings>
2. 滚动到 "Personal access tokens" 部分
3. 点击 "Generate new token"
4. 设置环境变量：`export FIGMA_ACCESS_TOKEN=<token>`

### 持久化配置

CLI 自带**用户级 token 缓存**：首次通过 `export`（或 `--d2c-token`/`--figma-token`）提供 token 后，会 write-through 写入 `~/.codin-d2c/credentials.json`（明文 `0600`），此后新终端裸跑即可从缓存解析，无需每次重设。解析链为 `flag → env → cache → error`。

- 查看来源（只读，不写盘）：`codin-d2c auth status`
- 清除缓存：`codin-d2c auth clear-cache [--token codin|figma|all]`（缺省 `all`）
- 禁用自动缓存：`export CODIN_D2C_TOKEN_CACHE=0`（`clear-cache` 的显式删除不受此开关约束）

也可直接将环境变量写入 shell 配置文件：

```bash
# ~/.zshrc 或 ~/.bashrc
echo 'export CODIN_D2C_TOKEN=<token>' >> ~/.zshrc
echo 'export FIGMA_ACCESS_TOKEN=<token>' >> ~/.zshrc
source ~/.zshrc
```

### 安全提醒

- **不要**将 Token 提交到 Git 仓库
- **不要**在代码中硬编码 Token
- 建议将 `.env` 文件加入 `.gitignore`

---

## 完整工作流示例

### 场景：用户在 Claude Code 中使用

**用户输入：**
```
请根据这个 Figma 设计实现一个 React 页面：
https://www.figma.com/design/ABC123/MyDesign?node-id=1-100

项目目录：/Users/me/project/src/pages/Home
```

**Agent 自动执行流程（基于 SKILL.md）：**

```
1. 检测 Token 环境变量 ✓

2. 读取 SKILL.md frontmatter，得到最低要求版本 = 4.0.0

3. 检查本地 CLI 是否可用且版本兼容
   $ codin-d2c commands
   → {"ok": true, "result": {"version": "3.2.0"}, ...}
   → 版本低于 4.0.0，切换到最新路径或 beta 路径

4. 改用最新 CLI 路径继续执行；若正在验证 beta-only 能力（例如 web-h5），使用 @beta
   $ npx -y --registry=https://bnpm.byted.org --package @byted/codin-d2c-mcp@latest codin-d2c commands
   $ npx -y --registry=https://bnpm.byted.org --package @byted/codin-d2c-mcp@beta codin-d2c commands
   → 若 result.version >= 4.0.0，后续命令沿用同一个 npx 前缀
   → 若 result.version 仍低于 4.0.0，说明 registry 尚未发布兼容版本，应停止并提示用户升级/发布包

5. 校验 Token（版本兼容后）
   $ npx -y --registry=https://bnpm.byted.org --package @byted/codin-d2c-mcp@latest codin-d2c auth verify
   → {"ok": true, ...}

6. 检测目标项目平台
   → 发现 package.json 有 React 依赖 → platform = "web"

7. 获取设计稿数据
   $ npx -y --registry=https://bnpm.byted.org --package @byted/codin-d2c-mcp@latest codin-d2c get-figma-data \
       --url "https://www.figma.com/design/ABC123/MyDesign?node-id=1-100" \
       --directory "/Users/me/project/src/pages/Home" \
       --platform web
   → {"ok": true, "result": {"xml_file": ".../.d2c_temp/figma_data_xxx.txt", "preview_image_file": ".../.d2c_temp/preview_xxx.png", ...}}

8. 同时读取 XML 文件和预览图
   → 预览图提供视觉真相，XML 提供精确结构数据
   → 交叉对照两者，理解设计意图

9. 下载图标（如果 next_actions 提示）
   $ npx -y --registry=https://bnpm.byted.org --package @byted/codin-d2c-mcp@latest codin-d2c download-icons \
       --figma-url "https://www.figma.com/design/ABC123/MyDesign?node-id=1-100" \
       --directory "/Users/me/project/src/pages/Home/assets" \
       --platform web \
       --icons-file "/absolute/path/to/icons.json"
   → 默认推荐 Agent 读取 XML 后生成显式 icons JSON，只下载需要的图标并优化保存名；如果用户要求全量自动下载或使用 Figma 原始名，也可以不传 --icons-file，走 --figma-url 自动模式。

10. 生成 React 代码 (Home.tsx, Home.css 等)

11. 代码审查（标注文件类型和优先级）
   $ npx -y --registry=https://bnpm.byted.org --package @byted/codin-d2c-mcp@latest codin-d2c verify-code \
       --url "https://www.figma.com/design/ABC123/MyDesign?node-id=1-100" \
       --code-files '[{"path":"/Users/me/project/src/pages/Home/Home.tsx","type":"new"},{"path":"/Users/me/project/src/pages/Home/Home.css","type":"new"},{"path":"/Users/me/project/src/App.tsx","type":"modify"}]' \
       --platform web \
       --code-context "React + CSS Modules"

12. 根据 CR 报告修复 Critical/Moderate 问题（针对性修复，不重写整个组件）

13. （可选）应用本地运行后，对运行页面做 Runtime Design Review
    # 先把运行页截图存到 inbox（绝对路径），再传 --live-screenshot。
    # 用户只在对话里贴/传了图、手里没有磁盘文件时：coding agent 无法把对话里的图落盘，
    # 改用 paste-screenshot 从系统剪贴板抓图（同机、单图规则、--reveal 可视确认）：
    #   $ npx ... codin-d2c paste-screenshot --directory "/Users/me/project/src/pages/Home" --reveal
    #   → 回显 saved_path/宽高/sha256；把 saved_path 传给下面的 --live-screenshot
    $ npx -y --registry=https://bnpm.byted.org --package @byted/codin-d2c-mcp@latest codin-d2c design-review \
        --url "https://www.figma.com/design/ABC123/MyDesign?node-id=1-100" \
        --directory "/Users/me/project/src/pages/Home" \
        --live-screenshot "/Users/me/project/src/pages/Home/.d2c_temp/design-review/inbox/home.png" \
        --code-dir "/Users/me/project/src/pages/Home"
    → 有 critical/warning 时：本机直接读 analysis_path/issues_path 修，或用
      codin-d2c design-review-fix --report-url <报告 URL> --code-root <abs> 生成 diff 建议；
      修复后重启应用重跑验证，最多 3 轮（仅在知道确切运行 URL 时才改用 --live-url）

14. 清理临时文件（在 design-review 回环结束后）
    $ npx -y --registry=https://bnpm.byted.org --package @byted/codin-d2c-mcp@latest codin-d2c cleanup-temp --directory "/Users/me/project/src/pages/Home"
```

整个过程 Agent 自主完成，用户只需提供 Figma URL 和目标目录。

---

### 场景：Lynx 规则查询页面

当目标项目包含 `@byted-lynx/*`、`@lynx-js/*`、`.lynx.tsx`、`<view>` / `<text>` 等信号时，Agent 使用 Lynx content-first 流程。规则查询必须发生在读取 XML DSL、预览图和 DSL `CodeGenGuid` 之后，并且必须发生在写第一版 ReactLynx 代码之前：

```
1. 检测平台 → platform = lynx
2. get-figma-data --platform lynx：获取 XML/DSL 与预览图
3. 读取 XML DSL、preview image、DSL CodeGenGuid 和目标项目约定；LLM 自己判断需要的 components
4. 可选 discover：query-ui-rules --stage discover --platform lynx
   → 读取 componentsMenu = [{ name, useWhen }]，选择组件名
5. implement：query-ui-rules --stage implement --platform lynx --components "..." --query "..."
   → 读取 rulesMarkdown，必须逐条遵守 <LYNX_CRITICAL_RULES> 和 <LYNX_USAGE_DOCS>
6. download-icons：SVG 可能返回 inline svg_code，支持时用 <svg content={svg_code} />，不支持 SVG 子标签/效果时降级 PNG <image>
7. 生成 ReactLynx 代码；不要生成 Web DOM 代码
8. 可选 deep dive：如需完整 props 或特殊场景，从 implement.deepDive.availableTopics[].queryKey 复制 queryKeys，执行 query-ui-rules --stage generation-detail-example --platform lynx --components "..." --query-keys "..."
   → 读取 topicMarkdown，并与 rulesMarkdown 合并理解
9. Agent 基于 rulesMarkdown、可选 topicMarkdown 和实际生成代码总结自然语言 ruleContext
10. verify-code --rule-context-file rule-context.txt 或 --rule-context "<text>"
```

`query-ui-rules` 是 Lynx-only 规则查询命令：命令不解析 DSL、不推断 signals、不决定主组件，只根据 Agent 显式传入的 `components` 和从 `deepDive.availableTopics[].queryKey` 复制的 `queryKeys` 返回 LLM 可直接阅读的 Markdown 内容。

默认情况下 CLI 返回标准 JSON envelope；`query-ui-rules --format markdown` 是唯一明确的纯 Markdown stdout 模式，适合人工调试或直接读取 `componentsMenu` / `rulesMarkdown` / `topicMarkdown`。

各 stage 的核心返回字段：

| Stage | 返回字段 | Agent 行为 |
| --- | --- | --- |
| `discover` | `componentsMenu` | 只用于选择组件名，不能直接生成代码 |
| `implement` | `rulesMarkdown` | 生成 Lynx 代码前必须读取，包含 `<LYNX_CRITICAL_RULES>` / `<LYNX_USAGE_DOCS>` |
| `generation-detail-example` | `topicMarkdown` | 只作为 `rulesMarkdown` 的补充，`queryKeys` 必须从 `deepDive.availableTopics[].queryKey` 复制 |

不要传旧查询标签：`--stage routing`、`--stage implementing`、`--stage verifying`、`verify`、`--dsl-snippet`、`--signals`、`--rule-types` 都是无效输入。Agent 仍然负责基于 DSL、用户要求和项目约定选择组件。

`ruleContext` 是给下游 CR Agent 阅读的自然语言 review guidance，不是工具要解析的规则对象。不要传原始 `query-ui-rules` JSON；Agent 应基于 `rulesMarkdown`、可选 `topicMarkdown`、项目约定和自己实际生成的代码，总结实际参考或应用的组件规则、prop 约束、caveats、examples 和重点 review 项。CLI 公开推荐使用 `--rule-context` 或 `--rule-context-file`，不会自动替 Agent 生成这段文本。

Non-Lynx 平台跳过 `query-ui-rules`，不要用 Lynx 规则作为兜底。

---

## FAQ

### Q: Agent 会自动安装 codin-d2c 吗？

**A:** 是的。SKILL.md 包含了安装与版本校验指引。Agent 会先读取 Skill frontmatter 中声明的最低版本，再检查本地 `codin-d2c commands` 返回的 `result.version`。如果本地 CLI 缺失或版本过低，Agent 会自动切到 `npx -y --registry=https://bnpm.byted.org --package @byted/codin-d2c-mcp@latest`；只有本地版本满足要求时，才会直接使用 `codin-d2c` 命令。

### Q: 我需要手动运行任何命令吗？

**A:** 不需要。你只需要：
1. 配置好两个 Token 环境变量
2. 将 SKILL.md 交给 Agent
3. 告诉 Agent Figma URL 和目标目录

其余全部由 Agent 自动完成。

### Q: 支持哪些 Agent？

**A:** 任何支持 shell 命令执行的 Agent 都可以使用，包括但不限于：
- Trae
- Claude Code
- Codex
- Gemini CLI
- 自定义 Agent（OpenClaw、Axe 等）
- CI/CD Pipeline

### Q: 这和 MCP 方式有什么区别？

**A:**
两者功能完全等价，只是适配不同的 Agent 生态。

| 维度 | MCP 方式 | CLI Skill 方式 |
|------|---------|---------------|
| 安装方式 | MCP Server 配置 | npm 全局安装 / npx |
| Token 消耗 | ~28K-55K tokens（schema 注入） | ~0 tokens（无 schema 成本） |
| 交互方式 | Tool Call 协议 | Shell 命令 |
| 功能 | 完全相同 | 完全相同 |


### Q: 出错了怎么办？

**A:** CLI 遵循 Agentic CLI Design 规范，每个错误响应都包含：
- `error.code`：机器可读的错误码
- `fix`：自然语言修复建议
- `next_actions`：修复后的下一步操作

Agent 会自动按照这些提示尝试修复。如果 Agent 无法修复，它会将错误信息和修复建议展示给你。

### Q: 能看到执行进度吗？

**A:** 可以。`get-figma-data` 命令支持 `--follow` 参数，启用 NDJSON 流式输出，
实时推送进度百分比。Agent 可以选择是否使用此功能。

### Q: `download-icons` 支持哪些输入参数？

**A:** `download-icons` 支持自动模式和显式模式。Agent 已读取 XML、能判断需要哪些图标时，默认推荐显式 `--icons-file`，便于部分下载和优化文件名：

```bash
codin-d2c download-icons \
  --figma-url "<与 get-figma-data 相同的 URL>" \
  --directory "<assets-dir>" \
  --icons-file "<absolute-json-file>" \
  --icon-format <png|svg>
```

`--icons-file` 必须是绝对路径 JSON 文件，内容为数组：`[{ "url": "...", "name": "...", "format": "png|svg", "nodeId": "..." }]`；其中 `name` 必填，`url`、`format`、`nodeId` 可选。非空 `--icons-file` 会跳过 XML 全量解析，只下载列表里的图标；direct URL 场景可不传 `--figma-url`，但通过 `nodeId` 查询或格式刷新时需要它。

缺少或空 `--icons-file` 时进入自动模式：`--figma-url` 作为 XML 查找键，优先读取本地 2 小时缓存。`get-figma-data` 在 XML 模式下会把 XML 写入 CLI 本地缓存，缓存有效期 2 小时；`raw_html_only` 不刷新本地 XML 图标缓存，避免 HTML-Like 内容污染 XML DSL 缓存。如果本地缓存 miss 或已过期，且已配置 D2C/Figma token，CLI 会尝试回退服务端 XML 缓存；如果未配置 token 或服务端缓存也不可用，需要先重新执行 `get-figma-data`，然后再调用 `download-icons`。

`--icon-format` 是全局格式覆盖，优先级高于 JSON 单项 `format`。当目标格式与已有 URL 源格式不一致时，工具会通过 `nodeId + --figma-url` 拉目标格式 URL；条件不足的单个 icon 会失败。非法 Figma 原始名会修复，例如 `login icon/login.png` -> `login_icon_login.png`；合法名称不变，返回结果可能包含可选 `source_name` 和 `sanitized`。

### Q: `verify-code` 的 `--code-files` 怎么传？

**A:** 支持三种格式：

1. **JSON 数组**（推荐，最精确）：
   ```bash
   --code-files '[{"path":"/src/Card.tsx","type":"new"},{"path":"/src/App.tsx","type":"modify"}]'
   ```

2. **带类型前缀的逗号分隔**（CLI 友好）：
   ```bash
   --code-files '/src/Card.tsx,modify:/src/App.tsx'
   ```

3. **纯逗号分隔**（全部视为 new）：
   ```bash
   --code-files '/src/Card.tsx,/src/Card.css'
   ```

标记 `modify` 类型的文件会自动提取 git diff，只发送变更部分，让 Code Review 更聚焦。

### Q: Lynx 的 `ruleContext` 从哪里来？

**A:** 从 `implement` 返回的 `rulesMarkdown`、可选 `generation-detail-example` 返回的 `topicMarkdown` 和你实际生成的代码中总结。Agent 应写一段自然语言 review guidance，说明本次参考或应用的 Lynx 平台规则、组件规则、prop/caveat、资源处理和重点检查项。`verify-code` 通过 `--rule-context` 或 `--rule-context-file` 接收这段文本；不要传原始 query JSON。

### Q: Runtime Design Review 的运行页截图怎么提供？

**A:** `design-review` 只读**磁盘文件**（`--live-screenshot <绝对路径>`）或**确切的运行页 URL**（`--live-url`），不读系统剪贴板，也读不到对话里内嵌的图片。按以下顺序决策：

1. 用户给了**文件路径** → 直接 `--live-screenshot <abs>`；路径在项目外就先拷进 `.d2c_temp/design-review/inbox/`。
2. 用户给了**确切的运行页 URL** 且登录/弹窗/标签/滚动态都正确 → `--live-url <url>`（不要从 `platform=web` 猜 `http://localhost:3000`）。
3. 没有路径、没有 URL，用户只是在**对话里贴/传了图** → coding agent（Claude Code、Codex、Trae）**无法把对话里的图落盘**，改用 `codin-d2c paste-screenshot --directory <abs> --reveal` 从系统剪贴板抓图（仅限同机、单图规则），它会把全分辨率原图存进 inbox 并回显 `saved_path`，再把 `saved_path` 传给 `--live-screenshot`。
4. 抓图失败或根本没有图 → 让用户给绝对路径或重新复制截图；**绝不**去 `$TMPDIR`/`/tmp`/浏览器缓存里猜"相似"的图，错图会污染像素 diff 和 AI 分析。

只接受 `.png`/`.jpg`/`.jpeg`/`.webp`，没有 base64/内联通道。`paste-screenshot` 是唯一读剪贴板的命令，`design-review` 保持纯净。

### Q: design-review 和 design-review-fix 有什么区别？

**A:** `design-review` 跑运行时走查（截图/URL 对比 Figma），产出本地 HTML 报告 + 尽力上传的可分享报告 URL + `analysis_path`/`issues_path`。`design-review-fix` 是独立命令：把一个**报告 URL**（`design-review` 产出的 `remote_report_url`，或用户直接给的链接）转成定位到 `file:line` 的 unified-diff 修复建议——它**只读报告 URL 作为问题源**（不接受本地 analysis.json），但会读 `--code-root` 源码来定位并渲染 diff，且**只生成建议、绝不写源文件**。同机场景下你也可以跳过它，直接读 `design-review` 产出的 `analysis_path`/`issues_path` 来改。修复回环最多 3 轮。

### Q: 为什么要同时读取 XML 和预览图？

**A:** XML DSL 提供精确的结构和样式数据（组件层级、布局属性、颜色值、字体大小等），但无法完全表达视觉语义。预览图是设计的**视觉真相**，能帮助 Agent：
- 理解组件的视觉层级和空间关系
- 区分交互元素和装饰元素
- 解决 XML 中模糊的布局关系
- 确保最终代码的视觉还原度

两者交叉对照，才能生成高质量的 UI 代码。

### Q: 如何确认 Skill 被正确加载？

**A:** 你可以直接询问 Agent：
```
你是否加载了 codin-d2c-cli Skill？请描述一下 D2C 的工作流程。
```
如果 Agent 能正确描述完整工作流（检测平台 → 获取数据 → 读取 XML+预览图 → 下载图标 → 生成代码 → Code Review → 可选 Runtime Design Review + design-review-fix 回环 → 清理），
说明 Skill 已成功加载。
对 Lynx 项目，还应能描述 `get-figma-data → 读取 DSL/预览图/CodeGenGuid → query-ui-rules discover/implement 读取 rulesMarkdown → 生成代码 → generation-detail-example 按 deepDive.availableTopics[].queryKey 拉取 topicMarkdown → verify-code ruleContext`。

---

## v4.0 变更说明

### 新增内容

| 维度 | v3.3.0 | v4.0 |
|------|--------|------|
| **最低版本门槛** | 3.3.0 | 4.0.0 |
| **Runtime Design Review** | 无 | 新增 Step 5：`design-review` 把运行页截图/URL 与 Figma 比对，产出本地 HTML + 尽力可分享报告 URL，修复回环最多 3 轮 |
| **修复回环** | 无 | 新增 Step 6：本机直接读 `analysis_path`/`issues_path` 修，或用 `design-review-fix` 把报告 URL 转成定位过的 unified-diff 建议（只建议、不写文件） |
| **运行图贴图入口** | 无 | 新增 `paste-screenshot`：用户只在对话里贴了图、coding agent 落不了盘时，从系统剪贴板抓图落盘（同机、单图规则、`--reveal` 可视确认）再喂给 `--live-screenshot` |
| **截图获取纪律** | 含"agent 可把对话内图片落盘"的错误表述 | 修正为：coding agent **无法**把对话里的图落盘，必须走 `paste-screenshot`；并给出 4 步截图获取决策序 |

### 迁移建议

- Agent 继续用 `@latest` 取 CLI，不要把运行命令固定到某个版本号；最低门槛随 Skill frontmatter `version` 走（现为 `4.0.0`；`paste-screenshot` 自该版本起由 `grab-screenshot` 重命名而来，旧名已不可用）。
- 旧流程"verify-code 后直接 cleanup"需升级为：先按需跑 design-review 回环，**回环结束后**再 cleanup（cleanup 会删 `.d2c_temp`，含设计缓存与报告/inbox）。
- 不要再让 Agent 尝试"把对话里的截图保存成文件"——用 `paste-screenshot` 从剪贴板抓。

---

## v3.3.0 变更说明

### 新增内容

| 维度 | v3.0.x | v3.3.0 |
|------|--------|--------|
| **最低版本门槛** | 3.0.1 | 3.3.0 |
| **Lynx 规则查询** | 无强制步骤 | XML DSL、预览图和 `CodeGenGuid` 后使用 `discover` / `implement` / `generation-detail-example` 获取 `componentsMenu`、`rulesMarkdown`、`topicMarkdown` |
| **Lynx 平台检测** | 主要识别 `@byted-lynx/*` | 同时识别 `@byted-lynx/*`、`@lynx-js/*`、`.lynx.tsx`、Lynx tags |
| **SVG 处理** | 仅描述下载结果 | 明确 inline `svg_code` 与 PNG fallback |
| **verify-code** | 只传代码文件 | Lynx 传 LLM 总结的自然语言 `ruleContext` |

### 迁移建议

- Agent 继续使用 `@latest` 获取 CLI，不要把运行命令固定到 `3.3.0`。
- 旧的“获取数据后直接生成 Lynx 代码”流程需要升级为先读取 Lynx 规则、再生成代码的 content-first query。
- 旧的结构化 `rule-context.json` / `usedRules[]` 组装流程已废弃，改为自然语言 ruleContext 文本。

---

## v3.0.0 → v3.0.1 变更说明

### 新增内容

| 维度 | v3.0.0 | v3.0.1 |
|------|--------|--------|
| **CLI 版本校验** | 默认假设本地 CLI 可直接使用 | 新增 Step -1，要求先读取 `codin-d2c commands` 的 `result.version` 并与 Skill `version` 比较 |
| **升级策略** | 示例中主要展示直接使用 CLI | 明确要求版本不足时切到 `npx -y --registry=https://bnpm.byted.org --package @byted/codin-d2c-mcp@latest` |
| **运行时版本引用** | 容易被误解为固定安装某个包版本 | 明确 Skill `version` 只是最低兼容门槛，运行时命令应优先使用 `@latest` 刷新 |

### 迁移建议

- 仍然可以保留全局安装的 `codin-d2c`。
- 但 Agent **必须先做版本比对**，不能默认本地安装就是最新版本。
- 若本地版本低于当前 Skill frontmatter `version`，本次会话中的后续命令都应沿用 `npx -y --registry=https://bnpm.byted.org --package @byted/codin-d2c-mcp@latest` 前缀；若 `@latest` 仍低于该版本，应停止并提示 registry 尚未发布兼容包。

---

## v2.2 → v2.3 变更说明

### 新增内容

| 维度 | v2.2 | v2.3 |
|------|------|------|
| **平台检测** | 简单提及 | 新增 Step 0，提供完整检测清单，强调"错误平台比 universal 更差" |
| **预览图指导** | 仅提及读取 XML | 强调必须同时读取 XML + 预览图，预览图是"视觉真相" |
| **代码生成指导** | 无 | 新增 Step 3 代码生成最佳实践（6 条） |
| **verify-code 格式** | 仅逗号分隔 | 完整描述三种输入格式（JSON 数组、类型前缀、纯逗号） |
| **文件排序** | 无 | 强调按重要性排序：主页面优先 → 大组件 → 样式 → 小组件 |
| **文件类型语义** | 无 | 解释 new/modify 的行为差异（modify 自动提取 git diff） |
| **新参数** | — | `--xml-mode`（含 `raw_html_only`）、`--xml-response-mode 4`、`--xml-cache`、`--icon-format`、`--trace-id` |
| **Guardrails** | 5 条 | 8 条，新增文件排序、类型标注、URL 一致性 |

### 设计理念

1. **效果驱动**：从 MCP Tool 描述中提取经过验证的效果提升指导（平台检测、预览图交叉对照、文件排序），融入 Skill 流程
2. **精确参数对齐**：所有命令参数与最新代码实现完全一致，包括新增的 `--xml-mode raw_html_only` / `--xml-response-mode 4`、`--xml-cache`、`--icon-format`
3. **智能文件组装**：指导 Agent 正确标注 new/modify 类型，利用 git diff 提升 Code Review 精度
4. **防错升级**：Guardrails 从 5 条扩展到 8 条，覆盖更多常见错误场景
5. **行数控制**：~200 行，在推荐范围内，信息密度高
