# Workspace

体验分跨仓开发工作区的项目拓扑和仓库定位。需要判断代码、文档、前端、后端、BFF、数据服务或本地辅助工具所在位置时，先应用本文件。

## 项目信息

- 项目名称：`ecology_score_dev`
- Git 仓库：`git@code.byted.org:ecom/ecology_score_dev.git`
- 项目定位：体验分跨仓开发工作区，聚合体验分知识库、前端 monorepo、后端/数据服务子模块和本地辅助工具。
- 仓库形态：Git 主仓 + `repos/` 下 4 个 Git submodule + 本地知识库/skills/packages。

## 仓库结构

```text
.
├── AGENTS.md                  # 根层推荐 skills
├── .gitmodules                # submodule 定义
├── score_kb/                  # 体验分跨仓知识库
├── repos/                     # 外部仓库子模块
│   ├── govern-public-fe-mono/ # 前端 monorepo，包含体验分 PC/H5 应用与领域 Kit
│   ├── governance_data/       # 通用数据聚合服务
│   ├── governance_seller_score/ # 体验分核心 RPC 服务
│   └── ecom_governance_shop_api/ # HTTP BFF 聚合层
├── skills/                    # 体验分相关本地 Codex skills
├── packages/                  # 本地辅助包/扩展
└── .agents/                   # 本地 Agent/skill 配置
```

## 子模块定位

| 路径                             | 仓库                                                  | 定位                                           |
| -------------------------------- | ----------------------------------------------------- | ---------------------------------------------- |
| `repos/govern-public-fe-mono`    | `git@code.byted.org:ecom/govern-public-fe-mono.git`   | 前端 monorepo，包含体验分 PC/H5 应用与领域 Kit |
| `repos/governance_data`          | `git@code.byted.org:ecom/governance_data.git`         | 通用数据聚合服务                               |
| `repos/governance_seller_score`  | `git@code.byted.org:ecom/governance_seller_score.git` | 体验分核心 RPC 服务                            |
| `repos/ecom_governance_shop_api` | `git@code.byted.org:bam/ecom_governance_shop_api.git` | HTTP BFF 聚合层                                |
