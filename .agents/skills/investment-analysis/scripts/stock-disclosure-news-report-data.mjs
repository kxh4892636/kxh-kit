#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULT_STOCK = "000001";
const DEFAULT_START = "2025-01-01";
const DEFAULT_END = new Date().toISOString().slice(0, 10);

const headers = {
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36",
  accept: "application/json,text/plain,*/*",
};

const CNINFO_MARKETS = {
  "沪深京": { column: "szse", stockList: "http://www.cninfo.com.cn/new/data/szse_stock.json" },
  "港股": { column: "hke", stockList: "http://www.cninfo.com.cn/new/data/hke_stock.json" },
  "三板": { column: "third", stockList: "http://www.cninfo.com.cn/new/data/gfzr_stock.json" },
  "基金": { column: "fund", stockList: "http://www.cninfo.com.cn/new/data/fund_stock.json" },
  "债券": { column: "bond", stockList: "http://www.cninfo.com.cn/new/data/bond_stock.json" },
  "监管": { column: "regulator", stockList: "" },
  "预披露": { column: "pre_disclosure", stockList: "" },
};

const CNINFO_CATEGORIES = {
  "年报": "category_ndbg_szsh",
  "半年报": "category_bndbg_szsh",
  "一季报": "category_yjdbg_szsh",
  "三季报": "category_sjdbg_szsh",
  "业绩预告": "category_yjygjxz_szsh",
  "权益分派": "category_qyfpxzcs_szsh",
  "董事会": "category_dshgg_szsh",
  "监事会": "category_jshgg_szsh",
  "股东大会": "category_gddh_szsh",
  "日常经营": "category_rcjy_szsh",
  "公司治理": "category_gszl_szsh",
  "中介报告": "category_zj_szsh",
  "首发": "category_sf_szsh",
  "增发": "category_zf_szsh",
  "股权激励": "category_gqjl_szsh",
  "配股": "category_pg_szsh",
  "解禁": "category_jj_szsh",
  "公司债": "category_gszq_szsh",
  "可转债": "category_kzzq_szsh",
  "其他融资": "category_qtrz_szsh",
  "股权变动": "category_gqbd_szsh",
  "补充更正": "category_bcgz_szsh",
  "澄清致歉": "category_cqdq_szsh",
  "风险提示": "category_fxts_szsh",
  "特别处理和退市": "category_tbclts_szsh",
  "退市整理期": "category_tszlq_szsh",
};

function parseArgs(argv) {
  const options = {
    stock: DEFAULT_STOCK,
    keyword: "",
    market: "沪深京",
    category: "",
    start: DEFAULT_START,
    end: DEFAULT_END,
    pageSize: 30,
    maxPages: 1,
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
    else if (arg.startsWith("--keyword")) options.keyword = readValue();
    else if (arg.startsWith("--market")) options.market = readValue();
    else if (arg.startsWith("--category")) options.category = readValue();
    else if (arg.startsWith("--start")) options.start = readValue();
    else if (arg.startsWith("--end")) options.end = readValue();
    else if (arg.startsWith("--page-size")) options.pageSize = Number(readValue()) || 30;
    else if (arg.startsWith("--max-pages")) options.maxPages = Number(readValue()) || 1;
    else if (arg.startsWith("--out")) options.output = readValue();
    else if (arg === "--include-raw") options.includeRaw = true;
    else if (!arg.startsWith("-")) options.stock = arg;
  }

  return options;
}

function printHelp() {
  console.log(`Usage:
  node scripts/stock-disclosure-news-report-data.mjs [stockCode] [--keyword=keyword] [--category=风险提示] [--start=YYYY-MM-DD] [--end=YYYY-MM-DD] [--out=/tmp/out.json]

What it fetches:
  - CNInfo information disclosure announcements and investor-relation disclosure rows
  - Eastmoney stock news search rows and stock research report rows

This single script intentionally combines the planned cninfo-disclosure-data and eastmoney-news-report-data sources.
It uses only Node built-ins and global fetch. No npm packages are required.`);
}

