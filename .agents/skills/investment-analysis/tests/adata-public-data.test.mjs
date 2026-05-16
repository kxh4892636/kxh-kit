import assert from "node:assert/strict";
import test from "node:test";

import {
  fetchAdataPublicData,
  fetchBaiduIndexConstituents,
  fetchBaiduStockDividend,
  fetchBaiduStockIndustry,
  fetchBaiduStockKline,
  fetchBaiduStockMinute,
  fetchBaiduStockOrderBook,
  fetchBaiduStockTicks,
  fetchEastmoneyAStockList,
  fetchEastmoneyCapitalFlowDaily,
  fetchEastmoneyCapitalFlowMinute,
  fetchEastmoneyConceptConstituents,
  fetchEastmoneyConceptList,
  fetchEastmoneyEtfList,
  fetchEastmoneyFinancialCore,
  fetchEastmoneyHotRank,
  fetchEastmoneyIndexCurrent,
  fetchEastmoneyIndexKline,
  fetchEastmoneyIndexList,
  fetchEastmoneyNewStockList,
  fetchEastmoneyNorthFlow,
  fetchEastmoneySecuritiesMargin,
  fetchEastmoneyStockConcepts,
  fetchEastmoneyStockKline,
  fetchEastmoneyStockMinute,
  fetchEastmoneyStockPlates,
  fetchEastmoneyStockShares,
  fetchSzseTradeCalendar,
  fetchTdxMineClearance,
  fetchThsEtfKline,
} from "../scripts/adata-public-data.mjs";

function jsonResponse(data, status = 200) {
  return {
    status,
    ok: status >= 200 && status < 300,
    text: async () => JSON.stringify(data),
  };
}

function textResponse(text, status = 200) {
  return {
    status,
    ok: status >= 200 && status < 300,
    text: async () => text,
  };
}

function baiduKlineJson() {
  return {
    ResultCode: 0,
    Result: {
      newMarketData: {
        headers: ["日期", "开盘", "收盘"],
        keys: [
          "timestamp",
          "time",
          "open",
          "close",
          "volume",
          "high",
          "low",
          "amount",
          "range",
          "ratio",
          "turnoverratio",
          "preClose",
        ],
        marketData: "1735776000,2025-01-02,10,11,100,12,9,1000,1,10,2,9;",
      },
      priceinfo: [["1735776000", "11", "10%", "1", "100", "10.5", "1000", "", "2025-01-02 09:31", "1000"]],
    },
  };
}

function baiduQuoteJson() {
  return {
    ResultCode: 0,
    Result: {
      basicinfos: { name: "贵州茅台" },
      askinfos: [{ askprice: "101", askvolume: "10" }],
      buyinfos: [{ bidprice: "100", bidvolume: "12" }],
      detailinfos: [[1735776000, "100", "101", "买盘", "B", "09:31:00"]],
    },
  };
}

function eastmoneyListJson() {
  return {
    data: {
      total: 1,
      diff: [{ f12: "512880", f13: 1, f14: "证券ETF", f2: "1.10", f3: "2.30", f4: "0.02", f5: "100", f6: "1000", f17: "1.00", f18: "0.99", f62: "123" }],
    },
  };
}

function financialCoreJson() {
  return {
    result: {
      pages: 1,
      data: [
        {
          SECURITY_CODE: "600519",
          SECURITY_NAME_ABBR: "贵州茅台",
          REPORT_DATE: "2025-03-31 00:00:00",
          REPORT_TYPE: "一季报",
          NOTICE_DATE: "2025-04-30 00:00:00",
          CURRENCY: "CNY",
          EPSJB: "10.1",
          BPS: "200.5",
          MGJYXJJE: "12.3",
          TOTALOPERATEREVE: "1000000",
          PARENTNETPROFIT: "500000",
          TOTALOPERATEREVETZ: "5.5",
          PARENTNETPROFITTZ: "6.6",
          ROEJQ: "5.2",
          XSMLL: "90.1",
          XSJLL: "50.2",
          ZCFZL: "20.3",
          LD: "3.2",
          SD: "3.0",
        },
      ],
    },
  };
}

function eastmoneyKlineJson() {
  return {
    data: {
      code: "600519",
      name: "贵州茅台",
      market: 1,
      decimal: 2,
      klines: ["2025-01-02,100,101,102,99,1000,100000,3,1,1,0.5"],
    },
  };
}

