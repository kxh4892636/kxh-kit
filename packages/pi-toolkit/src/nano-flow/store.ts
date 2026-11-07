import { readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { parseDocument, serializeDocument, type PlanDocument } from "./dag.js";
import { repairDocument } from "./repair.ts";
import type { NanoFlowSettings } from "./config.ts";

/** notes 文件的固定文件名。 */
export const NOTES_FILE = "notes.json";

const describe = (error: unknown): string => {
  return error instanceof Error ? error.message : String(error);
};

/**
 * 读取一个 Plan 的 notes 文档。
 * @param planDirectory - Plan 目录。
 * @param limits - 生效上限。
 * @returns 校验通过的文档。
 */
export const loadDocument = async (
  planDirectory: string,
  limits: NanoFlowSettings,
): Promise<PlanDocument> => {
  let text: string;
  try {
    text = await readFile(join(planDirectory, NOTES_FILE), "utf8");
  } catch (error) {
    throw new Error(`读取 ${NOTES_FILE} 失败: ${describe(error)}`);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    throw new Error(`${NOTES_FILE} 不是合法 JSON: ${describe(error)}`);
  }
  return parseDocument(raw, limits);
};

/**
 * 校验并写回 notes 文档；先写临时文件再 rename，避免半截文件。
 * @param planDirectory - Plan 目录。
 * @param document - 待写入文档。
 * @param limits - 生效上限。
 * @returns 归一化后的文档。
 */
export const commitDocument = async (
  planDirectory: string,
  document: PlanDocument,
  limits: NanoFlowSettings,
): Promise<PlanDocument> => {
  const validated = parseDocument(JSON.parse(serializeDocument(document)), limits);
  const file = join(planDirectory, NOTES_FILE);
  const temporary = `${file}.${process.pid}.tmp`;
  await writeFile(temporary, serializeDocument(validated), "utf8");
  await rename(temporary, file);
  return validated;
};

/** 打开文档的结果：文档本身 + 本次自动修复的机械问题。 */
export interface OpenedDocument {
  readonly document: PlanDocument;
  readonly repairs: readonly string[];
}

/**
 * 读取文档；遇到可机械修复的问题时先修复并写回，再返回文档。
 *
 * @param planDirectory - Plan 目录。
 * @param limits - 生效上限。
 * @returns 文档与本次修复项；不可修复时抛出剩余问题。
 */
export const openDocument = async (
  planDirectory: string,
  limits: NanoFlowSettings,
): Promise<OpenedDocument> => {
  const file = join(planDirectory, NOTES_FILE);
  let text: string;
  try {
    text = await readFile(file, "utf8");
  } catch (error) {
    throw new Error(`读取 ${NOTES_FILE} 失败: ${describe(error)}`);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    throw new Error(`${NOTES_FILE} 不是合法 JSON: ${describe(error)}`);
  }
  try {
    return { document: parseDocument(raw, limits), repairs: [] };
  } catch (error) {
    const { raw: repaired, changes } = repairDocument(raw, limits);
    if (changes.length === 0) throw error;
    const document = await commitDocument(planDirectory, parseDocument(repaired, limits), limits);
    return { document, repairs: changes };
  }
};
