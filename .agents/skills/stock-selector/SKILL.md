---
name: stock-selector
description: Use this skill whenever the user wants to screen A-share stocks, run the fixed Eastmoney xuangu stock-selector workflow, fetch key stock metrics from https://xuangu.eastmoney.com/, merge the two stock pools, create a preliminary shortlist, and then generate required investment-analysis reports for selected stocks. This skill should trigger for A股选股, 东方财富条件选股, xuangu, stock screening, 初筛, 股票池, PE/PB百分位, ROE毛利率筛选, 季线均线筛选, or requests to save stock-selector reports.
---

# Stock Selector

This skill turns two fixed Eastmoney natural-language stock screens into a repeatable workflow:

1. Fetch the two stock pools and key metrics from `https://xuangu.eastmoney.com/`.
2. Merge by stock code; when duplicated, prefer condition 1 data and append condition 2-only fields at the end.
3. Use `investment-analysis` for preliminary screening, but only with returned Eastmoney xuangu data.
4. After the preliminary shortlist is chosen, immediately use `investment-analysis` again for required deeper reports. Deep reports may and should use the data acquisition scripts, references, and source-specific endpoints from `investment-analysis`, then save the reports under `inbox/stock-selector/<day>/`.

This skill is for screening and research workflow automation. It does not produce personalized investment advice or buy/sell commands.

## Data Source

Use the Eastmoney xuangu natural-language endpoint:

```text
https://np-tjxg-b.eastmoney.com/api/smart-tag/stock/v3/pw/search-code
```

The endpoint is a web product interface, not a stable public API. Always inspect `responseConditionList` before trusting a result. If Eastmoney changes parsing, blocks the request, or triggers captcha, stop and report the exact failure instead of substituting guessed data.

Because this is a third-party interface, returned field keys, field names, date suffixes, and units can change at any time. Do not hardcode provider field keys such as current PE/PB/ROE key names for screening. The generated per-stock CSV headers should preserve the current response field description as `title|key|date|unit` whenever Eastmoney provides column metadata. If Eastmoney returns row-only keys without column metadata, keep the raw key as the header instead of guessing a title.

The fetch script depends on returned column title `代码` to merge the two stock pools by stock code, and returned column title `名称` to name per-stock CSV files. If Eastmoney changes either title, fail with the provider response context instead of guessing a replacement key.

## Fixed Screening Texts

Use these two texts exactly unless the user asks to change the criteria.

### Condition 1: Quality Screen

```text
A股，近三年销售毛利率均大于29%，近三年加权净资产收益率ROE均大于14%，总市值大于500亿元，非科创板，非北交所，非ST股，显示总市值、收盘价、市盈率TTM、市净率、近10年市盈率百分位、近10年市净率百分位、年度股息率、近三年销售毛利率、近三年加权净资产收益率ROE、近三年营业收入同比增长率、近三年归母净利润同比增长率、近三年经营活动产生的现金流量净额、资产负债率、有息负债率、所属行业、主营业务、收盘价(季线)、近一年涨跌幅、成交额、换手率
```

Expected parser checks:

- Includes `近三年【2023.12.31-2025.12.31】销售毛利率大于29%` or the equivalent current three-year range.
- Includes `近三年【...】净资产收益率ROE(加权)大于14%`.
- Includes `总市值大于500亿元`.
- Includes `非[上交所科创板]`, `非[北京证券交易所]`, and `非[ST股票]`.

### Condition 2: Quarterly Moving Average Screen

```text
A股，总市值大于500亿元，且（季线MA13大于收盘价(季线) 或 季线MA21大于收盘价(季线) 或 季线MA34大于收盘价(季线)），非科创板，非北交所，非ST股，显示总市值、收盘价、市盈率TTM、市净率、近10年市盈率百分位、近10年市净率百分位、年度股息率、近三年销售毛利率、近三年加权净资产收益率ROE、近三年营业收入同比增长率、近三年归母净利润同比增长率、近三年经营活动产生的现金流量净额、资产负债率、有息负债率、所属行业、主营业务、收盘价(季线)、近一年涨跌幅、成交额、换手率
```

