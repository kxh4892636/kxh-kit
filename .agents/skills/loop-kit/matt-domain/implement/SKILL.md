---
name: implement
description: "Implement a piece of work based on a spec or set of tickets."
disable-model-invocation: true
---

Implement the work described by the user in the spec or tickets.

Use /tdd where possible, /e2e optional (user confirm), at pre-agreed seams.

Use /verifying, run typechecking regularly, single test files regularly, e2e tests regularly, and the full test suite once at the end.

Once done, use /code-review to review the work.

Commit your work to the current branch.
