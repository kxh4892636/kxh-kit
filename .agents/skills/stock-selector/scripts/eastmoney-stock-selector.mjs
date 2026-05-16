#!/usr/bin/env node

import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

const ENDPOINT =
  "https://np-tjxg-b.eastmoney.com/api/smart-tag/stock/v3/pw/search-code";

export const CONDITION_1 =
  "A股，近三年销售毛利率均大于29%，近三年加权净资产收益率ROE均大于14%，总市值大于500亿元，非科创板，非北交所，非ST股，显示总市值、收盘价、市盈率TTM、市净率、近10年市盈率百分位、近10年市净率百分位、年度股息率、近三年销售毛利率、近三年加权净资产收益率ROE、近三年营业收入同比增长率、近三年归母净利润同比增长率、近三年经营活动产生的现金流量净额、资产负债率、有息负债率、所属行业、主营业务、收盘价(季线)、近一年涨跌幅、成交额、换手率";

export const CONDITION_2 =
  "A股，总市值大于500亿元，且（季线MA13大于收盘价(季线) 或 季线MA21大于收盘价(季线) 或 季线MA34大于收盘价(季线)），非科创板，非北交所，非ST股，显示总市值、收盘价、市盈率TTM、市净率、近10年市盈率百分位、近10年市净率百分位、年度股息率、近三年销售毛利率、近三年加权净资产收益率ROE、近三年营业收入同比增长率、近三年归母净利润同比增长率、近三年经营活动产生的现金流量净额、资产负债率、有息负债率、所属行业、主营业务、收盘价(季线)、近一年涨跌幅、成交额、换手率";

function randomHex(length = 32) {
  const chars = "0123456789abcdef";
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

function randomRequestId() {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < 32; i += 1) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return `${out}${Date.now()}`;
}

function buildPayload(query, pageNo, pageSize) {
  return {
    needAmbiguousSuggest: true,
    pageSize,
    pageNo,
    fingerprint: randomHex(),
    matchWord: "",
    shareToGuba: false,
    timestamp: `${Date.now()}000`,
    requestId: randomRequestId(),
    removedConditionIdList: [],
    ownSelectAll: false,
    needCorrect: true,
    client: "WEB",
    product: "",
    needShowStockNum: false,
    biz: "web_ai_select_stocks",
    xcId: "xc116cbc507b0701797c",
    gids: [],
    dxInfoNew: [],
    keyWordNew: query,
    customDataNew: JSON.stringify([{ type: "text", value: query, extra: "" }]),
  };
}

