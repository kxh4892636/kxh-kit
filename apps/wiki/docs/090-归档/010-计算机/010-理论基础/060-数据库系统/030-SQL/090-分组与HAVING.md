---
id: cf6f5d82-5fec-4f27-9f55-309c2e5292f8
---

# 分组与 HAVING

## GROUP BY 怎样分组？

- 作用: 按 GROUP BY 子句列出的属性把关系划分成若干组;
- 聚集范围: 聚集操作符分别作用在每个分组上, 而不是整张表;
- 输出: 每个分组产生一行结果;

```sql
SELECT studioName, SUM(length)
FROM Movies
GROUP BY studioName;
```

## NULL 在分组中怎样处理？

- 规则: NULL 在分组时作为一般取值看待, 不会被跳过;
- 结果: 所有该属性为 NULL 的元组落进同一组;
- 对比: 聚集计算本身会忽略 NULL, 见 [重复与聚集](./080-重复与聚集.md);

## HAVING 与 WHERE 有什么区别？

| 维度     | WHERE        | HAVING                 |
| -------- | ------------ | ---------------------- |
| 作用时机 | 分组之前     | GROUP BY 之后          |
| 筛选对象 | 单个元组     | 分组                   |
| 条件内容 | 属性上的条件 | 通常是聚集结果上的条件 |

```sql
SELECT name, SUM(length)
FROM MovieExec, Movies
WHERE producerC = cert
GROUP BY name
HAVING MIN(year) < 1930;
```

（source: 050-sql.md §全关系操作/§分组/§分组, 聚集和空值/§HAVING 子句）
