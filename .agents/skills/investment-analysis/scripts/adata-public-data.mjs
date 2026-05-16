#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULT_STOCK = "600519";
const DEFAULT_ETF = "512880";
const DEFAULT_START = "2025-01-01";
const DEFAULT_END = new Date().toISOString().slice(0, 10);

const headers = {
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36",
  accept: "application/json,text/plain,*/*",
};

function parseArgs(argv) {
  const options = {
    stock: DEFAULT_STOCK,
    etf: DEFAULT_ETF,
    index: "000300",
    concept: "BK0966",
    year: new Date().getFullYear(),
    start: DEFAULT_START,
    end: DEFAULT_END,
    etfLimit: 20,
    financePageSize: 20,
    output: "",
    includeRaw: false,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    const readValue = () => {
      if (arg.includes("=")) return arg.slice(arg.indexOf("=") + 1);
      i += 1;
      return argv[i];
    };

    if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg.startsWith("--stock")) options.stock = readValue();
    else if (arg.startsWith("--etf")) options.etf = readValue();
    else if (arg.startsWith("--index")) options.index = readValue();
    else if (arg.startsWith("--concept")) options.concept = readValue();
    else if (arg.startsWith("--year")) options.year = Number(readValue()) || new Date().getFullYear();
    else if (arg.startsWith("--month")) options.month = Number(readValue()) || undefined;
    else if (arg.startsWith("--start")) options.start = readValue();
    else if (arg.startsWith("--end")) options.end = readValue();
    else if (arg.startsWith("--etf-limit")) options.etfLimit = Number(readValue()) || 20;
    else if (arg.startsWith("--finance-page-size")) options.financePageSize = Number(readValue()) || 20;
    else if (arg.startsWith("--out")) options.output = readValue();
    else if (arg === "--include-raw") options.includeRaw = true;
    else if (!arg.startsWith("-")) options.stock = arg;
  }

  return options;
}

function printHelp() {
  console.log(`Usage:
  node scripts/adata-public-data.mjs [stockCode] [--etf=512880] [--index=000300] [--concept=BK0966] [--start=YYYY-MM-DD] [--end=YYYY-MM-DD] [--out=/tmp/adata.json]

What it fetches:
  - Baidu stock K-line/minute/order book/ticks/industry/dividend endpoints
  - Eastmoney ETF, concept, index, stock financial, capital-flow, north-flow, margin, hot-rank, A-share, and new-stock endpoints
  - SZSE trading calendar, TDX risk scan, and THS ETF K-line endpoints

This script uses only Node built-ins and global fetch. No npm packages are required.`);
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "" || value === "--") return null;
  const normalized = String(value).replace(/,/g, "").replace("%", "").replace("+", "");
  const numberValue = Number(normalized);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function compactDate(value) {
  return String(value || "").replace(/-/g, "");
}

function compileExchangeCode(stockCode) {
  if (stockCode.startsWith("6")) return `${stockCode}.SH`;
  if (stockCode.startsWith("0") || stockCode.startsWith("3")) return `${stockCode}.SZ`;
  if (stockCode.startsWith("8") || stockCode.startsWith("4")) return `${stockCode}.BJ`;
  return stockCode;
}

function eastmoneySecid(code) {
  if (code.startsWith("6")) return `1.${code}`;
  if (code.startsWith("0") || code.startsWith("3")) return `0.${code}`;
  return `0.${code}`;
}

async function fetchText(url, options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (!fetchImpl) throw new Error("global fetch is unavailable; use Node 18+ or pass options.fetchImpl");
  const response = await fetchImpl(url, {
    method: options.method || "GET",
    headers: {
      ...headers,
      ...(options.referer ? { referer: options.referer } : {}),
      ...(options.headers || {}),
    },
    ...(options.body ? { body: options.body } : {}),
  });
  const text = await response.text();
  return {
    url: String(url),
    status: response.status ?? null,
    ok: response.ok ?? (response.status >= 200 && response.status < 300),
    bytes: Buffer.byteLength(text),
    text,
  };
}

async function fetchJson(url, options = {}) {
  const response = await fetchText(url, options);
  try {
    return {
      ...response,
      json: JSON.parse(response.text),
    };
  } catch {
    throw new Error(`Non-JSON response from ${url}: ${response.text.slice(0, 120)}`);
  }
}

function parseBaiduKline(json, stockCode, startDate, endDate) {
  const market = json?.Result?.newMarketData;
  const keys = market?.keys || [];
  const raw = typeof market?.marketData === "string" ? market.marketData : "";
  const rows = raw
    .split(";")
    .filter(Boolean)
    .map((line) => {
      const values = line.split(",");
      const row = Object.fromEntries(keys.map((key, index) => [key, values[index] ?? null]));
      return {
        stockCode,
        timestamp: numberOrNull(row.timestamp),
        time: row.time || null,
        open: numberOrNull(row.open),
        close: numberOrNull(row.close),
        volume: numberOrNull(row.volume),
        high: numberOrNull(row.high),
        low: numberOrNull(row.low),
        amount: numberOrNull(row.amount),
        change: numberOrNull(row.range),
        changePct: numberOrNull(row.ratio),
        turnoverRatio: numberOrNull(row.turnoverratio),
        preClose: numberOrNull(row.preClose),
      };
    })
    .filter((row) => {
      if (!row.time) return false;
      return row.time >= startDate && row.time <= endDate && ((row.amount || 0) > 0 || (row.volume || 0) > 0);
    });
  return {
    resultCode: json?.ResultCode ?? null,
    stockCode,
    headers: market?.headers || [],
    keys,
    rows,
  };
}

function parseEtfList(json) {
  const rows = Array.isArray(json?.data?.diff) ? json.data.diff : [];
  return {
    total: json?.data?.total ?? rows.length,
    rows: rows.map((item) => ({
      code: item.f12 || null,
      market: item.f13 ?? null,
      name: item.f14 || null,
      latestPrice: numberOrNull(item.f2),
      changePct: numberOrNull(item.f3),
      change: numberOrNull(item.f4),
      volume: numberOrNull(item.f5),
      amount: numberOrNull(item.f6),
      open: numberOrNull(item.f17),
      preClose: numberOrNull(item.f18),
    })),
  };
}

