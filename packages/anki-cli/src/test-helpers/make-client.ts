import { createLogger } from "../cli/logger";
import { AnkiConnectClient } from "../client/anki-connect-client";

const silentLogger = createLogger("error");

export const makeClient = (
  url: string,
  overrides: Partial<ConstructorParameters<typeof AnkiConnectClient>[0]> = {},
): AnkiConnectClient =>
  new AnkiConnectClient({
    url,
    apiVersion: 6,
    apiKey: undefined,
    timeout: 2000,
    readOnly: false,
    logger: silentLogger,
    ...overrides,
  });
