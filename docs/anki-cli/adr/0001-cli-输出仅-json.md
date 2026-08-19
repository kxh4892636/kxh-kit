# CLI 输出仅 JSON

`anki-cli` 的用户可见输出只允许 JSON：stdout 输出成功结果对象（形状与上游 MCP structuredContent 一致），stderr 输出错误对象 `{success:false, error, action?, hint?, ...}` 并配合非零退出码（1=运行时错误，2=用法错误）。不提供人类可读表格、颜色或交互式进度渲染。原因是用户明确选择了脚本向契约：JSON-only 使管道组合（`anki-cli notes find ... | jq ...`）与上游 MCP 数据形状保持一致，且输出解析成为稳定契约。

**Considered Options**：默认人类可读 + `--json` 开关（被拒绝——用户明确选择仅 JSON）；仅人类可读（被拒绝——不可脚本化）。

**Consequences**：交互友好性让位于可组合性；所有命令（含交互式 `review`）必须遵守同一契约；将来若需要人类可读视图，应通过新增 `--format` 选项或外部渲染器扩展，不得破坏默认 JSON 契约。