function parseFinancialCore(json) {
  const rows = Array.isArray(json?.result?.data) ? json.result.data : [];
  return {
    pages: json?.result?.pages ?? null,
    rows: rows.map((item) => ({
      stockCode: item.SECURITY_CODE || null,
      shortName: item.SECURITY_NAME_ABBR || null,
      reportDate: item.REPORT_DATE ? item.REPORT_DATE.slice(0, 10) : null,
      reportType: item.REPORT_TYPE || null,
      noticeDate: item.NOTICE_DATE ? item.NOTICE_DATE.slice(0, 10) : null,
      currency: item.CURRENCY || null,
      basicEps: numberOrNull(item.EPSJB),
      netAssetPerShare: numberOrNull(item.BPS),
      operatingCashFlowPerShare: numberOrNull(item.MGJYXJJE),
      revenue: numberOrNull(item.TOTALOPERATEREVE),
      netProfitAttributable: numberOrNull(item.PARENTNETPROFIT),
      revenueYoy: numberOrNull(item.TOTALOPERATEREVETZ),
      netProfitYoy: numberOrNull(item.PARENTNETPROFITTZ),
      roeWeighted: numberOrNull(item.ROEJQ),
      grossMargin: numberOrNull(item.XSMLL),
      netMargin: numberOrNull(item.XSJLL),
      assetLiabilityRatio: numberOrNull(item.ZCFZL),
      currentRatio: numberOrNull(item.LD),
      quickRatio: numberOrNull(item.SD),
    })),
  };
}

function parseEastmoneyStockKline(json, stockCode) {
  const data = json?.data || {};
  const rows = Array.isArray(data.klines)
    ? data.klines.map((line) => {
        const [
          date,
          open,
          close,
          high,
          low,
          volume,
          amount,
          amplitude,
          changePct,
          change,
          turnoverRatio,
        ] = String(line).split(",");
        return {
          date,
          open: numberOrNull(open),
          close: numberOrNull(close),
          high: numberOrNull(high),
          low: numberOrNull(low),
          volume: numberOrNull(volume),
          amount: numberOrNull(amount),
          amplitude: numberOrNull(amplitude),
          changePct: numberOrNull(changePct),
          change: numberOrNull(change),
          turnoverRatio: numberOrNull(turnoverRatio),
        };
      })
    : [];

  return {
    stockCode,
    secid: data.code || null,
    name: data.name || null,
    market: data.market ?? null,
    decimal: data.decimal ?? null,
    rows,
  };
}

function parseBaiduMinute(json, stockCode) {
  const rows = Array.isArray(json?.Result?.priceinfo) ? json.Result.priceinfo : [];
  return {
    resultCode: json?.ResultCode ?? null,
    stockCode,
    rows: rows.map((row) => ({
      stockCode,
      time: row[0] || null,
      price: numberOrNull(row[1]),
      changePct: numberOrNull(row[2]),
      change: numberOrNull(row[3]),
      volume: numberOrNull(row[4]) === null ? null : numberOrNull(row[4]) * 100,
      avgPrice: numberOrNull(row[5]),
      amount: numberOrNull(row[9] ?? row[6]),
      tradeTime: row[8] || null,
    })),
  };
}

function parseBaiduQuoteDetail(json, stockCode) {
  const result = json?.Result || {};
  const asks = Array.isArray(result.askinfos) ? result.askinfos : [];
  const bids = Array.isArray(result.buyinfos) ? result.buyinfos : [];
  const details = Array.isArray(result.detailinfos) ? result.detailinfos : [];
  return {
    resultCode: json?.ResultCode ?? null,
    stockCode,
    shortName: result.basicinfos?.name || null,
    orderBook: {
      asks: asks.map((item, index) => ({
        level: asks.length - index,
        price: numberOrNull(item.askprice),
        volume: numberOrNull(item.askvolume),
      })),
      bids: bids.map((item, index) => ({
        level: index + 1,
        price: numberOrNull(item.bidprice),
        volume: numberOrNull(item.bidvolume),
      })),
    },
    ticks: details.map((row) => ({
      stockCode,
      timestamp: numberOrNull(row[0]),
      tradeTime: row[5] || null,
      volume: numberOrNull(row[1]),
      price: numberOrNull(row[2]),
      type: row[3] || null,
      bsType: row[4] || null,
    })),
  };
}

function parseEastmoneyMinute(json, stockCode) {
  const data = json?.data || {};
  const preClose = numberOrNull(data.preClose);
  const rows = Array.isArray(data.trends)
    ? data.trends.map((line) => {
        const [tradeTime, open, close, high, low, volume, amount, avgPrice] = String(line).split(",");
        const price = numberOrNull(close);
        const change = price !== null && preClose !== null ? price - preClose : null;
        return {
          stockCode,
          tradeTime,
          open: numberOrNull(open),
          close: price,
          high: numberOrNull(high),
          low: numberOrNull(low),
          volume: numberOrNull(volume) === null ? null : numberOrNull(volume) * 100,
          amount: numberOrNull(amount),
          price,
          avgPrice: numberOrNull(avgPrice),
          change,
          changePct: change !== null && preClose ? (change / preClose) * 100 : null,
        };
      })
    : [];
  return { stockCode, preClose, rows };
}

function parseCapitalFlowDaily(json, stockCode) {
  const rows = Array.isArray(json?.data?.klines) ? json.data.klines : [];
  return {
    stockCode,
    rows: rows.map((line) => {
      const [tradeDate, main, small, middle, large, extraLarge] = String(line).split(",");
      return {
        stockCode,
        tradeDate,
        mainNetInflow: numberOrNull(main),
        smallNetInflow: numberOrNull(small),
        middleNetInflow: numberOrNull(middle),
        largeNetInflow: numberOrNull(large),
        extraLargeNetInflow: numberOrNull(extraLarge),
      };
    }),
  };
}

function parseCapitalFlowMinute(json, stockCode) {
  const rows = Array.isArray(json?.data?.klines) ? json.data.klines : [];
  return {
    stockCode,
    rows: rows.map((line) => {
      const [tradeTime, main, small, middle, large, extraLarge] = String(line).split(",");
      return {
        stockCode,
        tradeTime,
        mainNetInflow: numberOrNull(main),
        smallNetInflow: numberOrNull(small),
        middleNetInflow: numberOrNull(middle),
        largeNetInflow: numberOrNull(large),
        extraLargeNetInflow: numberOrNull(extraLarge),
      };
    }),
  };
}

function parseConcepts(json) {
  const rows = Array.isArray(json?.result?.data) ? json.result.data : [];
  return {
    rows: rows.map((item) => ({
      stockCode: item.SECURITY_CODE || null,
      stockName: item.SECURITY_NAME_ABBR || null,
      conceptCode: item.NEW_BOARD_CODE || item.BOARD_CODE || null,
      conceptName: item.BOARD_NAME || null,
      reason: item.SELECTED_BOARD_REASON || null,
      boardYield: numberOrNull(item.BOARD_YIELD),
      boardRank: numberOrNull(item.BOARD_RANK),
      source: "Eastmoney",
    })),
  };
}

