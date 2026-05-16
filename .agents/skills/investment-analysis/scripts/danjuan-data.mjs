#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const BASE_URL = "https://danjuanfunds.com";
const DEFAULT_CODE = "SZ399812";
const DEFAULT_PROBE_OUTPUT = "/tmp/danjuan-data-probe.json";
const ALLOWED_METRICS = new Set(["pe", "pb", "roe"]);
const WINDOW_TO_DAY = new Map([
  ["3", "3y"],
  ["3y", "3y"],
  ["5", "5y"],
  ["5y", "5y"],
  ["10", "all"],
  ["10y", "all"],
  ["all", "all"],
]);
const DAY_TO_WINDOW_YEARS = new Map([
  ["3y", 3],
  ["5y", 5],
  ["all", 10],
]);

const headers = {
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36",
  accept: "application/json,text/plain,*/*",
};

function parseArgs(argv) {
  const options = {
    command: "valuation",
    code: DEFAULT_CODE,
    metrics: ["pe", "pb", "roe"],
    windows: ["3y", "5y", "all"],
    output: "",
    includeRaw: false,
  };

  const args = argv.slice(2);
  if (args[0] === "probe" || args[0] === "valuation") {
    options.command = args.shift();
  }

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    const readValue = () => {
      if (arg.includes("=")) return arg.slice(arg.indexOf("=") + 1);
      i += 1;
      return args[i];
    };

    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg.startsWith("--code")) {
      options.code = readValue();
    } else if (arg.startsWith("--metrics")) {
      options.metrics = readValue()
        .split(",")
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean);
    } else if (arg.startsWith("--windows")) {
      options.windows = readValue()
        .split(",")
        .map((value) => WINDOW_TO_DAY.get(value.trim().toLowerCase()))
        .filter(Boolean);
    } else if (arg.startsWith("--out")) {
      options.output = readValue();
    } else if (arg === "--include-raw") {
      options.includeRaw = true;
    } else if (!arg.startsWith("-")) {
      options.code = arg;
    }
  }

  options.metrics = options.metrics.filter((metric) => ALLOWED_METRICS.has(metric));
  options.windows = [...new Set(options.windows)];
  if (options.metrics.length === 0) options.metrics = ["pe", "pb", "roe"];
  if (options.windows.length === 0) options.windows = ["3y", "5y", "all"];
  return options;
}

function printHelp() {
  console.log(`Usage:
  node scripts/danjuan-data.mjs valuation [indexCode] [--metrics=pe,pb,roe] [--windows=3y,5y,10y] [--out=/tmp/out.json]
  node scripts/danjuan-data.mjs probe [indexCode] [--out=/tmp/probe.json]

Examples:
  node scripts/danjuan-data.mjs valuation SZ399812 --windows=3y,5y,10y
  node scripts/danjuan-data.mjs probe SZ399812 --out=/tmp/danjuan-probe.json

Notes:
  - Danjuan's page labels the 10-year tab as value "all"; direct day=10y returns a parameter error.
  - This script uses only Node built-ins and global fetch. No npm packages are required.`);
}

function numberOrNull(value) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function dateFromTimestamp(timestamp) {
  const numberValue = Number(timestamp);
  if (!Number.isFinite(numberValue)) return null;
  return new Date(numberValue).toISOString().slice(0, 10);
}

function maxDate(values) {
  const dates = values.filter(Boolean).sort();
  return dates.length ? dates[dates.length - 1] : null;
}

function normalizeDay(value) {
  return WINDOW_TO_DAY.get(String(value).trim().toLowerCase()) || null;
}

function requireOk(response) {
  const { json, url } = response;
  if (json?.result_code !== 0) {
    throw new Error(`Danjuan API error from ${url}: ${json?.result_code} ${json?.message || ""}`);
  }
  return json.data;
}

function summarizeBody(text) {
  const compact = text.replace(/\s+/g, " ").slice(0, 600);
  let jsonShape = null;
  try {
    const json = JSON.parse(text);
    const data = json?.data;
    jsonShape = {
      topKeys: Object.keys(json).slice(0, 20),
      dataType: Array.isArray(data) ? "array" : typeof data,
      dataKeys:
        data && !Array.isArray(data) && typeof data === "object"
          ? Object.keys(data).slice(0, 30)
          : [],
      itemCount: Array.isArray(data?.items)
        ? data.items.length
        : Array.isArray(data?.index_eva_pe_growths)
          ? data.index_eva_pe_growths.length
          : Array.isArray(data?.index_eva_pb_growths)
            ? data.index_eva_pb_growths.length
            : Array.isArray(data?.index_eva_roe_growths)
              ? data.index_eva_roe_growths.length
              : Array.isArray(data)
                ? data.length
                : null,
    };
  } catch {
    jsonShape = null;
  }
  return {
    sha256: createHash("sha256").update(text).digest("hex"),
    bytes: Buffer.byteLength(text),
    preview: compact,
    jsonShape,
  };
}