export async function searchCode(query, options = {}) {
  const pageNo = options.pageNo ?? 1;
  const pageSize = options.pageSize ?? 1000;
  const requestTimeoutMs = options.requestTimeoutMs ?? 20000;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (!fetchImpl) {
    throw new Error("global fetch is unavailable; use Node.js 18 or newer");
  }

  const signal =
    options.signal ??
    (typeof AbortSignal !== "undefined" && AbortSignal.timeout
      ? AbortSignal.timeout(requestTimeoutMs)
      : undefined);

  let response;
  try {
    response = await fetchImpl(ENDPOINT, {
      method: "POST",
      headers: {
        Accept: "application/json, text/plain, */*",
        "Content-Type": "application/json",
        Origin: "https://xuangu.eastmoney.com",
        Referer: "https://xuangu.eastmoney.com/",
        "User-Agent": "Mozilla/5.0",
        actionMode: "edit_way",
        curPage: "stockResult",
        jumpSource: "edit_way",
      },
      signal,
      body: JSON.stringify(buildPayload(query, pageNo, pageSize)),
    });
  } catch (error) {
    if (error.name === "AbortError" || error.name === "TimeoutError") {
      throw new Error(
        `Eastmoney request timed out after ${requestTimeoutMs}ms on page ${pageNo}`,
      );
    }
    throw error;
  }

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Eastmoney HTTP ${response.status}: ${text.slice(0, 500)}`);
  }
  const json = JSON.parse(text);
  if (json.code !== "100") {
    throw new Error(`Eastmoney code ${json.code}: ${json.msg || text.slice(0, 500)}`);
  }
  return json;
}

export async function fetchAll(query, options = {}) {
  const pageSize = options.pageSize ?? 1000;
  const first = await searchCode(query, { ...options, pageNo: 1, pageSize });
  const result = first.data?.result ?? {};
  const rows = [...(result.dataList ?? [])];
  const total = Number(result.total ?? rows.length);
  let pageNo = 2;

  while (rows.length < total) {
    const next = await searchCode(query, { ...options, pageNo, pageSize });
    const nextRows = next.data?.result?.dataList ?? [];
    if (nextRows.length === 0) break;
    rows.push(...nextRows);
    pageNo += 1;
  }

  return { raw: first, rows: rows.slice(0, total), total };
}

function resultColumns(raw) {
  return raw.data?.result?.columns ?? [];
}

function detectColumnKey(raw, titles) {
  for (const title of titles) {
    const column = resultColumns(raw).find((item) => item.title === title);
    if (column?.key) return column.key;
  }
  throw new Error(`Cannot find required column by title: ${titles.join(" / ")}`);
}

function mergeRows(cond1, cond2) {
  const c1CodeKey = detectColumnKey(cond1.raw, ["代码"]);
  const c2CodeKey = detectColumnKey(cond2.raw, ["代码"]);
  const c1 = new Map(cond1.rows.map((row) => [row[c1CodeKey], row]));
  const c2 = new Map(cond2.rows.map((row) => [row[c2CodeKey], row]));
  const codes = [...new Set([...c1.keys(), ...c2.keys()])].sort();
  const intersection = codes.filter((code) => c1.has(code) && c2.has(code));

  const rows = codes.map((code) => {
    const condition1 = c1.get(code);
    const condition2 = c2.get(code);
    if (!condition1) return condition2;
    if (!condition2) return condition1;

    const row = { ...condition1 };
    for (const [key, value] of Object.entries(condition2)) {
      if (!Object.hasOwn(row, key)) row[key] = value;
    }
    return row;
  });

  return { rows, intersectionCount: intersection.length };
}

function unionColumnKeys(cond1, cond2, rows) {
  const keys = [];
  const seen = new Set();
  const condition1Keys = new Set(
    resultColumns(cond1.raw)
      .map((column) => column.key)
      .filter(Boolean),
  );
  const condition2Columns = resultColumns(cond2.raw);
  const condition2UniqueColumns = condition2Columns.filter(
    (column) => column.key && !condition1Keys.has(column.key),
  );

  for (const column of resultColumns(cond1.raw)) {
    if (column.key && !seen.has(column.key)) {
      keys.push(column.key);
      seen.add(column.key);
    }
  }
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!seen.has(key) && !condition2Columns.some((column) => column.key === key)) {
        keys.push(key);
        seen.add(key);
      }
    }
  }
  for (const column of condition2UniqueColumns) {
    keys.push(column.key);
    seen.add(column.key);
  }
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!seen.has(key)) {
        keys.push(key);
        seen.add(key);
      }
    }
  }
  return keys;
}

function csvEscape(value) {
  const text = value == null ? "" : String(value);
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replaceAll('"', '""')}"`;
}

function sanitizeFilenamePart(value) {
  const text = value == null ? "" : String(value);
  return text
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, " ")
    .trim() || "unknown";
}

function columnLabel(cond1, cond2, key) {
  const column =
    resultColumns(cond1.raw).find((item) => item.key === key) ??
    resultColumns(cond2.raw).find((item) => item.key === key);
  const parts = [column?.title ?? "", key, column?.dateMsg ?? "", column?.unit ?? ""]
    .filter(Boolean)
    .map((part) => String(part));
  return parts.length ? parts.join("|") : key;
}

async function writePerStockCsvs(outDir, cond1, cond2, rows) {
  const stockDir = join(outDir, "stocks");
  await rm(stockDir, { recursive: true, force: true });
  await mkdir(stockDir, { recursive: true });

  const keys = unionColumnKeys(cond1, cond2, rows);
  const header = keys.map((key) => csvEscape(columnLabel(cond1, cond2, key))).join(",");
  const codeKey = detectColumnKey(cond1.raw, ["代码"]);
  const nameKey = detectColumnKey(cond1.raw, ["名称"]);
  const fallbackCodeKey = detectColumnKey(cond2.raw, ["代码"]);
  const fallbackNameKey = detectColumnKey(cond2.raw, ["名称"]);
  const filenames = new Set();

  for (const row of rows) {
    const code = sanitizeFilenamePart(row[codeKey] ?? row[fallbackCodeKey]);
    const name = sanitizeFilenamePart(row[nameKey] ?? row[fallbackNameKey]);
    let filename = `${name}-${code}.csv`;
    let suffix = 2;
    while (filenames.has(filename)) {
      filename = `${name}-${code}-${suffix}.csv`;
      suffix += 1;
    }
    filenames.add(filename);

    const line = keys.map((key) => csvEscape(row[key])).join(",");
    await writeFile(join(stockDir, filename), `${header}\n${line}\n`, "utf8");
  }

  return filenames.size;
}