function parsePlates(json) {
  const rows = Array.isArray(json?.result?.data) ? json.result.data : [];
  return {
    rows: rows.map((item) => ({
      stockCode: item.SECURITY_CODE || null,
      stockName: item.SECURITY_NAME_ABBR || null,
      plateCode: item.BOARD_CODE ? `BK${String(item.BOARD_CODE).padStart(4, "0").slice(-4)}` : null,
      plateName: item.BOARD_NAME || null,
      plateType: item.BOARD_TYPE || "概念",
      boardRank: numberOrNull(item.BOARD_RANK),
      source: "Eastmoney",
    })),
  };
}

function parseStockShares(json) {
  const rows = Array.isArray(json?.result?.data) ? json.result.data : [];
  return {
    rows: rows.map((item) => ({
      stockCode: item.SECURITY_CODE || null,
      changeDate: item.END_DATE ? item.END_DATE.slice(0, 10) : null,
      totalShares: numberOrNull(item.TOTAL_SHARES),
      limitedShares: numberOrNull(item.LIMITED_SHARES),
      listedAShares: numberOrNull(item.LISTED_A_SHARES),
      freeShares: numberOrNull(item.FREE_SHARES),
      changeReason: item.CHANGE_REASON || null,
    })),
  };
}

function parseBaiduDividend(json, stockCode) {
  let body = [];
  try {
    const tabs = json.Result?.at(-1)?.DisplayData?.resultData?.tplData?.result?.tabs || [];
    body = tabs.at(-1)?.content?.newCompany?.bonusTransfer?.body || [];
  } catch {
    body = [];
  }
  return {
    stockCode,
    rows: body
      .filter((row) => row?.["分红方案"] && row["分红方案"] !== "利润不分配")
      .map((row) => ({
        stockCode,
        reportDate: row["公告日"] || null,
        dividendPlan: row["分红方案"] || null,
        exDividendDate: row["除权除息日"] && row["除权除息日"] !== "--" ? row["除权除息日"] : null,
        raw: row,
      })),
  };
}

function parseBaiduIndustry(json) {
  const result = json?.Result || {};
  const rows = [];
  for (const [stockCode, groups] of Object.entries(result)) {
    for (const group of Array.isArray(groups) ? groups : []) {
      if (group?.name !== "行业") continue;
      for (const item of Array.isArray(group.list) ? group.list : []) {
        const query = new URLSearchParams(String(item.xcx_query || "").replace(/^\?/, ""));
        rows.push({
          stockCode,
          swCode: query.get("code") || null,
          industryName: item.name || null,
          industryType: item.describe || null,
          source: "Baidu",
        });
      }
    }
  }
  return { rows };
}

function parseNorthFlow(dataRows) {
  return {
    rows: dataRows.map((item) => ({
      tradeDate: item.TRADE_DATE ? item.TRADE_DATE.slice(0, 10) : null,
      mutualType: item.MUTUAL_TYPE || null,
      netDealAmount: numberOrNull(item.NET_DEAL_AMT),
      buyAmount: numberOrNull(item.BUY_AMT),
      sellAmount: numberOrNull(item.SELL_AMT),
    })),
  };
}

function parseSecuritiesMargin(json) {
  const rows = Array.isArray(json?.result?.data) ? json.result.data : [];
  return {
    pages: json?.result?.pages ?? null,
    rows: rows.map((item) => ({
      tradeDate: item.DIM_DATE ? item.DIM_DATE.slice(0, 10) : null,
      financingBalance: numberOrNull(item.RZYE),
      securitiesLendingBalance: numberOrNull(item.RQYE),
      marginBalance: numberOrNull(item.RZRQYE),
      marginBalanceChange: numberOrNull(item.RZRQYECZ),
    })),
  };
}

function parseHotRank(json) {
  const rows = Array.isArray(json?.data) ? json.data : [];
  return { rows: rows.map((item, index) => ({ rank: index + 1, rawCode: item.sc || null, raw: item })) };
}

function parseConceptList(json) {
  const rows = Array.isArray(json?.data?.diff) ? json.data.diff : [];
  return {
    total: json?.data?.total ?? rows.length,
    rows: rows.map((item) => ({
      conceptCode: item.f12 || null,
      market: item.f13 ?? null,
      conceptName: item.f14 || null,
      mainNetInflow: numberOrNull(item.f62),
      changePct: numberOrNull(item.f3),
    })),
  };
}

function parseConceptConstituents(json) {
  const rows = Array.isArray(json?.data?.diff) ? json.data.diff : [];
  return {
    total: json?.data?.total ?? rows.length,
    rows: rows.map((item) => ({
      stockCode: item.f12 || null,
      stockName: item.f14 || null,
      mainNetInflow: numberOrNull(item.f62),
    })),
  };
}

function parseIndexList(json) {
  const rows = Array.isArray(json?.data?.diff) ? json.data.diff : [];
  return {
    total: json?.data?.total ?? rows.length,
    rows: rows.map((item) => ({
      indexCode: item.f12 || null,
      market: item.f13 ?? null,
      indexName: item.f14 || null,
      source: "Eastmoney",
    })),
  };
}

function parseIndexConstituents(json, indexCode) {
  let rows = [];
  try {
    const result = json.Result?.at(-1)?.DisplayData?.resultData?.tplData?.result?.list || [];
    rows = result.map((item) => ({
      indexCode,
      stockCode: item.code || null,
      stockName: item.name || null,
      raw: item,
    }));
  } catch {
    rows = [];
  }
  return { indexCode, rows };
}

function indexSecid(indexCode) {
  if (String(indexCode).startsWith("93")) return `2.${indexCode}`;
  if (String(indexCode).startsWith("0")) return `1.${indexCode}`;
  return `0.${indexCode}`;
}

function parseIndexCurrent(json, indexCode) {
  const item = json?.data || {};
  const preClose = numberOrNull(item.f60);
  const priceRaw = numberOrNull(item.f43);
  const price = priceRaw === null ? null : priceRaw / 100;
  return {
    indexCode,
    name: item.f58 || null,
    price,
    open: numberOrNull(item.f46) === null ? null : numberOrNull(item.f46) / 100,
    high: numberOrNull(item.f44) === null ? null : numberOrNull(item.f44) / 100,
    low: numberOrNull(item.f45) === null ? null : numberOrNull(item.f45) / 100,
    volume: numberOrNull(item.f47),
    amount: numberOrNull(item.f48),
    change: price !== null && preClose !== null ? price - preClose / 100 : null,
    changePct: numberOrNull(item.f170) === null ? null : numberOrNull(item.f170) / 100,
  };
}

