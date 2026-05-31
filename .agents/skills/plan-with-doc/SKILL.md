---
name: plan-with-doc
description: 创建、校准或沉淀计划、路线图、技术方案和实施文档；需要在仓库 nano/ 输出 Markdown 时优先使用。触发：plan、roadmap、implementation plan、technical proposal、handoff、决策记录、项目计划、方案文档。
---

# Plan With Doc

Use this skill to turn uncertain work into a concise, verifiable plan document.

## Completion Criteria

The task is complete when:

- The target outcome, constraints, and out-of-scope items are clear.
- The plan captures the conversation context another agent needs to continue without losing state.
- Open questions are answered, verified from available sources, or marked as assumptions.
- Dependent decisions are resolved branch-by-branch through the design tree.
- The plan is split into executable steps with feedback points and key risks.
- Any generated Markdown document is saved to `nano/yyyymmdd-<content-summary>.md` at the repository root.

## Workflow

1. Define what "done" means before choosing an approach.
2. Gather facts from the user-provided materials and relevant source files; label facts, assumptions, and judgment separately. If a question can be answered by checking available context, verify it instead of asking.
3. Map the design tree: list the major branches, their dependencies, and the next decision that unlocks the most progress.
4. Walk down each branch in dependency order, resolving one decision before using it as the basis for later decisions.
5. Ask exactly one question at a time when feedback is needed. Include your recommended answer and wait for the user's response before asking the next question or finalizing that branch.
6. Build the plan as a sequence of minimal actions with validation points.
7. Capture handoff context: goal, constraints, decisions, assumptions, open questions, relevant artifacts, and suggested skills/tools when useful.
8. Write the document only after the plan is actionable enough for the next step.

## Document Rules

- Create `nano/` if it is missing. Do not modify unrelated files.
- Do not read or open existing files in `nano/`; they are not context for the current task.
- Include the current plan conversation context needed for another agent to take over.
- Reference existing artifacts by path or URL instead of duplicating them; redact secrets and sensitive personal data.
- Every generated Markdown plan must include a `## TaskList` section.
- Structure all other Markdown sections according to the task; do not force a fixed template.

## Style

- Keep the document short, concrete, and testable.
- Prefer one high-leverage question over a broad questionnaire; never batch several unresolved decisions into one prompt.
- When asking, include the recommendation first, then the question.
- Omit background that does not affect the plan.
- Stop planning when the next action is clear; avoid over-planning reversible decisions.