Expected parser checks:

- Includes `总市值大于500亿元`.
- Includes one grouped OR condition equivalent to:
  `季线周期13日均线>季线周期收盘价(前复权) 或 季线周期21日均线>季线周期收盘价(前复权) 或 季线周期34日均线>季线周期收盘价(前复权)`.
- Includes `非[上交所科创板]`, `非[北京证券交易所]`, and `非[ST股票]`.

Use `近10年市盈率百分位` and `近10年市净率百分位` for both conditions.

## Fetch Workflow

Prefer the bundled script:

```bash
node .agents/skills/stock-selector/scripts/eastmoney-stock-selector.mjs --out inbox/stock-selector/$(date +%Y%m%d)/raw
```

The script:

- Calls the two fixed queries.
- Fetches all pages with `pageSize=1000`.
- Writes `summary.md` and one per-stock CSV under `stocks/`; it does not write `union.csv`.
- Builds the union by stock code.
- When a stock appears in both conditions, starts from the condition 1 row, then appends fields that exist only in condition 2 to the end of the per-stock CSV header and row.
- If a field exists in both conditions, the condition 1 value wins for duplicate stocks.
- Does not add `命中条件1`, `命中条件2`, or `两个条件均命中` columns.
- Does not prefix columns with `condition1` or `condition2`.
- Preserves field descriptions in per-stock CSV headers as `title|key|date|unit` when current Eastmoney `columns` metadata exists; keeps raw keys for row-only fields without metadata.
- Rebuilds `stocks/` on each run. Each per-stock file is named `{name}-{code}.csv` and contains the merged header plus one stock row. Invalid filename characters are replaced with `_`; if sanitized filenames collide, append a numeric suffix.

If the script cannot run, recreate its behavior with native Node or Python standard-library requests. Do not add npm or pip dependencies just for this workflow.

## Preliminary Screening Rules

Use the `investment-analysis` skill for preliminary screening, but use only the Eastmoney data already returned in `raw/stocks/*.csv`. This means applying the `investment-analysis` valuation-quality-timing-risk framework without invoking its data acquisition scripts or fetching supplemental data during the preliminary phase. Do not call `investment-analysis` data scripts, Eastmoney F10 APIs, Danjuan, AData-derived scripts, browser scraping, or other data sources until after the preliminary shortlist is selected.

The preliminary screening goal is to quickly identify stocks that may have investment value and deserve deeper analysis. It is not a final investment conclusion.

When reading preliminary fields, interpret metrics from the per-stock CSV headers under `raw/stocks/`. Match metrics by returned display title, date, unit, and provider key embedded in the header. For headers that contain only a raw key, treat them as provider row-only fields and use them cautiously. Do not assume today's key names will exist in future responses.

For the preliminary shortlist, save `shortlist.md` and include a concise table with:

- Code and name
- Industry and main business
- Market cap
- PE TTM, PB, PE percentile, PB percentile
- Dividend yield
- Latest three-year gross margin and weighted ROE
- Revenue and parent-net-profit growth
- Operating cash flow
- Debt-to-asset ratio and interest-bearing debt ratio
- Quarterly close, one-year return, amount, turnover
- Preliminary view: `优先分析`, `候选观察`, or `剔除`
- Main reason in one short sentence

Suggested scoring lens:

- Prefer low or moderate PE/PB percentile, positive cash flow, stable high ROE, stable gross margin, and understandable business.
- Penalize missing core metrics, negative or abnormal PE, very high leverage, weak cash flow, heavy cyclicality without a clear cycle explanation, and crowded expensive growth.
- Treat the moving-average condition as timing context, not proof of value.
- Use the `investment-analysis` hierarchy: valuation and quality carry more weight than timing, and risks can veto otherwise attractive metrics.
- Keep the shortlist focused. If the union is large, pick the strongest 10-20 names unless the user asks for a different count.

