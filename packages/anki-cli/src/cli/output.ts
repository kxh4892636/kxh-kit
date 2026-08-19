import { toErrorPayload } from "./json-error";

// stdout 只输出结果 JSON(ADR-0001); 默认 2 空格缩进, --compact 单行。
export const printSuccessJson = (data: unknown, compact: boolean): void => {
  process.stdout.write(`${JSON.stringify(data, null, compact ? 0 : 2)}\n`);
};

// stderr 只输出错误 JSON; 退出码由调用方设置(1=运行时错误, 2=用法错误)。
export const printErrorJson = (error: unknown, debug: boolean, compact = false): void => {
  process.stderr.write(`${JSON.stringify(toErrorPayload(error, debug), null, compact ? 0 : 2)}\n`);
};
