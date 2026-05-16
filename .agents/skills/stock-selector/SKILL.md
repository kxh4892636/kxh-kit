---
name: stock-selector
description: Use this skill whenever the user wants to screen A-share stocks, run the fixed Eastmoney xuangu stock-selector workflow, fetch key stock metrics from https://xuangu.eastmoney.com/, merge the two stock pools, create a preliminary shortlist, or generate follow-up investment-analysis reports for selected stocks. This skill should trigger for A股选股, 东方财富条件选股, xuangu, stock screening, 初筛, 股票池, PE/PB百分位, ROE毛利率筛选, 季线均线筛选, or requests to save stock-selector reports.
---

# Stock Selector

This skill turns two fixed Eastmoney natural-language stock screens into a repeatable workflow:

1. Fetch the two stock pools and key metrics from `https://xuangu.eastmoney.com/`.
2. Merge by stock code and keep source tags for each condition.
3. Use only the returned Eastmoney data for preliminary screening.
4. After the preliminary shortlist is chosen, use `investment-analysis` for deeper reports and save them under `inbox/stock-selector/<day>/`.

This skill is for screening and research workflow automation. It does not produce personalized investment advice or buy/sell commands.

## Data Source

Use the Eastmoney xuangu natural-language endpoint:

```text
https://np-tjxg-b.eastmoney.com/api/smart-tag/stock/v3/pw/search-code
```

The endpoint is a web product interface, not a stable public API. Always inspect `responseConditionList` before trusting a result. If Eastmoney changes parsing, blocks the request, or triggers captcha, stop and report the exact failure instead of substituting guessed data.

Because this is a third-party interface, returned field keys, field names, date suffixes, and units can change at any time. Preserve every raw response and every returned row field. Do not hardcode provider field keys such as current PE/PB/ROE key names for data extraction. Use the `columns` array returned in the same response as the field dictionary: each column contains the provider key, display title, date, unit, sortability, userNeed flag, and other metadata needed to interpret row values.

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
- Saves full raw JSON for each condition exactly as returned by Eastmoney.
- Writes `field-dictionary.json`, copied from each response's `columns` and parser metadata.
- Writes `condition-1.rows.csv` and `condition-2.rows.csv` as dynamic wide tables whose headers include title, key, date, and unit.
- Writes `union.json` as a structured union where each stock keeps the full original `condition1` row and full original `condition2` row separately, so overlapping field keys are not overwritten.
- Writes `union.csv` as a dynamic wide table with `condition1|...` and `condition2|...` prefixed columns.
- Adds only source tags (`condition1`, `condition2`, `both`) around the raw provider rows.

If the script cannot run, recreate its behavior with native Node or Python standard-library requests. Do not add npm or pip dependencies just for this workflow.

## Preliminary Screening Rules

Use only the Eastmoney data returned by the xuangu queries during preliminary screening. Do not call `investment-analysis` data scripts, Eastmoney F10 APIs, Danjuan, AData-derived scripts, browser scraping, or other data sources until after the preliminary shortlist is selected.

When reading preliminary fields, first inspect `raw/field-dictionary.json` or the `columns` arrays in `condition-1.json` and `condition-2.json`. Match metrics by returned column descriptions such as `title`, `dateMsg`, `unit`, and `key`, then cite the actual current key in notes if useful. Do not assume today's key names will exist in future responses.

For the preliminary shortlist, make a concise table with:

- Code and name
- Match source: condition 1, condition 2, or both
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

- Prefer stocks that match both conditions.
- Prefer low or moderate PE/PB percentile, positive cash flow, stable high ROE, stable gross margin, and understandable business.
- Penalize missing core metrics, negative or abnormal PE, very high leverage, weak cash flow, heavy cyclicality without a clear cycle explanation, and crowded expensive growth.
- Treat the moving-average condition as timing context, not proof of value.
- Keep the shortlist focused. If the union is large, pick the strongest 10-20 names unless the user asks for a different count.

## Deep Analysis Workflow

After preliminary screening succeeds, run deeper analysis only for the selected stocks.

Use `investment-analysis` for the deeper reports. At that stage, it is acceptable to fetch additional data required by that skill, but clearly distinguish:

- `preliminaryScreenData`: Eastmoney xuangu fields used for initial selection.
- `deepAnalysisData`: any later data fetched for the full report.

Save reports to:

```text
inbox/stock-selector/<YYYYMMDD>/<code>-<name>.md
```

Each report should include:

1. Data date and source summary.
2. Why it passed the preliminary screen.
3. Valuation: PE/PB, percentile, dividend yield, and peer/context notes when available.
4. Quality: business, margin, ROE, ROIC if available, cash flow, and debt.
5. Timing: quarterly MA context, one-year performance, liquidity, and crowding.
6. Risks: value trap, growth trap, cycle trap, leverage, accounting, governance, and missing-data risks.
7. Decision view: `优先跟踪`, `观察`, or `暂不深入`, with conditions that would change the view.

## Parallel Deep Reports

When the runtime supports subagents and the user asks to generate deep reports, parallelize by stock, with at most 5 active subagents at a time.

Give each subagent a disjoint stock list and the output folder. Tell subagents they are not alone in the workspace, must not revert others' files, and must save only their assigned report files. Wait for each batch before launching the next batch if more than 5 stocks need reports.

Do not spawn subagents for the preliminary fetch/merge step; keep that deterministic and local.

## Output Folder Structure

Use this structure:

```text
inbox/stock-selector/<YYYYMMDD>/
├── raw/
│   ├── condition-1.json
│   ├── condition-2.json
│   ├── field-dictionary.json
│   ├── condition-1.rows.csv
│   ├── condition-2.rows.csv
│   ├── union.csv
│   ├── union.json
│   └── summary.md
├── shortlist.md
└── <code>-<name>.md
```

## Validation Checklist

Before presenting results:

- Confirm both queries returned `code: "100"` and a non-empty result.
- Confirm condition 1 parser text contains both `毛利率大于29%` and `ROE(加权)大于14%`.
- Confirm condition 2 parser text uses one grouped OR condition for MA13/MA21/MA34.
- Confirm union count equals `condition1 + condition2 - intersection`.
- Confirm `condition-1.json`, `condition-2.json`, and `field-dictionary.json` are present before doing any screening.
- Confirm output files are saved under `inbox/stock-selector/<day>/`.
- State the Eastmoney data dates shown by returned columns.
