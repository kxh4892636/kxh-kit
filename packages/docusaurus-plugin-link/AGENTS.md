# docusaurus-plugin-link

## 技术栈与架构入口

- Docusaurus 3 plugin package，TypeScript + Vite+ package build。
- `src/index.ts` 是 plugin 默认导出入口。
- `package.json#exports` 导出 plugin 主入口、`./redirect` 和 `./package.json`。

## 关键模块

- `src/index.ts`：校验 options、读取 docs 内容、向 Docusaurus 注册短链接跳转路由。
- `src/content.ts`：递归读取 Markdown/MDX、解析 front matter、发现重复 id。
- `src/path.ts`：根据 docs source、front matter `id`/`slug` 计算 canonical docs permalink 和短链接路径。
- `src/number-prefix.ts`：处理数字前缀目录。
- `src/redirect.tsx`：短链接路由渲染的重定向组件。
- `tests/path.test.ts`：核心路径计算和重复 id 行为测试锚点。

## 项目命令

- `vp run build`：构建 package。
- `vp run dev`：watch 构建。
- `vp run test`：运行测试。
- `vp run check`：运行 Vite+ 检查。
- `vp run prepublishOnly`：发布前构建。

## 生成物

- `dist/` 和 `node_modules/` 不手动编辑。

## 验证方式

- 改路径计算、front matter 或重复 id 逻辑时运行 `vp run test`。
- 改 plugin 导出或 Docusaurus 集成时运行 `vp run build`，并在 `apps/wiki` 运行 `vp run build`。
- 改类型、格式或 lint 相关内容时运行 `vp run check`。
