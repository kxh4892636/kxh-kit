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
- Main reason:
- Main risk:
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

## Exposure And Quality
- Index methodology:
- Top holdings and concentration:
- Industry / region exposure:
- "Moon" content:
- Pricing power and cash-flow quality:

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

## Watchpoints
- Fetch next:
- Monitor:
- Invalidate if:
```

## Stock Report

```md
# [Company Name] ([Code]) Analysis

Data date: [asOf]
Sources: [source list]
Decision context: [user horizon / question]

## Summary
- View: [Attractive / Watchlist / Neutral / Avoid]
- Why cheap/expensive:
- Why good/bad:
- Why now:
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

## Business And Industry
- Business model:
- Customer and supplier power:
- Real competitive boundary:
- Industry concentration:
- Key variable for winning:

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

## Watchpoints
- Fetch next:
- Monitor:
- Invalidate if:
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
