# Report Templates

Use these templates as structure. Keep the report concise, but do not omit material risks or data gaps.

## ETF / Index Report

```md
# [ETF or Index Name] Analysis

Data date: [asOf]
Sources: [source list]
Decision context: [user horizon / question]

## Summary
- View: [Attractive / Watchlist / Neutral / Avoid]
- Score: [x/100; band; veto if any]
- Main reason:
- Main risk:
- Decision preconditions met / missing:
- What would change the view:

## Data Snapshot
| Item | Value | Source | As of |
| --- | ---: | --- | --- |
| ETF price / NAV | | | |
| Tracking index | | | |
| PE / PE percentile | | | |
| PB / PB percentile | | | |
| ROE | | | |
| Historical PE/PB/ROE windows | 3y / 5y / provider all | | |
| Dividend yield | | | |
| Fee / tracking error / liquidity | | | |

## Scorecard
| Category | Score | Reason | Key Deduction |
| --- | ---: | --- | --- |
| Valuation | /25 | | |
| Exposure quality | /25 | | |
| Index method and wrapper | /15 | | |
| Timing and cycle | /10 | | |
| Margin of safety and risk | /15 | | |
| Data confidence | /10 | | |
| Total | /100 | | |

Hard vetoes:
- [None / list]

## Exposure And Quality
- Index methodology:
- Top holdings and concentration:
- Industry / region exposure:
- Industry structure label: [clear leader / two strong leaders / several strong leaders / fragmented price war / winner not yet knowable]
- "Moon" content: [dominant constituents with visible winner status, not speculative long-tail names]
- Good industry / good company / good price:
- Pricing power and cash-flow quality:
- Earnings position: [depressed / normal / peak-cycle / unknown]

## Valuation
- Current level vs history:
- 3y / 5y / near-10y PE-PB-ROE trend:
- Current level vs peers:
- Normalized earnings check:
- Dividend yield and bond yield comparison:

## Timing And Cycle
- Policy cycle:
- Market / valuation cycle:
- Economic cycle:
- Earnings cycle:
- Flow and crowding:

## Risks
- Value trap:
- Growth/theme trap:
- Cycle trap:
- Liquidity / premium-discount / tracking risk:
- Reflexivity:

## Scenarios
| Scenario | Assumptions | Implication |
| --- | --- | --- |
| Downside | | |
| Base | | |
| Upside | | |

## Margin Of Safety
- Valuation anchor:
- Downside support:
- What must go right:
- What can go wrong:
- Reflexivity / forced-sale risk:
- Positioning implication:

## Watchpoints
- Fetch next:
- Monitor:
- Invalidate if:
- Historical analogies to re-check:
```

## Stock Report

```md
# [Company Name] ([Code]) Analysis

Data date: [asOf]
Sources: [source list]
Decision context: [user horizon / question]

## Summary
- View: [Attractive / Watchlist / Neutral / Avoid]
- Score: [x/100; band; veto if any]
- Why cheap/expensive:
- Why good/bad:
- Why now:
- Decision preconditions met / missing:
- Biggest uncertainty:

## Data Snapshot
| Item | Value | Source | As of |
| --- | ---: | --- | --- |
| Price / market cap | | | |
| Revenue / growth | | | |
| Net profit / growth | | | |
| ROE / ROIC | | | |
| Gross / net margin | | | |
| Operating cash flow | | | |
| Debt / asset-liability ratio | | | |
| PE / PB / dividend yield | | | |

## Scorecard
| Category | Score | Reason | Key Deduction |
| --- | ---: | --- | --- |
| Valuation | /25 | | |
| Business and industry quality | /30 | | |
| Financial quality | /15 | | |
| Timing and catalyst | /10 | | |
| Margin of safety and risk | /15 | | |
| Data confidence | /5 | | |
| Total | /100 | | |

Hard vetoes:
- [None / list]

## Business And Industry
- Business model:
- Customer and supplier power:
- Real competitive boundary:
- Industry concentration:
- Industry structure label: [clear leader / two strong leaders / several strong leaders / fragmented price war / winner not yet knowable]
- Key variable for winning:
- Good industry / good company / good price:

## Quality
- Moat:
- Pricing power:
- Cash conversion:
- Balance sheet:
- Management and governance:

## Valuation
- Multiple comparison:
- Historical range:
- Normalized earnings:
- Scenario valuation:
- Valuation anchor:

## Timing
- Recent price and sentiment:
- Earnings cycle:
- Policy / liquidity:
- Catalysts:

## Risks And Traps
- Value trap:
- Growth trap:
- Accounting / cash-flow risk:
- Leverage / reflexivity:
- What the market may be correctly pricing:

## Scenarios
| Scenario | Assumptions | Implication |
| --- | --- | --- |
| Downside | | |
| Base | | |
| Upside | | |

## Margin Of Safety
- Valuation anchor:
- Downside support:
- What must go right:
- What can go wrong:
- Reflexivity / balance-sheet risk:
- Positioning implication:

## Watchpoints
- Fetch next:
- Monitor:
- Invalidate if:
- Historical analogies to re-check:
```

## Data Gap Language

Use these phrases when data is unavailable:

- "I could not verify [metric] with current data in this environment; this report treats it as unknown rather than assuming it."
- "The latest available provider data is as of [date], while market price is as of [date]; conclusions involving [metric] should be refreshed."
- "Provider A and Provider B disagree on [field]. I use [field/source] for the main view because [reason], and list the alternative here."
- "This source uses [raw field/parameter] for [meaning]. I keep the source-specific shape rather than forcing it into a unified schema."

## Conclusion Language

Prefer:

- "The setup is attractive only if..."
- "The evidence supports watchlist status, not a full positive view, because..."
- "The strongest counterargument is..."
- "The thesis breaks if..."

Avoid:

- "Buy now."
- "Guaranteed."
- "Low risk because PE is low."
- "Long term optimistic" without a valuation and risk bridge.
