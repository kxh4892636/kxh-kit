export type MarketErrorCode = "not_found" | "deadline_exceeded" | "upstream_unavailable";

export class MarketError extends Error {
  readonly code: MarketErrorCode;

  constructor(code: MarketErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.code = code;
  }
}
