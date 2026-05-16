# Data Sources And Native Scripts

This reference records source-specific data interfaces for investment analysis. Do not force these providers into one unified business API. Each source has its own shape, parameters, units, and failure modes. Use the source that fits the question, then explain the fields in the report.

## Script Rules

- Data acquisition must use either native Node.js or Python standard-library APIs.
- Do not add npm, pip, conda, browser automation, or SDK dependencies unless the user explicitly approves them.
- Keep each data source in one source-specific script file. Do not split one provider across multiple data-fetching scripts.
- Export every source-specific data-fetching function so it can be tested with an injected native `fetchImpl`.
- Cover every exported data-fetching function with `node:test` tests that mock the provider response and do not hit the network.
- Preserve source-specific payload shape where useful. Add only lightweight audit metadata such as `source`, `fetchedAt`, endpoint URL, warnings, and parser notes.
- Analyze the source before trusting it: endpoint, parameters, response shape, unit conventions, freshness, login/rate-limit behavior, and known failure modes.
- If a source blocks direct access, return a clear error or warning instead of silently substituting guessed data.

## Danjuan / Xueqiu Valuation Center

Source page:

- `https://danjuanfunds.com/djmodule/value-center`
- Detail route: `https://danjuanfunds.com/dj-valuation-table-detail/{index_code}`

Confirmed endpoints:

- Current valuation list: `https://danjuanfunds.com/djapi/index_eva/dj`
- Current valuation detail: `https://danjuanfunds.com/djapi/index_eva/detail/{index_code}`
- Historical valuation curve: `https://danjuanfunds.com/djapi/index_eva/{metric}_history/{index_code}?day={window}`
- Related funds: `https://danjuanfunds.com/djapi/index_eva/related/funds/{index_code}`

History parameters:

- `metric`: `pe`, `pb`, `roe`.
- `window`: `3y`, `5y`, `all`.
- The UI labels `all` as "near 10 years"; direct `day=10y` returns a parameter error. Treat `all` as the provider's 10-year tab and report the actual start/end dates from the returned points.

Important raw fields:

- Detail: `index_code`, `name`, `ttype`, `pe`, `pb`, `pe_percentile`, `pb_percentile`, `roe`, `yeild`, `peg`, `bond_yeild`, `eva_type`, `pb_flag`, `pe_over_history`, `pb_over_history`, `date`.
- History: `horizontal_lines`, `index_eva_pe_growths`, `index_eva_pb_growths`, `index_eva_roe_growths`.
- History point: `ts` plus the metric field, for example `{ pe, ts }`.

Unit notes:

- Percentiles and over-history fields are decimals from 0 to 1.
- `yeild` is Danjuan's raw dividend-yield typo.
- `roe` is a decimal ratio; multiply by 100 only for display.
- PE/PB history may include percentile guide lines in `horizontal_lines`; ROE may not.

Native script:

- `scripts/danjuan-data.mjs`
  - `valuation` command fetches detail plus PE/PB/ROE history for 3y/5y/all.
  - `probe` command probes list/detail/history endpoints and rejected candidate endpoints.
  - Exports `fetchDanjuanJson`, `fetchDanjuanValuationList`, `fetchDanjuanValuationDetail`, `fetchDanjuanValuationHistory`, `probeDanjuanEndpoints`, and `fetchDanjuanIndexValuation`.
  - Keeps Danjuan-specific field names and adds provider notes about windows and units.

Example:

```bash
node .agents/skills/investment-analysis/scripts/danjuan-data.mjs valuation SZ399812 --windows=3y,5y,10y --out=/tmp/danjuan.json
node .agents/skills/investment-analysis/scripts/danjuan-data.mjs probe SZ399812 --out=/tmp/danjuan-probe.json
```

## Fund Public Data From real-time-fund Reference

Reference repository:

- `https://github.com/hzm0321/real-time-fund`

Source-specific endpoints:

