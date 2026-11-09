---
name: "006-清理超长Plan描述"
description: "21 个 archived/reference Plan 的 spec description 超过 144 字，定下修剪或放宽校验并落地。"
status: completed
related_noted: []
next_step: "已交付；后续若再加长 description，按本 note 的压缩口径处理。"
---

# 006-清理超长Plan描述

交付：全工作区 `nano_flow_check` 不再有 `[header] description 超过 144 字` 失败项。验收：check 0 失败；被改 Plan 的原意仍能从 description 或其正文回读。

## 现状

2026-11-09 恢复轮的全工作区 check 共 21 项失败，全部是同一类：

| 域 | 条数 | Plan |
| --- | --- | --- |
| common | 2 | 2026-11-08-删除pi-toolkit与其Plan、2026-09-30-vite-plus升级到1.0（reference） |
| dsh | 13 | 2026-09-01-session与model管理插件、2026-09-01-会话上下文注入与默认workspace、2026-09-09-dsh-alive命令与测试基建调整、2026-09-09-dsh插件适配新版本、2026-09-10-dsh-alive全平台、2026-09-10-dsh插件适配0.1.5-rc.1、2026-09-13-dsh网络搜索fake-IP阻断修复、2026-11-07-预设提示词评审、2026-11-08-nano-flow等待确认状态、reference 下 2026-08-31-dsh嵌套skill发现插件、2026-10-26-dsh插件适配0.2.1-rc.2、2026-10-27-dsh插件装进desktop宿主、2026-11-04-dsh-toolkit插件 |
| etf | 1 | reference/2026-10-17-合并为单一etf应用 |
| music | 1 | reference/2026-10-28-古典音乐曲库与随机播放站点 |
| nano-flow | 4 | reference 下 2026-08-20-mcp迁移为cli、2026-08-22-nano-flow命令行收口、2026-08-26-工作区命令重构、2026-09-09-anki牌组删除 |

实际字数落在 162–233 字之间；多数是 233 字，像是早期模板里的整段说明被直接塞进 description。完整清单以 check 输出为准，可随时复跑。

## 定案

选 **A 修剪**（2026-11-09 用户确认）：逐条压到 ≤144 字，只留一句结论式摘要，不动规则、不改 `check-domain.mjs`。

预览阶段评估过 B（让 check 跳过 archived/reference 的长度校验）：等于在规则上开口子，还要同步改提示词，而 Plan 的 description 不进任何生成索引，收益不抵成本。

## 交付

21 条全部改写，长度落在 64–97 字：

- common 2 条、dsh 13 条、etf 1 条、music 1 条、nano-flow 4 条；
- 压缩口径：保留「做了什么 + 关键版本/数量 + 结果」，删掉与正文重复的取证细节与用例枚举；
- 每条的 `git diff` 只有 `description` 一行，正文、status 与索引均未动。

## 验证

- 逐条核对被删细节能否在正文回读：抽查 15 个已从 description 移除的具体事实（版本号、文件数、上游包名、US 编号、`deleteDecks` 约束等）全部在对应 spec 正文中命中，无需补正文。
- `nano_flow_check`（全工作区）：**0 失败**；改动前是 21 项失败。
- `git diff --numstat`：21 个归档/参考 Plan 各只改 1 行（合计 +21 / −21）；本 Plan 的 spec 另有改动，不计入。

## 验证

- `nano_flow_check`（全工作区）：0 失败，且不产生新的失效项。
- `git diff`：只改 YAML 头 `description` 或补正文，不动 note 状态与索引（索引是生成物）。
- 抽查 3 条压缩后的 description：单行、无换行、语义与正文一致。

## 相关

- [nano-flow绑定机制与GUIDE写入约束](spec.md) — 本 note 的宿主 Plan；该 Plan 收口时会把这条校验噪声作为遗留项交接。
