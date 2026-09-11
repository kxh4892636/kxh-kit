---
id: 0f14f949-1512-4736-82c4-3c9a86e7bf11
---

# Vite+ 工作流

## 新建或迁移项目后如何验证最小开发流程？

- 创建流程: `vp create` 负责生成项目，随后进入生成的目录执行其余命令;
- 最小门禁: 安装依赖后依次执行检查、测试和构建，分别证明静态质量、行为与生产产物;

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

- 旧项目入口: 已有 Vite 项目从根目录执行 `vp migrate`，再审查配置与依赖差异，并执行同一组检查、测试与构建;

## 如何运行一次测试或持续监听测试？

- 测试导入: 普通测试从 `vite-plus/test` 导入 `describe`、`it`、`expect` 等 API，由 Vite+ 转出项目配套的 Vitest;
- 测试模式: `vp test` 默认运行一次；需要持续监听文件变化时使用 `vp test watch`;

- 文档依据: [Vite+ Test](https://viteplus.dev/guide/test)，这里的默认单次执行是 vp 的行为，不能直接套用独立 Vitest 的默认模式;

## 如何把暂存文件检查接入 Git 提交？

- 提交检查: 在 `staged` 中配置暂存文件规则，再用 `vp config` 安装 Git hook，提交时由 `vp staged` 执行规则;

- 执行范围: 暂存检查只处理准备提交的文件，不能代替需要跨包执行的测试与构建;
- 自动修正: staged 规则若使用 --fix，可能修改文件内容，提交前应核对修正后的差异;
- 失败处理: 检查失败时先修正并重新暂存，再提交，避免把一次本地提交成功当作所有交付条件都已满足;

## CI 如何按顺序验证依赖、代码与构建产物？

- CI 安装: GitHub Actions 使用 `voidzero-dev/setup-vp@<精确版本>` 安装 Vite+，并可同时准备 Node.js、包管理器与依赖缓存;
- CI 顺序: 先安装依赖，再执行检查、测试和构建；前一步失败就停止交付;

```yaml
- uses: voidzero-dev/setup-vp@<精确版本>
- run: vp install
- run: vp check
- run: vp test
- run: vp build
```

- 版本固定: 将占位符替换为所选发布版本或提交 SHA；[官方 CI 文档](https://viteplus.dev/guide/ci)已说明 `v1` 标签不再接收更新;

- 安装一致性: CI 使用仓库声明的包管理器与锁文件，避免本地与构建环境解析到不同依赖;
- 构建入口: CI 中的 vp build 适用于 Vite 应用；项目已有 Docusaurus 等构建脚本时应使用 vp run build 执行它;
- 证据边界: 检查通过说明本次命令覆盖的范围通过，缓存、过滤条件与环境差异仍应在排查问题时核对;