- Fund real-time estimate: `https://fundgz.1234567.com.cn/js/{fundCode}.js?rt={timestamp}`
- Sina intraday estimate curve: `https://stock.finance.sina.com.cn/fundInfo/api/openapi.php/FdFundService.getEstimateNetworthPic?symbol={fundCode}&callback={callback}`
- Eastmoney historical NAV: `https://fundf10.eastmoney.com/F10DataApi.aspx?type=lsjz&code={fundCode}&page={page}&per={pageSize}&sdate={start}&edate={end}`
- Eastmoney top holdings: `https://fundf10.eastmoney.com/FundArchivesDatas.aspx?type=jjcc&code={fundCode}&topline=10&year=&month=&_={timestamp}`
- Eastmoney fund search: `https://fundsuggest.eastmoney.com/FundSearch/api/FundSearchAPI.ashx?m=1&key={query}&callback={callback}&_={timestamp}`
- Eastmoney profile/performance globals: `https://fund.eastmoney.com/pingzhongdata/{fundCode}.js?v={timestamp}`
- Tencent index snapshots: `https://qt.gtimg.cn/q={indexCodes}`

Raw shape and parser notes:

- `fundgz` returns JSONP `jsonpgz(...)` with `fundcode`, `name`, `jzrq`, `dwjz`, `gsz`, `gszzl`, `gztime`.
- Sina returns JSONP with `result.data.networth[]`, including `pre_date`, `min_time`, `pre_nav`, `pre_nav2`, `growthrate`, `growthrate2`. Treat `sina2` and `sina3` as alternative estimate口径.
- F10 NAV and holdings return `var apidata={ content:"<table...>" }`; parse script-wrapped HTML.
- `pingzhongdata` returns JavaScript globals such as `fS_name`, `fS_code`, `stockCodesNew`, `zqCodesNew`, `syl_1n`, `syl_6y`, `syl_3y`, `syl_1y`, `Data_netWorthTrend`, `Data_ACWorthTrend`, `Data_grandTotal`, `Data_assetAllocation`, `Data_holderStructure`, `Data_currentFundManager`, `Data_buySedemption`, `Data_performanceEvaluation`.
- Tencent quote strings are `~` separated JavaScript assignments, for example `var v_sh000001="..."`.
- Holdings are delayed disclosure. Never present holdings as live exposure.

Native script:

- `scripts/fund-public-data.mjs`
  - Fetches fundgz estimate, Sina estimate curves, single-day NAV, paged NAV range, latest top holdings, full `pingzhongdata` fields, period returns, optional search results, and Tencent market index snapshots.
  - Exports `fetchFundEstimate`, `fetchFundDailyNav`, `fetchFundNavHistory`, `fetchFundNavRange`, `fetchFundHoldings`, `fetchFundProfile`, `fetchFundPingzhongdata`, `fetchFundPeriodReturns`, `fetchSinaFundEstimate`, `fetchFundValuationBySource`, `searchFunds`, `fetchTencentMarketIndices`, `fetchShanghaiIndexDate`, and `fetchFundPublicData`.
  - Uses only native Node `fetch`, JSONP parsing, script-string parsing, and simple HTML table parsing.

Example:

```bash
node .agents/skills/investment-analysis/scripts/fund-public-data.mjs 161725 --query=白酒 --start=2025-01-01 --end=2026-05-16 --page-size=500 --out=/tmp/fund.json
node .agents/skills/investment-analysis/scripts/fund-public-data.mjs --fund=161725 --valuation-source=all --include-raw --out=/tmp/fund-raw.json
```

Programmatic usage:

```js
import {
  fetchFundPublicData,
  fetchFundPingzhongdata,
  fetchSinaFundEstimate,
  fetchTencentMarketIndices,
} from "./scripts/fund-public-data.mjs";

const fund = await fetchFundPublicData({
  fund: "161725",
  query: "白酒",
  start: "2025-01-01",
  end: "2026-05-16",
  pageSize: 500,
});
const pingzhongdata = await fetchFundPingzhongdata("161725");
const sina2 = await fetchSinaFundEstimate("161725", { dataSource: 2 });
const market = await fetchTencentMarketIndices();
```

