import assert from "node:assert/strict";
import test from "node:test";

import {
  fetchFundDailyNav,
  fetchFundEstimate,
  fetchFundHoldings,
  fetchFundNavHistory,
  fetchFundNavRange,
  fetchFundPeriodReturns,
  fetchFundPingzhongdata,
  fetchFundProfile,
  fetchFundPublicData,
  fetchFundValuationBySource,
  fetchShanghaiIndexDate,
  fetchSinaFundEstimate,
  fetchTencentMarketIndices,
  searchFunds,
} from "../scripts/fund-public-data.mjs";

function textResponse(text, status = 200) {
  return {
    status,
    ok: status >= 200 && status < 300,
    text: async () => text,
  };
}

function apidata(html) {
  return `var apidata={ content:${JSON.stringify(html)} };`;
}

function fundEstimateText() {
  return 'jsonpgz({"fundcode":"161725","name":"招商中证白酒指数","jzrq":"2025-01-02","dwjz":"1.234","gsz":"1.250","gszzl":"1.30","gztime":"2025-01-03 15:00"});';
}

function navText() {
  return apidata(`
    <table>
      <tr><th>净值日期</th><th>单位净值</th><th>累计净值</th><th>日增长率</th></tr>
      <tr><td>2025-01-02</td><td>1.234</td><td>2.345</td><td>1.23%</td><td>开放申购</td><td>开放赎回</td><td></td></tr>
    </table>
  `);
}

function holdingsText() {
  return apidata(`
    <div>截止至：<font>2025-03-31</font></div>
    <table>
      <tr><td>1</td><td>600519</td><td>贵州茅台</td><td>1500</td><td>1.1%</td><td>10.00万股</td><td>1500.00万元</td><td>9.8%</td></tr>
    </table>
  `);
}

function profileText() {
  return `
    var fS_code="161725";
    var fS_name="招商中证白酒指数";
    var fund_sourceRate="1.50%";
    var fund_Rate="0.15%";
    var fund_minsg="10";
    var stockCodesNew = ["600519","000858"];
    var zqCodesNew = ["019547"];
    var Data_netWorthTrend = [{"x":1735084800000,"y":1.2},{"x":1735776000000,"y":1.3}];
    var Data_ACWorthTrend = [[1735776000000,2.3]];
    var Data_grandTotal = [{"name":"沪深300","data":[[1735776000000,1.1]]}];
    var Data_assetAllocation = [{"name":"股票","value":90}];
    var Data_holderStructure = [{"name":"个人","value":80}];
    var Data_performanceEvaluation = {"avr":"良好"};
    var Data_currentFundManager = [{"name":"李四"}];
    var Data_buySedemption = {"申购状态":"开放"};
    var Data_fundSharesPositions = [{"date":"2025-01-02","value":10}];
    var swithSameType = [{"code":"000001"}];
    var syl_1n="10.5";
    var syl_3y="20.1";
    var syl_6y="-1.5";
    var syl_1y="2.3";
  `;
}

function searchText() {
  return 'cb({"Datas":[{"CODE":"161725","NAME":"招商中证白酒指数","CATEGORYDESC":"指数型","FundBaseInfo":{"JJJL":"张三","JJGS":"招商基金","ISBUY":"1"}}]});';
}

function sinaText() {
  return 'callback({"result":{"data":{"networth":[{"pre_date":"2025-01-02","min_time":"14:59","pre_nav":"1.250","pre_nav2":"1.260","growthrate":"0.013","growthrate2":"0.014"}]}}});';
}

function tencentText() {
  return 'var v_sh000001="1~上证指数~000001~3000~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~20250102150000~10~0.33";';
}

function fundFetch(url) {
  const parsed = new URL(String(url));
  if (parsed.hostname === "fundgz.1234567.com.cn") return textResponse(fundEstimateText());
  if (parsed.hostname === "fundf10.eastmoney.com" && parsed.pathname === "/F10DataApi.aspx") {
    return textResponse(navText());
  }
  if (parsed.hostname === "fundf10.eastmoney.com" && parsed.pathname === "/FundArchivesDatas.aspx") {
    return textResponse(holdingsText());
  }
  if (parsed.hostname === "fund.eastmoney.com") return textResponse(profileText());
  if (parsed.hostname === "fundsuggest.eastmoney.com") return textResponse(searchText());
  if (parsed.hostname === "stock.finance.sina.com.cn") return textResponse(sinaText());
  if (parsed.hostname === "qt.gtimg.cn") return textResponse(tencentText());
  throw new Error(`Unexpected URL ${url}`);
}

test("fetchFundEstimate parses fundgz JSONP", async () => {
  let seenUrl = null;
  const fetchImpl = async (url) => {
    seenUrl = new URL(String(url));
    return textResponse(fundEstimateText());
  };

  const result = await fetchFundEstimate("161725", { fetchImpl, now: () => 1 });

  assert.equal(seenUrl.pathname, "/js/161725.js");
  assert.equal(seenUrl.searchParams.get("rt"), "1");
  assert.equal(result.data.fundCode, "161725");
  assert.equal(result.data.estimatedChangePct, 1.3);
});

test("fetchFundNavHistory parses Eastmoney F10 NAV table", async () => {
  const fetchImpl = async (url) => {
    const parsed = new URL(String(url));
    assert.equal(parsed.searchParams.get("type"), "lsjz");
    assert.equal(parsed.searchParams.get("code"), "161725");
    return textResponse(navText());
  };

  const result = await fetchFundNavHistory("161725", {
    fetchImpl,
    start: "2025-01-01",
    end: "2025-01-31",
    pageSize: 5,
  });

  assert.equal(result.data.length, 1);
  assert.equal(result.data[0].date, "2025-01-02");
  assert.equal(result.data[0].dailyChangePct, 1.23);
});

