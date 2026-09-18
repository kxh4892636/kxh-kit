export const NOTE_STATUSES = Object.freeze(["pending", "in_progress", "blocked", "completed"]);

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

export const parseNoteDependencies = (rawValue) => {
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
  if (
    !Array.isArray(value) ||
    value.some((dependency) => typeof dependency !== "string" || !/^\d{2}$/.test(dependency))
  ) {
    return { kind: "invalid_value" };
  }
  return { dependencies: value, kind: "valid" };
};

export const deriveSpecStatus = (notes) => {
  if (notes.every((note) => note.status === "pending")) return "pending";
  if (notes.every((note) => note.status === "completed")) return "completed";
  return "in_progress";
};