function eastmoneyMinuteJson() {
  return {
    data: {
      preClose: 100,
      trends: ["2025-01-02 09:31,100,101,102,99,10,1000,100.5"],
    },
  };
}

function flowJson() {
  return { data: { klines: ["2025-01-02,1,2,3,4,5"] } };
}

function conceptJson() {
  return {
    success: true,
    result: {
      data: [
        {
          SECURITY_CODE: "600519",
          SECURITY_NAME_ABBR: "贵州茅台",
          NEW_BOARD_CODE: "BK0001",
          BOARD_CODE: "1",
          BOARD_NAME: "白酒",
          SELECTED_BOARD_REASON: "主营白酒",
          BOARD_TYPE: "行业",
          BOARD_RANK: "1",
          BOARD_YIELD: "2.2",
        },
      ],
    },
  };
}

function sharesJson() {
  return {
    success: true,
    result: {
      data: [
        {
          SECURITY_CODE: "600519",
          END_DATE: "2025-01-02 00:00:00",
          TOTAL_SHARES: "1000",
          LIMITED_SHARES: "100",
          LISTED_A_SHARES: "900",
          FREE_SHARES: "800",
          CHANGE_REASON: "定期报告",
        },
      ],
    },
  };
}

function dividendJson() {
  return {
    ResultCode: "0",
    Result: [
      {
        DisplayData: {
          resultData: {
            tplData: {
              result: {
                tabs: [
                  {
                    content: {
                      newCompany: {
                        bonusTransfer: {
                          body: [{ 公告日: "2025-01-01", 分红方案: "10派10元", 除权除息日: "2025-02-01" }],
                        },
                      },
                    },
                  },
                ],
              },
            },
          },
        },
      },
    ],
  };
}

function industryJson() {
  return {
    Result: {
      "600519": [{ name: "行业", list: [{ xcx_query: "code=801125", name: "白酒", describe: "申万二级" }] }],
    },
  };
}

function northJson() {
  return { result: { data: [{ TRADE_DATE: "2025-01-02 00:00:00", MUTUAL_TYPE: "001", NET_DEAL_AMT: "1", BUY_AMT: "2", SELL_AMT: "1" }] } };
}

function marginJson() {
  return { success: true, result: { pages: 1, data: [{ DIM_DATE: "2025-01-02 00:00:00", RZYE: "1", RQYE: "2", RZRQYE: "3", RZRQYECZ: "4" }] } };
}

function indexConstituentJson() {
  return { ResultCode: "0", Result: [{ DisplayData: { resultData: { tplData: { result: { list: [{ code: "600519", name: "贵州茅台" }] } } } } }] };
}

function indexCurrentJson() {
  return { data: { f58: "沪深300", f57: "000300", f43: 400000, f46: 399000, f44: 401000, f45: 398000, f47: 100, f48: 1000, f60: 399000, f170: 25 } };
}

function calendarJson() {
  return { data: [{ jyrq: "2025-01-02", jybz: "1", zrxh: "4" }] };
}

function mineJson() {
  return { name: "贵州茅台", data: [{ name: "财务风险", rows: [{ lx: "盈利", trigyy: "无", trig: 0, fs: 1, commonlxid: [] }] }] };
}

function newStockJson() {
  return { result: { pages: 1, data: [{ SECURITY_CODE: "301000", SECURITY_NAME_ABBR: "新股" }] } };
}

function thsText() {
  return 'callback({"total":1,"data":"20250102,1,2,0.9,1.5,100,1000"});';
}