Use the output this way:

- `estimate`, `sinaEstimate2`, `sinaEstimate3`: real-time or intraday estimate cross-check. Never treat estimate as official NAV.
- `dailyNav`, `navHistory`, `navRange`: official disclosed NAV, stage return, volatility, drawdown, and tracking stability.
- `holdings`: latest disclosed top holdings and top-10 concentration. Mark `reportDate`.
- `pingzhongdata.assetAllocation`, `holderStructure`, `currentFundManager`, `buyRedemption`, `performanceEvaluation`: exposure, holder base, manager, fee/redemption, and risk/return context.
- `pingzhongdata.benchmarkSeries`: compare fund trend with benchmark or peer curves.
- `periodReturns`: quick period return and consecutive up/down trend.
- `marketIndices`: broad-market timing backdrop, not a buy/sell signal by itself.

## AData Reference Sources

Reference repository:

- `https://github.com/1nchaos/adata`

Use AData as a source map, not as a dependency. Reimplement only the needed public endpoint logic with native code.

Source-specific endpoints implemented:

- Baidu stock K-line provider used by AData fallback:
  - `https://finance.pae.baidu.com/selfselect/getstockquotation?group=quotation_kline_ab&code={stockCode}&start_time={start} 00:00:00&ktype=1`
- Baidu stock minute, order book, and tick providers:
  - `https://finance.pae.baidu.com/selfselect/getstockquotation?group=quotation_minute_ab&code={stockCode}`
  - `https://finance.pae.baidu.com/vapi/v1/getquotation?query={stockCode}&code={stockCode}&market_type=ab`
- Baidu industry and dividend providers:
  - `https://finance.pae.baidu.com/api/getrelatedblock?stock=[...]&finClientType=pc`
  - `https://gushitong.baidu.com/opendata?resource_id=5429&query={stockCode}&code={stockCode}`
- Eastmoney ETF universe from AData ETF info logic:
  - `http://push2.eastmoney.com/api/qt/clist/get?fs=b:MK0021,b:MK0022,b:MK0023,b:MK0024&fields=f12,f13,f14,f2,f3,f4,f5,f6,f17,f18`
- Eastmoney financial core from AData `get_core_index` logic:
  - `https://datacenter.eastmoney.com/securities/api/data/get?type=RPT_F10_FINANCE_MAINFINADATA&sty=APP_F10_MAINFINADATA&filter=(SECUCODE="{stockCodeWithExchange}")`
- Eastmoney stock K-line attempt from AData market logic:
  - `http://push2his.eastmoney.com/api/qt/stock/kline/get?secid={secid}&klt=101&fqt=1&beg={YYYYMMDD}&end={YYYYMMDD}`
- Eastmoney stock minute, capital-flow, concept, plate, shares, north-flow, margin, hot-rank, A-stock list, new-stock list, index list/current/K-line:
  - `https://push2.eastmoney.com/api/qt/stock/trends2/get`
  - `https://push2his.eastmoney.com/api/qt/stock/fflow/daykline/get`
  - `https://push2.eastmoney.com/api/qt/stock/fflow/kline/get`
  - `https://datacenter.eastmoney.com/securities/api/data/v1/get?reportName=RPT_F10_CORETHEME_BOARDTYPE`
  - `https://datacenter.eastmoney.com/securities/api/data/v1/get?reportName=RPT_F10_EH_EQUITY`
  - `https://datacenter-web.eastmoney.com/api/data/v1/get?reportName=RPT_MUTUAL_DEAL_HISTORY`
  - `https://datacenter-web.eastmoney.com/api/data/v1/get?reportName=RPTA_RZRQ_LSHJ`
  - `https://emappdata.eastmoney.com/stockrank/getAllCurrentList`
  - `https://push2.eastmoney.com/api/qt/clist/get?fs=m:1+s:2`
  - `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid={indexSecid}`
