#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULT_FUND = "161725";
const DEFAULT_START = "2025-01-01";
const DEFAULT_END = new Date().toISOString().slice(0, 10);
const MARKET_INDEX_KEYS = [
  { code: "sh000001", name: "上证指数", type: "cn" },
  { code: "sh000016", name: "上证50", type: "cn" },
  { code: "sz399001", name: "深证成指", type: "cn" },
  { code: "sz399330", name: "深证100", type: "cn" },
  { code: "bj899050", name: "北证50", type: "cn" },
  { code: "sh000300", name: "沪深300", type: "cn" },
  { code: "sz399006", name: "创业板指", type: "cn" },
  { code: "sh000688", name: "科创50", type: "cn" },
  { code: "sh000905", name: "中证500", type: "cn" },
  { code: "sh000852", name: "中证1000", type: "cn" },
  { code: "usIXIC", name: "纳斯达克", type: "global" },
  { code: "usNDX", name: "纳斯达克100", type: "global" },
  { code: "usINX", name: "标普500", type: "global" },
  { code: "usDJI", name: "道琼斯", type: "global" },
  { code: "hkHSI", name: "恒生指数", type: "global" },
  { code: "hkHSTECH", name: "恒生科技指数", type: "global" },
];

const headers = {
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36",
  accept: "*/*",
  referer: "https://fund.eastmoney.com/",
};

function parseArgs(argv) {
  const options = {
    fund: DEFAULT_FUND,
    query: "",
    start: DEFAULT_START,
    end: DEFAULT_END,
    pageSize: 20,
    valuationSource: "all",
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
    else if (arg.startsWith("--fund")) options.fund = readValue();
    else if (arg.startsWith("--query")) options.query = readValue();
    else if (arg.startsWith("--start")) options.start = readValue();
    else if (arg.startsWith("--end")) options.end = readValue();
    else if (arg.startsWith("--page-size")) options.pageSize = Number(readValue()) || 20;
    else if (arg.startsWith("--valuation-source")) options.valuationSource = readValue();
    else if (arg.startsWith("--out")) options.output = readValue();
    else if (arg === "--include-raw") options.includeRaw = true;
    else if (!arg.startsWith("-")) options.fund = arg;
  }

  return options;
}

function printHelp() {
  console.log(`Usage:
  node scripts/fund-public-data.mjs [fundCode] [--query=keyword] [--start=YYYY-MM-DD] [--end=YYYY-MM-DD] [--valuation-source=all|fundgz|sina2|sina3] [--out=/tmp/fund.json]

What it fetches:
  - fundgz.1234567.com.cn real-time fund estimate
  - Sina fund estimate curve, including two valuation口径
  - Eastmoney F10 daily NAV, paged NAV range, and latest disclosed top holdings
  - Eastmoney pingzhongdata globals: trend, benchmark, asset allocation, holder structure, fund manager, fees, ranking, drawdown/risk evaluation
  - Eastmoney fund suggestion search when --query is present
  - Tencent market index snapshots for broad market context

This script uses only Node built-ins and global fetch. No npm packages are required.`);
}

function timestampNow(options = {}) {
  return typeof options.now === "function" ? options.now() : Date.now();
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "" || value === "--") return null;
  const normalized = String(value).replace(/,/g, "").replace("%", "");
  const numberValue = Number(normalized);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function stripTags(value) {
  return decodeHtml(String(value).replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim());
}

