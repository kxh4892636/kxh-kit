---
name: investment-analysis
description: 用《投资中最简单的事》的价值投资框架分析 ETF、基金、跟踪指数和股票个股，并把估值、品质、时机、风险、安全边际、公告、资讯、调研和研报数据来源统一到可复核报告中。只要用户提到 ETF、指数基金、基金估值、跟踪指数、A 股个股、股票分析、公告、研报、热门资讯、PE/PB/ROE、估值分位、护城河、价值陷阱、成长陷阱、安全边际、邱国鹭或《投资中最简单的事》，都应优先使用本 skill，即使用户没有明确说“投资分析”。
---

# Investment Analysis

Use this skill to produce disciplined ETF/index and stock reports. The goal is not to predict the next price move; it is to answer whether the asset is understandable, attractive at the current price, and robust against the most important failure modes.

This is not personalized financial advice. Do not promise returns, do not give certainty, and do not turn a report into a direct command to buy or sell. Tie every conclusion to data freshness, assumptions, and risk capacity.

## Load What You Need

- Read `references/framework.md` for the investing framework, red flags, and decision logic.
- Read `references/historical-cases.md` when you need book-derived historical analogies for industry structure, traps, cycles, or behavioral mistakes.
- Read `references/data-api.md` when data collection, source-specific scripts, provider mapping, or field interpretation matters.
- Read `references/report-templates.md` when producing a final ETF/index or stock report.

## Core Workflow

1. Identify the asset and decision context.
   - ETF/fund: fund code, fund name, exchange, target index, benchmark, fee, tracking error, liquidity, position horizon.
   - Index: index code, index family, constituent universe, valuation date, category: broad, style, industry, theme, overseas.
   - Stock: stock code, exchange, industry, listing status, market cap, financial period, user horizon.

2. Verify current data before numeric claims.
   - For current prices, valuation, holdings, constituents, financials, announcements, news, research reports, or rules, fetch or ask for the latest data. If live fetch is blocked, state the block and continue with clearly marked stale or sample data.
   - Preserve `asOf`, `fetchedAt`, `source`, and `confidence` for each dataset. Never mix data from different dates without saying so.

3. Pick the source-specific script or endpoint that fits the question.
   - Do not force Danjuan, fund public endpoints, and AData-reference endpoints into one unified schema.
   - Keep provider-specific field names and document their meaning, units, dates, and source URLs.
   - Treat provider data as fallible: cross-check key values across at least two sources when the conclusion depends on them.

4. Analyze the book's three-part core before the six-section frame.
   - Valuation: why the asset is cheap or expensive.
   - Quality: whether it is a good industry, good company, or good index exposure.
   - Timing: why consider it now, while accepting that timing is the least controllable part.
   - Give a positive view only when the setup is understandable, quality is acceptable, price leaves margin of safety, and the main bad news is visible rather than hidden.

5. Complete the six-section frame.
   - Valuation: current level, history, peer comparison, normalized earnings, dividend yield, valuation percentile.
   - Quality: business model, cash flow, ROE/ROIC quality, concentration, moat, pricing power, management or index methodology.
   - Timing: policy, liquidity, earnings cycle, sentiment, fund flows, crowding, catalysts.
   - Risk: value trap, growth trap, cycle trap, accounting risk, leverage, reflexivity, liquidity.
   - Margin of safety: downside scenario, base scenario, upside scenario, what must go right, what can go wrong.
   - Decision view: attractive, neutral, avoid, or watchlist, with evidence and conditions that would change the view.

6. Add a scorecard when producing a final report.
   - Use the score to expose the logic, not to automate buy/sell advice.
   - Show category scores, total score, key deductions, and hard vetoes.
   - If a hard veto is present, cap the final view at Watchlist or Avoid even when the numeric score is high.
   - Use historical cases only as analogies and warning patterns; never treat them as proof that the current asset will repeat the past.

## Critical Thinking And Scoring Discipline

Every deep report must be balanced and adversarial. Do not write reports that only list positives or use good metrics as confirmation of a bullish thesis.

Requirements:

- For every positive claim, check the strongest counterargument that could make it misleading.
- Separate "good company" from "good investment at this price"; a strong business can still be overvalued or have poor forward returns.
- Do not treat low PE, high ROE, high growth, high dividend yield, policy support, recent drawdown, or sell-side optimism as sufficient evidence by itself.
- Explicitly search for value traps, growth traps, cycle traps, leverage/reflexivity, accounting quality, governance, policy/regulatory risk, customer/supplier concentration, technology disruption, and valuation already pricing in the good news.
- Treat popular narratives and recent price strength as possible crowding signals, not proof.
- Include a bear case: the most plausible way the thesis fails.
- Include a balanced evidence table or equivalent concise structure that shows main positives, matching negatives, and what evidence would decide between them.
- If the negative evidence is material or unresolved, it must reduce the score and cap the decision view even when headline metrics look strong.

