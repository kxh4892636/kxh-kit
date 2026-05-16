import assert from "node:assert/strict";
import test from "node:test";

import {
  fetchDanjuanIndexValuation,
  fetchDanjuanJson,
  fetchDanjuanValuationDetail,
  fetchDanjuanValuationHistory,
  fetchDanjuanValuationList,
  probeDanjuanEndpoints,
} from "../scripts/danjuan-data.mjs";

function jsonResponse(data, status = 200) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: () => "application/json" },
    text: async () => JSON.stringify(data),
  };
}

const detailPayload = {
  result_code: 0,
  data: {
    index_code: "SZ399812",
    name: "中证养老产业指数",
    date: "2025-01-02",
    pe: "20.5",
    pb: "2.1",
    pe_percentile: "0.3",
    pb_percentile: "0.2",
    roe: "0.12",
    eva_type: "low",
  },
};

const peHistoryPayload = {
  result_code: 0,
  data: {
    horizontal_lines: [{ line_name: "median", line_value: "18.5", line_color: "#aaa", line_type: 1 }],
    index_eva_pe_growths: [{ ts: 1704067200000, pe: "17.2" }],
  },
};

test("fetchDanjuanJson appends params and parses JSON", async () => {
  let seenUrl = null;
  let seenHeaders = null;
  const fetchImpl = async (url, init) => {
    seenUrl = new URL(String(url));
    seenHeaders = init.headers;
    return jsonResponse({ result_code: 0, data: { ok: true } });
  };

  const result = await fetchDanjuanJson("/djapi/index_eva/pe_history/SZ399812", { day: "3y" }, { fetchImpl });

  assert.equal(result.json.data.ok, true);
  assert.equal(seenUrl.pathname, "/djapi/index_eva/pe_history/SZ399812");
  assert.equal(seenUrl.searchParams.get("day"), "3y");
  assert.equal(seenHeaders.referer, "https://danjuanfunds.com/djmodule/value-center");
});

test("fetchDanjuanValuationList returns the provider data section", async () => {
  const fetchImpl = async (url) => {
    assert.equal(new URL(String(url)).pathname, "/djapi/index_eva/dj");
    return jsonResponse({ result_code: 0, data: { items: [{ index_code: "CSI300" }] } });
  };

  const result = await fetchDanjuanValuationList({ fetchImpl });

  assert.deepEqual(result.data.items, [{ index_code: "CSI300" }]);
});

test("fetchDanjuanValuationDetail returns detail data", async () => {
  const fetchImpl = async (url) => {
    assert.equal(new URL(String(url)).pathname, "/djapi/index_eva/detail/SZ399812");
    return jsonResponse(detailPayload);
  };

  const result = await fetchDanjuanValuationDetail("SZ399812", { fetchImpl });

  assert.equal(result.data.index_code, "SZ399812");
  assert.equal(result.data.pe, "20.5");
});

test("fetchDanjuanValuationHistory normalizes PE history", async () => {
  const fetchImpl = async (url) => {
    const parsed = new URL(String(url));
    assert.equal(parsed.pathname, "/djapi/index_eva/pe_history/SZ399812");
    assert.equal(parsed.searchParams.get("day"), "3y");
    return jsonResponse(peHistoryPayload);
  };

  const result = await fetchDanjuanValuationHistory("SZ399812", "pe", "3y", { fetchImpl });

  assert.equal(result.history.metric, "pe");
  assert.equal(result.history.sourceWindow, "3y");
  assert.equal(result.history.windowYears, 3);
  assert.equal(result.history.pointCount, 1);
  assert.equal(result.history.points[0].date, "2024-01-01");
  assert.equal(result.history.points[0].pe, 17.2);
  assert.equal(result.history.horizontalLines[0].value, 18.5);
});

test("probeDanjuanEndpoints records candidate endpoint responses", async () => {
  const seen = [];
  const fetchImpl = async (url) => {
    seen.push(String(url));
    return jsonResponse({ result_code: 0, data: { items: [{ ok: true }] } });
  };

  const result = await probeDanjuanEndpoints("SZ399812", { fetchImpl });

  assert.equal(result.indexCode, "SZ399812");
  assert.ok(result.results.length >= 10);
  assert.equal(result.results[0].status, 200);
  assert.ok(seen[0].includes("/djapi/index_eva/dj"));
});

test("fetchDanjuanIndexValuation aggregates detail and selected histories", async () => {
  const fetchImpl = async (url) => {
    const parsed = new URL(String(url));
    if (parsed.pathname === "/djapi/index_eva/detail/SZ399812") return jsonResponse(detailPayload);
    if (parsed.pathname === "/djapi/index_eva/pe_history/SZ399812") return jsonResponse(peHistoryPayload);
    throw new Error(`Unexpected URL ${url}`);
  };

  const result = await fetchDanjuanIndexValuation("SZ399812", {
    fetchImpl,
    metrics: ["pe"],
    windows: ["3y"],
  });

  assert.equal(result.indexCode, "SZ399812");
  assert.equal(result.detail.pe, 20.5);
  assert.equal(result.histories.length, 1);
  assert.equal(result.histories[0].points[0].value, 17.2);
});