function dashedDate(value) {
  const text = String(value || "");
  if (/^\d{8}$/.test(text)) return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`;
  return text || DEFAULT_END;
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "" || value === "--") return null;
  const numberValue = Number(String(value).replace(/,/g, "").replace("%", ""));
  return Number.isFinite(numberValue) ? numberValue : null;
}

function stripHighlight(value) {
  return String(value || "")
    .replace(/<\/?em>/g, "")
    .replace(/\\u3000/g, "")
    .replace(/\u3000/g, "")
    .replace(/\r?\n/g, " ")
    .trim();
}

function parseJsonp(text) {
  const trimmed = String(text || "").trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return JSON.parse(trimmed);
  const start = trimmed.indexOf("(");
  const end = trimmed.lastIndexOf(")");
  if (start < 0 || end <= start) throw new Error(`Cannot parse JSONP: ${trimmed.slice(0, 120)}`);
  return JSON.parse(trimmed.slice(start + 1, end));
}

function formatShanghaiFromEpochMs(value) {
  const timestamp = numberOrNull(value);
  if (!timestamp) return null;
  return new Date(timestamp + 8 * 60 * 60 * 1000).toISOString().replace("T", " ").slice(0, 19);
}

function buildCninfoDetailUrl(row, announcementTime) {
  const params = new URLSearchParams({
    stockCode: row.secCode || "",
    announcementId: row.announcementId || "",
    orgId: row.orgId || "",
    announcementTime: announcementTime || "",
  });
  return `http://www.cninfo.com.cn/new/disclosure/detail?${params.toString()}`;
}

function buildCninfoPdfUrl(row) {
  if (!row.adjunctUrl) return null;
  return `https://static.cninfo.com.cn/${String(row.adjunctUrl).replace(/^\/+/, "")}`;
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
  const result = {
    url: String(url),
    status: response.status ?? null,
    ok: response.ok ?? (response.status >= 200 && response.status < 300),
    bytes: Buffer.byteLength(text),
    text,
  };
  if (!result.ok) throw new Error(`HTTP ${result.status} from ${url}: ${text.slice(0, 160)}`);
  return result;
}

async function fetchJson(url, options = {}) {
  const response = await fetchText(url, options);
  try {
    return { ...response, json: JSON.parse(response.text) };
  } catch {
    throw new Error(`Non-JSON response from ${url}: ${response.text.slice(0, 120)}`);
  }
}

async function fetchJsonp(url, options = {}) {
  const response = await fetchText(url, options);
  return { ...response, json: parseJsonp(response.text) };
}

export async function fetchCninfoStockList(market = "沪深京", options = {}) {
  const config = CNINFO_MARKETS[market] || CNINFO_MARKETS["沪深京"];
  if (!config.stockList) return { response: null, data: { rows: [], byCode: {} } };
  const response = await fetchJson(config.stockList, { ...options, referer: "http://www.cninfo.com.cn/" });
  const rows = Array.isArray(response.json?.stockList) ? response.json.stockList : [];
  return {
    response,
    data: {
      rows,
      byCode: Object.fromEntries(rows.map((row) => [row.code, row.orgId])),
    },
  };
}

async function resolveCninfoStockItem(stockCode, options = {}) {
  if (!stockCode) return "";
  if (options.cninfoOrgId) return `${stockCode},${options.cninfoOrgId}`;
  const stockList = await fetchCninfoStockList(options.market || "沪深京", options);
  const orgId = stockList.data.byCode[stockCode];
  if (!orgId) throw new Error(`Cannot resolve CNInfo orgId for ${stockCode}`);
  return `${stockCode},${orgId}`;
}

function parseCninfoAnnouncements(json) {
  const rows = Array.isArray(json?.announcements) ? json.announcements : [];
  return {
    totalAnnouncement: numberOrNull(json?.totalAnnouncement) ?? rows.length,
    rows: rows.map((row) => {
      const announcementTime = formatShanghaiFromEpochMs(row.announcementTime);
      return {
        stockCode: row.secCode || null,
        stockName: row.secName || null,
        title: stripHighlight(row.announcementTitle),
        announcementTime,
        announcementId: row.announcementId || null,
        orgId: row.orgId || null,
        announcementType: row.announcementType || null,
        adjunctUrl: row.adjunctUrl || null,
        pdfUrl: buildCninfoPdfUrl(row),
        detailUrl: buildCninfoDetailUrl(row, announcementTime),
      };
    }),
  };
}

