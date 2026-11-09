---
name: '017-注入ponytail两个skill'
description: '把 ponytail 的 audit 与 review 两个 skill 注入 nano-flow：audit 用 disable-model-invocation 设为只能手动调用，review 由 do 的代码交付引用。'
status: 'completed'
related_noted: ['016-校验项自动修复清单']
---

# 注入 ponytail 两个 skill

## 需求

2026-11-09：把这两个 skill 加进注入集：

- `skills/ponytail-audit/SKILL.md` —— 但必须**只能手动调用**。
- `skills/ponytail-review/SKILL.md` —— 并在 `do` skill 的代码交付里引用它。

来源：`github.com/DietrichGebert/ponytail`（`main` 分支，MIT，`Copyright (c) 2026 DietrichGebert`）。

## 落点

`packages/pi-toolkit/src/nano-flow/skills/` 下新增两个目录，与 `ask` / `do` / `code-spec` / `learning` / `to-skill` 同级。`resources_discover` 已经把整个 `skills` 根交出去，不用改注册代码。

## 手动调用的实现

pi 的机制是 frontmatter 的 `disable-model-invocation: true`（`docs/skills.md`「Hide the skill from automatic model selection」）：技能从模型的 `available_skills` 列表里消失，`/skill:ponytail-audit` 仍然可用。`learning` 早先就用这个字段，形态一致。

两处内容处置：

- 正文原样照搬，不改写。
- description 里的调用名从 `/ponytail-audit`、`/ponytail-review` 改成 pi 的 `/skill:ponytail-audit`、`/skill:ponytail-review`（原写法在 pi 里不存在，留着会误导路由）。

## 用户手改（保留）

- `do/SKILL.md`：`## 代码交付` 重构成 `## 代码工作`，分「执行」（`/skill:code-spec`）与「验证」（测试 + `/skill:ponytail-review` 代码审查）两条；commit 一行被收进验证之外。
- `ponytail-audit/agents/openai.yaml`：用户新增，内容 `policy: { allow_implicit_invocation: false }`。
  **这是 Codex/OpenAI 侧的约定，pi 不读它**；pi 侧真正起作用的是 frontmatter 的 `disable-model-invocation`。两者并存不冲突，只是多一个不会被消费的文件。

## 验证

1. `get_commands`（RPC，`--no-session`）：32 条命令里有 `skill:ponytail-audit` 与 `skill:ponytail-review`；stderr 无 skill 警告。
2. 系统提示词 `skills` 段：`ponytail-audit` 出现 0 次、`ponytail-review` 出现 3 次（name / description / path）—— 手动限制生效，review 可被模型选中。
3. `pi install /data00/.../packages/pi-toolkit` 重装后复跑上述两项，结果一致；`~/.pi/agent/settings.json` 的 `packages` 仍指向仓库内该路径。
4. `vp check`：2152 文件格式通过、463 文件 0 lint / 0 类型错误；`vp test`（`packages/pi-toolkit`）249 项通过。
5. 格式化器给两个英文 SKILL.md 末尾各补了一个空行，这是唯一被自动改写的地方。

## 遗留

- **许可证归属未落**：两个文件正文来自 MIT 项目，目前没写版权与许可声明。要对外分发 pi-toolkit 时应补一段 attribution，待用户决定形态。
- 语言不一致：现有 nano-flow skill 都是中文，这两个按原文保留英文。
