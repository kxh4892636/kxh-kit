---
name: '003-commit时文件被自动改写'
description: '提交钩子会在 commit 前对暂存文件执行 vp check --fix 并重新暂存。'
---

# 003-commit时文件被自动改写

## 适用条件与现象

`git commit` 输出 `Running tasks for staged files… vp check --fix`，提交后工作区文件或暂存内容发生变化。

## 原因

根 `vite.config.ts` 的 `staged: { "*": "vp check --fix" }` 在提交前对暂存文件执行格式化与 lint 修复，并重新暂存。

## 解决方法

以钩子修复后的结果为准；提交后再看一次 `git status` 确认没有残留改动，不要重复手动格式化。需要保留未格式化内容时不要暂存该文件。

## 验证

`git show --stat HEAD` 与 `git status --short` 一致，且没有未暂存的额外改动。

## 来源

[vite.config.ts](../../../../vite.config.ts)