async function fetchCninfoRows(tabName, stockCode, options = {}) {
  const market = options.market || "沪深京";
  const config = CNINFO_MARKETS[market] || CNINFO_MARKETS["沪深京"];
  const pageSize = Number(options.pageSize || 30);
  const maxPages = Math.max(1, Number(options.maxPages || 1));
  const stockItem = await resolveCninfoStockItem(stockCode, { ...options, market });
  const category = options.category ? CNINFO_CATEGORIES[options.category] || options.category : "";
  const url = "http://www.cninfo.com.cn/new/hisAnnouncement/query";
  const rows = [];
  const responses = [];
  let totalAnnouncement = null;

  for (let pageNum = 1; pageNum <= maxPages; pageNum += 1) {
    const body = new URLSearchParams({
      pageNum: String(pageNum),
      pageSize: String(pageSize),
      column: config.column,
      tabName,
      plate: "",
      stock: stockItem,
      searchkey: options.keyword || "",
      secid: "",
      category: tabName === "fulltext" ? category : "",
      trade: "",
      seDate: `${dashedDate(options.start || DEFAULT_START)}~${dashedDate(options.end || DEFAULT_END)}`,
      sortName: "",
      sortType: "",
      isHLtitle: "true",
    });
    const response = await fetchJson(url, {
      ...options,
      method: "POST",
      body,
      referer: "http://www.cninfo.com.cn/new/commonUrl/pageOfSearch?url=disclosure/list/search",
      headers: {
        "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
        ...(options.headers || {}),
      },
    });
    responses.push(response);
    const parsed = parseCninfoAnnouncements(response.json);
    totalAnnouncement = parsed.totalAnnouncement;
    rows.push(...parsed.rows);
    if (rows.length >= totalAnnouncement) break;
  }

  return {
    response: responses[0] || null,
    responses,
    data: {
      stockCode,
      market,
      tabName,
      totalAnnouncement,
      rows,
    },
  };
}

export async function fetchCninfoDisclosureAnnouncements(stockCode, options = {}) {
  return fetchCninfoRows("fulltext", stockCode, options);
}

export async function fetchCninfoInvestorRelations(stockCode, options = {}) {
  return fetchCninfoRows("relation", stockCode, options);
}

function parseEastmoneyNews(json, keyword) {
  const rows = Array.isArray(json?.result?.cmsArticleWebOld) ? json.result.cmsArticleWebOld : [];
  return {
    keyword,
    rows: rows.map((row) => ({
      keyword,
      articleCode: row.code || null,
      title: stripHighlight(row.title),
      content: stripHighlight(row.content),
      publishTime: row.date || null,
      mediaName: row.mediaName || null,
      image: row.image || null,
      url: row.url || (row.code ? `http://finance.eastmoney.com/a/${row.code}.html` : null),
    })),
  };
}

export async function fetchEastmoneyStockNews(symbol, options = {}) {
  const callback = options.callback || `jsonp_${Date.now()}`;
  const pageSize = Number(options.newsPageSize || options.pageSize || 10);
  const innerParam = {
    uid: "",
    keyword: symbol,
    type: ["cmsArticleWebOld"],
    client: "web",
    clientType: "web",
    clientVersion: "curr",
    param: {
      cmsArticleWebOld: {
        searchScope: "default",
        sort: "default",
        pageIndex: Number(options.newsPageIndex || 1),
        pageSize,
        preTag: "<em>",
        postTag: "</em>",
      },
    },
  };
  const url =
    "https://search-api-web.eastmoney.com/search/jsonp?" +
    new URLSearchParams({
      cb: callback,
      param: JSON.stringify(innerParam),
      _: String(Date.now()),
    });
  const response = await fetchJsonp(url, {
    ...options,
    referer: `https://so.eastmoney.com/news/s?keyword=${encodeURIComponent(symbol)}`,
  });
  return { response, data: parseEastmoneyNews(response.json, symbol) };
}

function parseResearchRows(json, stockCode) {
  const currentYear = numberOrNull(json?.currentYear) || new Date().getFullYear();
  const rows = Array.isArray(json?.data) ? json.data : [];
  return {
    stockCode,
    currentYear,
    totalPage: numberOrNull(json?.TotalPage) || 1,
    rows: rows.map((row, index) => ({
      ordinal: index + 1,
      stockCode: row.stockCode || stockCode,
      stockName: row.stockName || null,
      title: row.title || null,
      eastmoneyRating: row.emRatingName || null,
      lastEastmoneyRating: row.lastEmRatingName || null,
      ratingChange: row.ratingChange || null,
      organization: row.orgSName || row.orgName || null,
      organizationCode: row.orgCode || null,
      publishDate: row.publishDate ? String(row.publishDate).slice(0, 10) : null,
      infoCode: row.infoCode || null,
      oneMonthReportCount: numberOrNull(row.count),
      industry: row.indvInduName || row.industryName || null,
      author: row.author || row.researcher || null,
      reportType: row.reportType || null,
      forecast: {
        [currentYear]: {
          eps: numberOrNull(row.predictThisYearEps),
          pe: numberOrNull(row.predictThisYearPe),
        },
        [currentYear + 1]: {
          eps: numberOrNull(row.predictNextYearEps),
          pe: numberOrNull(row.predictNextYearPe),
        },
        [currentYear + 2]: {
          eps: numberOrNull(row.predictNextTwoYearEps),
          pe: numberOrNull(row.predictNextTwoYearPe),
        },
      },
      pdfUrl: row.infoCode ? `https://pdf.dfcfw.com/pdf/H3_${row.infoCode}_1.pdf` : null,
      encodedUrl: row.encodeUrl || null,
    })),
  };
}