function adataFetch(url, init = {}) {
  const parsed = new URL(String(url));
  if (parsed.hostname === "finance.pae.baidu.com" && parsed.pathname.includes("/vapi/")) return jsonResponse(baiduQuoteJson());
  if (parsed.hostname === "finance.pae.baidu.com" && parsed.pathname.includes("/api/getrelatedblock")) return jsonResponse(industryJson());
  if (parsed.hostname === "finance.pae.baidu.com") return jsonResponse(baiduKlineJson());
  if (parsed.hostname === "gushitong.baidu.com" && parsed.searchParams.get("resource_id") === "5429") return jsonResponse(dividendJson());
  if (parsed.hostname === "gushitong.baidu.com") return jsonResponse(indexConstituentJson());
  if (parsed.hostname === "push2.eastmoney.com" && parsed.pathname.includes("/stock/trends2")) return jsonResponse(eastmoneyMinuteJson());
  if (parsed.hostname === "push2.eastmoney.com" && parsed.pathname.includes("/stock/fflow")) return jsonResponse(flowJson());
  if (parsed.hostname === "push2.eastmoney.com" && parsed.pathname.includes("/stock/get")) return jsonResponse(indexCurrentJson());
  if (parsed.hostname === "push2.eastmoney.com") return jsonResponse(eastmoneyListJson());
  if (parsed.hostname === "push2his.eastmoney.com" && parsed.pathname.includes("/fflow/")) return jsonResponse(flowJson());
  if (parsed.hostname === "push2his.eastmoney.com") return jsonResponse(eastmoneyKlineJson());
  if (parsed.hostname === "datacenter.eastmoney.com" && parsed.searchParams.get("reportName") === "RPT_F10_EH_EQUITY") return jsonResponse(sharesJson());
  if (parsed.hostname === "datacenter.eastmoney.com" && parsed.searchParams.get("type") === "RPT_F10_CORETHEME_BOARDTYPE") return jsonResponse(conceptJson());
  if (parsed.hostname === "datacenter.eastmoney.com" && parsed.searchParams.get("reportName") === "RPT_F10_CORETHEME_BOARDTYPE") return jsonResponse(conceptJson());
  if (parsed.hostname === "datacenter.eastmoney.com") return jsonResponse(financialCoreJson());
  if (parsed.hostname === "datacenter-web.eastmoney.com" && parsed.searchParams.get("reportName") === "RPTA_RZRQ_LSHJ") return jsonResponse(marginJson());
  if (parsed.hostname === "datacenter-web.eastmoney.com" && parsed.searchParams.get("reportName") === "RPTA_APP_IPOAPPLY") return jsonResponse(newStockJson());
  if (parsed.hostname === "datacenter-web.eastmoney.com") return jsonResponse(northJson());
  if (parsed.hostname === "emappdata.eastmoney.com") {
    assert.equal(init.method, "POST");
    return jsonResponse({ data: [{ sc: "SH600519" }] });
  }
  if (parsed.hostname === "www.szse.cn") return jsonResponse(calendarJson());
  if (parsed.hostname === "page3.tdx.com.cn") return jsonResponse(mineJson());
  if (parsed.hostname === "d.10jqka.com.cn") return textResponse(thsText());
  throw new Error(`Unexpected URL ${url}`);
}

test("Baidu stock market functions parse K-line, minute, order book and ticks", async () => {
  assert.equal((await fetchBaiduStockKline("600519", { fetchImpl: adataFetch, start: "2025-01-01", end: "2025-01-31" })).data.rows[0].close, 11);
  assert.equal((await fetchBaiduStockMinute("600519", { fetchImpl: adataFetch })).data.rows[0].price, 11);
  assert.equal((await fetchBaiduStockOrderBook("600519", { fetchImpl: adataFetch })).data.orderBook.asks[0].price, 101);
  assert.equal((await fetchBaiduStockTicks("600519", { fetchImpl: adataFetch })).data.rows[0].price, 101);
});

test("Eastmoney list and financial functions parse ETF, concepts, finance and market rows", async () => {
  assert.equal((await fetchEastmoneyEtfList({ fetchImpl: adataFetch, etfLimit: 5 })).data.rows[0].code, "512880");
  assert.equal((await fetchEastmoneyConceptList({ fetchImpl: adataFetch })).data.rows[0].conceptName, "证券ETF");
  assert.equal((await fetchEastmoneyConceptConstituents("BK0966", { fetchImpl: adataFetch })).data.rows[0].stockCode, "512880");
  assert.equal((await fetchEastmoneyFinancialCore("600519", { fetchImpl: adataFetch })).data.rows[0].roeWeighted, 5.2);
  assert.equal((await fetchEastmoneyStockKline("600519", { fetchImpl: adataFetch, start: "2025-01-01", end: "2025-01-31" })).data.rows[0].turnoverRatio, 0.5);
  assert.equal((await fetchEastmoneyStockMinute("600519", { fetchImpl: adataFetch })).data.rows[0].price, 101);
});

