import assert from "node:assert/strict";
import { describe, test } from "vitest";

import {
  deriveSpecStatus,
  ISSUE_STATUSES,
  parseFrontmatter,
  parseIssueDependencies,
} from "./plan-document.mjs";

describe("Plan document", () => {
  test("parses exact frontmatter fences and normalized field values", () => {
    const parsed = parseFrontmatter("---\r\nstatus:  pending  \r\nblocked_by: []\r\n---\r\nbody");
    assert.deepEqual(
      [...parsed.fields],
      [
        ["status", "pending"],
        ["blocked_by", "[]"],
      ],
    );
    assert.equal(parsed.match[0], "---\r\nstatus:  pending  \r\nblocked_by: []\r\n---\r\n");
    assert.equal(parseFrontmatter("---\nstatus: pending\n---").fields.get("status"), "pending");
    assert.equal(parseFrontmatter("prefix\n---\nstatus: pending\n---\n"), null);
    assert.deepEqual(
      [...parseFrontmatter("---\nStatus: pending\nstatus!: pending\ninvalid\n---\n").fields],
      [],
    );
  });

  test("classifies dependency syntax independently from caller error presentation", () => {
    assert.deepEqual(parseIssueDependencies('["01", "99"]'), {
      dependencies: ["01", "99"],
      kind: "valid",
    });
    assert.deepEqual(parseIssueDependencies(undefined), { kind: "missing" });
    assert.equal(parseIssueDependencies("not-json").kind, "invalid_json");
    for (const rawValue of ['"01"', '["1"]', '["001"]', "[1]"]) {
      assert.deepEqual(parseIssueDependencies(rawValue), { kind: "invalid_value" });
    }
  });

  test("derives the spec status from issue statuses", () => {
    assert.equal(deriveSpecStatus([{ status: "pending" }, { status: "pending" }]), "pending");
    assert.equal(deriveSpecStatus([{ status: "completed" }, { status: "completed" }]), "completed");
    assert.equal(deriveSpecStatus([{ status: "blocked" }, { status: "pending" }]), "in_progress");
  });

  test("publishes the complete issue status vocabulary", () => {
    assert.deepEqual(ISSUE_STATUSES, ["pending", "in_progress", "blocked", "completed"]);
  });
});