function conditions(raw) {
  return (raw.data?.responseConditionList ?? [])
    .map((item) => `- ${item.describe}`)
    .join("\n");
}

function dateMessages(...rawResponses) {
  const dates = new Set();
  for (const raw of rawResponses) {
    for (const column of raw.data?.result?.columns ?? []) {
      if (column.dateMsg) dates.add(`${column.title}: ${column.dateMsg}`);
    }
  }
  return [...dates].sort();
}

function summaryMarkdown({ cond1, cond2, merged, outDir, stockFileCount }) {
  const dataDates = dateMessages(cond1.raw, cond2.raw)
    .map((line) => `- ${line}`)
    .join("\n");

  return `# Eastmoney Stock Selector Summary

Fetched at: ${new Date().toISOString()}

## Counts

- Condition 1: ${cond1.rows.length}
- Condition 2: ${cond2.rows.length}
- Intersection: ${merged.intersectionCount}
- Union: ${merged.rows.length}
- Per-stock CSV files: ${stockFileCount}

## Condition 1 Parser

${conditions(cond1.raw)}

## Condition 2 Parser

${conditions(cond2.raw)}

## Data Dates

${dataDates}

## Output

- ${join(outDir, "summary.md")}
- ${join(outDir, "stocks/")}
`;
}

function parseArgs(argv) {
  const args = {
    out: join("inbox", "stock-selector", yyyymmdd(), "raw"),
    pageSize: 1000,
    requestTimeoutMs: 20000,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--out") args.out = argv[++i];
    else if (arg === "--page-size") args.pageSize = Number(argv[++i]);
    else if (arg === "--timeout-ms") args.requestTimeoutMs = Number(argv[++i]);
    else if (arg === "--help" || arg === "-h") args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function yyyymmdd(date = new Date()) {
  const yyyy = date.getFullYear();
  const mm = `${date.getMonth() + 1}`.padStart(2, "0");
  const dd = `${date.getDate()}`.padStart(2, "0");
  return `${yyyy}${mm}${dd}`;
}

async function removeStaleOutputs(outDir) {
  const staleFiles = [
    "condition-1.json",
    "condition-2.json",
    "condition-1.rows.csv",
    "condition-2.rows.csv",
    "field-dictionary.json",
    "union.csv",
    "union.json",
    "key-metrics.csv",
    "key-metrics.json",
  ];
  await Promise.all(
    staleFiles.map((file) => rm(join(outDir, file), { force: true })),
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(
      "Usage: node eastmoney-stock-selector.mjs [--out DIR] [--page-size N] [--timeout-ms N]",
    );
    return;
  }

  await mkdir(args.out, { recursive: true });
  await removeStaleOutputs(args.out);
  const fetchOptions = {
    pageSize: args.pageSize,
    requestTimeoutMs: args.requestTimeoutMs,
  };
  const cond1 = await fetchAll(CONDITION_1, fetchOptions);
  const cond2 = await fetchAll(CONDITION_2, fetchOptions);
  const merged = mergeRows(cond1, cond2);

  const stockFileCount = await writePerStockCsvs(args.out, cond1, cond2, merged.rows);
  await writeFile(
    join(args.out, "summary.md"),
    summaryMarkdown({ cond1, cond2, merged, outDir: args.out, stockFileCount }),
    "utf8",
  );

  console.log(`condition1=${cond1.rows.length}`);
  console.log(`condition2=${cond2.rows.length}`);
  console.log(`intersection=${merged.intersectionCount}`);
  console.log(`union=${merged.rows.length}`);
  console.log(`stockFiles=${stockFileCount}`);
  console.log(`out=${args.out}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}