test("fetchFundDailyNav returns the requested day row", async () => {
  const result = await fetchFundDailyNav("161725", "2025-01-02", { fetchImpl: fundFetch });

  assert.equal(result.data.date, "2025-01-02");
  assert.equal(result.data.nav, 1.234);
});

test("fetchFundNavRange merges paged NAV history", async () => {
  const result = await fetchFundNavRange("161725", { fetchImpl: fundFetch, pageSize: 5, maxPages: 1 });

  assert.equal(result.data.length, 1);
  assert.equal(result.data[0].accumulatedNav, 2.345);
});

test("fetchFundHoldings parses latest disclosed top holdings", async () => {
  const fetchImpl = async (url) => {
    const parsed = new URL(String(url));
    assert.equal(parsed.searchParams.get("type"), "jjcc");
    assert.equal(parsed.searchParams.get("code"), "161725");
    return textResponse(holdingsText());
  };

  const result = await fetchFundHoldings("161725", { fetchImpl, now: () => 1 });

  assert.equal(result.data.reportDate, "2025-03-31");
  assert.equal(result.data.rows[0].stockCode, "600519");
  assert.equal(result.data.rows[0].navRatioPct, 9.8);
});

test("fetchFundProfile parses pingzhongdata globals", async () => {
  const fetchImpl = async (url) => {
    assert.equal(new URL(String(url)).pathname, "/pingzhongdata/161725.js");
    return textResponse(profileText());
  };

  const result = await fetchFundProfile("161725", { fetchImpl, now: () => 1 });

  assert.equal(result.data.fundName, "招商中证白酒指数");
  assert.deepEqual(result.data.stockCodes, ["600519", "000858"]);
  assert.equal(result.data.annualReturns.oneYear, 10.5);
});

test("fetchFundPingzhongdata parses extended Eastmoney globals", async () => {
  const result = await fetchFundPingzhongdata("161725", { fetchImpl: fundFetch, now: () => 1 });

  assert.equal(result.data.fundName, "招商中证白酒指数");
  assert.equal(result.data.assetAllocation[0].name, "股票");
  assert.equal(result.data.currentFundManager[0].name, "李四");
  assert.equal(result.data.benchmarkSeries[0].name, "沪深300");
});

test("fetchFundPeriodReturns exposes period returns and consecutive trend", async () => {
  const result = await fetchFundPeriodReturns("161725", { fetchImpl: fundFetch, now: () => 1 });

  assert.equal(result.data.oneMonth, 2.3);
  assert.equal(result.data.oneYear, 10.5);
  assert.equal(Math.round(result.data.oneWeek), 8);
});

test("fetchSinaFundEstimate parses Sina valuation curve", async () => {
  const result = await fetchSinaFundEstimate("161725", {
    fetchImpl: fundFetch,
    dataSource: 3,
    callback: "callback",
  });

  assert.equal(result.data.dataSource, "sina3");
  assert.equal(result.data.estimatedNav, 1.26);
  assert.equal(result.data.estimatedChangePct, 1.4000000000000001);
});

test("fetchFundValuationBySource dispatches source-specific valuation", async () => {
  const result = await fetchFundValuationBySource("161725", "sina2", {
    fetchImpl: fundFetch,
    callback: "callback",
  });

  assert.equal(result.data.dataSource, "sina2");
  assert.equal(result.data.estimatedNav, 1.25);
});

test("searchFunds parses Eastmoney fund suggestions", async () => {
  const fetchImpl = async (url) => {
    const parsed = new URL(String(url));
    assert.equal(parsed.searchParams.get("key"), "白酒");
    return textResponse(searchText());
  };

  const result = await searchFunds("白酒", { fetchImpl, now: () => 1 });

  assert.equal(result.data.length, 1);
  assert.equal(result.data[0].fundCode, "161725");
  assert.equal(result.data[0].manager, "张三");
});

test("fetchTencentMarketIndices parses Tencent quote strings", async () => {
  const result = await fetchTencentMarketIndices({
    fetchImpl: fundFetch,
    now: () => 1,
    indexKeys: [{ code: "sh000001", name: "上证指数", type: "cn" }],
  });

  assert.equal(result.data[0].name, "上证指数");
  assert.equal(result.data[0].price, 3000);
});

test("fetchShanghaiIndexDate returns latest Tencent trade date", async () => {
  const result = await fetchShanghaiIndexDate({ fetchImpl: fundFetch, now: () => 1 });

  assert.equal(result.data, "20250102");
});

test("fetchFundPublicData aggregates all fund source sections", async () => {
  const result = await fetchFundPublicData({
    fund: "161725",
    query: "白酒",
    start: "2025-01-01",
    end: "2025-01-31",
    pageSize: 5,
    fetchImpl: fundFetch,
    now: () => 1,
    includeRaw: true,
  });

  assert.equal(result.fundCode, "161725");
  assert.equal(result.estimate.estimatedNav, 1.25);
  assert.equal(result.navHistory[0].date, "2025-01-02");
  assert.equal(result.holdings.rows[0].stockName, "贵州茅台");
  assert.equal(result.profile.fundCode, "161725");
  assert.equal(result.pingzhongdata.assetAllocation[0].name, "股票");
  assert.equal(result.sinaEstimate2.estimatedNav, 1.25);
  assert.equal(result.marketIndices[0].price, 3000);
  assert.equal(result.search[0].fundName, "招商中证白酒指数");
  assert.equal(typeof result.raw.estimate, "string");
});
