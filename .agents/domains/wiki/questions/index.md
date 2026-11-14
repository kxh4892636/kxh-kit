# Questions

<!-- 由 nano_flow_check 生成，请勿手改 -->

| Name | Description |
| --- | --- |
| [001-MDX把doc后缀解析成textDirective](001-MDX把doc后缀解析成textDirective.md) | 导图里写成 doc:<uuid> 的跳转依据会被 MDX 的指令语法吃掉，解析时要先把 textDirective 还原成 :name 才拼得回文档 id。 |
| [002-本地起wiki站验收的两个陷阱](002-本地起wiki站验收的两个陷阱.md) | wiki 的 dev server 只监听 [::1]，用 127.0.0.1 打不开；用 Invoke-WebRequest 探深链或纯 HTML 路由会拿到 404，探针结果不代表站点坏了。 |
| [003-doc引用写错为什么build不报错](003-doc引用写错为什么build不报错.md) | doc:<id> 只校验「写了没有」，不再校验目标文档存在：id 拼错 build 照样通过，点击落到 404，唯一兜底是人工点一遍。 |
| [004-导图样式为什么以字符串注入](004-导图样式为什么以字符串注入.md) | vp pack 解析不了 CSS import，导图样式改成一个 styles.ts 字符串 + <style> 注入；mindmap-block.css 仍是正本，单测比对两者防漂移。 |
