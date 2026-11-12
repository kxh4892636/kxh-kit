---
id: 1428a046-9b04-4b84-8b09-bdb8b2d52f78
---

# 循环与 switch 的汇编

## 循环语句怎样翻译成条件分支？

- 思路: 把循环统一改写成条件测试加回跳的结构;

```c
// do-while
loop:
  body-statement;
  t = test-expr;
  if (t) goto loop;

// while
  t = test-expr;
  if (!t) goto done;
loop:
  body-statement;
  t = test-expr;
  if (t) goto loop;
done:

// for
  init-expr;
  t = test-expr;
  if (!t) goto done;
loop:
  body-statement;
  update-expr;
  t = test-expr;
  if (t) goto loop;
done:
```

- 结论: 三种循环在机器级只是测试位置不同的同一结构;

## switch 语句为什么比一串 if 更快？

- 跳转表: 由代码段地址构成、用下标直接索引的数组;
- 翻译: switch 被译成一次边界检查和一条跳转表取址;
- 收益: 分支数增加时仍只做常数次操作;
