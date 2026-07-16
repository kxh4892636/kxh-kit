# Region 与控制面 (Partition) 映射

Region 是 Argos 中数据查询的物理分区标识。每个 region 属于一个**控制面 (Partition)**，控制面决定了使用哪个 CLI 环境 (`-e`) 来查询。

**核心规则**：`-e` 参数必须与 region 所属的 Partition 对应，否则查不到数据。

CLI 支持的 `-e` 值：`cn`（默认）| `boe` | `i18n` | `i18n-bd` | `sandbox`

| Partition (控制面) | CLI `-e` 参数 | 说明 |
|---|---|---|
| `cn` | `-e cn`（默认） | 国内站 |
| `boe` | `-e boe` | 测试环境 |
| `i18n` | `-e i18n` | 海外站（TikTok 等） |
| `i18n-bd` | `-e i18n-bd` | 海外 BD 站（Lark 等） |
| `eu-ttp` | `-e i18n` | 欧洲 TTP 合规（CLI 暂无独立 `-e` 值，使用 i18n） |
| `tx-ttp` | `-e i18n` | 美国 TTP（CLI 暂无独立 `-e` 值，使用 i18n） |

---

## cn (国内站)

| Region | Alias | MS Zone |
|--------|-------|---------|
| China-North | cn | CN |
| China-East | China-East | China-East |
| China-Aggregation | cn_ag | CN_AG |
| China-Pay | China-Pay | China-Pay |
| China-Pay2 | China-Pay2 | China-Pay2 |
| China-HKPay | China-HKPay | China-HKPay |
| China-Fintech | China-Fintech | China-Fintech |
| China-Enterprise | China-Enterprise | CN_TOB |
| China-North3 | China-North3 | China-North3 |
| China-North5 | China-North5 | China-North5 |
| China-North6 | China-North6 | China-North6 |
| ChinaSinf-East | ChinaSinf-East | ChinaSinf-East |
| ChinaSinf-North | ChinaSinf-North | ChinaSinf-North |
| Aliyun_NC2 | Aliyun_NC2 | Aliyun_NC2 |
| China-PPE | ppe | China-PPE |
| China-East-PPE | China-East-PPE | China-East-PPE |
| China-Pay2-PPE | China-Pay2-PPE | China-Pay2-PPE |
| ChinaSinf-North-PPE | ChinaSinf-North-PPE | ChinaSinf-North |

## boe (测试环境)

| Region | Alias | MS Zone |
|--------|-------|---------|
| China-BOE | boe | BOE |
| China-BOE2 | China-BOE2 | China-BOE2 |
| US-BOE | boei18n | BOEi18n |
| ChinaSinf-BOE | ChinaSinf-BOE | ChinaSinf-BOE |

## i18n (海外站)

| Region | Alias | MS Zone |
|--------|-------|---------|
| Singapore-Central | sg | SGALI |
| US-East | US-East | MVAALI |
| US-West | US-West | US-West |
| US-SouthWest | US-SouthWest | US-SouthWest |
| Europe-Central | Europe-Central | Europe-Central |
| EasternEuro-TT | EasternEuro-TT | EasternEuro-TT |
| Asia-SouthEast | Asia-SouthEast | Asia-SouthEast |
| Australia-SouthEast | Australia-SouthEast | Australia-SouthEast |
| ID-Compliance | ID-Compliance | ID-Compliance |
| ID-Compliance2 | ID-Compliance2 | ID-Compliance2 |
| MY-Compliance | MY-Compliance | MY-Compliance |
| Singapore-Compliance | compliance-sg | SGCOMPLIANCE |
| I18N-BGE | I18N-BGE | I18N-BGE |
| Singapore-PPE | ppe-sig | SG |
| US-PPE | ppe-va | US-PPE |
| US-East-PPE | US-East-PPE | US-East-PPE |
| ID-Compliance-PPE | ID-Compliance-PPE | ID-Compliance-PPE |
| ID-Compliance2-PPE | ID-Compliance2-PPE | ID-Compliance2-PPE |
| MY-Compliance-PPE | MY-Compliance-PPE | MY-Compliance-PPE |
| MY-PPE | MY-PPE | MY-PPE |
| MY2-PPE | MY2-PPE | MY2-PPE |
| MY3-PPE | MY3-PPE | MY3-PPE |

## i18n-bd (海外 BD 站 / Lark)

| Region | Alias | MS Zone |
|--------|-------|---------|
| Singapore-Common | Singapore-Common | SGCOMM1 |
| Singapore-SaaS | Singapore-SaaS | SGSAAS1LARKIDC |
| US-EE | va | VA |
| US-Central | US-Central | US-Central |
| US-WestBD | US-WestBD | US-WestBD |
| US-EastBD | US-EastBD | US-EastBD |
| US-TTP3 | US-TTP3 | US-TTP3 |
| US-TTP4 | US-TTP4 | US-TTP4 |
| US-Compliance | US-Compliance | US-Compliance |
| Europe-WestBD | Europe-WestBD | Europe-WestBD |
| Asia-South | Asia-South | Asia-South |
| Asia-SaaS | Asia-SaaS | Asia-SaaS |
| Asia-NorthEast | Asia-NorthEast | Asia-NorthEast |
| Asia-EastBD | Asia-EastBD | Asia-EastBD |
| Asia-Enterprise | Asia-Enterprise | Asia-Enterprise |
| Asia-CIS | Asia-CIS | Asia-CIS |
| Australia-SouthEastBD | Australia-SouthEastBD | Australia-SouthEastBD |
| Asia-SouthEastBD | Asia-SouthEastBD | Asia-SouthEastBD |
| SouthAmerica-East | SouthAmerica-East | SouthAmerica-East |
| MiddleEast-South | MiddleEast-South | MiddleEast-South |
| Africa-South | Africa-South | Africa-South |
| ID-CentralBD | ID-CentralBD | ID-CentralBD |
| Singapore-SaaS-PPE | Singapore-SaaS-PPE | Singapore-SaaS-PPE |
| US-Compliance-PPE | US-Compliance-PPE | US-Compliance-PPE |
| US-TTP3-PPE | US-TTP3-PPE | US-TTP3-PPE |
| Asia-SouthEastBD-PPE | Asia-SouthEastBD-PPE | Asia-SouthEastBD-PPE |
| Asia-CIS-PPE | Asia-CIS-PPE | Asia-CIS-PPE |
| Asia-SaaS-PPE | Asia-SaaS-PPE | Asia-SaaS-PPE |

## eu-ttp (欧洲 TTP 合规)

| Region | Alias | MS Zone |
|--------|-------|---------|
| EU-Compliance | EU-Compliance | EU-Compliance |
| EU-Compliance2 | EU-Compliance2 | EU-Compliance2 |
| EU-TTP | EU-TTP | EU-TTP |
| EU-TTP2 | EU-TTP2 | EU-TTP2 |
| US-EastRed | useast-red | USEASTRED |
| EU-TTP-PPE | EU-TTP-PPE | EU-TTP-PPE |
| EU-TTP2-PPE | EU-TTP2-PPE | EU-TTP2-PPE |
| US-EastRed-PPE | US-EastRed-PPE | US-EastRed-PPE |

## tx-ttp (美国 TTP)

| Region | Alias | MS Zone |
|--------|-------|---------|
| US-TTP | US-TTP | US-TTP |
| US-TTP2 | US-TTP2 | US-TTP2 |
| US-TTP-PPE | US-TTP-PPE | US-TTP-PPE |
| US-TTP2-PPE | US-TTP2-PPE | US-TTP2-PPE |
