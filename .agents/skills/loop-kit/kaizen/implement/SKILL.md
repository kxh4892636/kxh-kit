---
name: implement
description: "根据 spec 或 issues 实现一项工作."
disable-model-invocation: true
---

实现用户在 spec 或 issues 中描述的工作.

尽可能在预先商定的 seams 上使用 /tdd.

使用 /verifying, 定期运行 typechecking 和单个测试文件, 并在最后运行一次完整 test suite.

完成后, 使用 /code-review 审查这项工作.

将你的工作 commit 到当前 branch.
