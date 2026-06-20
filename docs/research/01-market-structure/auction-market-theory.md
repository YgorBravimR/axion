# Auction Market Theory (AMT): Comprehensive Research

A deep examination of Auction Market Theory—its history, theoretical foundations, global applications, and specific use in Brazilian markets (B3).

---

## 1. History & Origins

### Pre-AMT Roots: Bachelier and Market Microstructure

The intellectual foundation for Auction Market Theory traces to the early 20th century. In 1900, **Louis Bachelier** published _The Theory of Speculation_, the first mathematical model describing stock prices as following a random walk—borrowing Brownian motion concepts from physics [Source: Efficient Market Hypothesis Research](https://en.wikipedia.org/wiki/Efficient_market_hypothesis). This seminal work suggested that price movements had no predictable pattern, laying groundwork for decades of debate between randomness and market structure.

The **Efficient Market Hypothesis (EMH)** emerged in the 1960s, with pioneers like Maurice Kendall (1953) and Paul Samuelson (1965) arguing that properly anticipated prices must follow a random walk due to rapid information absorption [Source: Random Walk Hypothesis Definition](https://www.ig.com/en/glossary-trading-terms/random-walk-theory-definition). This period emphasized market efficiency and equilibrium, but left a critical gap: _How does a market actually discover fair value in real time?_

Auction Market Theory filled that gap by shifting focus from whether markets are random to _how they function as auctions_.

### J. Peter Steidlmayer and the Chicago Board of Trade (1978–1985)

In the late 1970s and early 1980s, **J. Peter Steidlmayer**, a veteran pit trader at the **Chicago Board of Trade (CBOT)**, observed markets from a unique vantage point. Unlike academics studying prices from afar, Steidlmayer witnessed firsthand how buyers and sellers interacted on the trading floor, constantly testing prices and seeking equilibrium [Source: Market Profile, Volume Profile and Auction Market Theory](https://ftmo.com/en/market-profile-volume-profile-and-auction-market-theory/).

Steidlmayer's motivation was pragmatic: existing technical analysis and fundamental models didn't capture the real-time auction process occurring at the CBOT. He realized that price discovery wasn't chaotic—it followed a logic similar to an open-outcry auction, where participants continuously test and bid until finding a price level where the maximum amount of trading occurred [Source: J. Peter Steidlmayer: The Mind Behind Market Profile](https://wetics.com/blog/j-peter-steidlmayer-the-mind).

### Market Profile Birth: TPO Charts (1982–1985)

Steidlmayer developed **Market Profile** and the **Liquidity Data Bank** as tools to visualize this auction process. The revolutionary innovation was the **Time Price Opportunity (TPO)** chart. Each TPO represents a fixed 30-minute period at a given price level—a single letter in a chart showing which price levels attracted trading during each half-hour bracket [Source: Time price opportunity charts explained](https://www.tradingview.com/support/solutions/43000725590-time-price-opportunity-charts-explained/).

In **1985**, the CBOT released Market Profile as an official CBOT product, marking the formalization of AMT. The TPO chart allowed traders to see price discovery unfolding in real time—not as random noise, but as an auction process accumulating evidence of where fair value resided [Source: Market Profile, Volume Profile and Auction Market Theory](https://ftmo.com/en/blog/market-profile-volume-profile-and-auction-market-theory/).

### Collaborators and Early Evangelism (1985–1990)

Steidlmayer collaborated with **Kevin Koy**, a trader and journalist at the CBOT, to codify and teach the methodology. In **1986**, Steidlmayer and Koy published _Markets and Market Logic_, introducing the auction framework to a wider audience [Source: Markets and Market Logic by Steidlmayer and Koy](https://www.scribd.com/doc/312647593/Markets-and-Market-Logic-by-Peter-J-Steidlmayer-and-Kevin-Koy-pdf). They also founded **Market Logic School** in 1986 to formalize education [Source: Market profile](https://en.wikipedia.org/wiki/Market_profile).

That same year, Steidlmayer published _Steidlmayer on Markets_, his definitive treatment of Market Profile as a tool for understanding auction mechanics and price discovery [Source: Amazon.com: Steidlmayer on Markets](https://www.amazon.com/Steidlmayer-Markets-Trading-Market-Profile/dp/0471215562).

The CBOT, recognizing the innovation's power, promoted Market Profile through seminars and trader education. Within the pit-trading community, adoption spread organically—traders saw immediate practical value in the TPO framework for identifying support, resistance, and fair-value zones.

### Evolution: Volume Profile and Modern Variants (1990s–2020s)

While TPO measured _time_ at each price level, traders increasingly wanted to analyze _volume_—the actual amount traded at each price. This led to **Volume Profile**, which replaced time letters with volume bars, culminating in the **Volume Point of Control (VPOC)**—the price level with the highest total volume [Source: Volume profile indicators: basic concepts](https://www.tradingview.com/support/solutions/43000502040-volume-profile-indicators-basic-concepts/).

The rise of **electronic trading** (especially after 2000) rendered pit-trading floor dynamics less central, but it enriched the toolkit. Traders could now combine Market Profile with:

- **Footprint charts**: Showing intra-bar order flow and aggression direction [Source: Footprint Charts: A Complete Guide to Advanced Trading Analysis](https://optimusfutures.com/blog/footprint-charts/)
- **DOM (Depth of Market)**: Real-time order book visualization [Source: How to Use Order Flow Analysis in Trading](https://blog.traderspost.io/article/order-flow-trading-analysis)
- **Level 2 / Level 3 data**: Detailed bid-ask ladder information

This convergence of Market Profile (time/volume at price) + order flow (aggression direction) + DOM (order book depth) created the modern arsenal for reading market auction dynamics.

### Key Books: The Canon

Three seminal books defined the discourse:

1. **Steidlmayer on Markets (1986)** — The foundational text, written by Steidlmayer himself. Introduces Market Profile as an auction framework and offers the theoretical justification for TPO analysis [Source: Amazon.com: Steidlmayer on Markets](https://www.amazon.com/Steidlmayer-Markets-Trading-Market-Profile/dp/0471215562).

2. **Mind Over Markets: Power Trading with Market Generated Information (1993)** — Co-authored by **James F. Dalton**, **Eric T. Jones**, and **Robert B. Dalton**. Expanded the theory, introducing the concept of **Market Generated Information (MGI)**—the idea that the market itself broadcasts its state through price and volume structure, not only through news [Source: Amazon.com: Mind Over Markets](https://www.amazon.com/Mind-Over-Markets-Generated-Information/dp/1118531736). Dalton's five-stage progression (Novice → Advanced Beginner → Competent → Proficient → Expert) became a framework for learning.

3. **Markets in Profile: Profiting from the Auction Process (2007)** — Also by Dalton, Jones, and R. Dalton. Expands on intermediate and longer-term auction mechanics, introduces multi-timeframe inventory distribution, and bridges auction theory with behavioral finance and neuroeconomics [Source: Amazon.com: Markets in Profile](https://www.amazon.com/Markets-Profile-Profiting-Auction-Process/dp/0470039094).

### Key Figures

- **J. Peter Steidlmayer** — Originator; pit trader at CBOT; visionary of the auction framework
- **Kevin Koy** — CBOT collaborator; co-author; educator
- **James F. Dalton** — Popularizer; theorist of Market Generated Information; 40+ years in markets
- **Robert B. Dalton** — Co-author; writer
- **Eric T. Jones** — Co-author; educator
- **Tom Alexander** — Profile educator; contributed to modern adaptations

---

## 2. The Theory Itself

### The Two-Way Auction Mechanism

At its core, **Auction Market Theory posits that all markets operate as continuous two-way auctions constantly searching for fair value through buyer-seller interaction** [Source: Auction Market Theory / Market Profile](https://www.forexfactory.com/thread/1301052-auction-market-theory-market-profile-trading).

This is not metaphor—it mirrors the mechanics of a live auction:

- **Up auction**: Buyers probe higher prices to find sellers. Price rises until sellers reject further bids.
- **Down auction**: Sellers test lower prices to find buyers. Price falls until buyers reject further selling.

The market alternates between these auctions. Price discovery succeeds when both sides "accept" a level by trading there repeatedly. **Fair value** is the price range where the market "traded the most," indicating balanced aggression between buyers and sellers [Source: What is the Auction Market Theory| Free Trading Guides](https://www.quantvue.io/post/what-is-the-auction-market-theory).

### Four Dimensions: Price, Time, Volume, and Sentiment

Unlike traditional charts (which plot only price vs. time), AMT incorporates four dimensions:

1. **Price** — The Y-axis; the absolute level
2. **Time** — How long price spent at each level (X-axis) or represented as TPO letters
3. **Volume** — How much was traded at each level; shown as bar width in Volume Profile
4. **Sentiment / Aggression** — Directional conviction; shown in order flow, footprints, and bid-ask imbalance

This multidimensional lens reveals _where the market is comfortable_ (high volume nodes) versus _where it's nervous_ (low volume nodes or single prints).

### The Bell-Curve Distribution and Value Area

Market Profile typically forms a **roughly bell-shaped distribution**, with price concentrating around a central "fair value" and tapering off at extremes. This mirrors the Gaussian distribution found throughout nature [Source: Market Profile indicator - MQL5 Articles](https://www.mql5.com/en/articles/16461).

From this distribution, traders extract:

#### Value Area (VA)

The price range where **70% of all trading activity occurred** during a session [Source: Value Area Explained: VAH, VAL, and POC in Market Profile (2026)](https://marketprofile.info/articles/value-area-explained). The 70% figure is empirical convention—it emerged from observation of where institutional traders cluster orders.

#### Value Area High (VAH)

The highest price within the value area; often acts as resistance.

#### Value Area Low (VAL)

The lowest price within the value area; often acts as support.

#### Point of Control (POC)

The single price level where the **most time or volume was traded**—the "fairest" price that day [Source: Volume profile indicators: basic concepts](https://www.tradingview.com/support/solutions/43000502040-volume-profile-indicators-basic-concepts/). The POC is the fulcrum around which price rotates in balanced markets.

### Initial Balance (IB) and Day-Type Classification

The **Initial Balance** is the high-low range established during the **first hour of the regular trading session** (e.g., 9:30–10:30 AM ET in US equity futures) [Source: Initial Balance Indicator. How to Use Initial Balance?](https://atas.net/blog/initial-balance-indicator-how-to-use-initial-balance/). The IB's width predicts how the day will unfold.

**Day Types** are classifications based on how price behaves relative to the IB [Source: Market Profile : Different Types of Profile Days](https://www.marketcalls.in/market-profile/market-profile-different-types-of-profile-days.html):

- **Normal Day** (~50–60% frequency): Balanced market; narrow IB; price rotates around it, expanding minimally. Short-timeframe traders maintain control.
- **Normal Variation**: Similar to Normal but with slightly larger expansion.
- **Trend Day**: Imbalanced market; price moves decisively in one direction from open; IB expands 2+ times its width. Long-timeframe traders have conviction and drive price persistently.
- **Double Distribution**: Two separate value areas; indicates a shift in fair value; often occurs after a significant news event.
- **Neutral**: No clear direction; price meanders.
- **Non-Trend**: Price extends beyond IB but doesn't move cleanly; may consolidate later.

A narrow IB suggests strong day-to-day traders will step in, allowing range extension. A wide IB suggests the market opened with strong directional conviction and may trend.

### Excess (Buying Tails, Selling Tails) and Single Prints

**Excess** refers to clusters of **single-letter TPO prints** at session highs and lows, forming "tails" [Source: Excess in Market Profile: How to Trade Failed Auctions for Profit](https://marketprofile.info/articles/excess-market-profile).

- **Buying tail** (excess low): Aggressive buyers rejected prices below, stopping the downward auction. The tail's low becomes strong support.
- **Selling tail** (excess high): Aggressive sellers rejected prices above, stopping the upward auction. The tail's high becomes strong resistance.

**Single prints** are price levels where only one TPO letter appears, meaning the market spent minimal time there. They indicate **emotional, non-consensus trading**—the market was moving too fast for two-sided trading. Single prints often become support/resistance when price revisits them; traders expect sharp reversals with 75–85% reliability [Source: Single Prints in Market Profile: Setups & Trend Days](https://orderflowlabs.com/blogs/theblog/market-profile).

### Range Extension (RE)

A **range extension** occurs when price moves beyond the Initial Balance high or low, signaling that longer-timeframe traders have entered. It suggests the previous fair value was either too high, too low, or that a market event changed perception [Source: Range Extension (RE) Definition](https://www.mypivots.com/dictionary/definition/168/range-extension-re). Range extensions are key indicators of institutional participation and directional commitment.

### Balance vs. Imbalance

The market oscillates between two states:

**Balance**: Price rotates around the POC; buying and selling are roughly equal; two-sided trade. High volume nodes accumulate. Tight, defined value area.

**Imbalance**: One side dominates (aggressive buyers or sellers); price moves directionally away from the POC; one-sided tape. Single prints and low-volume nodes. Wide price swings.

Balanced markets facilitate trade; imbalanced markets discover new value. AMT suggests traders should _buy at the bottom of the balanced range_ and _sell at the top_, then adapt when imbalance appears.

### Acceptance vs. Rejection

When price spends considerable time (high volume, multiple TPO letters) at a level, the market has **accepted** that price. Conversely, when price passes through a level quickly (single prints, low volume), it has **rejected** it [Source: B-Shaped and P-Shaped Market Profile](https://bookmap.com/blog/b-shaped-and-p-shaped-market-profile-how-deviations-from-balance-create-weak-highs-and-weak-lows).

A breakout that builds volume above a resistance level shows **acceptance** of the new high. A breakout that immediately reverses shows **rejection**. Institutional traders use this cue to assess breakout conviction.

### Long-Timeframe vs. Short-Timeframe Traders ("The Other Timeframe")

A core AMT insight: **every market has multiple timeframes operating simultaneously** [Source: Market Profile: Long-Term Swing Trading Analysis](https://www.trader-dale.com/market-profile-long-term-analysis/).

- **Short-timeframe traders** (scalpers, day traders, 5–30 min horizons) provide liquidity, rotate within balance, and enforce POC rotation. They're responsive.
- **Long-timeframe traders** (swing traders, position traders, multi-day+ horizons) accumulate positions, drive trend, and create imbalance. They're initiative.

On a trend day, long-timeframe traders dominate. On a normal day, short-timeframe traders maintain structure. Understanding "the other timeframe"—the longer-term context—tells you when a short-term bounce will fail or when a consolidation will break into a trend.

### Market Generated Information (MGI)

James Dalton's key contribution was formalizing the concept that **the market broadcasts its state through its structure, not only through headlines** [Source: What is the Market Profile? – Jim Dalton Trading](https://jimdaltontrader.com/what-is-the-market-profile-2/).

The TPO pattern, POC location, value area shape (narrow vs. wide, balanced vs. skewed), excess clustering, and single-print zones are all **market-generated information**—signals of where buyers and sellers have decided to trade. Reading MGI allows traders to trade based on what the market is _showing_, not what commentators are _saying_.

### Open Type Classifications

How the market opens sets the tone [Source: Market Profile Open Type and Confidence](https://www.marketcalls.in/market-profile/market-profile-open-type-and-confidence.html):

- **Open Drive (OD)**: Price opens outside the previous day's value area and moves persistently in one direction. High conviction; trend days often follow.
- **Open Test Drive (OTD)**: Opens outside prior VA, tests beyond it briefly (confirming no new buyers/sellers there), then reverses. Moderate conviction; often followed by a rotational day within or near the prior VA.
- **Open Rejection Reverse (ORR)**: Opens, moves one direction, then reverses decisively through the open back toward the prior day's value area. Indecision; failed initiative; often normal or rotational days follow.
- **Open Auction in Range (OAIR)** / **Open Auction Out of Range (OAOR)**: Price opens and rotates within a narrow band. No strong early conviction.

Open type classification helps traders gauge whether the session will trend or rotate.

### Composite Profiles: Multi-Timeframe Structure

While daily profiles show intra-day balance, **composite profiles** (weekly, monthly, quarterly) reveal where large institutions have decided value resides over extended periods [Source: Market Profile Composite Analysis: Weekly and Monthly Trading Strategies](https://marketprofile.info/articles/composite-profile-analysis).

Institutions think in composites, not daily bars. A weekly POC carries more weight than a daily POC because it represents consensus across multiple days. Daily trading within weekly VA confirms institutionally accepted value. Breakouts beyond weekly VAH/VAL often signal major moves.

---

## 3. Global Application

### Geographic Distribution and Popularity

**Auction Market Theory is most heavily used in:**

1. **US Futures Markets** — CME E-mini S&P 500 (ES), E-mini Nasdaq (NQ), Treasury futures, Crude Oil. These high-liquidity products are ideal for Market Profile analysis [Source: E-mini S&P 500 Overview - CME Group](https://www.cmegroup.com/markets/equities/sp/e-mini-sandp500.html).

2. **Global Equity Index Futures** — DAX (Europe), Nikkei (Japan), FTSE (UK), ASX (Australia).

3. **FX Futures** — CME currency futures, though forex traders also use it.

4. **Commodities** — Energy, metals, agriculture futures.

5. **Crypto Futures** — Bitcoin, Ethereum futures on platforms like CME and Bybit.

6. **Brazilian Futures** (covered in detail below) — WIN, WDO, INDFUT on B3.

### Modern Trading Platforms

AMT tools are now embedded in most professional trading software [Source: Best Order Flow Trading Software | Ranked for 2026](https://gitnux.org/best/order-flow-trading-software/):

- **Sierra Chart** ($36/month) — Dedicated volume profile, TPO, footprint charts; DOM-based; favored by serious futures traders [Source: In-Depth Sierra Chart Analysis and Leading Alternatives for 2026 Futures Trading](https://www.tradervps.com/blog/sierra-chart-analysis-alternatives-futures-trading)
- **NinjaTrader** ($99/month or free) — Cloud-based, order flow, market depth, Strategy Builder; accessible to retail traders [Source: Top Order Flow Platforms & Data Explained](https://www.trader-dale.com/top-order-flow-platforms-data-explained-ninjatrader-sierra-chart-atas-quantower-tradingview/)
- **Bookmap** ($16–$79/month) — Real-time liquidity visualization, order book heatmaps, 3D volume; best for DOM/footprint [Source: Comparing Footprint & Volume Profile Trading](https://bookmap.com/blog/comparing-bookmap-to-dom-footprint-and-volume-profile)
- **ATAS** — Order flow and volume analysis; anchored profiles; institutional-grade [Source: ATAS - Order Flow & Volume Analysis Software](https://atas.net/)
- **TradingView** — Volume Profile and TPO overlays available; limited order flow; popular for retail [Source: Top Order Flow Trading Software for Futures & Options](https://www.quantvps.com/blog/order-flow-trading-software)
- **TradeStation, MotiveWave, MetaTrader 5** — All include Market Profile variants
- **Profit Pro (Nelogica)** — Brazil-specific leader (see section 4)

### Institutional vs. Retail Adoption

**Institutional desks** (prop firms, banks, hedge funds) use Market Profile as a risk management framework:

- Portfolio-wide POC alignment (all positions reference the same structure)
- Diversification across timeframes (daily, weekly, monthly)
- Inventory management (understanding where positions are accumulated)

**Retail traders** typically focus on tactical entry/exit:

- Trading within VA as support/resistance
- Trading IB breakouts
- Scalping single-print reversals
- Range trading in normal days

The gap reflects skill and capital: institutions can afford to wait for multi-day composites to set up; retail often needs daily or intraday entries [Source: How Institutional Traders Use Market Profile](https://marketprofile.info/articles/institutional-traders-market-profile).

### Critiques and Limitations

**Does it predict or describe?**

AMT is fundamentally **descriptive**—it describes where trading occurred and why, but does not predict future prices with certainty [Source: Auction Market Theory (AMT) - DayTrading.com](https://www.daytrading.com/auction-market-theory-amt). A trader can say "the market accepted price at VAH" (descriptive) but cannot guarantee it won't spike beyond VAH tomorrow (predictive failure).

**Key criticisms:**

1. **Overemphasis on Fair Value**: Markets deviate from fair value due to sentiment, algo trading, leverage, and geopolitics. AMT assumes orderly discovery; reality is messier [Source: Auction Market Theory: Decoding Market Behavior](https://haikhuu.com/education/auction-market-theory).

2. **Complexity of Application**: Reading a Market Profile requires skill. Novice traders often misidentify VA or misclassify day types, leading to poor decisions.

3. **Low-Liquidity Blindspot**: AMT works best in high-volume, tight-spread markets (ES, NQ, crude). In thin markets or illiquid assets, volume-based analysis breaks down.

4. **Overnight / 24h Markets**: Traditional Market Profile assumes defined RTH (Regular Trading Hours). Crypto futures and overnight equities trading challenge the daily-profile framework.

5. **Survivorship Bias**: Educators and practitioners who promote AMT tend to be successful; unsuccessful traders using AMT don't publish books. Selection bias inflates its perceived win rate.

6. **Works Best With Liquidity**: The theory assumes two-sided participation. In trending, one-sided markets or flash crashes, the auction paradigm momentarily fails.

**Verdict**: AMT is best used as a **framework for understanding market structure** and **one tool among many**, not as a standalone prediction system. Combined with order flow, multi-timeframe context, and risk management, it becomes powerful.

### Academic and Quant Perspective

Mainstream academic finance has largely ignored AMT, focusing instead on EMH, factor models, and stochastic calculus. However, **market microstructure research** (order book dynamics, bid-ask spreads, adverse selection) has quietly validated many AMT intuitions without citing it [Source: Efficient Market Hypothesis - an overview](https://www.sciencedirect.com/topics/economics-econometrics-and-finance/efficient-market-hypothesis).

Some quant funds now incorporate volume-at-price into machine learning models. AMT's emphasis on market structure—rather than price alone—aligns with modern insights in high-frequency trading and market-making.

---

## 4. Application on B3 (Brazilian Exchange)

### B3 Overview and Instruments

**B3** (Brasil Bolsa Balcão) is the primary Brazilian exchange, formed from the 2008 merger of **Bovespa** (equities) and **BM&F** (derivatives). B3 trades equities, equity options, and **futures** [Source: B3 (stock exchange)](<https://en.wikipedia.org/wiki/B3_(stock_exchange)>).

Key **futures instruments** for retail and prop traders:

1. **WIN** (Índice Miniatura) — **Mini-index futures** tracking the Bovespa Index; smallest contract; high volume; retail favorite. One contract can be day-traded on most brokers with as little as BRL 100 margin [Source: Trading at Brasil Bolsa Balcão - Commodity.com](https://commodity.com/trading/exchanges/brasil-bolsa-balcao/).

2. **WDO** (Índice da Taxa de Câmbio) — **Mini-dollar futures**; tracks USD/BRL rate; popular for currency trading and hedging.

3. **INDFUT** (Índice) — **Full-size index futures**; larger contract; institutional focus.

4. **DOLFUT** — Full-size dollar futures.

5. **Options on indices and individual stocks** — Equity options; smaller volume than futures.

### Session Structure: RTH, Pre-Market, After-Market, Auctions

B3 operates multiple sessions distinct from US markets [Source: Horários da B3: Pregão, Pré-Abertura e After Market](https://www.traders.com.br/blog/posts/horarios-b3-pre-abertura-after-market):

- **Pre-Market (Pré-Abertura)**: 9:45 AM – 10:00 AM. Orders collected but not executed. Auction to determine opening price.
- **Regular Trading Hours (Pregão)**: 10:00 AM – 4:55 PM.
- **Closing Auction**: 4:55 PM – 5:00 PM. Prices calculated for close.
- **After-Market (After-Hours)**: 5:00 PM – 5:30 PM. Lower volume.

**Overnight Session**: Unlike US equity futures (which trade 23 hours on Globex), B3 futures have a gap between 5:30 PM and 9:45 AM next day. This gap creates overnight risk and distinct profile gaps.

### How RTH Shapes Market Profile vs. Electronic Markets

Traditional AMT (Steidlmayer-era) assumed pit trading within defined RTH. B3's structure somewhat preserves this:

- **Daily profile = 10:00 AM – 4:55 PM** (approx. 7 hours). Enough time for balance/imbalance to develop and resolve.
- **Opening auction (leilão de abertura)** affects the IB; if the gap overnight was significant, the opening auction may spike or crash [Source: Leilão de abertura - o que é, significado e definição](https://borainvestir.b3.com.br/glossario/leilao-de-abertura/).

The opening auction mechanism on B3 is particularly important. Unlike CME Globex (continuous), B3 equilibrates buy and sell orders at a theoretical price, then executes all compatible orders simultaneously at 10:00 AM. This creates a unique opening bar—often a large volume bar at a "fair open"—distinct from typical candle auctions.

### B3-Specific Platforms and Tools

**Profit Pro (Nelogica)**

Nelogica, founded in 2003 and based in Porto Alegre, dominates Brazil's paid trading platform market [Source: Nelogica - Crunchbase Company Profile & Funding](https://www.crunchbase.com/organization/nelogica).

**Profit Pro** offers:

- Volume Profile and TPO charts (Market Profile)
- **Mapa de Fluxo** (Flow Map) — footprint/order flow visualization
- **SuperDOM** — DOM depth of market
- **Options modules** — Greeks and risk analysis
- 200+ technical indicators
- Integration with B3 data feeds

**Profit Mobile** extends this to iOS/Android for on-the-go trading.

**Profit Ultra** — Premium variant with deeper historical tick data and advanced profiling.

**Competitors:**

- **ATAS** — Advanced order flow and volume analysis; becoming popular in Brazil for detailed microstructure
- **Tryd** (formerly trading software specific to Brazil)
- **Bússola do Investidor** — Educational/analytical tools
- **GoTrader** — B3-specific platform
- **MetaTrader 5** — Brokers offer it for B3, though native MT5 integration is not native to B3

### Brazilian Trading Community and Educators

The Brazilian equities and futures community is large, vibrant, and increasingly professionalized. Key educators and communities:

**André Antunes / Scalper** — Founder of **Scalper Trader**, one of Brazil's largest trading education platforms. Antunes has 17+ years at B3 and 14 years at CME. His curriculum emphasizes **tape reading** (order flow and DOM interpretation), which bridges AMT and microstructure [Source: Quem é André Antunes e Scalper](https://scalper.com.br/quem-somos/).

**TAT (Trader at Work)** — Brazilian prop trading and education community. TAT emphasizes **fluxo** (order flow), market profile, and pattern recognition. Strong following among retail and prop traders.

**Hawks** — Prop trading firm specializing in Brazilian futures (WIN, WDO). Known for systematic approaches and risk management. Community-driven education.

**Trader Esportivo** — Community and educators focused on tape reading and market microstructure; popular among retail.

**Stormer / Alexandre Wolwacz** — Educator and creator of proprietary tools for flow analysis and market profile.

**The Trader Group, Palex, Vitorino Filho** — Various educators offering market profile and order flow courses.

**Trader e Investidor community** — Large forum and educational hub.

### Terminology and Translation

Brazilian traders use distinct terminology while referring to AMT concepts:

| English Term             | Portuguese Term            | Context                           |
| ------------------------ | -------------------------- | --------------------------------- |
| Point of Control         | Ponto de Controle          | Price level with most time/volume |
| Value Area               | Área de Valor              | 70% trading range                 |
| Value Area High          | Topo da Área de Valor      | Upper boundary of VA              |
| Value Area Low           | Fundo da Área de Valor     | Lower boundary of VA              |
| Auction                  | Leilão                     | Market discovery process          |
| Tape Reading             | Leitura de Fluxo / Fluxo   | Order flow analysis               |
| Fair Value               | Valor Justo                | Equilibrium price                 |
| Lateral / Não-direcional | Sideways / Non-directional | Normal day (rotational)           |
| Direcional / Tendência   | Directional / Trend        | Trending day                      |

### B3-Specific Setups and Gotchas

**Opening Auction Effects (Leilão de Abertura)**

Unlike CME opens (which occur on the first traded minute), B3's 10:00 AM simultaneous auction can create large, fast moves. The theoretical equilibrium price is calculated until 10:00 AM sharp; all orders at that price (or better) execute simultaneously. This results in:

- Large initial volume bar
- Possible gap from the overnight theoretical price
- A "fair open"—price is usually efficient (sellers and buyers have already bid)
- Immediate range expansion or rotation possible

Traders learn to interpret the auction imbalance: if there's a large buy imbalance at open, it signals intra-day sellers may arrive; if a sell imbalance, buyers may step in to mop up.

**PVP Overlap (Volume Point Overlap)**

B3 traders often reference "PVP overlap"—identifying yesterday's VPOC (Volume Point of Control) and today's; if they coincide, it's a strong support/resistance level. This is a practical adaptation of the AMT principle that **prices revisit established value areas**.

**Abertura Fora de Valor** (Opening Outside Value)

If the market opens far outside yesterday's value area, it signals overnight conviction or a news event. Brazilian traders watch for quick mean-reversion (back into VA) or break-away (establishing new value).

**Rompimento de IB** (Initial Balance Breakout)

Breaking and holding above the IB high (or below the IB low) signals range extension and longer-timeframe entry. Common setup: wait for first hour, identify IB, trade the break with stop at IB low.

**Rejeição de VPOC** (VPOC Rejection)

If price revisits yesterday's VPOC and reverses sharply, it's a **rejection signal**—the market says "that price is no longer fair." Used for scalp entries.

**Migração de Valor** (Value Migration)

When the POC or VPOC shifts to a new level day-over-day, it indicates the market has accepted a new fair value. Traders align daily trades with the direction of value migration (if VPOC moved up yesterday, bias trades on the long side today).

### Liquidity and Overnight Risk

**Overnight gaps** are larger on B3 than CME. The gap between 5:30 PM close and 9:45 AM next day means:

- **Macro news** (US Fed, economic data, geopolitics) hits while B3 is closed
- **Overnight gaps** often 50–150 points on WIN (significant)
- **Opening auction** must re-equilibrate around the new news
- Stop-losses set overnight can gap through

Risk-conscious traders don't hold large positions into the overnight without protective collars or reduced size.

### RTH-Only vs. Overnight Profiles

Some sophisticated traders build separate **RTH-only profiles** (10:00 AM – 4:55 PM) and **overnight profiles** (next day 9:45 AM open gap). This reveals:

- **RTH profile** = local Brazilian activity + spillover from US overnight
- **Overnight profile** = gap and any pre-market repositioning

Composite weekly profiles assume RTH only, since overnight gaps are noise.

### B3-Specific Critiques

1. **Lower Liquidity Than CME**: B3 WIN is highly liquid for Brazil but thinner than ES (S&P 500 e-mini). Bid-ask spreads widen during low-volume periods; profile can become erratic.

2. **Dependency on US Markets**: B3 futures largely track the US session (especially overnight). A trader focused only on 10:00 AM–4:55 PM RTH misses the macro context set by ES overnight.

3. **Cost and Complexity**: Profit Pro and ATAS are paid tools; retail traders must invest in infrastructure. Some Brazilian retailers are under-equipped compared to institutional desks.

4. **Educational Gap**: While TAT, Hawks, and Scalper do excellent work, the overall teaching of AMT fundamentals in Brazil lags the US. Many retail traders learn order flow before learning balance/imbalance structure—backwards.

5. **Gaps and Slippage**: The overnight gap is a feature (provides opportunity) and a bug (increases overnight risk). Traders must respect it.

---

## 5. Sources & Further Reading

### Foundational Books

- [Steidlmayer on Markets: Trading with Market Profile](https://www.amazon.com/Steidlmayer-Markets-Trading-Market-Profile/dp/0471215562) — J. Peter Steidlmayer (1986). The original; foundational.
- [Markets and Market Logic](https://www.scribd.com/doc/312647593/Markets-and-Market-Logic-by-Peter-J-Steidlmayer-and-Kevin-Koy-pdf) — J. Peter Steidlmayer and Kevin Koy (1986). Co-authored; pit-trading perspective.
- [Mind Over Markets: Power Trading with Market Generated Information](https://www.amazon.com/Mind-Over-Markets-Generated-Information/dp/1118531736) — James F. Dalton, Eric T. Jones, Robert B. Dalton (Updated Edition, 2013). Expanded theory; market generated information.
- [Markets in Profile: Profiting from the Auction Process](https://www.amazon.com/Markets-Profile-Profiting-Auction-Process/dp/0470039094) — James F. Dalton, Robert B. Dalton, Eric T. Jones (2007). Intermediate and longer-term dynamics; behavioral finance integration.

### Online Resources and Educators

- [Profile Trading](https://www.profiletrading.com/) — Market Profile education and resources
- [Jim Dalton Trading](https://jimdaltontrading.com/) — James Dalton's official site; courses and insights
- [MarketProfile.info](https://marketprofile.info/articles) — Comprehensive articles on AMT, value areas, composite profiles
- [ATAS Blog](https://atas.net/market-theory/) — Order flow and market structure content
- [Bookmap Blog](https://bookmap.com/blog/) — Order flow, auction theory, and practical applications
- [TradeProAcademy](https://tradeproacademy.com/) — Free and paid AMT and order flow courses

### Brazilian Resources (Portuguese-language)

- **Scalper** — [scalper.com.br](https://scalper.com.br/) — André Antunes' platform; courses on tape reading and market profile
- **TAT (Trader at Work)** — Community and education focused on order flow and B3 futures
- **Hawks** — Prop trading community; systematic trading and market profile emphasis
- **Bora Investir** — B3 glossary and educational content; [borainvestir.b3.com.br](https://borainvestir.b3.com.br/)

### Academic / Theoretical Background

- [Efficient Market Hypothesis: An Overview](https://www.sciencedirect.com/topics/economics-econometrics-and-finance/efficient-market-hypothesis) — Context for AMT as alternative to EMH
- [Random Walk Hypothesis: Definition, History, Core Principles](https://bravosresearch.com/blog/technical-analysis/random-walk-hypothesis/) — Historical perspective on Bachelier and price discovery debates
- [The Practical Application of Time Price Opportunity (TPO) Profile Charts in Futures Trading](https://ninjatrader.medium.com/the-practical-application-of-time-price-opportunity-tpo-profile-charts-in-futures-trading-216a8fb43781) — NinjaTrader's modern perspective

### Platform Documentation

- [Sierra Chart: Time Price Opportunity Charts](https://www.sierrachart.com/index.php?page=doc/StudiesReference/TimePriceOpportunityCharts.html)
- [TradingView: Time Price Opportunity Charts Explained](https://www.tradingview.com/support/solutions/43000725590-time-price-opportunity-charts-explained/)
- [MotiveWave: Time Price Opportunity](https://docs.motivewave.com/user-guide/volume-order-flow-analysis-guide/time-price-opportunity)
- [ATAS: Market Profiles, Volume Analysis](https://atas.net/volume-analysis/)

### Related Concepts (Order Flow, Microstructure)

- [How to Use Order Flow Analysis in Trading](https://blog.traderspost.io/article/order-flow-trading-analysis)
- [Footprint Charts: A Complete Guide to Advanced Trading Analysis](https://optimusfutures.com/blog/footprint-charts/)
- [Comparing Footprint & Volume Profile Trading (Bookmap)](https://bookmap.com/blog/comparing-bookmap-to-dom-footprint-and-volume-profile)
- [Order Flow Trading Strategy Guide](https://journalplus.co/strategies/order-flow-trading/)

---

## Final Notes

Auction Market Theory remains the most systematic framework for understanding how financial markets operate as price-discovery mechanisms. Whether trading a CME E-mini, Brazilian WIN futures, or crypto, the AMT lens—looking for value areas, balance/imbalance, acceptance/rejection, and multi-timeframe structure—provides traders with a coherent mental model.

In Brazil, where retail and prop traders are increasingly professionalized, B3 futures (particularly WIN and WDO) offer high-volume, liquid arenas for testing AMT principles. The blend of local tape-reading culture (fluxo) and international Market Profile practice is creating a sophisticated trading ecosystem that rivals global centers.

Success with AMT requires:

1. **Patience** — Learning to read profiles properly takes hundreds of hours
2. **Liquidity respect** — Only trade AMT where volume is sufficient
3. **Humility** — Remember it describes, not predicts; combine with risk management
4. **Multi-timeframe context** — Use composites to avoid whipsaws
5. **Practice and journaling** — Track where your trades succeeded/failed against the structure you identified

Auction Market Theory is not a holy grail, but for traders willing to invest in the skill, it becomes a potent edge.

---

**Document compiled:** June 2026  
**Research scope:** History, theory, global application, B3-specific analysis  
**Citation basis:** 50+ sources; web research; platform documentation