Score conservatively. Start from a neutral baseline, then add or subtract evidence. Do not start from an optimistic score and only look for confirmations:

- Scores above 80 require strong valuation, quality, cash conversion, balance sheet, and risk evidence with no major unresolved veto.
- Scores in the 70-79 range mean "promising but still conditional", not a default buy view.
- Cap at 70 if the thesis depends on earnings recovery, policy support, sell-side forecasts, or unverified normalized profit.
- Cap at 65 if there is material missing data, unresolved leverage/reflexivity, questionable cash conversion, or clear industry-cycle uncertainty.
- Cap at 60 if the main attraction is only low valuation, high dividend yield, recent decline, or high historical ROE.
- Apply hard vetoes before total score. A hard veto should cap the report at Watchlist/Avoid for the general framework, or at the closest equivalent cautious label in a specialized workflow.

## ETF And Index Analysis

Use the ETF/index path when the user asks about an ETF, open-ended fund, LOF, index, sector, style index, or thematic basket.

Minimum checks:

- Identify the underlying index and whether the fund truly tracks it.
- Pull index valuation: PE, PB, percentile, dividend yield, ROE, PEG when available, valuation date, low/mid/high status.
- For Danjuan index valuation detail, pull historical PE/PB/ROE curves when relevant and compare the 3-year, 5-year, and provider "all"/near-10-year windows.
- Pull ETF/fund data: latest NAV, intraday estimate if applicable, historical NAV, premium/discount, fee, size, turnover, liquidity, tracking error when available.
- Decompose exposure: top holdings, industry weights, top-10 concentration, region/currency if overseas, single-stock and sector risks.
- Judge index quality: whether the index contains enough "moons" (dominant or advantaged companies), whether profits are cyclical, and whether the index is cheap for a durable reason or a trap.
- Separate ETF diversification from real risk: ETF diversification reduces single-company fraud and management risk, but not industry decline, valuation bubble, cycle misread, liquidity mismatch, or methodology flaws.

ETF/index conclusion rules:

- Low PE alone is not low risk. Check whether earnings are at a cycle peak.
- High PE can be acceptable only when ROE, durability, growth runway, and downside margin justify it.
- Theme ETFs need extra skepticism: a correct theme can still be a poor investment if the index is crowded, expensive, and full of unproven companies.
- For industry ETFs, map the current stage: policy bottom, market bottom, economic bottom, or earnings bottom.

## Stock Analysis

Use the stock path when the user asks about an individual company, A-share code, HK/US ticker, business quality, moat, valuation, or whether a stock is a value/growth trap.

Always answer three questions:

- Why is it cheap or expensive?
- Why is it a good or bad business?
- Why consider it now, rather than earlier or later?

Minimum checks:

- Business: revenue model, customers, suppliers, pricing power, substitutability, competitive boundary.
- Industry: concentration, supply discipline, demand growth, regulation, technology route, winner status.
- Disclosures and expectations: recent CNInfo announcements, investor-relation records, Eastmoney news, and Eastmoney research reports when the question depends on new events, catalysts, market attention, or sell-side forecast changes.
- Financials: revenue and profit growth, gross/net margin, ROE structure, cash conversion, capex, working capital, debt, dilution.
- Valuation: PE/PB/PS/EV multiples, dividend yield, normalized earnings, historical range, peer comparison, scenario valuation.
- Management and governance: incentives, capital allocation, accounting quality, related-party or pledge risks when relevant.
- Reflexivity: whether price decline can damage financing, customer confidence, credit lines, pledge risk, or operating capacity.

Stock conclusion rules:

- Do not recommend "越跌越买" unless the business is understood, the problem is temporary, valuation is low, balance sheet risk is controlled, and reflexivity is weak.
- Treat high growth as an assumption, not a fact. Ask what moat lets growth become shareholder return.
- If the company is in a fast-changing technology path or subsidized theme, raise the evidence bar.
- Selling or avoiding can be correct even after a large decline if the thesis has broken.

## Report Requirements

- State the data date and source at the top.
- Mark missing data explicitly instead of filling gaps with narrative.
- Use concise tables for metrics and bullet lists for judgment.
- Separate facts, assumptions, and interpretation.
- End with watchpoints: what to monitor, what would invalidate the thesis, and what data should be fetched next.

## Common Failure Modes To Avoid

- Do not equate low PE with cheap before checking cycle peak earnings, cash flow, and value traps.
- Do not equate high revenue growth with moat.
- Do not use the user's cost basis as an investment reason.
- Do not chase the best recent ETF or stock simply because it led the last cycle.
- Do not hide uncertainty behind vague wording such as "long term optimistic".
- Do not provide a precise target price without scenario assumptions and valuation math.