function parseTradeCalendar(json) {
  const rows = Array.isArray(json?.data) ? json.data : [];
  return {
    rows: rows.map((item) => ({
      tradeDate: item.jyrq || null,
      tradeStatus: numberOrNull(item.jybz),
      dayWeek: numberOrNull(item.zrxh),
    })),
  };
}

function parseTdxMineClearance(json, stockCode) {
  const rows = [];
  let score = 100;
  for (const group of Array.isArray(json?.data) ? json.data : []) {
    for (const item of Array.isArray(group.rows) ? group.rows : []) {
      const common = Array.isArray(item.commonlxid) ? item.commonlxid : [];
      if (item.trigyy && common.length === 0) {
        rows.push({
          stockCode,
          stockName: json.name || null,
          firstType: group.name || null,
          secondType: item.lx || null,
          thirdType: null,
          reason: item.trigyy,
          scoreDeduction: numberOrNull(item.fs),
        });
        if (item.trig === 1 && numberOrNull(item.fs) !== null) score -= numberOrNull(item.fs);
      }
      for (const sub of common) {
        if (!sub.trigyy) continue;
        rows.push({
          stockCode,
          stockName: json.name || null,
          firstType: group.name || null,
          secondType: item.lx || null,
          thirdType: sub.lx || null,
          reason: sub.trigyy,
          scoreDeduction: numberOrNull(sub.fs),
        });
        if (sub.trig === 1 && numberOrNull(sub.fs) !== null) score -= numberOrNull(sub.fs);
      }
    }
  }
  return {
    stockCode,
    stockName: json?.name || null,
    score: Math.max(score, 1),
    rows,
  };
}

function parseThsJsonp(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error(`Cannot parse THS response: ${text.slice(0, 120)}`);
  return JSON.parse(text.slice(start, end + 1));
}

function parseThsEtfKline(json, etfCode, startDate, endDate) {
  const rows = String(json?.data || "")
    .split(";")
    .filter(Boolean)
    .map((line) => {
      const [date, open, high, low, close, volume, amount] = line.split(",");
      return {
        etfCode,
        tradeDate: date?.replace(/^(\d{4})(\d{2})(\d{2})$/, "$1-$2-$3") || null,
        open: numberOrNull(open),
        high: numberOrNull(high),
        low: numberOrNull(low),
        close: numberOrNull(close),
        volume: numberOrNull(volume),
        amount: numberOrNull(amount),
      };
    })
    .filter((row) => {
      if (!row.tradeDate) return false;
      return row.tradeDate >= startDate && row.tradeDate <= endDate && (row.volume || 0) > 0;
    });
  return { etfCode, total: json?.total ?? rows.length, rows };
}

export async function fetchBaiduStockKline(stockCode, options = {}) {
  const start = options.start || DEFAULT_START;
  const end = options.end || DEFAULT_END;
  const url =
    "https://finance.pae.baidu.com/selfselect/getstockquotation?" +
    new URLSearchParams({
      all: "1",
      isIndex: "false",
      isBk: "false",
      isBlock: "false",
      isFutures: "false",
      isStock: "true",
      newFormat: "1",
      group: "quotation_kline_ab",
      finClientType: "pc",
      code: stockCode,
      start_time: `${start} 00:00:00`,
      ktype: "1",
    });
  const response = await fetchJson(url, { ...options, referer: "https://gushitong.baidu.com/" });
  return {
    response,
    data: parseBaiduKline(response.json, stockCode, start, end),
  };
}

export async function fetchBaiduStockMinute(stockCode, options = {}) {
  const url =
    "https://finance.pae.baidu.com/selfselect/getstockquotation?" +
    new URLSearchParams({
      all: "1",
      isIndex: "false",
      isBk: "false",
      isBlock: "false",
      isFutures: "false",
      isStock: "true",
      newFormat: "1",
      group: "quotation_minute_ab",
      finClientType: "pc",
      code: stockCode,
    });
  const response = await fetchJson(url, { ...options, referer: "https://gushitong.baidu.com/" });
  return { response, data: parseBaiduMinute(response.json, stockCode) };
}

export async function fetchBaiduStockOrderBook(stockCode, options = {}) {
  const url =
    "https://finance.pae.baidu.com/vapi/v1/getquotation?" +
    new URLSearchParams({
      srcid: "5353",
      all: "1",
      pointType: "string",
      group: "quotation_minute_ab",
      query: stockCode,
      code: stockCode,
      market_type: "ab",
      newFormat: "1",
      finClientType: "pc",
    });
  const response = await fetchJson(url, { ...options, referer: "https://gushitong.baidu.com/" });
  const detail = parseBaiduQuoteDetail(response.json, stockCode);
  return { response, data: { ...detail, ticks: undefined } };
}

export async function fetchBaiduStockTicks(stockCode, options = {}) {
  const url =
    "https://finance.pae.baidu.com/vapi/v1/getquotation?" +
    new URLSearchParams({
      srcid: "5353",
      all: "1",
      pointType: "string",
      group: "quotation_minute_ab",
      query: stockCode,
      code: stockCode,
      market_type: "ab",
      newFormat: "1",
      finClientType: "pc",
    });
  const response = await fetchJson(url, { ...options, referer: "https://gushitong.baidu.com/" });
  const detail = parseBaiduQuoteDetail(response.json, stockCode);
  return { response, data: { stockCode, shortName: detail.shortName, rows: detail.ticks } };
}

export async function fetchEastmoneyEtfList(options = {}) {
  const limit = options.etfLimit || options.limit || 20;
  const url =
    "http://push2.eastmoney.com/api/qt/clist/get?" +
    new URLSearchParams({
      pn: "1",
      pz: String(limit),
      po: "1",
      np: "1",
      fltt: "2",
      invt: "2",
      fs: "b:MK0021,b:MK0022,b:MK0023,b:MK0024",
      fields: "f12,f13,f14,f2,f3,f4,f5,f6,f17,f18",
    });
  const response = await fetchJson(url, {
    ...options,
    referer: "http://quote.eastmoney.com/center/gridlist.html#fund_etf",
  });
  return {
    response,
    data: parseEtfList(response.json),
  };
}