## Deep Analysis Workflow

After preliminary screening succeeds, deeper analysis is mandatory for every stock in the shortlist. Do not stop after creating `shortlist.md` unless the user explicitly interrupts or asks to pause before deep analysis.

Use `investment-analysis` for the deeper reports. At this stage, the preliminary-data restriction no longer applies: use the current data acquisition scripts, references, and source-specific endpoints described by `investment-analysis` whenever they are relevant to the stock and available in the workspace. This can include scripts or endpoints for current price and valuation, financial statements, announcements, news, investor-relations records, research reports, peer/context data, and other sources required by the `investment-analysis` workflow.

Keep provider boundaries explicit. Do not collapse Eastmoney xuangu fields, Eastmoney F10, CNInfo announcements, Danjuan, AData-derived datasets, research reports, or browser-scraped pages into one anonymous dataset. Preserve source, `asOf`, `fetchedAt`, field names, units, confidence, and failure/blocking notes for each dataset.

Clearly distinguish:

- `preliminaryScreenData`: Eastmoney xuangu fields used for initial selection.
- `deepAnalysisData`: any later data fetched with `investment-analysis` scripts, source-specific endpoints, browser workflows, or other explicitly cited sources for the full report.

If a required `investment-analysis` data source is blocked, stale, unavailable, or inconsistent with another source, say so in the report and lower data confidence instead of silently falling back to the preliminary CSV.

Save reports to:

```text
inbox/stock-selector/<YYYYMMDD>/<code>-<name>.md
```

Each report should include:

1. Data date and source summary.
2. Why it passed the preliminary screen.
3. Valuation: PE/PB, percentile, dividend yield, normalized earnings, historical range, and peer/context notes from deep-analysis sources when available.
4. Quality: business model, industry structure, margin, ROE/ROIC when available, cash conversion, capex, working capital, and debt.
5. Disclosures and expectations: recent announcements, investor-relations records, news, research reports, and market expectations when the conclusion depends on new events or catalysts.
6. Timing: quarterly MA context from the preliminary CSV, current price/valuation context from deep-analysis data, one-year performance, liquidity, sentiment, and crowding.
7. Risks: value trap, growth trap, cycle trap, leverage, accounting, governance, reflexivity, and missing-data risks.
8. Decision view: `优先跟踪`, `观察`, or `暂不深入`, with conditions that would change the view.

## Parallel Deep Reports

When the runtime supports subagents, parallelize deep reports by stock, with at most 5 active subagents at a time.

Give each subagent a disjoint stock list and the output folder. Tell subagents they are not alone in the workspace, must not revert others' files, and must save only their assigned report files. Wait for each batch before launching the next batch if more than 5 stocks need reports.

Do not spawn subagents for the preliminary fetch/merge step; keep that deterministic and local.

## Output Folder Structure

Use this structure:

```text
inbox/stock-selector/<YYYYMMDD>/
├── raw/
│   ├── summary.md
│   └── stocks/
│       └── <name>-<code>.csv
├── shortlist.md
└── <code>-<name>.md
```

## Validation Checklist

Before presenting results:

- Confirm both queries returned `code: "100"` and a non-empty result.
- Confirm condition 1 parser text contains both `毛利率大于29%` and `ROE(加权)大于14%`.
- Confirm condition 2 parser text uses one grouped OR condition for MA13/MA21/MA34.
- Confirm union count equals `condition1 + condition2 - intersection`.
- Confirm only `summary.md` and `stocks/` are generated in `raw/`; `union.csv` must not be generated.
- Confirm per-stock CSVs have no `命中条件1`, `命中条件2`, or `两个条件均命中` columns.
- Confirm condition 2-only columns appear after condition 1 columns in per-stock CSV headers.
- Confirm `stocks/` contains one `{name}-{code}.csv` file per union row.
- Confirm output files are saved under `inbox/stock-selector/<day>/`.
- State the Eastmoney data dates shown by the per-stock CSV headers and `summary.md`.
