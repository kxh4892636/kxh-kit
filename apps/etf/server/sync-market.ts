import { loadConfig } from "./config.ts";
import { createRemoteFetcher } from "./libs/hongsehuojian/hongsehuojian.ts";
import { openSqliteDatabase } from "./libs/sqlite/database.ts";
import { createSqliteMarketRepository } from "./market/repository/sqlite/sqlite-market-repository.ts";
import { syncMarketData } from "./market/service/sync-market-data.ts";

const main = async (): Promise<void> => {
  const config = loadConfig(".env");
  const db = openSqliteDatabase(config.databaseDsn);
  try {
    const repository = createSqliteMarketRepository(db);
    const summary = await syncMarketData({ repository, fetcher: createRemoteFetcher() });
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    db.$client.close();
  }
};

void main().catch((error: unknown): void => {
  console.error(error);
  process.exitCode = 1;
});