function decodeHtml(value) {
  return String(value)
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function parseJsonp(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error(`Cannot parse JSONP: ${text.slice(0, 120)}`);
  return JSON.parse(text.slice(start, end + 1));
}

function extractScriptString(text, name) {
  const match = text.match(new RegExp(`var\\s+${name}\\s*=\\s*"((?:\\\\.|[^"])*)"`));
  if (!match) return null;
  return JSON.parse(`"${match[1]}"`);
}

function extractScriptNumber(text, name) {
  const match = text.match(new RegExp(`var\\s+${name}\\s*=\\s*"?([^";]+)"?\\s*;`));
  return match ? numberOrNull(match[1]) : null;
}

function extractScriptJson(text, name) {
  const value = extractScriptValue(text, name);
  return Array.isArray(value) || (value && typeof value === "object") ? value : null;
}

function extractScriptValue(text, name) {
  const match = text.match(new RegExp(`var\\s+${name}\\s*=\\s*`));
  if (!match) return null;
  let i = match.index + match[0].length;
  while (/\s/.test(text[i])) i += 1;
  const start = i;
  const first = text[i];
  if (first === '"' || first === "'") {
    let escaped = false;
    for (i += 1; i < text.length; i += 1) {
      const char = text[i];
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === first) {
        const raw = text.slice(start, i + 1);
        return first === '"' ? JSON.parse(raw) : raw.slice(1, -1).replace(/\\'/g, "'");
      }
    }
    return null;
  }
  if (first === "[" || first === "{") {
    let depth = 0;
    let inString = false;
    let quote = "";
    let escaped = false;
    for (; i < text.length; i += 1) {
      const char = text[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === quote) inString = false;
      } else if (char === '"' || char === "'") {
        inString = true;
        quote = char;
      } else if (char === first) {
        depth += 1;
      } else if ((first === "[" && char === "]") || (first === "{" && char === "}")) {
        depth -= 1;
        if (depth === 0) {
          try {
            return JSON.parse(text.slice(start, i + 1));
          } catch {
            return null;
          }
        }
      }
    }
    return null;
  }
  const semi = text.indexOf(";", start);
  const literal = text.slice(start, semi >= 0 ? semi : undefined).trim();
  if (literal === "true") return true;
  if (literal === "false") return false;
  return numberOrNull(literal);
}

function extractApidataContent(text) {
  const match = text.match(/content\s*:\s*"((?:\\.|[^"])*)"/);
  if (!match) return "";
  return JSON.parse(`"${match[1]}"`);
}

