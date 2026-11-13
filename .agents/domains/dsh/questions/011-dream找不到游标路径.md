---
name: '011-dream找不到游标路径'
description: '在 PTC 会话里调 nano_flow_dream 报找不到游标路径：默认走 $DSH_HOME，工具进程没有该变量时改传 statePath。'
---

# 011-dream找不到游标路径

## 现象

nano-flow 会话按提示词调 `nano_flow_dream({ action: "scan" })` 直接失败：

```text
找不到游标路径：设置 DSH_HOME 或传 --state
```

同时 `bash` 里 `echo $DSH_HOME` 明明有值，容易判成「路径配错了」。

## 原因

游标默认路径是 `$DSH_HOME/toolkit/nano-flow-dream.json`，由 `scan.mjs` 的 `defaultStatePath()` 读 `process.env.DSH_HOME` 得到。PTC 会话里工具绑定在 `run_code` 的程序进程内执行，那里 `process.env` 是空的；`bash` 是另一个进程，环境变量照常继承。所以同一个会话里「bash 有、工具没有」。

## 解决

1. 用 `bash` 确认宿主 home：`echo $DSH_HOME`（本机为 `~/.dsh`）。
2. `scan` 与 `mark` 都显式传绝对路径：`statePath: "<home>/.dsh/toolkit/nano-flow-dream.json"`。
3. 不要在提示词里写死 profile 路径——工具参数化就是为此。

## 验证

- 传 `statePath` 后 `scan` 报告首行会带「游标：<path>」；同样参数调 `mark` 回「已推进游标：<path>」。
- 不传仍报同一句，即证明是环境变量问题，不是工作区或 Plan 路径问题。

## 相关

- [dream 游标](../CONTEXT.md) — 游标格式（按 Plan + 会话记 seq 上界）与只前进语义。
- [008-dream输入扫描改为脚本](../plans/reference/2026-11-13-dsh与pi对齐/008-dream输入扫描改为脚本.md) — 游标路径与 seq 口径的来源。
