---
name: "审查修复pi-toolkit"
description: "按 ponytail 审查报告修复 pi-toolkit 的 12 条问题：校验器不收敛的自动修复、命名规则重复、搜索 ori_question、写入原子化、轨迹序号开销、ask 空回答、死代码、模板与 README、侧栏读盘、frontmatter 解析器。"
status: completed
---

# 审查修复pi-toolkit

## 目标

把 `packages/pi-toolkit` 的 ponytail 审查结论（1 份报告，13 条发现）落成可验收的代码改动，并补上发现所暴露的测试缺口。

## 来源

本轮审查结论本身就是需求来源，逐条对应：

| 报告编号 | note |
| --- | --- |
| 1、2（自动修复不收敛） | 001 |
| 3（create 与 check 规则分叉） | 002 |
| 4（ori_question 变成 skill 样板） | 003 |
| 5（原地覆盖写） | 004 |
| 6（轨迹序号整文件解析） | 005 |
| 8（rpc 空回答） | 006 |
| 9（不可达 CLI 与三份渲染） | 007 |
| 10、11（模板 reason、README skill 清单） | 008 |
| 12（侧栏空转读盘） | 009 |
| 13（两个 frontmatter 解析器） | 010 |

## 范围与取舍

- **报告第 7 条（`packages/dsh-toolkit` 里那份旧校验器副本）本轮不改**：用户已确认只动 `pi-toolkit`。代价是两份规则继续分叉，`pi` 侧新增的自动修复 dsh 侧没有；后续若改校验器规则，两份必须一起改。这条结论写在报告与这里，不建 note（本轮没有对应交付物）。
- 不改行为契约：不改配置字段、不改工具参数、不留迁移分支。每条修完都要有能失败的测试。
- 删除优先：报告里的「重复实现」一律删到只剩一份，不为兼容加分支。

## 验收

`pnpm --filter @kxh4892636/pi-toolkit check` 与 `test` 全绿；报告第 1、2 条要用真实文件复现「连续校验不再改变文件」；新增测试在原实现上会失败。

## 进度

- 轮首：Plan 与 10 条 note 已建、已绑定本会话；spec 写入目标、来源、范围与验收。
- 轮末：10 条 note 全部 completed。`pnpm --filter @kxh4892636/pi-toolkit check` 通过（格式 + lint + 类型），`test` 257 个用例全绿（原 251，新增 6）。
- 验证方法：每条新测试都用 `git checkout HEAD -- <被改文件>` 退回旧实现跑一遍，确认会失败，再恢复新实现确认转绿；第 1、2 条另在临时工作区用真实文件复现了「修复前每跑一次文件变大 / 修复后多跑一次 md5 不变」。
- 已提交：`3c54c28`（代码与测试）+ 一个 `docs(pi)`（本 Plan）。
- 已合入 `origin/main`（`dc336cd` 及以前，含「禁用压缩」「侧栏常驻与折叠」「Command Code provider」）：唯一文本冲突在 README 的 Nano Flow 段落，保留上游两条新内容并保留本轮的 skill 清单修正；`ui/sidebar.ts` 自动合入，`refresh` 的 `mounted` 守卫在新结构里含义不变（
  挂上才刷新），已重跑测试确认。
- 合并后验证：`check` 通过（98 个文件格式 + 67 个文件 lint/类型），`test` 25 个文件 / 290 个用例全绿；第 1 条的复现脚本重跑后 spec 的 md5 仍恒定。
- 恢复入口：读 `notes_index.md`。本轮工作已完成，无待推进项；报告第 7 条（dsh 副本）按用户决定留到后续。

## 追加：Command Code provider 收窄（note 011）

- 需求变更：provider 只上架 DeepSeek（97 → 7），并把思考作为默认能力（reasoning、text+image、DeepSeek effort 映射、OpenAI 协议 compat）。
- 验证：`check` 通过，`test` 296 个用例全绿；真实网关目录走一遍过滤器后只剩 7 条，字段按预期。
- 未验证：网关是否接受 `thinking.type` + `reasoning_effort`（需一次真实请求）；6 个非视觉模型标了 image，贴图失败会报错。两条都记在 note 011。

## 追踪 Note

<!-- 由 nano_flow_check 生成，请勿手改 -->

| Name | Description | Status | Reason | Next Step | Related Note |
| --- | --- | --- | --- | --- | --- |
