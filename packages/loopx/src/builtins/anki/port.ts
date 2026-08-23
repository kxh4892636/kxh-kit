import type { JsonValue } from "../../cli/types";

export interface AnkiPort {
  readonly invoke: <Result>(
    action: string,
    params?: Readonly<Record<string, JsonValue>>,
  ) => Promise<Result>;
}
