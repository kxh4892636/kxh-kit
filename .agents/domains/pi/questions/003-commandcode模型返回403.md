---
name: '003-commandcode模型返回403'
description: '选中 claude-* 或 gpt-6-astra 时上游返回 403 MODEL_NOT_IN_PLAN：这是套餐权限，不是端点映射或路径错；400/404 才是路径问题。'
---

# 003-commandcode模型返回403

## 适用条件与现象

`commandcode` provider 已登录、`/model` 也列出了 96 条模型，但选中 Claude 全系或 `gpt-6-astra` 时请求失败：

- Anthropic 一侧（`claude-*`）：HTTP 403，信封 `{"type":"error","error":{"type":"permission_error","message":"MODEL_NOT_IN_PLAN: …"}}`。
- OpenAI 一侧：HTTP 403，`{"message":"…","type":"permission_error","code":"FORBIDDEN"}`。

## 原因

模型清单是全量目录，与账号权限无关；这些模型属于上游更高档套餐（Provider 及以上）或需按需加购。当前账号只开通了低档（开源那批）模型。

## 解决方法

- 换到账号已开通的模型（如 `commandcode/deepseek/deepseek-v4-flash`），或在上游升级套餐 / 加购。
- 不要为了这条 403 去改 `api` / `baseUrl` 映射：错误由 Anthropic 信封返回且是 403，说明端点映射是对的。

## 验证

- 区分权限与路径：路径或协议写错会得到 400 `invalid_request_error` 或 404，不是 `permission_error`。
- 可用链路自检：`pi -p --model commandcode/deepseek/deepseek-v4-flash "回复三个字"` 正常返回；带工具调用的 `pi -p --model … "读 packages/pi-toolkit/package.json，只回答 name"` 也正常。
- 目录自检：`pi --list-models | grep -c '^commandcode'` 应为 96（受限模型仍会列出）。

## 来源

Plan `2026-11-09-commandcode-provider接入`，[003-登录凭据与真机验收](../plans/reference/2026-11-09-commandcode-provider接入/003-登录凭据与真机验收.md)；log.jsonl run 6。

## 相关

- [001-取证与方案定案](../plans/reference/2026-11-09-commandcode-provider接入/001-取证与方案定案.md) — 双协议与 baseUrl 不对称的取证，403 的判定建立在这套映射上。
- [003-登录凭据与真机验收](../plans/reference/2026-11-09-commandcode-provider接入/003-登录凭据与真机验收.md) — 403 的逐条实测记录与信封原文。
