import { readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { parseDocument, serializeDocument, type PlanDocument } from "./dag.js";
import type { NanoFlowSettings } from "../contract.js";

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
 * 读取一个 Plan 的 notes 原始 JSON，不做结构校验。
 * 供 `nano_flow_read` 的 inspect 与 `nano_flow_write` 的 repair 在文档不合法时使用。
 * @param planDirectory - Plan 目录。
 * @returns 解析后的原始 JSON。
 */
export const loadRawDocument = async (planDirectory: string): Promise<unknown> => {
  let text: string;
  try {
    text = await readFile(join(planDirectory, NOTES_FILE), "utf8");
  } catch (error) {
    throw new Error(`读取 ${NOTES_FILE} 失败: ${describe(error)}`);
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${NOTES_FILE} 不是合法 JSON: ${describe(error)}`);
  }
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