- SZSE trading calendar, TDX risk scan, and THS ETF K-line:
  - `http://www.szse.cn/api/report/exchange/onepersistenthour/monthList?month={YYYY-M}`
  - `http://page3.tdx.com.cn:7615/site/pcwebcall_static/bxb/json/{stockCode}.json`
  - `http://d.10jqka.com.cn/v6/line/hs_{etfCode}/{kType}/last36000.js`

Raw shape and parser notes:

- Baidu K-line returns `Result.newMarketData.keys` plus semicolon-separated `marketData`.
- Baidu minute returns `Result.priceinfo`; Baidu quote detail returns `askinfos`, `buyinfos`, `detailinfos`.
- Baidu industry returns related blocks; keep only `name=行业` for industry mapping.
- Eastmoney ETF list returns JSON `data.diff` with `f12` code, `f14` name, `f2` price, `f3` change percent, `f5` volume, `f6` amount.
- Eastmoney financial core returns JSON `result.data` with fields such as `REPORT_DATE`, `REPORT_TYPE`, `EPSJB`, `BPS`, `TOTALOPERATEREVE`, `PARENTNETPROFIT`, `ROEJQ`, `XSMLL`, `XSJLL`, `ZCFZL`.
- Eastmoney concept/plate APIs return `BOARD_NAME`, `SELECTED_BOARD_REASON`, `BOARD_RANK`, `BOARD_TYPE`.
- Eastmoney stock shares returns `TOTAL_SHARES`, `LIMITED_SHARES`, `LISTED_A_SHARES`, `FREE_SHARES`, `CHANGE_REASON`.
- Capital-flow rows expose main/small/middle/large/extra-large net inflow. Use only as timing/sentiment evidence.
- North-flow and margin data are market-level context. Do not use them as company quality evidence.
- Eastmoney `push2his` may close sockets or rate-limit in some network environments. Record the error and use Baidu K-line or another approved source if needed.
- THS and TDX endpoints may rate-limit or block. Treat missing sections in `errors` as source failure, not as absence of risk.

Native script:

- `scripts/adata-public-data.mjs`
  - Fetches Baidu stock K-line/minute/order book/ticks/industry/dividend, Eastmoney ETF list, concept list and constituents, financial core, stock K-line/minute, capital flow, concept/plate exposure, share changes, north-flow, margin, hot rank, index list/current/K-line, SZSE calendar, TDX risk scan, A-share/new-stock lists, and THS ETF K-line.
  - Exports `fetchBaiduStockKline`, `fetchBaiduStockMinute`, `fetchBaiduStockOrderBook`, `fetchBaiduStockTicks`, `fetchEastmoneyEtfList`, `fetchEastmoneyConceptList`, `fetchEastmoneyConceptConstituents`, `fetchEastmoneyFinancialCore`, `fetchEastmoneyStockMinute`, `fetchEastmoneyStockKline`, `fetchEastmoneyCapitalFlowDaily`, `fetchEastmoneyCapitalFlowMinute`, `fetchEastmoneyStockConcepts`, `fetchEastmoneyStockPlates`, `fetchEastmoneyStockShares`, `fetchBaiduStockDividend`, `fetchBaiduStockIndustry`, `fetchEastmoneyNorthFlow`, `fetchEastmoneySecuritiesMargin`, `fetchEastmoneyHotRank`, `fetchEastmoneyIndexList`, `fetchBaiduIndexConstituents`, `fetchEastmoneyIndexKline`, `fetchEastmoneyIndexCurrent`, `fetchSzseTradeCalendar`, `fetchTdxMineClearance`, `fetchEastmoneyAStockList`, `fetchEastmoneyNewStockList`, `fetchThsEtfKline`, and `fetchAdataPublicData`.
  - Uses only native Node APIs and keeps AData-source-specific sections in the output.