test("Eastmoney capital flow, concepts, plates and shares parse provider data", async () => {
  assert.equal((await fetchEastmoneyCapitalFlowDaily("600519", { fetchImpl: adataFetch })).data.rows[0].mainNetInflow, 1);
  assert.equal((await fetchEastmoneyCapitalFlowMinute("600519", { fetchImpl: adataFetch })).data.rows[0].extraLargeNetInflow, 5);
  assert.equal((await fetchEastmoneyStockConcepts("600519", { fetchImpl: adataFetch })).data.rows[0].conceptName, "白酒");
  assert.equal((await fetchEastmoneyStockPlates("600519", { fetchImpl: adataFetch })).data.rows[0].plateType, "行业");
  assert.equal((await fetchEastmoneyStockShares("600519", { fetchImpl: adataFetch })).data.rows[0].totalShares, 1000);
});

test("Dividend, industry, north flow, margin and hot rank functions parse source data", async () => {
  assert.equal((await fetchBaiduStockDividend("600519", { fetchImpl: adataFetch })).data.rows[0].dividendPlan, "10派10元");
  assert.equal((await fetchBaiduStockIndustry("600519", { fetchImpl: adataFetch })).data.rows[0].industryName, "白酒");
  assert.equal((await fetchEastmoneyNorthFlow({ fetchImpl: adataFetch })).data.shenzhen.rows[0].netDealAmount, 1);
  assert.equal((await fetchEastmoneySecuritiesMargin({ fetchImpl: adataFetch })).data.rows[0].marginBalance, 3);
  assert.equal((await fetchEastmoneyHotRank({ fetchImpl: adataFetch })).data.rows[0].rank, 1);
});

test("Index, calendar, risk and ETF THS functions parse source data", async () => {
  assert.equal((await fetchEastmoneyIndexList({ fetchImpl: adataFetch })).data.rows[0].indexCode, "512880");
  assert.equal((await fetchBaiduIndexConstituents("000300", { fetchImpl: adataFetch })).data.rows[0].stockCode, "600519");
  assert.equal((await fetchEastmoneyIndexKline("000300", { fetchImpl: adataFetch, start: "2025-01-01", end: "2025-01-31" })).data.rows[0].date, "2025-01-02");
  assert.equal((await fetchEastmoneyIndexCurrent("000300", { fetchImpl: adataFetch })).data.name, "沪深300");
  assert.equal((await fetchSzseTradeCalendar(2025, { fetchImpl: adataFetch, month: 1 })).data.rows[0].tradeStatus, 1);
  assert.equal((await fetchTdxMineClearance("600519", { fetchImpl: adataFetch })).data.stockName, "贵州茅台");
  assert.equal((await fetchEastmoneyAStockList({ fetchImpl: adataFetch })).data.rows[0].name, "证券ETF");
  assert.equal((await fetchEastmoneyNewStockList({ fetchImpl: adataFetch })).data.rows[0].SECURITY_CODE, "301000");
  assert.equal((await fetchThsEtfKline("512880", { fetchImpl: adataFetch, start: "2025-01-01", end: "2025-01-31" })).data.rows[0].close, 1.5);
});

test("fetchAdataPublicData aggregates source sections and records failures", async () => {
  const result = await fetchAdataPublicData({
    stock: "600519",
    etf: "512880",
    index: "000300",
    concept: "BK0966",
    start: "2025-01-01",
    end: "2025-01-31",
    etfLimit: 5,
    financePageSize: 5,
    fetchImpl: adataFetch,
    includeRaw: true,
    fetchedAt: "2025-01-31T00:00:00.000Z",
    month: 1,
    year: 2025,
  });

  assert.equal(result.stockCode, "600519");
  assert.equal(result.stockMarketBaidu.rows[0].open, 10);
  assert.equal(result.financialCoreEastmoney.rows[0].basicEps, 10.1);
  assert.equal(result.stockIndustryBaidu.rows[0].industryName, "白酒");
  assert.equal(result.indexCurrentEastmoney.name, "沪深300");
  assert.equal(result.thsEtfKline.rows[0].close, 1.5);
  assert.equal(Object.keys(result.errors).length, 0);
  assert.equal(typeof result.raw.stockMarketBaidu, "string");
});
