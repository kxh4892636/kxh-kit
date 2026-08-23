---
name: implement
description: "根据 spec 或 issues 实现工作."
---

实现用户在 spec 或 issues 中描述的工作.

由 `/loop-x` 进入时, 保留传入的 `plan-path` 和 `session-id`: 主路径使用 `record-plan`, 接入路径还保留 `issue-id` 并使用 `record-issue`. 进入本 skill 后立即登记 `/implement=started`, 然后只执行脚本返回的 `next_skill` 或 `next_action`; `/tdd`, `/verifying`, `/code-review` 和最终 commit 动作每一步实际完成后都登记 receipt. 直接调用本 skill 且不属于 `/loop-x` 路径时忽略此运行态协议.

开始前使用 `/dev-gate`. 只有其结论为 `ready` 时才进入实现; 以确认后的交付终点约束范围, 以确认后的门禁作为 `/verifying` 输入. 基线发生实质漂移时, 返回 `/dev-gate` 更新并重新确认.

尽可能在预先商定的 seams 上使用 `/tdd`.

使用 `/verifying`, 定期运行 typechecking 和单个测试文件, 并在最后运行一次完整 test suite.

完成后, 使用 `/code-review` 审查这项工作.

将你的工作 commit 到当前 branch.

遇到 block 卡点, 首先在对应业务域 workflow 中寻找可能的解决方法.
