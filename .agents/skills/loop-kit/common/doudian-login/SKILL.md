---
name: doudian-login
description: 抖店商家态登录流程。用户需要抖店测试商家登录、fake login、切换或进入指定 shopId、线上真实商家附身、附身抖店/罗盘经营，或 E2E/验收前需要准备商家态时使用。
---

# Doudian Login

本 skill 用于在测试、验收、联调或页面走查前进入正确商家态。它负责判断商家类型、读取目标业务的验证配置、执行测试商家登录或线上附身。

## 完成标准

- 已确定商家类型：测试商家或线上真实商家。
- 已确定目标 `shopId`、访问域名和目标页面路径；无法从用户输入或项目配置确认时，已向用户询问。
- 已读取并执行匹配分支的 reference 流程。
- 已记录最终商家态结果、异常提示和重试次数。

## 执行流程

1. 根据用户目标和当前修改范围确定商家类型、目标 app 与目标页面。完成标准：商家类型、`shopId` 来源、目标 URL 来源都有明确记录。
   1. 测试商家、测试 `shopId`、fake login、抖店测试商家登录，读取 [test-merchant-login.md](test-merchant-login.md)。
   2. 线上真实商家、商家附身、附身抖店，读取 [production-merchant-impersonation.md](production-merchant-impersonation.md)。
2. 按“shopId 与页面配置”确认 `shopId`、访问域名、路由前缀和页面路径。完成标准：能拼出目标 URL，或明确缺少哪个输入。
3. 按“路由规则”读取对应 reference 并执行该分支流程。完成标准：只加载当前分支需要的登录/附身细节，并得到成功、待确认或阻塞结论。
