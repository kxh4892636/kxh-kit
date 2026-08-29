import assert from "node:assert/strict";
import path from "node:path";
import { describe, test } from "vitest";

import {
  countLines,
  deriveSpecStatus as deriveDocumentStatus,
  hasSection,
  isValidDate,
  parseDependencies as parseDocumentDependencies,
  parseFrontmatter as parseDocumentFrontmatter,
  parseIssueTable,
} from "./check-domain.mjs";
import {
  blockedBody,
  deriveSpecStatus,
  hasDeliveryEvidence,
  leaseIsActive,
  leaseSeconds,
  normalizePlanPath,
  normalizeSkill,
  optionValues,
  parseCli,
  parseDependencies,
  parseFrontmatter,
  requireOption,
  validateState,
} from "./flow.mjs";

describe("domain document parsers", () => {
  test.each([
    ["", 0],
    ["one", 1],
    ["one\n", 1],
    ["one\ntwo", 2],
    ["one\r\ntwo\r\n", 2],
  ])("counts lines in %j", (content, expected) => {
    assert.equal(countLines(content), expected);
  });

  test("frontmatter requires exact fences and trims exact field values", () => {
    const errors = [];
    assert.deepEqual(
      [...parseDocumentFrontmatter("---\r\nstatus:  pending  \r\n---\r\nbody", "doc", errors, ".")],
      [["status", "pending"]],
    );
    assert.deepEqual(
      [...parseDocumentFrontmatter("---\nstatus:pending\n---", "doc", errors, ".")],
      [["status", "pending"]],
    );
    assert.deepEqual(errors, []);

    for (const invalid of [
      "prefix\n---\nstatus: pending\n---\n",
      "---\nstatus: pending\n---suffix",
      "---\nStatus: pending\n---\n",
      "---\nstatus pending\n---\n",
    ]) {
      const invalidErrors = [];
      const fields = parseDocumentFrontmatter(invalid, "doc", invalidErrors, ".");
      if (invalid.startsWith("---\n") && invalid.endsWith("---\n")) {
        assert.deepEqual([...fields], []);
      } else {
        assert.equal(invalidErrors.length, 1);
      }
    }
  });

  test("dependency and date parsers enforce complete values", () => {
    const errors = [];
    assert.deepEqual(parseDocumentDependencies('["01", "99"]', "doc", errors, "."), ["01", "99"]);
    for (const raw of [undefined, '"01"', '["1"]', '["001"]', "[1]", "not-json"]) {
      const before = errors.length;
      assert.deepEqual(parseDocumentDependencies(raw, "doc", errors, "."), []);
      assert.equal(errors.length, before + 1);
    }
    for (const valid of ["2000-02-29", "2026-01-01", "9999-12-31"]) {
      assert.equal(isValidDate(valid), true);
    }
    for (const invalid of [
      "2026-02-29",
      "2026-00-01",
      "2026-01-00",
      "2026-13-01",
      "2026-01-32",
      "x2026-01-01",
      "2026-01-01x",
    ]) {
      assert.equal(isValidDate(invalid), false);
    }
  });

  test("issue table parser anchors rows and preserves every captured column", () => {
    const valid = "| 01 | [First](01-first.md) | blocked | 02, 03 | next |";
    assert.deepEqual(
      [...parseIssueTable(valid)],
      [["01", { dependencies: ["02", "03"], fileName: "01-first.md", status: "blocked" }]],
    );
    for (const dependencyCell of ["—", "-", ""]) {
      const row = `| 01 | [First](nested/01-first.md) | pending | ${dependencyCell} | next |`;
      assert.deepEqual(parseIssueTable(row).get("01"), {
        dependencies: [],
        fileName: "01-first.md",
        status: "pending",
      });
    }
    for (const row of [
      "|01|[First](01-first.md)|pending|—|",
      "|   01   |   [First](01-first.md)   |   pending   |   —   |",
    ]) {
      assert.deepEqual(parseIssueTable(row).get("01"), {
        dependencies: [],
        fileName: "01-first.md",
        status: "pending",
      });
    }
    for (const invalid of [
      "x| 01 | [First](01-first.md) | pending | — | next |",
      "| 1 | [First](01-first.md) | pending | — | next |",
      "| 01 | [First](01-first.txt) | pending | — | next |",
      "| 01 | [First](01-first.md) | paused | — | next |",
    ]) {
      assert.equal(parseIssueTable(invalid).size, 0);
    }
  });

  test("document helpers distinguish sections and aggregate status", () => {
    assert.equal(hasSection("## 范围\n正文", "范围"), true);
    assert.equal(hasSection("prefix ## 范围\n正文", "范围"), false);
    assert.equal(hasSection("## 范围 extra", "范围"), false);
    assert.equal(deriveDocumentStatus([{ status: "pending" }, { status: "pending" }]), "pending");
    assert.equal(
      deriveDocumentStatus([{ status: "completed" }, { status: "completed" }]),
      "completed",
    );
    assert.equal(
      deriveDocumentStatus([{ status: "pending" }, { status: "completed" }]),
      "in_progress",
    );
  });
});

