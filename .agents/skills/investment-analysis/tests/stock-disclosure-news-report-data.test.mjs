import assert from "node:assert/strict";
import test from "node:test";

import {
  fetchCninfoDisclosureAnnouncements,
  fetchCninfoInvestorRelations,
  fetchCninfoStockList,
  fetchEastmoneyResearchReports,
  fetchEastmoneyStockNews,
  fetchStockDisclosureNewsReportData,
} from "../scripts/stock-disclosure-news-report-data.mjs";

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

function cninfoStockListJson() {
  return {
    stockList: [{ code: "000001", orgId: "gssz0000001", zwjc: "平安银行" }],
  };
}

function cninfoAnnouncementJson(title = "平安银行：2025年年度报告") {
  return {
    totalAnnouncement: 1,
    announcements: [
      {
        secCode: "000001",
        secName: "平安银行",
        announcementTitle: title,
        announcementTime: 1735689600000,
        announcementId: "1210000001",
        orgId: "gssz0000001",
        announcementType: "010301",
        adjunctUrl: "finalpage/2025-01-01/1210000001.PDF",
      },
    ],
  };
}

function eastmoneyNewsJsonp() {
  return `jsonp_1(${JSON.stringify({
    result: {
      cmsArticleWebOld: [
        {
          code: "202501011234567890",
          title: "<em>平安银行</em>新闻标题",
          content: "这是<em>平安银行</em>新闻内容\\u3000\\r\\n第二行",
          date: "2025-01-01 09:30:00",
          mediaName: "东方财富",
          image: "",
        },
      ],
    },
  })})`;
}

function eastmoneyReportJson(page = 1) {
  return {
    TotalPage: 2,
    currentYear: 2025,
    data: [
      {
        stockCode: "000001",
        stockName: "平安银行",
        title: `平安银行深度报告-${page}`,
        emRatingName: "买入",
        lastEmRatingName: "增持",
        ratingChange: "调高",
        orgSName: "测试证券",
        orgCode: "80000000",
        publishDate: "2025-01-0" + page + " 00:00:00",
        infoCode: `AP2025010${page}`,
        count: "3",
        indvInduName: "银行",
        author: "分析师A",
        reportType: "个股研报",
        predictThisYearEps: "2.1",
        predictThisYearPe: "5.2",
        predictNextYearEps: "2.3",
        predictNextYearPe: "4.8",
        predictNextTwoYearEps: "2.5",
        predictNextTwoYearPe: "4.4",
      },
    ],
  };
}

async function stockDisclosureFetch(url, options = {}) {
  const parsed = new URL(String(url));
  if (parsed.hostname === "www.cninfo.com.cn" && parsed.pathname.endsWith("/new/data/szse_stock.json")) {
    return jsonResponse(cninfoStockListJson());
  }
  if (parsed.hostname === "www.cninfo.com.cn" && parsed.pathname.endsWith("/new/hisAnnouncement/query")) {
    const body = options.body instanceof URLSearchParams ? options.body : new URLSearchParams(String(options.body || ""));
    const tabName = body.get("tabName");
    return jsonResponse(cninfoAnnouncementJson(tabName === "relation" ? "投资者关系活动记录表" : "平安银行：2025年年度报告"));
  }
  if (parsed.hostname === "search-api-web.eastmoney.com") return textResponse(eastmoneyNewsJsonp());
  if (parsed.hostname === "reportapi.eastmoney.com") return jsonResponse(eastmoneyReportJson(Number(parsed.searchParams.get("pageNo") || 1)));
  throw new Error(`Unexpected URL ${url}`);
}

test("CNInfo stock list and disclosure functions parse official rows", async () => {
  const stockList = await fetchCninfoStockList("沪深京", { fetchImpl: stockDisclosureFetch });
  assert.equal(stockList.data.byCode["000001"], "gssz0000001");

  const announcements = await fetchCninfoDisclosureAnnouncements("000001", {
    fetchImpl: stockDisclosureFetch,
    start: "2025-01-01",
    end: "2025-01-31",
    category: "年报",
  });
  assert.equal(announcements.data.rows[0].stockName, "平安银行");
  assert.equal(announcements.data.rows[0].title, "平安银行：2025年年度报告");
  assert.equal(announcements.data.rows[0].pdfUrl, "https://static.cninfo.com.cn/finalpage/2025-01-01/1210000001.PDF");
  assert.match(announcements.data.rows[0].detailUrl, /announcementId=1210000001/);

  const relations = await fetchCninfoInvestorRelations("000001", { fetchImpl: stockDisclosureFetch });
  assert.equal(relations.data.rows[0].title, "投资者关系活动记录表");
});

test("Eastmoney news and report functions parse news, forecasts and PDF links", async () => {
  const news = await fetchEastmoneyStockNews("000001", {
    fetchImpl: stockDisclosureFetch,
    callback: "jsonp_1",
    pageSize: 10,
  });
  assert.equal(news.data.rows[0].title, "平安银行新闻标题");
  assert.equal(news.data.rows[0].mediaName, "东方财富");
  assert.equal(news.data.rows[0].url, "http://finance.eastmoney.com/a/202501011234567890.html");

  const reports = await fetchEastmoneyResearchReports("000001", {
    fetchImpl: stockDisclosureFetch,
    start: "2025-01-01",
    end: "2025-01-31",
    maxPages: 2,
  });
  assert.equal(reports.data.rows.length, 2);
  assert.equal(reports.data.rows[0].forecast[2025].eps, 2.1);
  assert.equal(reports.data.rows[1].ordinal, 2);
  assert.equal(reports.data.rows[0].pdfUrl, "https://pdf.dfcfw.com/pdf/H3_AP20250101_1.pdf");
});

test("fetchStockDisclosureNewsReportData aggregates all sections and raw payloads", async () => {
  const result = await fetchStockDisclosureNewsReportData({
    stock: "000001",
    start: "2025-01-01",
    end: "2025-01-31",
    fetchImpl: stockDisclosureFetch,
    callback: "jsonp_1",
    maxPages: 1,
    includeRaw: true,
    fetchedAt: "2025-01-31T00:00:00.000Z",
  });

  assert.equal(result.stockCode, "000001");
  assert.equal(result.cninfoAnnouncements.rows[0].stockCode, "000001");
  assert.equal(result.cninfoInvestorRelations.rows[0].title, "投资者关系活动记录表");
  assert.equal(result.eastmoneyNews.rows[0].keyword, "000001");
  assert.equal(result.eastmoneyResearchReports.rows[0].organization, "测试证券");
  assert.equal(Object.keys(result.errors).length, 0);
  assert.equal(result.raw.cninfoAnnouncements.length, 1);
  assert.equal(result.raw.eastmoneyResearchReports.length, 1);
});

test("fetchStockDisclosureNewsReportData records provider failures without hiding other sections", async () => {
  async function partlyBlockedFetch(url, options = {}) {
    const parsed = new URL(String(url));
    if (parsed.hostname === "www.cninfo.com.cn") return textResponse("blocked", 403);
    return stockDisclosureFetch(url, options);
  }

  const result = await fetchStockDisclosureNewsReportData({
    stock: "000001",
    fetchImpl: partlyBlockedFetch,
    callback: "jsonp_1",
  });

  assert.match(result.errors.cninfoAnnouncements, /HTTP 403/);
  assert.match(result.errors.cninfoInvestorRelations, /HTTP 403/);
  assert.equal(result.eastmoneyNews.rows[0].title, "平安银行新闻标题");
  assert.equal(result.eastmoneyResearchReports.rows[0].title, "平安银行深度报告-1");
});
