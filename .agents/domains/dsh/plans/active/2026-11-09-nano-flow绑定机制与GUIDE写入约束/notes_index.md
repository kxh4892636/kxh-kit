# Notes Index

<!-- 由 nano_flow_check 生成，请勿手改 -->

| Name | Description | Related Note |
| --- | --- | --- |
| [001-梳理会话Plan绑定机制](001-梳理会话Plan绑定机制.md) | 查清绑定表、写入时机、消费方与当前缺陷，给出依赖清单。 | 002-为GUIDE增加仅dream可写约束 |
| [002-为GUIDE增加仅dream可写约束](002-为GUIDE增加仅dream可写约束.md) | 确定 GUIDE 的写入边界与空模板初始化：正文只由 dream 维护，create 只补空文件。 | 001-梳理会话Plan绑定机制, 003-提供Plan绑定工具 |
| [003-提供Plan绑定工具](003-提供Plan绑定工具.md) | 新增 nano_flow_bind：同一会话只保留一个绑定，再次调用即切换，并让看板与 log 跟随。 | 001-梳理会话Plan绑定机制, 002-为GUIDE增加仅dream可写约束 |
| [004-移除全部隐式绑定路径](004-移除全部隐式绑定路径.md) | 删除 check、plan-log 与轮转的自动绑定，绑定表只剩 nano_flow_bind 一个写入口。 | 001-梳理会话Plan绑定机制, 003-提供Plan绑定工具, 005-收敛绑定表生命周期与遗留缺陷, 006-清理超长Plan描述 |
| [005-收敛绑定表生命周期与遗留缺陷](005-收敛绑定表生命周期与遗留缺陷.md) | 处理 R3 迁移后绑定失效、R4 死条目回收、R6 cwd 漂移与 R7 死代码，让绑定表可持续维护。 | 001-梳理会话Plan绑定机制, 004-移除全部隐式绑定路径 |
| [006-清理超长Plan描述](006-清理超长Plan描述.md) | 21 个 archived/reference Plan 的 spec description 超过 144 字，定下修剪或放宽校验并落地。 | — |
