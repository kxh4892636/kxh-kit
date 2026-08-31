import type { SkillInvocationPolicyLike } from "./contract.js";
import { parse as parseYaml } from "yaml";

const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** frontmatter 校验通过后的 skill 正文，解析规则与内建 filesystem provider 一致。 */
export interface ParsedSkill {
  name: string;
  description: string;
  whenToUse?: string;
  invocation: SkillInvocationPolicyLike;
  metadata?: Record<string, unknown>;
  content: string;
}

/**
 * 解析并校验一份 SKILL.md。文档不是 skill（缺少或无效 frontmatter、缺 name 或
 * description、name 非 kebab-case）时返回 undefined。
 * @param raw - 从磁盘读取的完整文件文本。
 * @returns 解析结果，无效时为 undefined。
 */
export const parseSkillText = (raw: string): ParsedSkill | undefined => {
  const parsed = parseFrontmatter(raw);
  if (parsed === undefined) return undefined;
  const name = dataString(parsed.data, "name");
  const description = dataString(parsed.data, "description");
  if (name === undefined || description === undefined) return undefined;
  if (!SKILL_NAME.test(name)) return undefined;
  let invocation: SkillInvocationPolicyLike;
  try {
    invocation = parseInvocationPolicy(parsed.data);
  } catch {
    return undefined;
  }
  return {
    name,
    description,
    ...optionalString(parsed.data, "whenToUse"),
    invocation,
    ...optionalMetadata(parsed.data),
    content: parsed.body.trim(),
  };
};

const parseFrontmatter = (
  raw: string,
): { data: Record<string, unknown>; body: string } | undefined => {
  const firstLineEnd = raw.indexOf("\n");
  if (firstLineEnd < 0) return undefined;
  const firstLine = raw.slice(0, firstLineEnd).replace(/\r$/, "");
  if (firstLine !== "---") return undefined;
  const start = firstLineEnd + 1;
  const closing = findClosingFrontmatter(raw, start);
  if (closing === undefined) return undefined;
  let parsed: unknown;
  try {
    parsed = parseYaml(raw.slice(start, closing.start));
  } catch {
    return undefined;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return undefined;
  return { data: parsed as Record<string, unknown>, body: raw.slice(closing.bodyStart) };
};

const findClosingFrontmatter = (
  raw: string,
  start: number,
): { start: number; bodyStart: number } | undefined => {
  let lineStart = start;
  while (lineStart <= raw.length) {
    const nextNewline = raw.indexOf("\n", lineStart);
    const lineEnd = nextNewline < 0 ? raw.length : nextNewline;
    const line = raw.slice(lineStart, lineEnd).replace(/\r$/, "");
    if (line === "---") {
      return { start: lineStart, bodyStart: nextNewline < 0 ? raw.length : nextNewline + 1 };
    }
    if (nextNewline < 0) return undefined;
    lineStart = nextNewline + 1;
  }
  return undefined;
};

const parseInvocationPolicy = (data: Record<string, unknown>): SkillInvocationPolicyLike => {
  rejectLegacyInvocationKey(data, "disableModelInvocation", "disable-model-invocation");
  rejectLegacyInvocationKey(data, "modelInvocable", "disable-model-invocation");
  rejectLegacyInvocationKey(data, "userInvocable", "user-invocable");
  const disableModelInvocation = frontmatterBoolean(data, "disable-model-invocation");
  const userInvocable = frontmatterBoolean(data, "user-invocable");
  return {
    modelInvocable: disableModelInvocation !== true,
    userInvocable: userInvocable !== false,
  };
};

const rejectLegacyInvocationKey = (
  data: Record<string, unknown>,
  legacy: string,
  canonical: string,
): void => {
  if (Object.hasOwn(data, legacy)) {
    throw new Error(`frontmatter field "${legacy}" is unsupported; use "${canonical}"`);
  }
};

const frontmatterBoolean = (data: Record<string, unknown>, key: string): boolean | undefined => {
  if (!Object.hasOwn(data, key)) return undefined;
  const value = data[key] as unknown;
  if (typeof value === "boolean") return value;
  if (value === 1 || value === "1") return true;
  if (value === 0 || value === "0") return false;
  if (typeof value === "string") {
    switch (value.toLowerCase()) {
      case "true":
      case "yes":
      case "on":
        return true;
      case "false":
      case "no":
      case "off":
        return false;
    }
  }
  throw new TypeError(`frontmatter field "${key}" must be a boolean`);
};

const dataString = (data: Record<string, unknown>, key: string): string | undefined => {
  const value = data[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
};

const optionalString = (data: Record<string, unknown>, key: string): Record<string, string> => {
  const value = data[key];
  return typeof value === "string" && value.length > 0 ? { [key]: value } : {};
};

const optionalMetadata = (
  data: Record<string, unknown>,
): { metadata?: Record<string, unknown> } => {
  const value = data["metadata"];
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return { metadata: value as Record<string, unknown> };
  }
  return {};
};