describe("flow parsers", () => {
  test("normalizes skills, required options, and repeated option values", () => {
    assert.equal(normalizeSkill("/code-delivery"), "code-delivery");
    assert.equal(normalizeSkill("code-delivery"), "code-delivery");
    assert.equal(normalizeSkill("nested/code-delivery"), "nested/code-delivery");
    assert.equal(normalizeSkill(undefined), undefined);
    assert.equal(requireOption({ plan: "  docs/plan  " }, "plan"), "docs/plan");
    for (const value of [undefined, null, 1, "", "   "]) {
      assert.throws(() => requireOption({ plan: value }, "plan"), /缺少 --plan/);
    }
    assert.deepEqual(optionValues({ evidence: ["a", "b"] }, "evidence"), ["a", "b"]);
    assert.deepEqual(optionValues({ evidence: "a" }, "evidence"), ["a"]);
    assert.deepEqual(optionValues({ evidence: 1 }, "evidence"), []);
  });

  test("validates lease and plan boundaries", () => {
    assert.equal(leaseSeconds({}), 1800);
    for (const value of ["30", "86400"])
      assert.equal(leaseSeconds({ "lease-seconds": value }), Number(value));
    for (const value of ["29", "86401", "30.5", "x", ""]) {
      assert.throws(() => leaseSeconds({ "lease-seconds": value }), /30 到 86400/);
    }
    const workspace = path.resolve("workspace");
    assert.equal(normalizePlanPath(workspace, "."), ".");
    assert.equal(normalizePlanPath(workspace, "docs\\plan"), "docs/plan");
    assert.throws(() => normalizePlanPath(workspace, "../outside"), /工作区内/);
    assert.throws(() => normalizePlanPath(workspace, path.parse(workspace).root), /工作区内/);
  });

  test("只接受当前持久状态版本", () => {
    const current = { plans: {}, revision: 0, schema_version: 5 };
    assert.equal(validateState(current), current);
    const plan = {
      cursor: 0,
      issues: {},
      lease: null,
      phase: "planning",
      receipts: [],
    };
    assert.equal(validateState({ ...current, plans: { plan } }).plans.plan, plan);
    for (const invalid of [
      null,
      [],
      {},
      { ...current, revision: 0.5 },
      { ...current, plans: null },
      { ...current, schema_version: 3 },
      { ...current, plans: { plan: { ...plan, phase: "ready" } } },
      { ...current, plans: { plan: { ...plan, cursor: -1 } } },
      { ...current, plans: { plan: { ...plan, receipts: null } } },
    ]) {
      assert.throws(() => validateState(invalid), /格式无效/);
    }
  });

  test("parses frontmatter, dependencies, statuses, and delivery evidence", () => {
    assert.deepEqual(
      [...parseFrontmatter("---\nstatus:  pending  \nblocked_by: []\n---\n", "issue.md").fields],
      [
        ["status", "pending"],
        ["blocked_by", "[]"],
      ],
    );
    assert.deepEqual(
      [...parseFrontmatter("---\nstatus:pending\n---", "issue.md").fields],
      [["status", "pending"]],
    );
    assert.throws(
      () => parseFrontmatter("prefix\n---\nstatus: pending\n---\n", "issue.md"),
      /frontmatter/,
    );
    assert.deepEqual([...parseFrontmatter("---\nStatus: pending\n---\n", "issue.md").fields], []);
    assert.deepEqual(parseDependencies('["01", "02"]', "issue.md"), ["01", "02"]);
    for (const invalid of ['"01"', '["1"]', '["001"]', "[1]", "bad"]) {
      assert.throws(() => parseDependencies(invalid, "issue.md"), /blocked_by/);
    }
    assert.equal(deriveSpecStatus([{ status: "pending" }, { status: "pending" }]), "pending");
    assert.equal(deriveSpecStatus([{ status: "completed" }, { status: "completed" }]), "completed");
    assert.equal(deriveSpecStatus([{ status: "blocked" }]), "in_progress");
    assert.equal(hasDeliveryEvidence("## 交付记录\n交付物：包\n证据：测试\n"), true);
    assert.equal(
      hasDeliveryEvidence('## 交付物与证据\r\n  {"receipt":true}  \r\n交付物和证据\r\n'),
      true,
    );
    for (const invalid of [
      "prefix ## 交付记录\n交付物：包\n证据：测试",
      "## 交付记录 extra\n交付物：包\n证据：测试",
      '## 交付记录\n{"only":"receipt"}',
      "## 交付记录\n只有交付物",
      "## 交付记录\n只有证据",
    ]) {
      assert.equal(hasDeliveryEvidence(invalid), false);
    }
  });
});