export async function fetchEastmoneyConceptList(options = {}) {
  const page = options.page || 1;
  const pageSize = options.pageSize || 100;
  const url =
    "https://push2.eastmoney.com/api/qt/clist/get?" +
    new URLSearchParams({
      pn: String(page),
      pz: String(pageSize),
      po: "1",
      np: "1",
      fltt: "2",
      invt: "2",
      fid: "f62",
      fs: "m:90+t:3",
      fields: "f12,f13,f14,f62,f3",
    });
  const response = await fetchJson(url, options);
  return { response, data: parseConceptList(response.json) };
}

export async function fetchEastmoneyConceptConstituents(conceptCode, options = {}) {
  const page = options.page || 1;
  const pageSize = options.pageSize || 200;
  const url =
    "https://push2.eastmoney.com/api/qt/clist/get?" +
    new URLSearchParams({
      fid: "f62",
      po: "1",
      pz: String(pageSize),
      pn: String(page),
      np: "1",
      fltt: "2",
      invt: "2",
      fs: `b:${conceptCode}`,
      fields: "f12,f14,f62",
    });
  const response = await fetchJson(url, options);
  return { response, data: parseConceptConstituents(response.json) };
}

export async function fetchEastmoneyFinancialCore(stockCode, options = {}) {
  const secuCode = options.secuCode || compileExchangeCode(stockCode);
  const pageSize = options.financePageSize || options.pageSize || 20;
  const url =
    "https://datacenter.eastmoney.com/securities/api/data/get?" +
    new URLSearchParams({
      type: "RPT_F10_FINANCE_MAINFINADATA",
      sty: "APP_F10_MAINFINADATA",
      quoteColumns: "",
      filter: `(SECUCODE="${secuCode}")`,
      p: String(options.page || 1),
      ps: String(pageSize),
      sr: "-1",
      st: "REPORT_DATE",
      source: "HSF10",
      client: "PC",
    });
  const response = await fetchJson(url, {
    ...options,
    referer: "https://emweb.securities.eastmoney.com/",
  });
  return {
    response,
    data: parseFinancialCore(response.json),
  };
}

export async function fetchEastmoneyStockMinute(stockCode, options = {}) {
  const url =
    "https://push2.eastmoney.com/api/qt/stock/trends2/get?" +
    new URLSearchParams({
      fields1: "f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f11,f12,f13",
      fields2: "f51,f52,f53,f54,f55,f56,f57,f58",
      ut: "fa5fd1943c7b386f172d6893dbfba10b",
      ndays: "1",
      iscr: "1",
      iscca: "0",
      secid: eastmoneySecid(stockCode),
    });
  const response = await fetchJson(url, { ...options, referer: "http://quote.eastmoney.com/" });
  return { response, data: parseEastmoneyMinute(response.json, stockCode) };
}

export async function fetchEastmoneyStockKline(stockCode, options = {}) {
  const start = compactDate(options.start || DEFAULT_START);
  const end = compactDate(options.end || DEFAULT_END);
  const url =
    "http://push2his.eastmoney.com/api/qt/stock/kline/get?" +
    new URLSearchParams({
      secid: eastmoneySecid(stockCode),
      fields1: "f1,f2,f3,f4,f5,f6",
      fields2: "f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61",
      klt: "101",
      fqt: "1",
      beg: start,
      end,
    });
  const response = await fetchJson(url, { ...options, referer: "http://quote.eastmoney.com/" });
  return {
    response,
    data: parseEastmoneyStockKline(response.json, stockCode),
  };
}

export async function fetchEastmoneyCapitalFlowDaily(stockCode, options = {}) {
  const url =
    "https://push2his.eastmoney.com/api/qt/stock/fflow/daykline/get?" +
    new URLSearchParams({
      lmt: "0",
      klt: "101",
      fields1: "f1,f2,f3,f7",
      fields2: "f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61",
      secid: eastmoneySecid(stockCode),
    });
  const response = await fetchJson(url, { ...options, referer: "https://data.eastmoney.com/zjlx/" });
  return { response, data: parseCapitalFlowDaily(response.json, stockCode) };
}

export async function fetchEastmoneyCapitalFlowMinute(stockCode, options = {}) {
  const url =
    "https://push2.eastmoney.com/api/qt/stock/fflow/kline/get?" +
    new URLSearchParams({
      lmt: "0",
      klt: "1",
      fields1: "f1,f2,f3,f7",
      fields2: "f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61,f62,f63,f64,f65",
      secid: eastmoneySecid(stockCode),
    });
  const response = await fetchJson(url, { ...options, referer: "https://data.eastmoney.com/zjlx/" });
  return { response, data: parseCapitalFlowMinute(response.json, stockCode) };
}

export async function fetchEastmoneyStockConcepts(stockCode, options = {}) {
  const secuCode = options.secuCode || compileExchangeCode(stockCode);
  const url =
    "https://datacenter.eastmoney.com/securities/api/data/v1/get?" +
    new URLSearchParams({
      reportName: "RPT_F10_CORETHEME_BOARDTYPE",
      columns:
        "SECUCODE,SECURITY_CODE,SECURITY_NAME_ABBR,NEW_BOARD_CODE,BOARD_NAME,SELECTED_BOARD_REASON,IS_PRECISE,BOARD_RANK,BOARD_YIELD,DERIVE_BOARD_CODE",
      quoteColumns: "f3~05~NEW_BOARD_CODE~BOARD_YIELD",
      filter: `(SECUCODE="${secuCode}")(IS_PRECISE="1")`,
      pageNumber: "1",
      pageSize: String(options.pageSize || 50),
      sortTypes: "1",
      sortColumns: "BOARD_RANK",
      source: "HSF10",
      client: "PC",
    });
  const response = await fetchJson(url, { ...options, referer: "https://data.eastmoney.com/bkzj/gn.html" });
  return { response, data: parseConcepts(response.json) };
}

export async function fetchEastmoneyStockPlates(stockCode, options = {}) {
  const secuCode = options.secuCode || compileExchangeCode(stockCode);
  const url =
    "https://datacenter.eastmoney.com/securities/api/data/get?" +
    new URLSearchParams({
      type: "RPT_F10_CORETHEME_BOARDTYPE",
      sty: "SECUCODE,SECURITY_CODE,SECURITY_NAME_ABBR,BOARD_CODE,BOARD_NAME,IS_PRECISE,BOARD_RANK,BOARD_TYPE",
      filter: `(SECUCODE="${secuCode}")`,
      p: "1",
      ps: String(options.pageSize || ""),
      sr: "1",
      st: "BOARD_RANK",
      source: "HSF10",
      client: "PC",
    });
  const response = await fetchJson(url, { ...options, referer: "https://emweb.securities.eastmoney.com/" });
  return { response, data: parsePlates(response.json) };
}

