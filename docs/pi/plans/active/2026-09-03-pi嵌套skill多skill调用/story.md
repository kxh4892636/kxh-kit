# Pi 嵌套 skill 多 skill 调用

## 原始想法

packages/pi-nested-skill 支持嵌套 skill 了, 但不支持一次输入, 调用多个 skill

## 角色

- **Pi 使用者**：在 Pi 会话中通过自然语言和 skill marker 组合多个已载入 skill，希望一次输入完成多段 agent 指令装配。

## 故事

### US-001 一次输入原位展开多个 skill marker

作为 Pi 使用者，我想在同一条 interactive/RPC 输入中写入多个 `/skill:<name>` marker，并让插件按出现顺序把它们全部替换为 Pi 原生 skill block，以便一次输入即可组合多个已载入 skill 的指令上下文。

- [x] 输入 `请 /skill:to-story 梳理故事，然后 /skill:quest-with-domain 拷问领域设计` 时，两个已载入 skill 的 block 都按出现顺序插入，剩余中文文本保持原序，并作为同一轮共享用户输入交给 agent。
- [x] 当同一条输入出现多个未转义、精确命名已载入 skill 的 marker 时，不只展开第一个 marker。
- [x] 在 interactive editor 中，输入开头或中段的 `/skill:` 都出现已载入 skill 搜索/补全列表，补全只替换当前 marker，不删除其他文本。

## 迷雾

- 失败形态已澄清：展开链路已能处理两个 skill；用户实际缺口是第二个 inline marker 没有 Pi 原生 slash command 的搜索补全列表。补齐方式是插件叠加 autocomplete provider，不修改 Pi core。
- 既有 ADR/README 边界保持不变：重复 marker 重复展开；未知 marker 原样保留；读取失败 marker 原样保留并 warning，不阻断其他 marker；`\/skill:name` 作为字面量保留；插入的 skill 正文不递归扫描；不支持 per-skill args。

## 上下文

- [Pi 领域语言](../../../CONTEXT.md)
- [独立插件 ADR](../../../adr/0004-以独立插件补充发现与原位展开.md)
- [既有 Pi 嵌套 skill 插件 spec](../2026-09-03-pi嵌套skill插件/spec.md)
- `.temp/pi/packages/pi-nested-skill/README.md`
- `.temp/pi/packages/pi-nested-skill/src/expansion.ts`
- `.temp/pi/packages/pi-nested-skill/src/index.ts`
