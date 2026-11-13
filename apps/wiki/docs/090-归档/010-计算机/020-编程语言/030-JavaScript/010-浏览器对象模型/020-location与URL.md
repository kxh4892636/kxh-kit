---
id: 97e51062-f409-43d4-bba4-fdf9bacfe3ed
---

# location 与 URL

## location 对象保存哪些信息？

- 语义: 保存当前窗口文档的地址信息, `window.location` 与 `document.location` 指向同一对象;

| 属性                                  | 含义                       |
| ------------------------------------- | -------------------------- |
| `location.href`                       | 完整 URL, 可读写           |
| `location.protocol`                   | 协议 (含 `:`)              |
| `location.host` / `hostname` / `port` | 主机与端口 / 主机名 / 端口 |
| `location.origin`                     | 协议 + 主机名 + 端口       |
| `location.pathname`                   | 路径部分                   |
| `location.search`                     | 查询字符串 (含 `?`)        |
| `location.hash`                       | 片段标识 (含 `#`)          |
| `location.ancestorOrigins`            | 当前文档的所有祖先源       |

## 如何跳转与刷新页面？

| 方法                      | 行为                                 |
| ------------------------- | ------------------------------------ |
| `location.assign(url)`    | 加载新文档, 会在历史记录中新增条目   |
| `location.replace(url)`   | 用新文档替换当前文档, 不新增历史条目 |
| `location.reload(force?)` | 重新加载当前文档                     |
| `location.toString()`     | 返回 URL 字符串                      |

## 如何用 `URL` 对象构造与解析 URL？

- 定位: `URL` 是内置类, 只负责构造 / 解析 URL, 与网络请求无关;
- 前提: 没有任何网络方法强制要求 `URL` 对象, 字符串本身就够用, 但解析与拼接时 `URL` 更省事;

```js
new URL(url, [base]); // url 为完整地址或路径; base 为可选基准地址
```

- 完整地址: `new URL("https://javascript.info/profile/admin")`;
- 路径 + 基准: `new URL("/profile/admin", "https://javascript.info")`, 与上式等价;
- 相对已有 URL: `new URL("tester", new URL("https://javascript.info/profile/admin"))` → `.../profile/tester`;
- 传参: `URL` 对象可直接传给 `fetch`、`XMLHttpRequest` 等几乎所有接受 URL 的接口, 内部自动做字符串转换;

## `URL` 对象有哪些组件属性？

| 属性                  | 含义                                                  |
| --------------------- | ----------------------------------------------------- |
| `href`                | 完整 URL, 等同 `url.toString()`                       |
| `protocol`            | 协议, 含结尾 `:`                                      |
| `host`                | 主机名 (含端口)                                       |
| `pathname`            | 路径, 以 `/` 开头                                     |
| `search`              | 查询串, 以 `?` 开头                                   |
| `hash`                | 片段标识, 以 `#` 开头                                 |
| `origin`              | 协议 + 主机名 + 端口 (只读)                           |
| `username`/`password` | HTTP 认证信息, 少见: `http://login:password@site.com` |

- 典型解析: `new URL("https://javascript.info/url")` 得到 `protocol` = `https:`, `host` = `javascript.info`, `pathname` = `/url`;
- 可写: 改这些属性只改这个对象, 要生效需 `url.toString()` 或赋回 `location.href`;

## `URL` 与 `location` 是什么关系？

- 同名组件: `location` 也暴露 `protocol` / `host` / `pathname` / `search` / `hash` / `origin`, 含义与 `URL` 上的同名属性一致;
- 区别: `location` 绑定当前文档, 赋值 `location.href` 即导航; `URL` 只是独立的值对象, 怎么改都不影响页面;
- 配合用法: 用 `URL` 安全地改参数, 再写回 `location` 完成跳转;

```js
const url = new URL(location.href);
url.searchParams.set("page", "2");
location.href = url; // 赋值时自动转成字符串再导航
```

## URLSearchParams 如何解析查询字符串？

```js
const params = new URLSearchParams(location.search);
params.get("id"); // 读取第一个值
params.set("page", "2"); // 覆盖
params.toString(); // 序列化回查询字符串
```

| 方法/属性                                       | 作用                      |
| ----------------------------------------------- | ------------------------- |
| `append(name, value)`                           | 追加键值对                |
| `set(name, value)`                              | 设置键值, 覆盖该键其它值  |
| `get(name)` / `getAll(name)`                    | 读取第一个 / 全部值       |
| `has(name, value?)`                             | 是否存在该键 (或该键值对) |
| `delete(name, value?)`                          | 删除键或指定键值对        |
| `sort()`                                        | 按键名排序                |
| `size`                                          | 参数数量                  |
| `keys()` / `values()` / `entries()` / `forEach` | 遍历与迭代                |

## `URLSearchParams` 在 `URL` 上还有哪些细节？

- 入口: `url.searchParams` 返回 `URLSearchParams` 对象;
- 自动编码: 只写原始值, 序列化时自动编码 (`q=test me!` → `q=test+me%21`, `tbs=qdr:y` → `tbs=qdr%3Ay`);
- 重复键: `?user=John&user=Pete` 合法, 用 `getAll` 取全部;
- 可迭代: 遍历顺序即参数出现顺序, 取出的值是解码后的, 因此可像 `Map` 一样直接 `for...of`;
- 联动: 经 `url.searchParams` 修改后, `url.toString()` 立即反映新参数;
- 通用方法表 (`append` / `delete` / `get` / `has` / `set` / `sort` / `size`) 见上节;

## 为什么 `URL` 不需要手动编码非法字符？

- 标准: RFC3986 规定 URL 中允许出现哪些字符;
- 非法字符: 空格、非拉丁字母等必须替换为 `%` 加 UTF-8 字节的形式; 空格写成 `+` 是历史遗留的例外;
- 自动: 写入 `URL` 时只管给原始值, 转字符串时统一编码;
- 例: `new URL("https://ru.wikipedia.org/wiki/Тест")` 的路径与 `searchParams.set("key", "ъ")` 的值都被编码; 西里尔字母在 UTF-8 下占 2 字节, 故每个字母生成两个 `%..`;

## `encodeURI` 与 `encodeURIComponent` 该怎么选？

- 分工: `encodeURI` / `decodeURI` 面向整条 URL; `encodeURIComponent` / `decodeURIComponent` 面向单个组件 (参数、hash、路径段);
- `encodeURI`: 只编码 URL 中完全禁止的字符;
- `encodeURIComponent`: 在此基础上额外编码 `#` `$` `&` `+` `,` `/` `:` `;` `=` `?` `@`;
- 规则: 整条 URL 用 `encodeURI`; 参数名与值逐个用 `encodeURIComponent`, 除非确定只含合法字符;
- 反例: `?q=${encodeURI("Rock&Roll")}` → `?q=Rock&Roll`, 会被解析成 `q=Rock` 外加一个 `Roll` 参数; 换成 `encodeURIComponent` 才是 `q=Rock%26Roll`;
- 版本差异: `URL` / `URLSearchParams` 基于 RFC3986, `encode*` 系列基于过时的 RFC2396;
- 典型差异: IPv6 方括号 —— `encodeURI("http://[2607:f8b0:4005:802::1007]/")` 会把 `[` `]` 编码成 `%5B` `%5D`, `new URL(...)` 则原样保留;
- 结论: 这类场景少见, 日常 `encode*` 够用;