export async function fetchEastmoneyStockShares(stockCode, options = {}) {
  const secuCode = options.secuCode || compileExchangeCode(stockCode);
  const url =
    "https://datacenter.eastmoney.com/securities/api/data/v1/get?" +
    new URLSearchParams({
      reportName: "RPT_F10_EH_EQUITY",
      columns:
        "SECUCODE,SECURITY_CODE,END_DATE,TOTAL_SHARES,LIMITED_SHARES,UNLIMITED_SHARES,LISTED_A_SHARES,FREE_SHARES,CHANGE_REASON",
      quoteColumns: "",
      filter: `(SECUCODE="${secuCode}")`,
      pageNumber: "1",
      pageSize: String(options.pageSize || 200),
      sortTypes: "-1",
      sortColumns: "END_DATE",
      source: "HSF10",
      client: "PC",
    });
  const response = await fetchJson(url, { ...options, referer: "https://emweb.securities.eastmoney.com/" });
  return { response, data: parseStockShares(response.json) };
}

export async function fetchBaiduStockDividend(stockCode, options = {}) {
  const url =
    "https://gushitong.baidu.com/opendata?" +
    new URLSearchParams({
      openapi: "1",
      dspName: "iphone",
      tn: "tangram",
      client: "app",
      query: stockCode,
      code: stockCode,
      word: stockCode,
      resource_id: "5429",
      ma_ver: "4",
      finClientType: "pc",
    });
  const response = await fetchJson(url, { ...options, referer: "https://gushitong.baidu.com/" });
  return { response, data: parseBaiduDividend(response.json, stockCode) };
}

export async function fetchBaiduStockIndustry(stockCodes, options = {}) {
  const codes = Array.isArray(stockCodes) ? stockCodes : [stockCodes];
  const stock = JSON.stringify(codes.map((code) => ({ code: String(code), market: "ab", type: "stock" })));
  const url =
    "https://finance.pae.baidu.com/api/getrelatedblock?" +
    new URLSearchParams({
      stock,
      finClientType: "pc",
    });
  const response = await fetchJson(url, { ...options, referer: "https://gushitong.baidu.com/" });
  return { response, data: parseBaiduIndustry(response.json) };
}

export async function fetchEastmoneyNorthFlow(options = {}) {
  const pageSize = options.pageSize || 100;
  const pageNumber = options.page || 1;
  async function fetchType(mutualType) {
    const url =
      "https://datacenter-web.eastmoney.com/api/data/v1/get?" +
      new URLSearchParams({
        sortColumns: "TRADE_DATE",
        sortTypes: "-1",
        pageSize: String(pageSize),
        pageNumber: String(pageNumber),
        reportName: "RPT_MUTUAL_DEAL_HISTORY",
        columns: "ALL",
        source: "WEB",
        client: "WEB",
        filter: `(MUTUAL_TYPE="${mutualType}")`,
      });
    return fetchJson(url, { ...options, referer: "https://data.eastmoney.com/hsgt/index.html" });
  }
  const [sgt, hgt] = await Promise.all([fetchType("001"), fetchType("003")]);
  return {
    responses: [sgt, hgt],
    data: {
      shenzhen: parseNorthFlow(sgt.json?.result?.data || []),
      shanghai: parseNorthFlow(hgt.json?.result?.data || []),
    },
  };
}

export async function fetchEastmoneySecuritiesMargin(options = {}) {
  const url =
    "https://datacenter-web.eastmoney.com/api/data/v1/get?" +
    new URLSearchParams({
      reportName: "RPTA_RZRQ_LSHJ",
      columns: "ALL",
      source: "WEB",
      sortColumns: "dim_date",
      sortTypes: "-1",
      pageNumber: String(options.page || 1),
      pageSize: String(options.pageSize || 250),
    });
  const response = await fetchJson(url, { ...options, referer: "https://data.eastmoney.com/rzrq/total.html" });
  return { response, data: parseSecuritiesMargin(response.json) };
}

export async function fetchEastmoneyHotRank(options = {}) {
  const response = await fetchJson("https://emappdata.eastmoney.com/stockrank/getAllCurrentList", {
    ...options,
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      appId: "appId01",
      globalId: "786e4c21-70dc-435a-93bb-38",
      marketType: "",
      pageNo: options.page || 1,
      pageSize: options.pageSize || 100,
    }),
  });
  return { response, data: parseHotRank(response.json) };
}

export async function fetchEastmoneyIndexList(options = {}) {
  const page = options.page || 1;
  const pageSize = options.pageSize || 50;
  const market = options.market || "sh";
  const fs = market === "sz" ? "m:0+t:5" : "m:1+s:2";
  const url =
    "https://push2.eastmoney.com/api/qt/clist/get?" +
    new URLSearchParams({
      pn: String(page),
      pz: String(pageSize),
      po: "1",
      np: "1",
      fltt: "2",
      invt: "2",
      dect: "1",
      fid: "f3",
      fs,
      fields: "f12,f13,f14",
    });
  const response = await fetchJson(url, { ...options, referer: "https://quote.eastmoney.com/center/" });
  return { response, data: parseIndexList(response.json) };
}

export async function fetchBaiduIndexConstituents(indexCode, options = {}) {
  const page = options.page || 0;
  const url =
    "https://gushitong.baidu.com/opendata?" +
    new URLSearchParams({
      resource_id: "5352",
      query: indexCode,
      code: indexCode,
      market: "ab",
      group: "asyn_ranking",
      pn: String(page * (options.pageSize || 100)),
      rn: String(options.pageSize || 100),
      pc_web: "1",
      finClientType: "pc",
    });
  const response = await fetchJson(url, { ...options, referer: "https://gushitong.baidu.com/" });
  return { response, data: parseIndexConstituents(response.json, indexCode) };
}

export async function fetchEastmoneyIndexKline(indexCode, options = {}) {
  const start = compactDate(options.start || DEFAULT_START);
  const end = compactDate(options.end || DEFAULT_END);
  const url =
    "https://push2his.eastmoney.com/api/qt/stock/kline/get?" +
    new URLSearchParams({
      secid: indexSecid(indexCode),
      fields1: "f1,f2,f3,f4,f5,f6",
      fields2: "f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61",
      klt: String(options.klt || 101),
      fqt: "1",
      beg: start,
      end,
      smplmt: "100000",
      lmt: "1000000",
    });
  const response = await fetchJson(url, { ...options, referer: "https://quote.eastmoney.com/center/" });
  return { response, data: parseEastmoneyStockKline(response.json, indexCode) };
}

