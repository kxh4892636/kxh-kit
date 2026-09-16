import type { JsonValue } from "../../../cli/types";

export interface NoteDuplicateOptions {
  readonly allowDuplicate?: boolean | undefined;
  readonly duplicateScope?: "deck" | "collection" | undefined;
  readonly duplicateScopeOptions?:
    | {
        readonly deckName?: string | undefined;
        readonly checkChildren?: boolean | undefined;
        readonly checkAllModels?: boolean | undefined;
      }
    | undefined;
}

/**
 * 组装上游 addNote/addNotes 的 options 载荷(重复检查相关)。
 * 单项未提供就不出现在载荷里, 全部未提供时返回 undefined —
 * 调用方据此决定是否带上 options 字段, 空对象与缺省在上游语义不同。
 */
export const buildNoteOptions = (
  source: NoteDuplicateOptions,
): Readonly<Record<string, JsonValue>> | undefined => {
  const options: Record<string, JsonValue> = {};
  let hasOptions = false;
  if (source.allowDuplicate !== undefined) {
    options["allowDuplicate"] = source.allowDuplicate;
    hasOptions = true;
  }
  if (source.duplicateScope !== undefined) {
    options["duplicateScope"] = source.duplicateScope;
    hasOptions = true;
  }
  const scopeOptions = source.duplicateScopeOptions;
  if (scopeOptions !== undefined) {
    options["duplicateScopeOptions"] = {
      ...(scopeOptions.deckName === undefined ? {} : { deckName: scopeOptions.deckName }),
      ...(scopeOptions.checkChildren === undefined
        ? {}
        : { checkChildren: scopeOptions.checkChildren }),
      ...(scopeOptions.checkAllModels === undefined
        ? {}
        : { checkAllModels: scopeOptions.checkAllModels }),
    };
    hasOptions = true;
  }
  return hasOptions ? options : undefined;
};
