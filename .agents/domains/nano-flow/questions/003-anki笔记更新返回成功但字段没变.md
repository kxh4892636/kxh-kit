---
name: '003-anki笔记更新返回成功但字段没变'
description: 'Anki 浏览器占用笔记时写入可能静默失败。'
---

# 003-anki笔记更新返回成功但字段没变

## 适用条件与现象

笔记正在 Anki 浏览器中打开时执行更新，命令成功但字段未生效。

## 原因

Anki 浏览器占用该笔记时，上游写入可能静默失败。

## 解决方法

让用户关闭浏览器或切走后再更新；结果异常时先排除这一点。

## 验证

`nnf anki notes info --note-id <id>` 复核字段。

## 来源

[anki.md](../../../../packages/nano-flow/skills/nano-flow-cli/references/anki.md)