export async function fetchEastmoneyIndexCurrent(indexCode, options = {}) {
  const url =
    "http://push2.eastmoney.com/api/qt/stock/get?" +
    new URLSearchParams({
      invt: "2",
      fltt: "1",
      fields:
        "f58,f107,f57,f43,f59,f169,f170,f152,f46,f60,f44,f45,f47,f48,f86,f116",
      secid: indexSecid(indexCode),
      wbp2u: "|0|0|0|web",
    });
  const response = await fetchJson(url, { ...options, referer: "https://quote.eastmoney.com/center/" });
  return { response, data: parseIndexCurrent(response.json, indexCode) };
}

export async function fetchSzseTradeCalendar(year = new Date().getFullYear(), options = {}) {
  const monthRows = [];
  const responses = [];
  const months = options.month ? [Number(options.month)] : Array.from({ length: 12 }, (_, index) => index + 1);
  for (const month of months) {
    const url =
      "http://www.szse.cn/api/report/exchange/onepersistenthour/monthList?" +
      new URLSearchParams({ month: `${year}-${month}` });
    const response = await fetchJson(url, { ...options, referer: "http://www.szse.cn/" });
    responses.push(response);
    monthRows.push(...parseTradeCalendar(response.json).rows);
  }
  return { responses, data: { year, rows: monthRows } };
}

export async function fetchTdxMineClearance(stockCode, options = {}) {
  const url = `http://page3.tdx.com.cn:7615/site/pcwebcall_static/bxb/json/${stockCode}.json`;
  const response = await fetchJson(url, options);
  return { response, data: parseTdxMineClearance(response.json, stockCode) };
}

export async function fetchEastmoneyAStockList(options = {}) {
  const page = options.page || 1;
  const pageSize = options.pageSize || 100;
  const url =
    "https://push2.eastmoney.com/api/qt/clist/get?" +
    new URLSearchParams({
      pn: String(page),
      pz: String(pageSize),
      po: "1",
      np: "1",
      fltt: "2",
      invt: "2",
      fid: "f3",
      fs: "m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23",
      fields: "f12,f13,f14,f2,f3,f5,f6,f20",
    });
  const response = await fetchJson(url, { ...options, referer: "https://quote.eastmoney.com/center/gridlist.html" });
  return { response, data: parseEtfList(response.json) };
}

export async function fetchEastmoneyNewStockList(options = {}) {
  const url =
    "https://datacenter-web.eastmoney.com/api/data/v1/get?" +
    new URLSearchParams({
      reportName: "RPTA_APP_IPOAPPLY",
      columns: "ALL",
      source: "WEB",
      client: "WEB",
      sortColumns: "APPLY_DATE",
      sortTypes: "-1",
      pageNumber: String(options.page || 1),
      pageSize: String(options.pageSize || 50),
    });
  const response = await fetchJson(url, { ...options, referer: "https://data.eastmoney.com/xg/xg/" });
  return {
    response,
    data: {
      pages: response.json?.result?.pages ?? null,
      rows: Array.isArray(response.json?.result?.data) ? response.json.result.data : [],
    },
  };
}

export async function fetchThsEtfKline(etfCode, options = {}) {
  const kType = Number(options.kType || 1);
  const start = options.start || DEFAULT_START;
  const end = options.end || DEFAULT_END;
  const url = `http://d.10jqka.com.cn/v6/line/hs_${etfCode}/${kType - 1}1/last36000.js`;
  const response = await fetchText(url, {
    ...options,
    referer: `http://stockpage.10jqka.com.cn/${etfCode}/`,
    headers: { "hexin-v": options.hexinV || "", ...(options.headers || {}) },
  });
  return { response, data: parseThsEtfKline(parseThsJsonp(response.text), etfCode, start, end) };
}

