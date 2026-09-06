export class MarketError extends Error {
  readonly status: 400 | 404 | 408 | 502 | 504;
  readonly code: string;
  constructor(
    status: 400 | 404 | 408 | 502 | 504,
    code: string,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.status = status;
    this.code = code;
  }
}
