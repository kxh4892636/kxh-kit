---
name: implement
description: "根据 spec 或 issues 实现工作."
---

实现用户在 spec 或 issues 中描述的工作.

携带 flow context 进入时, 完整读取 [`FLOW.md`](../../FLOW.md) 并按共享协议推进和登记; 直接调用本 skill 且不属于 Flow 时忽略该协议.

开始前使用 `/dev-gate`. 只有其结论为 `ready` 时才进入实现; 以确认后的执行契约, 以确认后的门禁作为 `/verifying` 输入. 基线发生实质漂移时, 返回 `/dev-gate` 更新并重新确认.

尽可能在预先商定的 seams 上使用 `/tdd`.

使用 `/verifying`, 定期运行 typechecking 和单个测试文件, 并在最后运行一次完整 test suite.

完成后, 使用 `/code-review` 审查这项工作.

将你的工作 commit 到当前 branch.

遇到 block 卡点, 首先在对应业务域 workflow 中寻找可能的解决方法.