async function capture(name, fn) {
  try {
    return { name, ok: true, value: await fn() };
  } catch (error) {
    return { name, ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function fetchAdataPublicData(options = {}) {
  const stockCode = options.stock || options.stockCode || DEFAULT_STOCK;
  const etfCode = options.etf || options.etfCode || DEFAULT_ETF;
  const indexCode = options.index || options.indexCode || "000300";
  const conceptCode = options.concept || options.conceptCode || "BK0966";
  const fetchedAt = options.fetchedAt || new Date().toISOString();
  const raw = {};
  const errors = {};

  const tasks = await Promise.all([
    capture("stockMarketBaidu", () => fetchBaiduStockKline(stockCode, options)),
    capture("stockMinuteBaidu", () => fetchBaiduStockMinute(stockCode, options)),
    capture("stockOrderBookBaidu", () => fetchBaiduStockOrderBook(stockCode, options)),
    capture("stockTicksBaidu", () => fetchBaiduStockTicks(stockCode, options)),
    capture("etfListEastmoney", () => fetchEastmoneyEtfList(options)),
    capture("conceptListEastmoney", () => fetchEastmoneyConceptList(options)),
    capture("conceptConstituentsEastmoney", () => fetchEastmoneyConceptConstituents(conceptCode, options)),
    capture("financialCoreEastmoney", () => fetchEastmoneyFinancialCore(stockCode, options)),
    capture("eastmoneyKline", () => fetchEastmoneyStockKline(stockCode, options)),
    capture("eastmoneyMinute", () => fetchEastmoneyStockMinute(stockCode, options)),
    capture("capitalFlowDailyEastmoney", () => fetchEastmoneyCapitalFlowDaily(stockCode, options)),
    capture("capitalFlowMinuteEastmoney", () => fetchEastmoneyCapitalFlowMinute(stockCode, options)),
    capture("stockConceptsEastmoney", () => fetchEastmoneyStockConcepts(stockCode, options)),
    capture("stockPlatesEastmoney", () => fetchEastmoneyStockPlates(stockCode, options)),
    capture("stockSharesEastmoney", () => fetchEastmoneyStockShares(stockCode, options)),
    capture("stockDividendBaidu", () => fetchBaiduStockDividend(stockCode, options)),
    capture("stockIndustryBaidu", () => fetchBaiduStockIndustry(stockCode, options)),
    capture("northFlowEastmoney", () => fetchEastmoneyNorthFlow(options)),
    capture("securitiesMarginEastmoney", () => fetchEastmoneySecuritiesMargin(options)),
    capture("hotRankEastmoney", () => fetchEastmoneyHotRank(options)),
    capture("indexListEastmoney", () => fetchEastmoneyIndexList(options)),
    capture("indexConstituentsBaidu", () => fetchBaiduIndexConstituents(indexCode, options)),
    capture("indexKlineEastmoney", () => fetchEastmoneyIndexKline(indexCode, options)),
    capture("indexCurrentEastmoney", () => fetchEastmoneyIndexCurrent(indexCode, options)),
    capture("tradeCalendarSzse", () => fetchSzseTradeCalendar(options.year || new Date().getFullYear(), options)),
    capture("mineClearanceTdx", () => fetchTdxMineClearance(stockCode, options)),
    capture("aStockListEastmoney", () => fetchEastmoneyAStockList(options)),
    capture("newStockListEastmoney", () => fetchEastmoneyNewStockList(options)),
    capture("thsEtfKline", () => fetchThsEtfKline(etfCode, options)),
  ]);
  const byName = Object.fromEntries(tasks.map((task) => [task.name, task]));
  for (const task of tasks) {
    if (!task.ok) errors[task.name] = task.error;
  }

  if (options.includeRaw) {
    for (const task of tasks) {
      if (task.ok && task.value?.response?.text) raw[task.name] = task.value.response.text;
    }
  }

  return {
    source: "AData reference native-source script",
    fetchedAt,
    stockCode,
    etfCode,
    indexCode,
    conceptCode,
    providerAnalysis: {
      reference: "1nchaos/adata stock, ETF, index, capital-flow, sentiment, and risk source logic",
      noExternalDependencies: true,
      endpoints: {
        stockMarketBaidu: "finance.pae.baidu.com/selfselect/getstockquotation",
        stockMinuteBaidu: "finance.pae.baidu.com/selfselect/getstockquotation?group=quotation_minute_ab",
        stockQuoteDetailBaidu: "finance.pae.baidu.com/vapi/v1/getquotation",
        etfListEastmoney: "push2.eastmoney.com/api/qt/clist/get",
        financialCoreEastmoney: "datacenter.eastmoney.com/securities/api/data/get",
        eastmoneyKlineAttempt: "push2his.eastmoney.com/api/qt/stock/kline/get",
        eastmoneyMinute: "push2.eastmoney.com/api/qt/stock/trends2/get",
        capitalFlow: "push2his.eastmoney.com/api/qt/stock/fflow/daykline/get",
        conceptsAndPlates: "datacenter.eastmoney.com/securities/api/data/v1/get",
        northFlowAndMargin: "datacenter-web.eastmoney.com/api/data/v1/get",
        tdxMineClearance: "page3.tdx.com.cn:7615/site/pcwebcall_static/bxb/json",
        thsEtfKline: "d.10jqka.com.cn/v6/line",
      },
      notes: [
        "Baidu K-line is kept because AData uses it as a stock market provider and it is accessible without extra dependencies.",
        "Eastmoney push2his, THS, SZSE, and TDX endpoints may fail or rate-limit in some network environments; the script records errors instead of hiding them.",
        "Capital-flow, hot-rank, and north-flow data are timing and sentiment inputs, not substitutes for business quality evidence.",
      ],
    },
    stockMarketBaidu: byName.stockMarketBaidu?.value?.data || null,
    stockMinuteBaidu: byName.stockMinuteBaidu?.value?.data || null,
    stockOrderBookBaidu: byName.stockOrderBookBaidu?.value?.data || null,
    stockTicksBaidu: byName.stockTicksBaidu?.value?.data || null,
    etfListEastmoney: byName.etfListEastmoney?.value?.data || null,
    conceptListEastmoney: byName.conceptListEastmoney?.value?.data || null,
    conceptConstituentsEastmoney: byName.conceptConstituentsEastmoney?.value?.data || null,
    financialCoreEastmoney: byName.financialCoreEastmoney?.value?.data || null,
    eastmoneyKline: byName.eastmoneyKline?.value?.data || null,
    eastmoneyMinute: byName.eastmoneyMinute?.value?.data || null,
    capitalFlowDailyEastmoney: byName.capitalFlowDailyEastmoney?.value?.data || null,
    capitalFlowMinuteEastmoney: byName.capitalFlowMinuteEastmoney?.value?.data || null,
    stockConceptsEastmoney: byName.stockConceptsEastmoney?.value?.data || null,
    stockPlatesEastmoney: byName.stockPlatesEastmoney?.value?.data || null,
    stockSharesEastmoney: byName.stockSharesEastmoney?.value?.data || null,
    stockDividendBaidu: byName.stockDividendBaidu?.value?.data || null,
    stockIndustryBaidu: byName.stockIndustryBaidu?.value?.data || null,
    northFlowEastmoney: byName.northFlowEastmoney?.value?.data || null,
    securitiesMarginEastmoney: byName.securitiesMarginEastmoney?.value?.data || null,
    hotRankEastmoney: byName.hotRankEastmoney?.value?.data || null,
    indexListEastmoney: byName.indexListEastmoney?.value?.data || null,
    indexConstituentsBaidu: byName.indexConstituentsBaidu?.value?.data || null,
    indexKlineEastmoney: byName.indexKlineEastmoney?.value?.data || null,
    indexCurrentEastmoney: byName.indexCurrentEastmoney?.value?.data || null,
    tradeCalendarSzse: byName.tradeCalendarSzse?.value?.data || null,
    mineClearanceTdx: byName.mineClearanceTdx?.value?.data || null,
    aStockListEastmoney: byName.aStockListEastmoney?.value?.data || null,
    newStockListEastmoney: byName.newStockListEastmoney?.value?.data || null,
    thsEtfKline: byName.thsEtfKline?.value?.data || null,
    errors,
    ...(options.includeRaw ? { raw } : {}),
  };
}

async function writeJsonOutput(outputPath, payload) {
  const output = `${JSON.stringify(payload, null, 2)}\n`;
  if (outputPath) {
    await mkdir(dirname(resolve(outputPath)), { recursive: true });
    await writeFile(outputPath, output, "utf8");
    console.log(`Wrote ${outputPath}`);
  } else {
    process.stdout.write(output);
  }
}

async function main() {
  const options = parseArgs(process.argv);
  if (options.help) {
    printHelp();
    return;
  }

  const payload = await fetchAdataPublicData(options);
  await writeJsonOutput(options.output, payload);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