Example:

```bash
node .agents/skills/investment-analysis/scripts/adata-public-data.mjs 600519 --etf=512880 --start=2025-01-01 --end=2026-05-16 --etf-limit=50 --finance-page-size=20 --out=/tmp/adata.json
node .agents/skills/investment-analysis/scripts/adata-public-data.mjs --stock=300059 --etf=512880 --start=2025-01-01 --include-raw --out=/tmp/adata-raw.json
```

Programmatic usage:

```js
import {
  fetchAdataPublicData,
  fetchEastmoneyFinancialCore,
  fetchEastmoneyCapitalFlowDaily,
  fetchEastmoneyStockConcepts,
  fetchBaiduStockIndustry,
  fetchTdxMineClearance,
} from "./scripts/adata-public-data.mjs";

const stock = await fetchAdataPublicData({
  stock: "600519",
  etf: "512880",
  index: "000300",
  concept: "BK0966",
  start: "2025-01-01",
  end: "2026-05-16",
});
const financials = await fetchEastmoneyFinancialCore("600519", { financePageSize: 20 });
const capitalFlow = await fetchEastmoneyCapitalFlowDaily("600519");
const concepts = await fetchEastmoneyStockConcepts("600519");
const industry = await fetchBaiduStockIndustry("600519");
const mineClearance = await fetchTdxMineClearance("600519");
```

Use the output this way:

- `stockMarketBaidu`, `eastmoneyKline`, `eastmoneyMinute`: price trend, liquidity, volatility, and report date context.
- `financialCoreEastmoney`: profitability, ROE, margins, leverage, and growth checks.
- `stockIndustryBaidu`, `stockConceptsEastmoney`, `stockPlatesEastmoney`: industry and theme exposure; use `reason` to guard against narrative drift.
- `stockSharesEastmoney`: share-capital changes and dilution/lock-up context.
- `stockDividendBaidu`: shareholder return and dividend consistency.
- `capitalFlowDailyEastmoney`, `capitalFlowMinuteEastmoney`, `hotRankEastmoney`: sentiment/crowding/timing only.
- `northFlowEastmoney`, `securitiesMarginEastmoney`: market-wide liquidity and leverage backdrop.
- `mineClearanceTdx`: risk-screen prompts. Verify serious flags with filings before making a strong conclusion.
- `etfListEastmoney`, `thsEtfKline`: ETF universe, secondary-market price/volume, and liquidity.
- `indexListEastmoney`, `indexConstituentsBaidu`, `indexKlineEastmoney`, `indexCurrentEastmoney`: index identification, constituent checks, and benchmark timing.
- `errors`: source-specific failed sections. A missing section caused by provider failure must be stated explicitly in the report.

## Choosing A Source

ETF or index valuation:

- Prefer Danjuan for PE/PB/ROE current and historical index valuation.
- Use `fund-public-data.mjs` for fund NAV, estimate, disclosed holdings, and fund search.
- Use `adata-public-data.mjs` for stock K-line, ETF universe, and stock financial core.

Individual stock report:

- Use `adata-public-data.mjs` for price history and financial core.
- Add other approved native scripts only when the report needs industry, concept, capital flow, pledge, or governance data.

Data quality language:

- State the source and date for each numeric claim.
- Mark missing or blocked provider data explicitly.
- Do not blend dates or providers as if they share one schema.
- Cross-check any number that drives a strong conclusion.

## Native Test Coverage

Tests live next to the skill and use only Node built-ins:

- `tests/danjuan-data.test.mjs`
- `tests/fund-public-data.test.mjs`
- `tests/adata-public-data.test.mjs`

Run them with:

```bash
node --test .agents/skills/investment-analysis/tests/*.test.mjs
```
