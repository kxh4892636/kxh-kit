# wiki

## 技术栈与架构入口

- Docusaurus 3 知识库，使用 React、TypeScript、MD/MDX 文档和本地搜索。
- `docusaurus.config.ts` 是站点配置入口，定义 docs preset、navbar、搜索、KaTeX 和 `@kxh-awesome/docusaurus-plugin-link`。
- `sidebars.ts` 是文档侧边栏入口，当前按目录自动生成。
- `src/pages/index.tsx` 是首页入口；`src/pages/` 下的文件会形成 Docusaurus 页面路由。

## 关键模块

- `docs/`：知识库正文，目录名和 `README.md` 会影响文档路由与侧边栏。
- `sidebars.ts`：文档分类和自动生成边界，新增顶级栏目时先看这里。
- `docusaurus.config.ts`：站点 URL、docs 路径、插件、搜索、主题和导航配置。
- `src/pages/`：自定义页面路由，不走 docs sidebar。
- `src/components/`：首页和主题内复用组件。
- `src/css/custom.css`：站点全局样式。
- `static/`：Docusaurus 静态资源。

## 路由

- `/` 来自 `src/pages/index.tsx`。
- `/project/`、`/resume/` 等自定义页面来自 `src/pages/*`。
- `/docs/` 及其子路由来自 `docs/`，侧边栏由 `sidebars.ts` 自动生成。
- `@kxh-awesome/docusaurus-plugin-link` 会读取 docs front matter `id` 并生成短链接跳转路由；修改 front matter 时注意唯一性。

## 依赖关系

- 依赖 workspace package `@kxh-awesome/docusaurus-plugin-link` 生成短链接路由。
- 不依赖本仓库后端服务。

## 项目命令

- `vp run start`：启动 Docusaurus 开发服务器。
- `vp run build`：构建站点。
- `vp run typecheck`：运行 TypeScript 检查。
- `vp run serve`：本地预览构建产物。
- `vp run clear`：清理 Docusaurus 缓存。

## 生成物

- `.docusaurus/` 和 `build/` 是生成物，不手动编辑。
- `node_modules/` 不手动编辑。

## 验证方式

- 只改普通 Markdown 内容时，人工复核标题、链接、图片路径和 front matter 即可。
- 改 `docusaurus.config.ts`、`sidebars.ts`、`src/` 或影响导航/路由的文档时，运行 `vp run build`。
- 改 TypeScript 组件或配置类型时，运行 `vp run typecheck`。
