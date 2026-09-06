import { createServer } from "node:http";
import { startServer } from "../../../etf-service/dist/server.js";
import { createRemoteFetcher } from "../../../etf-service/dist/integrations/hongsehuojian.js";
const rows = [];
for (let index = 0; index < 1000; index++) {
  const date = new Date(Date.UTC(2022, 0, 3 + index));
  const open = 100 + index * 0.1;
  rows.push(
    [
      date.toISOString().slice(0, 10),
      open,
      open + 2,
      open - 1,
      open + 1,
      100000,
      10000000,
      1,
      1,
      "一",
    ].join(","),
  );
}
const upstream = createServer((req, res) => {
  const symbol = new URL(req.url, "http://localhost").searchParams.get("securityCode");
  res.setHeader("content-type", "application/json");
  res.end(
    JSON.stringify({
      securityCode: symbol,
      columns: "tradeDate,open,high,low,close,volume,amount,change,changePercent,week",
      items: rows.join(";"),
    }),
  );
});
upstream.listen(0, "127.0.0.1", () => {
  const port = upstream.address().port;
  const running = startServer(
    {
      port: Number(process.env.ETF_E2E_BACKEND_PORT ?? "18181"),
      databaseDsn: process.env.DATABASE_DSN,
    },
    createRemoteFetcher({ endpoint: "http://127.0.0.1:" + port }),
  );
  running.server.on("error", (error) => {
    console.error(error);
    upstream.close();
    process.exitCode = 1;
  });
  const stop = () => {
    void running.close().finally(() => upstream.close());
  };
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
});
