---
title: Golang
description: 面经高频Golang题 18 道，按知识体系分成 3 组，组内按出现次数降序。
sidebar_position: 8
---

# Golang

面经统计共 18 道，按知识体系分成 3 组，组内按出现次数降序。
数据来源 [osjobs Top K](https://osjobs.net/topk/)，抓取于 2026-11-12。

## 并发与调度（12）

- 18 - 简单介绍 GMP 模型以及该模型的优点
- 16 - 简述 Goroutine 的调度流程
- 14 - 协程与进程，线程的区别是什么？协程有什么优势？
- 6 - 有缓存的管道和没有缓存的管道区别是什么？
- 6 - Channels 怎么保证线程安全？
- 4 - Maps 是线程安全的吗？怎么解决它的并发安全问题？
- 4 - Golang 的一个协程能保证绑定在一个内核线程上吗？
- 4 - Golang 的协程可以自己主动让出 CPU 吗？
- 4 - Golang 的协程通信方式有哪些？
- 4 - 简述 Golang 的伪抢占式调度
- 4 - 什么是 goroutine 泄漏
- 4 - groutinue 什么时候会被挂起？

## 内存与 GC（2）

- 24 - 简述 Golang 垃圾回收的机制
- 8 - 两次 GC 周期重叠会引发什么问题，GC 触发机制是什么样的？

## 语言基础（4）

- 26 - 简述 slice 的底层原理，slice 和数组的区别是什么？
- 22 - 简述 defer 的执行顺序
- 10 - Golang 是如何实现 Maps 的？
- 8 - Golang 有哪些优缺点、错误处理有什么优缺点？
