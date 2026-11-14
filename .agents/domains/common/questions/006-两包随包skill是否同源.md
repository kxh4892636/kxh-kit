---
name: '006-两包随包skill是否同源'
description: 'pi-toolkit 与 dsh-toolkit 各带一份 skill 树：同名 9 个文件逐字一致，learning/ANKI.md 只差一行宿主调用语法；改共享 skill 两包同改，没有脚本兜底。'
---

# 006-两包随包skill是否同源

## 问题

两个 CLI 包都把自己的 skill 随包分发：`packages/pi-toolkit/src/nano-flow/skills/` 与 `packages/dsh-toolkit/src/nano-flow/skills/`。改一个 skill 时不确定改一处还是两处，也不知道两边「一致」到什么程度。

## 答案

**同源但各带一份副本，允许的差异只有宿主的 skill 调用语法。**

2026-11-14 实测（`git log` 到 `8a517272`）：

| 包 | skill 目录 | 文件数 |
| --- | --- | --- |
| pi-toolkit | code-spec / learning / ponytail-audit / ponytail-review / to-skill | 10 |
| dsh-toolkit | 同上 + ponytail / pp | 13 |

同名文件 9 个逐字一致，唯一的差异是 `learning/ANKI.md` 的一行：

- pi：`读取 `/skill:nano-flow-cli` 通过 `nnf anki` 创建 anki 牌组/卡片;`
- dsh：`读取 `/nano-flow-cli skill` 通过 `nnf anki` 创建 anki 牌组/卡片;`

这不是分叉，是宿主语法：pi 用 `/skill:<name>`，dsh 用 `/<name> skill`（[pi 017](../../pi/plans/reference/2026-11-09-pi-toolkit插件/017-注入ponytail两个skill.md) 记录过同一处的改写）。

两份副本是必需的，两个包都要能单独发布、单独注入：pi 把 `skills` 根整个交给 `resources_discover`；dsh 用 `createAssetSkillProvider`（provider 名 `nano-flow-assets`，rank 200）动态发现 `<root>/<name>/SKILL.md`。共享一个包会让任一包多一个运行时依赖。

**操作口径**：改共享 skill 就两包同改（正文、description 一致）；只允许调用语法这类宿主差异。新增 skill 只加需要它的包——`ponytail`、`pp` 目前只在 dsh 侧。

**没有兜底**：仓库里没有脚本或测试比对这两棵树（[004](004-两包校验规则是否同源.md) 的 `check-domain.mjs` 有，skill 没有），只改一包不会被门禁拦下。

## 验证

```powershell
$pi='packages/pi-toolkit/src/nano-flow/skills'; $dsh='packages/dsh-toolkit/src/nano-flow/skills'
git diff --no-index --stat -- $pi $dsh   # 只应出现 learning/ANKI.md 一行差异
```

## 相关

- [004-两包校验规则是否同源](004-两包校验规则是否同源.md) — 同一类「两包各带一份」约定，那边有 diff 门禁，这边没有。
- [001-发布dsh-toolkit并真机验收](../../dsh/workflows/001-发布dsh-toolkit并真机验收/001-发布dsh-toolkit并真机验收.md) — 发布前核对随包 skill 清单的走查清单。
