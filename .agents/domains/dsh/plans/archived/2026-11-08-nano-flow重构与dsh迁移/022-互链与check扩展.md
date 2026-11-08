---
name: "022-互链与check扩展"
description: "实现页面文末「## 相关」互链契约：check 校验目标与原因、GUIDE 预算进设置面板，测试与安装。"
status: completed
related_noted:
  - '019-dream机制设计'
  - '020-迁移legacy领域文档'
---

# 022-互链与check扩展

## 交付

- `contract.ts`：`NanoFlowSettings.guideMaxBytes`，默认 13 KB。
- `client/panel.ts`：设置面板新增 `GUIDE.md` 字段（KB）。
- `limits.ts`：注入的「篇幅限制」增加 GUIDE 行。
- `check-domain.mjs`：`DEFAULT_LIMITS.guideMaxBytes`；`## 相关` 校验（只允许一个、必须是最后章节、每条 `- [标题](相对.md) — 原因`、目标存在、原因非空）；`GUIDE.md` 体积超限报错（读 limits）。
- `prompts/system.md`：新增「## 互链」契约。
- `README.md`：check 描述与设置项更新。

## 验证

- `vp check`：124 文件格式、94 文件 lint/类型通过。
- `vp test src`：37 文件 / **301 例**通过（新增 check-domain 3 例、preset 1 例、plugin 1 例、limits 断言 1 条）。
- `vp run build` 成功；源码 check 脚本在真实工作区跑通。
- 0.5.30 打包并装入 desktop 与 web profile。

## 遗留

- 重启宿主后新 check 才被宿主进程使用（当前进程仍载 0.5.29）。