function tableRows(html) {
  return [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)]
    .map((match) =>
      [...match[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((cell) => stripTags(cell[1])),
    )
    .filter((row) => row.length);
}

function parseNavHistory(html) {
  return tableRows(html)
    .filter((row) => /^\d{4}-\d{2}-\d{2}$/.test(row[0]))
    .map((row) => ({
      date: row[0],
      nav: numberOrNull(row[1]),
      accumulatedNav: numberOrNull(row[2]),
      dailyChangePct: numberOrNull(row[3]),
      subscribeStatus: row[4] || null,
      redeemStatus: row[5] || null,
      dividend: row[6] || null,
    }));
}

function parseHoldings(html) {
  const reportDate =
    html.match(/截止至：<font[^>]*>([^<]+)/)?.[1] ||
    html.match(/(报告期|截止日期)[^0-9]{0,20}(\d{4}-\d{2}-\d{2})/)?.[2] ||
    html.match(/(\d{4}-\d{2}-\d{2})/)?.[1] ||
    null;
  const rows = tableRows(html)
    .filter((row) => /^\d+$/.test(row[0]) && /^\d{6}$/.test(row[1]))
    .map((row) => ({
      rank: numberOrNull(row[0]),
      stockCode: row[1],
      stockName: row[2] || null,
      latestPrice: numberOrNull(row[3]),
      changePct: numberOrNull(row[4]),
      holdingShares: row[5] || null,
      holdingMarketValue: row[6] || null,
      navRatioPct: numberOrNull(row[7]),
    }));

  return { reportDate, rows };
}

function normalizeEstimate(raw) {
  if (!raw || typeof raw !== "object") return null;
  return {
    fundCode: raw.fundcode || null,
    fundName: raw.name || null,
    latestNavDate: raw.jzrq || null,
    latestNav: numberOrNull(raw.dwjz),
    estimatedNav: numberOrNull(raw.gsz),
    estimatedChangePct: numberOrNull(raw.gszzl),
    estimatedAt: raw.gztime || null,
    valuationSource: "fundgz",
  };
}

function normalizeSearch(raw) {
  const items = Array.isArray(raw?.Datas) ? raw.Datas : [];
  return items.map((item) => ({
    fundCode: item.CODE || item.FCODE || item._id || null,
    fundName: item.NAME || item.SHORTNAME || item.FundBaseInfo?.SHORTNAME || null,
    category: item.CATEGORYDESC || item.CATEGORY || item.FundBaseInfo?.FTYPE || null,
    manager: item.FundBaseInfo?.JJJL || null,
    company: item.FundBaseInfo?.JJGS || null,
    isBuyable: item.FundBaseInfo?.ISBUY || null,
    raw: item,
  }));
}

function normalizeProfile(text) {
  return {
    fundCode: extractScriptString(text, "fS_code"),
    fundName: extractScriptString(text, "fS_name"),
    sourceRate: extractScriptString(text, "fund_sourceRate"),
    currentRate: extractScriptString(text, "fund_Rate"),
    minPurchaseAmount: extractScriptString(text, "fund_minsg"),
    stockCodes: extractScriptJson(text, "stockCodesNew") || extractScriptJson(text, "stockCodes") || [],
    bondCodes: extractScriptJson(text, "zqCodesNew") || extractScriptJson(text, "zqCodes") || [],
    netWorthTrendSample: (extractScriptJson(text, "Data_netWorthTrend") || []).slice(-5),
    annualReturns: {
      oneYear: extractScriptNumber(text, "syl_1n"),
      threeYears: extractScriptNumber(text, "syl_3y"),
      sixMonths: extractScriptNumber(text, "syl_6y"),
      oneMonth: extractScriptNumber(text, "syl_1y"),
    },
  };
}

function normalizePingzhongdata(text, fundCode) {
  const netWorthTrend = extractScriptJson(text, "Data_netWorthTrend") || [];
  const grandTotal = extractScriptJson(text, "Data_grandTotal") || [];
  return {
    fundCode: extractScriptString(text, "fS_code") || fundCode,
    fundName: extractScriptString(text, "fS_name"),
    sourceRate: extractScriptString(text, "fund_sourceRate"),
    currentRate: extractScriptString(text, "fund_Rate"),
    minPurchaseAmount: extractScriptString(text, "fund_minsg"),
    stockCodes: extractScriptJson(text, "stockCodesNew") || extractScriptJson(text, "stockCodes") || [],
    bondCodes: extractScriptJson(text, "zqCodesNew") || extractScriptJson(text, "zqCodes") || [],
    netWorthTrend,
    accumulatedNetWorthTrend: extractScriptJson(text, "Data_ACWorthTrend") || [],
    benchmarkSeries: grandTotal,
    rateInSimilarType: extractScriptJson(text, "Data_rateInSimilarType") || [],
    rateInSimilarPercent: extractScriptJson(text, "Data_rateInSimilarPersent") || [],
    fluctuationScale: extractScriptJson(text, "Data_fluctuationScale") || [],
    holderStructure: extractScriptJson(text, "Data_holderStructure") || [],
    assetAllocation: extractScriptJson(text, "Data_assetAllocation") || [],
    performanceEvaluation: extractScriptJson(text, "Data_performanceEvaluation") || {},
    currentFundManager: extractScriptJson(text, "Data_currentFundManager") || [],
    buyRedemption: extractScriptJson(text, "Data_buySedemption") || {},
    fundSharesPositions: extractScriptJson(text, "Data_fundSharesPositions") || [],
    sameTypeFunds: extractScriptJson(text, "swithSameType") || [],
    returns: {
      oneWeek: computeWeekReturnFromNetWorthTrend(netWorthTrend),
      oneMonth: extractScriptNumber(text, "syl_1y"),
      threeMonths: extractScriptNumber(text, "syl_3y"),
      sixMonths: extractScriptNumber(text, "syl_6y"),
      oneYear: extractScriptNumber(text, "syl_1n"),
    },
    consecutiveTrend: calculateConsecutiveTrend(netWorthTrend),
  };
}

function computeWeekReturnFromNetWorthTrend(trend) {
  if (!Array.isArray(trend) || trend.length < 2) return null;
  const valid = trend
    .filter((item) => item && typeof item.x === "number" && Number.isFinite(Number(item.y)))
    .sort((a, b) => a.x - b.x);
  if (valid.length < 2) return null;
  const latest = valid[valid.length - 1];
  const latestNav = Number(latest.y);
  if (!Number.isFinite(latestNav) || latestNav === 0) return null;
  const cutoff = latest.x - 7 * 24 * 60 * 60 * 1000;
  let before = valid[0];
  for (const item of valid) {
    if (item.x <= cutoff) before = item;
    else break;
  }
  const beforeNav = Number(before.y);
  if (!Number.isFinite(beforeNav) || beforeNav === 0) return null;
  return ((latestNav - beforeNav) / beforeNav) * 100;
}

function calculateConsecutiveTrend(trend) {
  if (!Array.isArray(trend) || trend.length < 2) return null;
  const valid = trend
    .filter((item) => item && typeof item.x === "number" && Number.isFinite(Number(item.y)))
    .sort((a, b) => a.x - b.x);
  if (valid.length < 2) return null;
  let type = null;
  let days = 0;
  for (let i = valid.length - 1; i > 0; i -= 1) {
    const current = Number(valid[i].y);
    const previous = Number(valid[i - 1].y);
    if (current > previous) {
      if (type === "down") break;
      type = "up";
      days += 1;
    } else if (current < previous) {
      if (type === "up") break;
      type = "down";
      days += 1;
    } else {
      break;
    }
  }
  return days >= 3 ? { type, days } : null;
}

function normalizeSinaEstimate(raw, fundCode, dataSource = 2) {
  const networth = Array.isArray(raw?.result?.data?.networth) ? raw.result.data.networth : [];
  const navKey = Number(dataSource) === 3 ? "pre_nav2" : "pre_nav";
  const growthKey = Number(dataSource) === 3 ? "growthrate2" : "growthrate";
  const points = networth
    .map((point) => ({
      date: point.pre_date || null,
      time: point.min_time || null,
      value: numberOrNull(point[navKey]),
      growthRatePct:
        point[growthKey] === null || point[growthKey] === undefined ? null : numberOrNull(point[growthKey]) * 100,
    }))
    .filter((point) => point.value !== null);
  const last = points[points.length - 1] || null;
  return {
    fundCode,
    dataSource: Number(dataSource) === 3 ? "sina3" : "sina2",
    estimatedNav: last?.value ?? null,
    estimatedChangePct: last?.growthRatePct ?? null,
    estimatedAt: last?.date && last?.time ? `${last.date} ${last.time}` : null,
    pointCount: points.length,
    points,
  };
}

function parseTencentAssignments(text) {
  const result = new Map();
  for (const match of text.matchAll(/var\s+(v_[A-Za-z0-9_]+)\s*=\s*"([^"]*)";?/g)) {
    result.set(match[1].replace(/^v_/, ""), match[2]);
  }
  return result;
}