describe("flow parsers", () => {
  test("replaces only the exact blocking section and appends after trimmed content", () => {
    const section = "## 阻塞记录\n\n- 障碍: new\n- 解除条件: ready\n";
    assert.equal(blockedBody("content   ", "new", "ready"), `content\n\n${section}`);
    assert.equal(
      blockedBody(
        "intro\n## 阻塞记录\n\n- 障碍: old\n- 解除条件: old\n## 后续\nkeep\n",
        "new",
        "ready",
      ),
      `intro\n${section}## 后续\nkeep\n`,
    );
    assert.equal(
      blockedBody("prefix ## 阻塞记录\nold", "new", "ready"),
      `prefix ## 阻塞记录\nold\n\n${section}`,
    );
  });

  test("CLI parser consumes pairs, aggregates evidence, and rejects incomplete tokens", () => {
    assert.deepEqual(parseCli([]), { command: "help", options: {} });
    assert.deepEqual(parseCli(["init", "--plan", "p", "--evidence", "a", "--evidence", "b"]), {
      command: "init",
      options: { evidence: ["a", "b"], plan: "p" },
    });
    for (const invalid of [
      ["init", "value"],
      ["init", "plan", "value"],
      ["init", "--plan"],
      ["init", "--plan", "--entry"],
    ]) {
      assert.throws(() => parseCli(invalid), /无法识别参数|缺少值/);
    }
  });

  test("lease activity uses the strict expiry boundary", () => {
    const now = new Date("2026-08-27T00:00:00.000Z");
    assert.equal(leaseIsActive(null, now), undefined);
    assert.equal(
      leaseIsActive({ expires_at: "2026-08-26T23:59:59.999Z", owner_session: "s" }, now),
      false,
    );
    assert.equal(leaseIsActive({ expires_at: now.toISOString(), owner_session: "s" }, now), false);
    assert.equal(
      leaseIsActive({ expires_at: "2026-08-27T00:00:00.001Z", owner_session: "s" }, now),
      true,
    );
  });
});