function candidatePaths(indexCode) {
  return [
    "/djapi/index_eva/dj",
    `/djapi/index_eva/detail/${indexCode}`,
    `/djapi/index_eva/pe_history/${indexCode}?day=3y`,
    `/djapi/index_eva/pe_history/${indexCode}?day=5y`,
    `/djapi/index_eva/pe_history/${indexCode}?day=all`,
    `/djapi/index_eva/pb_history/${indexCode}?day=3y`,
    `/djapi/index_eva/pb_history/${indexCode}?day=5y`,
    `/djapi/index_eva/pb_history/${indexCode}?day=all`,
    `/djapi/index_eva/roe_history/${indexCode}?day=3y`,
    `/djapi/index_eva/roe_history/${indexCode}?day=5y`,
    `/djapi/index_eva/roe_history/${indexCode}?day=all`,
    `/djapi/index_eva/history/${indexCode}`,
    `/djapi/index_eva/chart/${indexCode}`,
    `/djapi/index_eva/pe/${indexCode}`,
    `/djapi/index_eva/pb/${indexCode}`,
    `/djapi/index_eva/roe/${indexCode}`,
    `/djapi/index_eva/${indexCode}/history`,
    `/djapi/index_eva/${indexCode}/chart`,
    `/djapi/index_eva/${indexCode}/pe`,
    `/djapi/index_eva/${indexCode}/pb`,
    `/djapi/index_eva/${indexCode}/roe`,
    `/djapi/index_eva/detail/${indexCode}?period=3`,
    `/djapi/index_eva/detail/${indexCode}?period=5`,
    `/djapi/index_eva/detail/${indexCode}?period=10`,
    `/djapi/index_eva/detail/${indexCode}?years=3`,
    `/djapi/index_eva/detail/${indexCode}?years=5`,
    `/djapi/index_eva/detail/${indexCode}?years=10`,
    `/djapi/index_eva/detail/${indexCode}?type=pe&years=10`,
    `/djapi/index_eva/detail/${indexCode}?type=pb&years=10`,
    `/djapi/index_eva/detail/${indexCode}?type=roe&years=10`,
  ];
}