function parseTencentIndex(raw, fallback, type) {
  if (!raw) return null;
  const parts = raw.split("~");
  if (type === "global") {
    return {
      code: fallback.code,
      name: fallback.name,
      providerName: parts[1] || "",
      price: numberOrNull(parts[3]),
      change: numberOrNull(parts[4]),
      changePercent: numberOrNull(parts[5]),
    };
  }
  return {
    code: fallback.code,
    name: fallback.name,
    providerName: parts[1] || "",
    price: numberOrNull(parts[3]),
    change: numberOrNull(parts[31]),
    changePercent: numberOrNull(parts[32]),
    tradeTime: parts[30] || null,
  };
}

async function fetchText(url, options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (!fetchImpl) throw new Error("global fetch is unavailable; use Node 18+ or pass options.fetchImpl");
  const response = await fetchImpl(url, {
    method: options.method || "GET",
    headers: {
      ...headers,
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

async function capture(name, fn) {
  try {
    return { name, ok: true, value: await fn() };
  } catch (error) {
    return { name, ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function fetchFundEstimate(fundCode, options = {}) {
  const url = `https://fundgz.1234567.com.cn/js/${fundCode}.js?rt=${timestampNow(options)}`;
  const response = await fetchText(url, options);
  return {
    response,
    data: normalizeEstimate(parseJsonp(response.text)),
  };
}

export async function fetchFundDailyNav(fundCode, date, options = {}) {
  const result = await fetchFundNavHistory(fundCode, { ...options, start: date, end: date, pageSize: 1 });
  return {
    response: result.response,
    data: result.data.find((row) => row.date === date) || null,
  };
}

export async function fetchFundNavHistory(fundCode, options = {}) {
  const page = options.page || 1;
  const pageSize = options.pageSize || 20;
  const start = options.start || DEFAULT_START;
  const end = options.end || DEFAULT_END;
  const url =
    "https://fundf10.eastmoney.com/F10DataApi.aspx?" +
    new URLSearchParams({
      type: "lsjz",
      code: fundCode,
      page: String(page),
      per: String(pageSize),
      sdate: start,
      edate: end,
    });
  const response = await fetchText(url, options);
  const content = extractApidataContent(response.text);
  return {
    response,
    content,
    data: parseNavHistory(content),
  };
}

export async function fetchFundNavRange(fundCode, options = {}) {
  const pageSize = options.pageSize || 500;
  const maxPages = options.maxPages || 20;
  const merged = new Map();
  const responses = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const result = await fetchFundNavHistory(fundCode, { ...options, page, pageSize });
    responses.push(result.response);
    for (const row of result.data) merged.set(row.date, row);
    if (result.data.length < pageSize) break;
  }
  return {
    responses,
    data: [...merged.values()].sort((a, b) => a.date.localeCompare(b.date)),
  };
}

export async function fetchFundHoldings(fundCode, options = {}) {
  const url =
    "https://fundf10.eastmoney.com/FundArchivesDatas.aspx?" +
    new URLSearchParams({
      type: "jjcc",
      code: fundCode,
      topline: String(options.topline || 10),
      year: options.year || "",
      month: options.month || "",
      _: String(timestampNow(options)),
    });
  const response = await fetchText(url, options);
  const content = extractApidataContent(response.text);
  return {
    response,
    content,
    data: parseHoldings(content),
  };
}

export async function fetchFundProfile(fundCode, options = {}) {
  const url = `https://fund.eastmoney.com/pingzhongdata/${fundCode}.js?v=${timestampNow(options)}`;
  const response = await fetchText(url, options);
  return {
    response,
    data: normalizeProfile(response.text),
  };
}

export async function fetchFundPingzhongdata(fundCode, options = {}) {
  const url = `https://fund.eastmoney.com/pingzhongdata/${fundCode}.js?v=${timestampNow(options)}`;
  const response = await fetchText(url, options);
  return {
    response,
    data: normalizePingzhongdata(response.text, fundCode),
  };
}

export async function fetchFundPeriodReturns(fundCode, options = {}) {
  const result = await fetchFundPingzhongdata(fundCode, options);
  return {
    response: result.response,
    data: {
      ...result.data.returns,
      consecutiveTrend: result.data.consecutiveTrend,
    },
  };
}

export async function fetchSinaFundEstimate(fundCode, options = {}) {
  const callback = options.callback || "callback";
  const dataSource = options.dataSource || 2;
  const url =
    "https://stock.finance.sina.com.cn/fundInfo/api/openapi.php/FdFundService.getEstimateNetworthPic?" +
    new URLSearchParams({ symbol: fundCode, callback });
  const response = await fetchText(url, options);
  return {
    response,
    data: normalizeSinaEstimate(parseJsonp(response.text), fundCode, dataSource),
  };
}

export async function fetchFundValuationBySource(fundCode, dataSource = "fundgz", options = {}) {
  const normalized = String(dataSource || "fundgz").toLowerCase();
  if (normalized === "1" || normalized === "fundgz") return fetchFundEstimate(fundCode, options);
  if (normalized === "2" || normalized === "sina2") {
    return fetchSinaFundEstimate(fundCode, { ...options, dataSource: 2 });
  }
  if (normalized === "3" || normalized === "sina3") {
    return fetchSinaFundEstimate(fundCode, { ...options, dataSource: 3 });
  }
  throw new Error(`Unsupported fund valuation source: ${dataSource}`);
}

export async function searchFunds(query, options = {}) {
  const callback = options.callback || "cb";
  const url =
    "https://fundsuggest.eastmoney.com/FundSearch/api/FundSearchAPI.ashx?" +
    new URLSearchParams({
      m: "1",
      key: query,
      callback,
      _: String(timestampNow(options)),
    });
  const response = await fetchText(url, options);
  return {
    response,
    data: normalizeSearch(parseJsonp(response.text)),
  };
}

export async function fetchTencentMarketIndices(options = {}) {
  const indexKeys = options.indexKeys || MARKET_INDEX_KEYS;
  const codes = indexKeys.map((item) => item.code).join(",");
  const url = `https://qt.gtimg.cn/q=${codes}&_t=${timestampNow(options)}`;
  const response = await fetchText(url, options);
  const assignments = parseTencentAssignments(response.text);
  return {
    response,
    data: indexKeys.map((item) => parseTencentIndex(assignments.get(item.code), item, item.type)).filter(Boolean),
  };
}

export async function fetchShanghaiIndexDate(options = {}) {
  const result = await fetchTencentMarketIndices({
    ...options,
    indexKeys: [{ code: "sh000001", name: "上证指数", type: "cn" }],
  });
  return {
    response: result.response,
    data: result.data[0]?.tradeTime ? String(result.data[0].tradeTime).slice(0, 8) : null,
  };
}

export async function fetchFundPublicData(options = {}) {
  const fundCode = options.fund || options.fundCode || DEFAULT_FUND;
  const timestamp = timestampNow(options);
  const raw = {};
  const errors = {};

  const tasks = await Promise.all([
    capture("estimate", () => fetchFundEstimate(fundCode, options)),
    capture("dailyNav", () => fetchFundDailyNav(fundCode, options.end || DEFAULT_END, options)),
    capture("navHistory", () => fetchFundNavHistory(fundCode, options)),
    capture("navRange", () => fetchFundNavRange(fundCode, options)),
    capture("holdings", () => fetchFundHoldings(fundCode, options)),
    capture("profile", () => fetchFundProfile(fundCode, options)),
    capture("pingzhongdata", () => fetchFundPingzhongdata(fundCode, options)),
    capture("periodReturns", () => fetchFundPeriodReturns(fundCode, options)),
    capture("sinaEstimate2", () => fetchSinaFundEstimate(fundCode, { ...options, dataSource: 2 })),
    capture("sinaEstimate3", () => fetchSinaFundEstimate(fundCode, { ...options, dataSource: 3 })),
    capture("marketIndices", () => fetchTencentMarketIndices(options)),
    ...(options.query ? [capture("search", () => searchFunds(options.query, options))] : []),
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

  const estimate = byName.estimate?.value?.data || null;
  const navHistory = byName.navHistory?.value?.data || [];
  const holdings = byName.holdings?.value?.data || { reportDate: null, rows: [] };
  const pingzhongdata = byName.pingzhongdata?.value?.data || null;
  const asOf = estimate?.estimatedAt || navHistory[0]?.date || holdings.reportDate || null;

  return {
    source: "fundgz.1234567.com.cn + Eastmoney/Sina/Tencent public fund endpoints",
    fetchedAt: new Date(timestamp).toISOString(),
    asOf,
    sourceUrl: `https://fund.eastmoney.com/${fundCode}.html`,
    fundCode,
    estimate,
    dailyNav: byName.dailyNav?.value?.data || null,
    navHistory,
    navRange: byName.navRange?.value?.data || [],
    holdings,
    profile: byName.profile?.value?.data || null,
    pingzhongdata,
    periodReturns: byName.periodReturns?.value?.data || pingzhongdata?.returns || null,
    sinaEstimate2: byName.sinaEstimate2?.value?.data || null,
    sinaEstimate3: byName.sinaEstimate3?.value?.data || null,
    marketIndices: byName.marketIndices?.value?.data || [],
    search: byName.search?.value?.data || [],
    errors,
    warnings: [
      "Fund holdings are delayed disclosure, not live portfolio exposure.",
      "pingzhongdata fields are Eastmoney page globals and may change without versioning.",
      "Sina estimate data has multiple口径; use fundgz and disclosed NAV for cross-checking.",
    ],
    providerAnalysis: {
      reference: "hzm0321/real-time-fund app/api/fund.js endpoint logic",
      endpoints: [
        "fundgz.1234567.com.cn/js/{fundCode}.js",
        "stock.finance.sina.com.cn/fundInfo/api/openapi.php/FdFundService.getEstimateNetworthPic",
        "fundf10.eastmoney.com/F10DataApi.aspx?type=lsjz",
        "fundf10.eastmoney.com/FundArchivesDatas.aspx?type=jjcc",
        "fundsuggest.eastmoney.com/FundSearch/api/FundSearchAPI.ashx",
        "fund.eastmoney.com/pingzhongdata/{fundCode}.js",
        "qt.gtimg.cn/q={marketIndexCodes}",
      ],
      parser: "Native JSONP, JavaScript-global, Tencent quote-string, and HTML table parsing; no external dependencies.",
    },
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

  const payload = await fetchFundPublicData(options);
  await writeJsonOutput(options.output, payload);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
