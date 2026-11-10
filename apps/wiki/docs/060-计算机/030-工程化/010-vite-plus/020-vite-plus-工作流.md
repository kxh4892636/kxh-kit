---
id: 0f14f949-1512-4736-82c4-3c9a86e7bf11
---

# Vite+ 工作流

## 新建或迁移项目后如何验证最小开发流程？

- 创建: `vp create` 生成项目, 随后进入生成的目录执行其余命令;
- 最小门禁: 装依赖后依次执行检查、测试与构建;
- 各自证明: 静态质量、运行时行为、生产产物;
- 旧项目: 已有 Vite 项目从根目录执行 `vp migrate`;
- 迁移之后: 审查配置与依赖差异, 再跑同一组检查、测试与构建;

```bash
vp create
cd <生成的项目目录>
vp install
vp dev

vp check
vp test
vp build
vp preview
```

## 如何运行一次测试或持续监听测试？

- 测试导入: 从 `vite-plus/test` 导入 `describe`、`it`、`expect` 等 API;
- 背后: 由 Vite+ 转出项目配套的 Vitest;
- 默认模式: `vp test` 运行一次就退出;
- 监听模式: `vp test watch` 持续监听文件变化;
- 文档依据: [Vite+ Test](https://viteplus.dev/guide/test);
- 边界: 单次执行是 `vp` 的行为, 不能套用独立 Vitest 的默认模式;

## 如何把暂存文件检查接入 Git 提交？

- 提交检查: 在 `staged` 中配置暂存文件规则;
- 接线: 用 `vp config` 安装 Git hook;
- 执行者: 提交时由 `vp staged` 执行规则;
- 范围: 只处理准备提交的文件, 代替不了跨包测试与构建;
- 自动修正: 规则带 `--fix` 会修改文件内容;
- 提交前: 核对修正后的差异;
- 失败处理: 先修正并重新暂存, 再提交;
- 误区: 一次本地提交成功不等于所有交付条件满足;

## CI 如何按顺序验证依赖、代码与构建产物？

- CI 安装: 用 `voidzero-dev/setup-vp@<精确版本>` 装 Vite+;
- 同时准备: Node.js、包管理器与依赖缓存;
- CI 顺序: 先装依赖, 再执行检查、测试与构建;
- 失败即停: 前一步失败就中断交付;
- 版本固定: 把占位符换成所选发布版本或提交 SHA;
- 依据: [官方 CI 文档](https://viteplus.dev/guide/ci);
- 文档要点: `v1` 标签不再接收更新;

## CI 如何保证环境一致与排查边界？

- 安装一致性: CI 使用仓库声明的包管理器与锁文件;
- 目的: 本地与构建环境不解析到不同依赖;
- 构建入口: `vp build` 适用于 Vite 应用;
- 例外: 项目已有 Docusaurus 等构建脚本时用 `vp run build`;
- 证据边界: 检查通过只说明本次命令覆盖的范围通过;
- 排查时: 仍需核对缓存、过滤条件与环境差异;

```yaml
- uses: voidzero-dev/setup-vp@<精确版本>
- run: vp install
- run: vp check
- run: vp test
- run: vp build
```