export async function fetchDanjuanJson(pathname, params = {}, options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const refererPath = options.refererPath || "/djmodule/value-center";
  const url = new URL(pathname, BASE_URL);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) url.searchParams.set(key, value);
  }

  const response = await fetchImpl(url, {
    headers: {
      ...headers,
      referer: `${BASE_URL}${refererPath}`,
    },
  });
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Non-JSON response from ${url}: ${text.slice(0, 120)}`);
  }

  return {
    url: url.toString(),
    status: response.status,
    bytes: Buffer.byteLength(text),
    json,
  };
}

export async function fetchDanjuanValuationList(options = {}) {
  const response = await fetchDanjuanJson("/djapi/index_eva/dj", {}, options);
  return {
    response,
    data: requireOk(response),
  };
}

export async function fetchDanjuanValuationDetail(indexCode, options = {}) {
  const response = await fetchDanjuanJson(`/djapi/index_eva/detail/${indexCode}`, {}, options);
  return {
    response,
    data: requireOk(response),
  };
}

export async function fetchDanjuanValuationHistory(indexCode, metric, window, options = {}) {
  if (!ALLOWED_METRICS.has(metric)) throw new Error(`Unsupported Danjuan metric: ${metric}`);
  const day = normalizeDay(window);
  if (!day) throw new Error(`Unsupported Danjuan history window: ${window}`);
  const response = await fetchDanjuanJson(
    `/djapi/index_eva/${metric}_history/${indexCode}`,
    { day },
    { ...options, refererPath: `/dj-valuation-table-detail/${indexCode}` },
  );
  return {
    response,
    data: requireOk(response),
    history: normalizeHistory(metric, day, requireOk(response), response.url),
  };
}

export async function probeDanjuanEndpoints(indexCode = DEFAULT_CODE, options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const results = [];
  for (const pathname of candidatePaths(indexCode)) {
    const url = `${BASE_URL}${pathname}`;
    const startedAt = Date.now();
    try {
      const response = await fetchImpl(url, {
        headers: {
          ...headers,
          referer: `${BASE_URL}/djmodule/value-center`,
        },
      });
      const text = await response.text();
      results.push({
        url,
        status: response.status,
        ok: response.ok,
        elapsedMs: Date.now() - startedAt,
        contentType: response.headers?.get?.("content-type") || null,
        ...summarizeBody(text),
      });
    } catch (error) {
      results.push({
        url,
        status: null,
        ok: false,
        elapsedMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    indexCode,
    fetchedAt: new Date().toISOString(),
    note:
      "Native Node probe for Danjuan valuation endpoints. Candidate history endpoints are exploratory and may change.",
    results,
  };
}

function normalizeDetail(raw) {
  if (!raw || typeof raw !== "object") return null;
  return {
    indexCode: raw.index_code || null,
    name: raw.name || null,
    category: raw.ttype ?? null,
    date: raw.date || null,
    pe: numberOrNull(raw.pe),
    pb: numberOrNull(raw.pb),
    pePercentile: numberOrNull(raw.pe_percentile),
    pbPercentile: numberOrNull(raw.pb_percentile),
    peOverHistory: numberOrNull(raw.pe_over_history),
    pbOverHistory: numberOrNull(raw.pb_over_history),
    roe: numberOrNull(raw.roe),
    dividendYield: numberOrNull(raw.yeild),
    peg: numberOrNull(raw.peg),
    bondYield: numberOrNull(raw.bond_yeild),
    valuationStatus: raw.eva_type || "unknown",
    valuationStatusInt: raw.eva_type_int ?? null,
    usesPbRule: Boolean(raw.pb_flag),
    rawUrl: raw.url || null,
  };
}

function normalizeHistory(metric, day, rawData, sourceUrl) {
  const pointsKey = `index_eva_${metric}_growths`;
  const rawPoints = Array.isArray(rawData?.[pointsKey]) ? rawData[pointsKey] : [];
  const points = rawPoints.map((point) => {
    const value = numberOrNull(point?.[metric]);
    return {
      date: dateFromTimestamp(point?.ts),
      timestamp: numberOrNull(point?.ts),
      metric,
      value,
      [metric]: value,
    };
  });

  const horizontalLines = Array.isArray(rawData?.horizontal_lines)
    ? rawData.horizontal_lines.map((line) => ({
        name: line.line_name || null,
        value: numberOrNull(line.line_value),
        color: line.line_color || null,
        type: line.line_type ?? null,
      }))
    : [];

  return {
    metric,
    sourceWindow: day,
    windowYears: DAY_TO_WINDOW_YEARS.get(day) || null,
    sourceUrl,
    pointCount: points.length,
    startDate: points[0]?.date || null,
    endDate: points[points.length - 1]?.date || null,
    horizontalLines,
    points,
  };
}

export async function fetchDanjuanIndexValuation(indexCode = DEFAULT_CODE, options = {}) {
  const metrics = options.metrics || ["pe", "pb", "roe"];
  const windows = (options.windows || ["3y", "5y", "all"]).map((window) => normalizeDay(window)).filter(Boolean);
  const detailResult = await fetchDanjuanValuationDetail(indexCode, options);
  const histories = [];
  const raw = options.includeRaw ? { detail: detailResult.data, histories: {} } : undefined;

  for (const metric of metrics.filter((metric) => ALLOWED_METRICS.has(metric))) {
    for (const day of windows) {
      const historyResult = await fetchDanjuanValuationHistory(indexCode, metric, day, options);
      histories.push(historyResult.history);
      if (raw) raw.histories[`${metric}_${day}`] = historyResult.data;
    }
  }

  const detail = normalizeDetail(detailResult.data);
  const asOf = maxDate([detail?.date, ...histories.map((history) => history.endDate)]);
  const warnings = [];
  if (windows.includes("all")) {
    warnings.push(
      "Danjuan page labels day=all as near 10 years; actual history length depends on provider availability.",
    );
  }

  return {
    source: "Danjuan/Xueqiu index_eva",
    fetchedAt: new Date().toISOString(),
    asOf,
    sourceUrl: `${BASE_URL}/dj-valuation-table-detail/${indexCode}`,
    indexCode,
    detail,
    histories,
    warnings,
    providerAnalysis: {
      confirmedEndpoints: [
        "/djapi/index_eva/detail/{index_code}",
        "/djapi/index_eva/{pe|pb|roe}_history/{index_code}?day={3y|5y|all}",
      ],
      windowMapping: {
        near3Years: "day=3y",
        near5Years: "day=5y",
        near10Years: "day=all",
      },
      responseShape:
        "History payload contains horizontal_lines and index_eva_{metric}_growths points with ts plus metric value.",
      unitNotes: {
        pe: "multiple",
        pb: "multiple",
        roe: "decimal ratio; multiply by 100 for percentage display",
      },
    },
    ...(raw ? { raw } : {}),
  };
}

async function writeJsonOutput(outputPath, payload) {
  const text = `${JSON.stringify(payload, null, 2)}\n`;
  if (outputPath) {
    await mkdir(dirname(resolve(outputPath)), { recursive: true });
    await writeFile(outputPath, text, "utf8");
    console.log(`Wrote ${outputPath}`);
  } else {
    process.stdout.write(text);
  }
}

async function main() {
  const options = parseArgs(process.argv);
  if (options.help) {
    printHelp();
    return;
  }

  if (options.command === "probe") {
    const payload = await probeDanjuanEndpoints(options.code);
    await writeJsonOutput(options.output || DEFAULT_PROBE_OUTPUT, payload);
    return;
  }

  const payload = await fetchDanjuanIndexValuation(options.code, {
    metrics: options.metrics,
    windows: options.windows,
    includeRaw: options.includeRaw,
  });
  await writeJsonOutput(options.output, payload);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
