---
id: 1783a6cb-0b13-473e-ada3-19d411a9ed06
---

# src 与 href 的区别

## src 指定什么，何时加载？

- 语义: 指定要嵌入当前元素的外链资源路径;
- 标签: `img`、`script`、`iframe`;
- 时机: 浏览器解析到该标签时立即下载并填入;

```html
<img src="favicon144.png" alt="Visit the MDN site" />
<script src="my-js-file.js" defer></script>
```

## href 指定什么，何时生效？

- 语义: 指定引用的目标路径;
- 标签: `a`、`link`;
- 时机: 解析到标签时只建立引用关系, 由用户操作或资源使用触发;

```html
<a href="https://www.mozilla.com">Mozilla</a> <link rel="stylesheet" href="my-css-file.css" />
```

- `a` 的 href: 用户点击后跳转到该 URL;
- `link` 的 href: 作为外部资源被文档引用;

## 两者如何区分选用？

| 属性   | 关系        | 结果                       | 典型标签                  |
| ------ | ----------- | -------------------------- | ------------------------- |
| `src`  | 嵌入/替换   | 资源立即取回, 成为页面内容 | `img`、`script`、`iframe` |
| `href` | 引用/超链接 | 建立指向关系, 不立即取回   | `a`、`link`               |

- 判断依据: 问资源是否构成当前页面内容, 是则用 `src`, 否用 `href`;
