---
id: 54d07beb-ebaf-47e0-aad6-9aa18741866e
---

# DevTools 综述

React DevTools 与 Performance tracks 的概览。

## React DevTools 的作用是什么?

- 检查 React 组件树, 查看与编辑 props / state;
- 定位重渲染与性能问题;

## React DevTools 如何安装?

- 浏览器扩展: Chrome, Firefox, Edge 等;
- React Native: 通过 DevTools 菜单连接;

## Components 面板能做什么?

- 查看组件层级、props、state、hooks;
- 高亮更新: 显示哪些组件发生了重渲染;

## Profiler 面板用来做什么?

- 记录渲染耗时, 找出性能瓶颈;
- 生产环境需使用 profiling build 才能查看性能数据;

## Performance tracks 展示哪些 React 专属时间线?

- 浏览器 Performance 面板中的 React 专属时间线;
- 展示 Scheduler、Renders、Cascading updates、Components 等;

## React DevTools 与 StrictMode、ESLint 如何配合?

- 开发环境默认启用, StrictMode 的额外检查可帮助发现不纯渲染;
- 与 ESLint 一起发现并修复问题;
