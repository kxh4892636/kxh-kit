export const ISSUE_STATUSES = Object.freeze(["pending", "in_progress", "blocked", "completed"]);

export const parseFrontmatter = (content) => {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) return null;

  const fields = new Map();
  for (const line of match[1].split(/\r?\n/)) {
    const field = line.match(/^([a-z_]+):(.*)/);
    if (field) fields.set(field[1], field[2].trim());
  }
  return { fields, match };
};

export const parseIssueDependencies = (rawValue) => {
  if (rawValue === undefined) return { kind: "missing" };

  let value;
  try {
    value = JSON.parse(rawValue);
  } catch (error) {
    return {
      detail: error instanceof Error ? error.message : String(error),
      kind: "invalid_json",
    };
  }
  if (!Array.isArray(value) || value.some((dependency) => !/^\d{2}$/.test(dependency))) {
    return { kind: "invalid_value" };
  }
  return { dependencies: value, kind: "valid" };
};

export const deriveSpecStatus = (issues) => {
  if (issues.every((issue) => issue.status === "pending")) return "pending";
  if (issues.every((issue) => issue.status === "completed")) return "completed";
  return "in_progress";
};