export async function fetchEastmoneyResearchReports(stockCode, options = {}) {
  const pageSize = Number(options.reportPageSize || options.pageSize || 100);
  const maxPages = Math.max(1, Number(options.reportMaxPages || options.maxPages || 1));
  const baseParams = {
    industryCode: "*",
    pageSize: String(pageSize),
    industry: "*",
    rating: "*",
    ratingChange: "*",
    beginTime: dashedDate(options.start || "2000-01-01"),
    endTime: dashedDate(options.end || `${new Date().getFullYear() + 1}-01-01`),
    fields: "",
    qType: "0",
    orgCode: options.orgCode || "",
    code: stockCode,
    rcode: "",
  };
  const responses = [];
  const rows = [];
  let currentYear = new Date().getFullYear();
  let totalPage = 1;

  for (let page = 1; page <= Math.min(maxPages, totalPage); page += 1) {
    const url =
      "https://reportapi.eastmoney.com/report/list?" +
      new URLSearchParams({
        ...baseParams,
        pageNo: String(page),
        p: String(page),
        pageNum: String(page),
        pageNumber: String(page),
      });
    const response = await fetchJson(url, {
      ...options,
      referer: "https://data.eastmoney.com/report/stock.jshtml",
    });
    responses.push(response);
    const parsed = parseResearchRows(response.json, stockCode);
    currentYear = parsed.currentYear;
    totalPage = parsed.totalPage;
    rows.push(...parsed.rows.map((row, index) => ({ ...row, ordinal: rows.length + index + 1 })));
  }

  return {
    response: responses[0] || null,
    responses,
    data: {
      stockCode,
      currentYear,
      totalPage,
      rows,
    },
  };
}

async function capture(name, fn) {
  try {
    return { name, ok: true, value: await fn() };
  } catch (error) {
    return { name, ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function fetchStockDisclosureNewsReportData(options = {}) {
  const stockCode = options.stock || options.stockCode || DEFAULT_STOCK;
  const fetchedAt = options.fetchedAt || new Date().toISOString();
  const raw = {};
  const errors = {};
  const tasks = await Promise.all([
    capture("cninfoAnnouncements", () => fetchCninfoDisclosureAnnouncements(stockCode, options)),
    capture("cninfoInvestorRelations", () => fetchCninfoInvestorRelations(stockCode, options)),
    capture("eastmoneyNews", () => fetchEastmoneyStockNews(options.keyword || stockCode, options)),
    capture("eastmoneyResearchReports", () => fetchEastmoneyResearchReports(stockCode, options)),
  ]);
  const byName = Object.fromEntries(tasks.map((task) => [task.name, task]));

  for (const task of tasks) {
    if (!task.ok) errors[task.name] = task.error;
  }

  if (options.includeRaw) {
    for (const task of tasks) {
      if (!task.ok) continue;
      const responses = task.value?.responses || [task.value?.response].filter(Boolean);
      raw[task.name] = responses.map((response) => response.text);
    }
  }

  return {
    source: "CNInfo and Eastmoney native-source script",
    fetchedAt,
    stockCode,
    providerAnalysis: {
      noExternalDependencies: true,
      endpoints: {
        cninfoStockList: "cninfo.com.cn/new/data/*_stock.json",
        cninfoDisclosure: "cninfo.com.cn/new/hisAnnouncement/query",
        eastmoneyNews: "search-api-web.eastmoney.com/search/jsonp",
        eastmoneyResearchReports: "reportapi.eastmoney.com/report/list",
      },
      notes: [
        "CNInfo announcements are official disclosure records and should anchor material-event facts.",
        "CNInfo investor-relation rows are company-disclosed communication records; use them as management statements, not independent proof.",
        "Eastmoney news and research reports are discovery and expectation inputs; treat them as secondary evidence and cross-check important claims with filings.",
        "Research report PDF links follow Eastmoney's public H3 infoCode pattern and may fail for some rows if Eastmoney changes storage rules.",
      ],
    },
    cninfoAnnouncements: byName.cninfoAnnouncements?.value?.data || null,
    cninfoInvestorRelations: byName.cninfoInvestorRelations?.value?.data || null,
    eastmoneyNews: byName.eastmoneyNews?.value?.data || null,
    eastmoneyResearchReports: byName.eastmoneyResearchReports?.value?.data || null,
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

  const payload = await fetchStockDisclosureNewsReportData(options);
  await writeJsonOutput(options.output, payload);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
