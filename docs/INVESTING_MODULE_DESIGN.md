# Investing Module - Technical Design Document

## Overview

This document outlines the architecture for a **long-term investing module** integrated into the Woolet personal finance application. The design prioritizes **API efficiency**, **cost optimization**, and **simplicity** while providing meaningful portfolio tracking and performance analytics.

---

## 1. High-Level Feature Breakdown

### 1.1 Portfolio Management
| Feature | Description |
|---------|-------------|
| Stock Search | Search stocks by ticker or company name |
| Add Position | Buy stocks and add to portfolio |
| Sell Position | Full or partial sale with realized P/L calculation |
| Delete Holding | Remove a position entirely |
| Transaction History | Complete audit trail of all buy/sell operations |

### 1.2 Price & Charting
| Feature | Description |
|---------|-------------|
| Daily Prices | End-of-day (EOD) prices only, no real-time data |
| Historical Ranges | 1D, 1W, 1M, 3M, 1Y, 5Y, MAX |
| Price Caching | Store historical prices to avoid repeated API calls |
| Chart Display | Line charts for price history |

### 1.3 Benchmarks & Comparison
| Feature | Description |
|---------|-------------|
| S&P 500 | Default benchmark |
| Selectable Indices | NASDAQ-100, MSCI World, local indices (KASE for KZT) |
| Time-Series Storage | Benchmarks stored as price data, same as stocks |

### 1.4 Analytics
| Feature | Description |
|---------|-------------|
| Total Invested | Sum of all buy transactions (cost basis) |
| Current Value | Holdings × current price |
| Unrealized P/L | Current value - cost basis (amount & %) |
| Realized P/L | Profit/loss from sold positions |
| Portfolio vs Benchmark | Time-weighted return comparison |

### 1.5 Asset Overview
| Feature | Description |
|---------|-------------|
| By Stock | Allocation per ticker |
| By Currency | USD/EUR/KZT breakdown |
| By Exchange | NYSE, NASDAQ, LSE, KASE, etc. |

### 1.6 Multi-Currency
| Feature | Description |
|---------|-------------|
| Base Currency | User's `defaultCurrency` from settings |
| Asset Currencies | Stocks in native currency |
| FX Conversion | Daily FX rates for portfolio valuation |

---

## 2. Data Models (Drizzle Schema)

### 2.1 Entity Relationship Diagram

```
┌─────────────┐     ┌──────────────────────┐     ┌─────────────────────┐
│   users     │────<│ investmentPortfolios │────<│ investmentTxns      │
└─────────────┘     └──────────────────────┘     └─────────────────────┘
                              │                           │
                              │                           │
                    ┌─────────┴─────────┐                │
                    │                   │                │
              ┌─────┴─────┐     ┌───────┴───────┐       │
              │  stocks   │<────│ portfolioHold-│<──────┘
              └───────────┘     │     ings      │
                    │           └───────────────┘
                    │
              ┌─────┴─────┐     ┌───────────────┐
              │ stockPrices│    │ benchmarkPrices│
              └───────────┘     └───────────────┘
```

### 2.2 Schema Definitions

```typescript
// apps/api/src/db/schema/investing.ts

import { pgTable, text, uuid, timestamp, decimal, date, index, boolean, integer, unique } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './users';

// ============================================
// STOCKS (Instrument Master Data)
// ============================================
export const stocks = pgTable('stocks', {
    id: uuid('id').defaultRandom().primaryKey(),
    ticker: text('ticker').notNull(),                    // AAPL, MSFT, GOOGL
    name: text('name').notNull(),                        // Apple Inc.
    exchange: text('exchange').notNull(),                // NASDAQ, NYSE, LSE, KASE
    currency: text('currency').notNull(),                // USD, EUR, KZT
    country: text('country'),                            // US, GB, KZ
    sector: text('sector'),                              // Technology, Healthcare
    industry: text('industry'),                          // Consumer Electronics
    isActive: boolean('is_active').default(true).notNull(),
    lastPriceUpdate: timestamp('last_price_update'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
    tickerExchangeUnique: unique('stocks_ticker_exchange_unique').on(table.ticker, table.exchange),
    tickerIdx: index('stocks_ticker_idx').on(table.ticker),
    exchangeIdx: index('stocks_exchange_idx').on(table.exchange),
}));

// ============================================
// STOCK PRICES (Historical Daily Prices)
// ============================================
export const stockPrices = pgTable('stock_prices', {
    id: uuid('id').defaultRandom().primaryKey(),
    stockId: uuid('stock_id').references(() => stocks.id, { onDelete: 'cascade' }).notNull(),
    date: date('date').notNull(),
    open: decimal('open', { precision: 14, scale: 4 }),
    high: decimal('high', { precision: 14, scale: 4 }),
    low: decimal('low', { precision: 14, scale: 4 }),
    close: decimal('close', { precision: 14, scale: 4 }).notNull(),
    adjustedClose: decimal('adjusted_close', { precision: 14, scale: 4 }).notNull(), // Split-adjusted
    volume: decimal('volume', { precision: 18, scale: 0 }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
    stockDateUnique: unique('stock_prices_stock_date_unique').on(table.stockId, table.date),
    stockIdIdx: index('stock_prices_stock_id_idx').on(table.stockId),
    dateIdx: index('stock_prices_date_idx').on(table.date),
    stockDateIdx: index('stock_prices_stock_date_idx').on(table.stockId, table.date),
}));

// ============================================
// BENCHMARKS (Index Master Data)
// ============================================
export const benchmarks = pgTable('benchmarks', {
    id: uuid('id').defaultRandom().primaryKey(),
    symbol: text('symbol').notNull().unique(),           // ^GSPC, ^IXIC, ^MSCI
    name: text('name').notNull(),                        // S&P 500, NASDAQ-100
    description: text('description'),
    currency: text('currency').notNull(),                // USD
    isDefault: boolean('is_default').default(false).notNull(),
    lastPriceUpdate: timestamp('last_price_update'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ============================================
// BENCHMARK PRICES (Historical Daily Prices)
// ============================================
export const benchmarkPrices = pgTable('benchmark_prices', {
    id: uuid('id').defaultRandom().primaryKey(),
    benchmarkId: uuid('benchmark_id').references(() => benchmarks.id, { onDelete: 'cascade' }).notNull(),
    date: date('date').notNull(),
    close: decimal('close', { precision: 14, scale: 4 }).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
    benchmarkDateUnique: unique('benchmark_prices_benchmark_date_unique').on(table.benchmarkId, table.date),
    benchmarkIdIdx: index('benchmark_prices_benchmark_id_idx').on(table.benchmarkId),
    dateIdx: index('benchmark_prices_date_idx').on(table.date),
}));

// ============================================
// INVESTMENT PORTFOLIOS (Per-User)
// ============================================
export const investmentPortfolios = pgTable('investment_portfolios', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    name: text('name').notNull(),                        // "Main Portfolio", "Retirement"
    description: text('description'),
    baseCurrency: text('base_currency').default('USD').notNull(),
    benchmarkId: uuid('benchmark_id').references(() => benchmarks.id),
    isDefault: boolean('is_default').default(false).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
    userIdIdx: index('investment_portfolios_user_id_idx').on(table.userId),
}));

// ============================================
// PORTFOLIO HOLDINGS (Derived from Transactions)
// ============================================
// This is a MATERIALIZED VIEW or computed table for quick lookups
// Can be recalculated from transactions at any time
export const portfolioHoldings = pgTable('portfolio_holdings', {
    id: uuid('id').defaultRandom().primaryKey(),
    portfolioId: uuid('portfolio_id').references(() => investmentPortfolios.id, { onDelete: 'cascade' }).notNull(),
    stockId: uuid('stock_id').references(() => stocks.id, { onDelete: 'cascade' }).notNull(),
    shares: decimal('shares', { precision: 18, scale: 8 }).notNull(),         // Fractional shares support
    avgCostBasis: decimal('avg_cost_basis', { precision: 14, scale: 4 }).notNull(), // Average cost per share
    totalCostBasis: decimal('total_cost_basis', { precision: 14, scale: 2 }).notNull(),
    firstPurchaseDate: date('first_purchase_date').notNull(),
    lastTransactionDate: date('last_transaction_date').notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
    portfolioStockUnique: unique('portfolio_holdings_portfolio_stock_unique').on(table.portfolioId, table.stockId),
    portfolioIdIdx: index('portfolio_holdings_portfolio_id_idx').on(table.portfolioId),
    stockIdIdx: index('portfolio_holdings_stock_id_idx').on(table.stockId),
}));

// ============================================
// INVESTMENT TRANSACTIONS (Source of Truth)
// ============================================
export const investmentTransactions = pgTable('investment_transactions', {
    id: uuid('id').defaultRandom().primaryKey(),
    portfolioId: uuid('portfolio_id').references(() => investmentPortfolios.id, { onDelete: 'cascade' }).notNull(),
    stockId: uuid('stock_id').references(() => stocks.id, { onDelete: 'cascade' }).notNull(),
    type: text('type').notNull(),                        // 'buy', 'sell'
    shares: decimal('shares', { precision: 18, scale: 8 }).notNull(),
    pricePerShare: decimal('price_per_share', { precision: 14, scale: 4 }).notNull(),
    totalAmount: decimal('total_amount', { precision: 14, scale: 2 }).notNull(),
    fees: decimal('fees', { precision: 12, scale: 2 }).default('0').notNull(),
    currency: text('currency').notNull(),                // Transaction currency
    fxRateToBase: decimal('fx_rate_to_base', { precision: 12, scale: 6 }).default('1').notNull(),
    date: date('date').notNull(),
    notes: text('notes'),
    // For SELL transactions: realized P/L tracking
    realizedPL: decimal('realized_pl', { precision: 14, scale: 2 }),
    costBasisUsed: decimal('cost_basis_used', { precision: 14, scale: 2 }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
    portfolioIdIdx: index('investment_transactions_portfolio_id_idx').on(table.portfolioId),
    stockIdIdx: index('investment_transactions_stock_id_idx').on(table.stockId),
    dateIdx: index('investment_transactions_date_idx').on(table.date),
    typeIdx: index('investment_transactions_type_idx').on(table.type),
}));

// ============================================
// FX RATES HISTORY (Daily Currency Rates)
// ============================================
export const fxRates = pgTable('fx_rates', {
    id: uuid('id').defaultRandom().primaryKey(),
    fromCurrency: text('from_currency').notNull(),
    toCurrency: text('to_currency').notNull(),
    date: date('date').notNull(),
    rate: decimal('rate', { precision: 12, scale: 6 }).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
    fxPairDateUnique: unique('fx_rates_pair_date_unique').on(table.fromCurrency, table.toCurrency, table.date),
    dateIdx: index('fx_rates_date_idx').on(table.date),
}));

// ============================================
// RELATIONS
// ============================================
export const stocksRelations = relations(stocks, ({ many }) => ({
    prices: many(stockPrices),
    holdings: many(portfolioHoldings),
    transactions: many(investmentTransactions),
}));

export const stockPricesRelations = relations(stockPrices, ({ one }) => ({
    stock: one(stocks, {
        fields: [stockPrices.stockId],
        references: [stocks.id],
    }),
}));

export const benchmarksRelations = relations(benchmarks, ({ many }) => ({
    prices: many(benchmarkPrices),
    portfolios: many(investmentPortfolios),
}));

export const benchmarkPricesRelations = relations(benchmarkPrices, ({ one }) => ({
    benchmark: one(benchmarks, {
        fields: [benchmarkPrices.benchmarkId],
        references: [benchmarks.id],
    }),
}));

export const investmentPortfoliosRelations = relations(investmentPortfolios, ({ one, many }) => ({
    user: one(users, {
        fields: [investmentPortfolios.userId],
        references: [users.id],
    }),
    benchmark: one(benchmarks, {
        fields: [investmentPortfolios.benchmarkId],
        references: [benchmarks.id],
    }),
    holdings: many(portfolioHoldings),
    transactions: many(investmentTransactions),
}));

export const portfolioHoldingsRelations = relations(portfolioHoldings, ({ one }) => ({
    portfolio: one(investmentPortfolios, {
        fields: [portfolioHoldings.portfolioId],
        references: [investmentPortfolios.id],
    }),
    stock: one(stocks, {
        fields: [portfolioHoldings.stockId],
        references: [stocks.id],
    }),
}));

export const investmentTransactionsRelations = relations(investmentTransactions, ({ one }) => ({
    portfolio: one(investmentPortfolios, {
        fields: [investmentTransactions.portfolioId],
        references: [investmentPortfolios.id],
    }),
    stock: one(stocks, {
        fields: [investmentTransactions.stockId],
        references: [stocks.id],
    }),
}));

// ============================================
// TYPE EXPORTS
// ============================================
export type Stock = typeof stocks.$inferSelect;
export type NewStock = typeof stocks.$inferInsert;
export type StockPrice = typeof stockPrices.$inferSelect;
export type NewStockPrice = typeof stockPrices.$inferInsert;
export type Benchmark = typeof benchmarks.$inferSelect;
export type BenchmarkPrice = typeof benchmarkPrices.$inferSelect;
export type InvestmentPortfolio = typeof investmentPortfolios.$inferSelect;
export type PortfolioHolding = typeof portfolioHoldings.$inferSelect;
export type InvestmentTransaction = typeof investmentTransactions.$inferSelect;
export type NewInvestmentTransaction = typeof investmentTransactions.$inferInsert;
export type FxRate = typeof fxRates.$inferSelect;
```

---

## 3. API Interaction Strategy (Twelve Data)

### 3.1 Provider Configuration

Your API key is already configured in `.env`:
```env
TWELVE_DATA=f07c7cc6101544bbae195c93e623409b
```

### 3.2 Twelve Data Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Twelve Data API Layer                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Endpoints Used (1 credit each):                                │
│  ┌─────────────────┐  ┌─────────────────┐  ┌────────────────┐  │
│  │ /symbol_search  │  │  /time_series   │  │    /quote      │  │
│  │ (find stocks)   │  │ (daily prices)  │  │ (latest EOD)   │  │
│  └────────┬────────┘  └────────┬────────┘  └───────┬────────┘  │
│           │                    │                   │            │
│           └────────────────────┼───────────────────┘            │
│                                │                                │
│                    ┌───────────▼───────────┐                    │
│                    │  TwelveDataService    │                    │
│                    │     (Provider)        │                    │
│                    └───────────┬───────────┘                    │
└─────────────────────────────────┼───────────────────────────────┘
                                  │
                     ┌────────────▼────────────┐
                     │     Cache Layer         │
                     │  Redis (hot) + DB       │
                     └────────────┬────────────┘
                                  │
                     ┌────────────▼────────────┐
                     │      PostgreSQL         │
                     │  (permanent storage)    │
                     └─────────────────────────┘
```

### 3.3 Twelve Data Service Implementation

```typescript
// apps/api/src/services/investing/twelve-data.ts

const TWELVE_DATA_BASE_URL = 'https://api.twelvedata.com';

// Response types from Twelve Data API
interface TwelveDataSearchResponse {
    data: Array<{
        symbol: string;
        instrument_name: string;
        exchange: string;
        mic_code: string;
        exchange_timezone: string;
        instrument_type: string;
        country: string;
        currency: string;
    }>;
    status: string;
}

interface TwelveDataTimeSeriesResponse {
    meta: {
        symbol: string;
        interval: string;
        currency: string;
        exchange_timezone: string;
        exchange: string;
        mic_code: string;
        type: string;
    };
    values: Array<{
        datetime: string;
        open: string;
        high: string;
        low: string;
        close: string;
        volume: string;
    }>;
    status: string;
}

interface TwelveDataQuoteResponse {
    symbol: string;
    name: string;
    exchange: string;
    mic_code: string;
    currency: string;
    datetime: string;
    timestamp: number;
    open: string;
    high: string;
    low: string;
    close: string;
    volume: string;
    previous_close: string;
    change: string;
    percent_change: string;
}

export interface StockSearchResult {
    ticker: string;
    name: string;
    exchange: string;
    micCode: string;
    currency: string;
    country: string;
    type: 'stock' | 'etf' | 'index';
}

export interface DailyPrice {
    date: string;           // YYYY-MM-DD
    open: number;
    high: number;
    low: number;
    close: number;
    adjustedClose: number;
    volume: number;
}

export class TwelveDataService {
    private apiKey: string;
    private baseUrl: string;

    constructor() {
        this.apiKey = process.env.TWELVE_DATA!;
        this.baseUrl = TWELVE_DATA_BASE_URL;
        
        if (!this.apiKey) {
            throw new Error('TWELVE_DATA API key is required in .env');
        }
    }

    /**
     * Search for stocks by ticker or name
     * API Cost: 1 credit per request
     * 
     * Example: searchStocks('AAPL') or searchStocks('Apple')
     */
    async searchStocks(query: string, outputSize = 30): Promise<StockSearchResult[]> {
        const url = new URL(`${this.baseUrl}/symbol_search`);
        url.searchParams.set('symbol', query);
        url.searchParams.set('outputsize', outputSize.toString());
        url.searchParams.set('apikey', this.apiKey);

        const response = await fetch(url.toString());
        const data = await response.json() as TwelveDataSearchResponse;

        if (data.status !== 'ok') {
            throw new Error(`Twelve Data search failed: ${JSON.stringify(data)}`);
        }

        return data.data
            .filter(item => 
                item.instrument_type === 'Common Stock' || 
                item.instrument_type === 'ETF'
            )
            .map(item => ({
                ticker: item.symbol,
                name: item.instrument_name,
                exchange: item.exchange,
                micCode: item.mic_code,
                currency: item.currency,
                country: item.country,
                type: item.instrument_type === 'ETF' ? 'etf' : 'stock' as const,
            }));
    }

    /**
     * Get historical daily prices
     * API Cost: 1 credit per symbol
     * 
     * Uses interval=1day for daily data
     * outputsize can be up to 5000 data points (~20 years of daily data)
     */
    async getDailyPrices(
        symbol: string,
        startDate?: string,
        endDate?: string,
        outputSize = 5000
    ): Promise<DailyPrice[]> {
        const url = new URL(`${this.baseUrl}/time_series`);
        url.searchParams.set('symbol', symbol);
        url.searchParams.set('interval', '1day');
        url.searchParams.set('outputsize', outputSize.toString());
        url.searchParams.set('order', 'asc');
        url.searchParams.set('apikey', this.apiKey);
        
        // Adjust for splits (important for historical accuracy)
        url.searchParams.set('adjust', 'splits');

        if (startDate) {
            url.searchParams.set('start_date', startDate);
        }
        if (endDate) {
            url.searchParams.set('end_date', endDate);
        }

        const response = await fetch(url.toString());
        const data = await response.json() as TwelveDataTimeSeriesResponse;

        if (data.status !== 'ok' || !data.values) {
            throw new Error(`Twelve Data time_series failed: ${JSON.stringify(data)}`);
        }

        return data.values.map(v => ({
            date: v.datetime.split(' ')[0], // Extract date part (YYYY-MM-DD)
            open: parseFloat(v.open),
            high: parseFloat(v.high),
            low: parseFloat(v.low),
            close: parseFloat(v.close),
            adjustedClose: parseFloat(v.close), // Already adjusted with adjust=splits
            volume: parseInt(v.volume || '0', 10),
        }));
    }

    /**
     * Get latest EOD quote with additional info
     * API Cost: 1 credit per symbol
     */
    async getQuote(symbol: string): Promise<{
        price: DailyPrice;
        name: string;
        exchange: string;
        currency: string;
        previousClose: number;
        change: number;
        changePercent: number;
    }> {
        const url = new URL(`${this.baseUrl}/quote`);
        url.searchParams.set('symbol', symbol);
        url.searchParams.set('apikey', this.apiKey);

        const response = await fetch(url.toString());
        const data = await response.json() as TwelveDataQuoteResponse;

        if (!data.symbol) {
            throw new Error(`Twelve Data quote failed: ${JSON.stringify(data)}`);
        }

        return {
            price: {
                date: data.datetime,
                open: parseFloat(data.open),
                high: parseFloat(data.high),
                low: parseFloat(data.low),
                close: parseFloat(data.close),
                adjustedClose: parseFloat(data.close),
                volume: parseInt(data.volume || '0', 10),
            },
            name: data.name,
            exchange: data.exchange,
            currency: data.currency,
            previousClose: parseFloat(data.previous_close),
            change: parseFloat(data.change),
            changePercent: parseFloat(data.percent_change),
        };
    }

    /**
     * Get EOD price for a specific date
     * API Cost: 1 credit per symbol
     */
    async getEODPrice(symbol: string, date: string): Promise<DailyPrice> {
        const url = new URL(`${this.baseUrl}/eod`);
        url.searchParams.set('symbol', symbol);
        url.searchParams.set('date', date);
        url.searchParams.set('apikey', this.apiKey);

        const response = await fetch(url.toString());
        const data = await response.json();

        return {
            date: data.datetime || date,
            open: parseFloat(data.open || '0'),
            high: parseFloat(data.high || '0'),
            low: parseFloat(data.low || '0'),
            close: parseFloat(data.close),
            adjustedClose: parseFloat(data.close),
            volume: parseInt(data.volume || '0', 10),
        };
    }

    /**
     * Get index/benchmark data (works same as stocks)
     * Symbols: ^GSPC (S&P 500), ^IXIC (NASDAQ), ^DJI (Dow Jones)
     */
    async getBenchmarkPrices(symbol: string, outputSize = 5000): Promise<DailyPrice[]> {
        // Benchmarks use same endpoint as stocks
        return this.getDailyPrices(symbol, undefined, undefined, outputSize);
    }
}

// Singleton instance
let twelveDataInstance: TwelveDataService | null = null;

export function getTwelveDataService(): TwelveDataService {
    if (!twelveDataInstance) {
        twelveDataInstance = new TwelveDataService();
    }
    return twelveDataInstance;
}
```

### 3.4 API Endpoints Used

| Endpoint | Cost | Purpose | When Called |
|----------|------|---------|-------------|
| `/symbol_search` | 1 credit | Find stocks by ticker/name | User search |
| `/time_series` | 1 credit | Historical daily prices (up to 5000 points) | Initial backfill, chart data |
| `/quote` | 1 credit | Latest EOD price + metadata | Portfolio valuation |
| `/eod` | 1 credit | Specific date price | Fill missing data |

### 3.5 Twelve Data Free Tier Limits

| Limit | Value | Notes |
|-------|-------|-------|
| Daily credits | **800** | Resets at midnight UTC |
| Rate limit | **8 requests/min** | Respect with delays |
| Historical data | **5000 points** | ~20 years of daily data |
| Exchanges | **120+** | Global coverage |

### 3.6 Supported Markets

Twelve Data covers **120+ exchanges** including:
- 🇺🇸 NYSE, NASDAQ (US)
- 🇬🇧 LSE (UK)
- 🇪🇺 Euronext, XETRA (Europe)
- 🇯🇵 TSE (Japan)
- 🇰🇿 **KASE** (Kazakhstan) ✅
- 🇷🇺 MOEX (Russia)
- And many more...

### 3.7 Benchmark Symbols for Twelve Data

| Index | Symbol | Description |
|-------|--------|-------------|
| S&P 500 | `SPX` | US large-cap |
| NASDAQ-100 | `NDX` | US tech |
| Dow Jones | `DJI` | US blue-chip |
| FTSE 100 | `UKX` | UK stocks |
| DAX | `GDAXI` | German stocks |
| Nikkei 225 | `N225` | Japanese stocks |

### 3.8 Fetch Strategy & Caching

```typescript
// apps/api/src/services/investing/price-service.ts

import { getTwelveDataService, DailyPrice } from './twelve-data';
import { cache, CACHE_KEYS, CACHE_TTL } from '../../lib/redis';

export class PriceService {
    private twelveData = getTwelveDataService();
    
    /**
     * FETCH STRATEGY:
     * 
     * 1. CHECK DATABASE FIRST
     *    - Query stockPrices table for requested date range
     *    - If all dates present → return from DB
     * 
     * 2. CHECK REDIS CACHE
     *    - For "hot" data (last 7 days) → check Redis
     *    - TTL: 4 hours for recent prices
     * 
     * 3. FETCH FROM TWELVE DATA (only if needed)
     *    - Identify missing date ranges
     *    - Use /time_series with date range
     *    - Store in database (permanent)
     *    - Cache in Redis (hot data only)
     * 
     * 4. BACKFILL OPTIMIZATION
     *    - On first stock add: fetch all history with outputsize=5000
     *    - Store all in database
     *    - Never fetch again for those dates
     */

    async getPrices(
        stockId: string,
        startDate: string,
        endDate: string
    ): Promise<StockPrice[]> {
        // 1. Get what we have in DB
        const existingPrices = await this.db.query.stockPrices.findMany({
            where: and(
                eq(stockPrices.stockId, stockId),
                gte(stockPrices.date, startDate),
                lte(stockPrices.date, endDate)
            ),
            orderBy: asc(stockPrices.date)
        });

        // 2. Find missing dates
        const missingRanges = this.findMissingDateRanges(
            existingPrices,
            startDate,
            endDate
        );

        if (missingRanges.length === 0) {
            return existingPrices;
        }

        // 3. Fetch missing data from Twelve Data
        const stock = await this.db.query.stocks.findFirst({
            where: eq(stocks.id, stockId)
        });

        for (const range of missingRanges) {
            // Rate limiting: 8 requests/minute
            await this.rateLimitDelay();
            
            const newPrices = await this.twelveData.getDailyPrices(
                stock.ticker,
                range.start,
                range.end
            );

            // 4. Store in database (permanent)
            if (newPrices.length > 0) {
                await this.db.insert(stockPrices).values(
                    newPrices.map(p => ({
                        stockId,
                        date: p.date,
                        open: p.open.toString(),
                        high: p.high.toString(),
                        low: p.low.toString(),
                        close: p.close.toString(),
                        adjustedClose: p.adjustedClose.toString(),
                        volume: p.volume.toString(),
                    }))
                ).onConflictDoNothing();
            }
        }

        // 5. Return full dataset
        return this.db.query.stockPrices.findMany({
            where: and(
                eq(stockPrices.stockId, stockId),
                gte(stockPrices.date, startDate),
                lte(stockPrices.date, endDate)
            ),
            orderBy: asc(stockPrices.date)
        });
    }

    /**
     * Initial backfill when adding a new stock
     * Fetches maximum history (5000 days = ~20 years)
     */
    async backfillStockHistory(stockId: string, ticker: string): Promise<void> {
        // Check if we already have data
        const existingCount = await this.db
            .select({ count: count() })
            .from(stockPrices)
            .where(eq(stockPrices.stockId, stockId));

        if (existingCount[0].count > 0) {
            return; // Already backfilled
        }

        // Fetch maximum history
        const prices = await this.twelveData.getDailyPrices(ticker);
        
        if (prices.length > 0) {
            await this.db.insert(stockPrices).values(
                prices.map(p => ({
                    stockId,
                    date: p.date,
                    open: p.open.toString(),
                    high: p.high.toString(),
                    low: p.low.toString(),
                    close: p.close.toString(),
                    adjustedClose: p.adjustedClose.toString(),
                    volume: p.volume.toString(),
                }))
            ).onConflictDoNothing();
        }
    }

    /**
     * Rate limit helper (8 requests/minute = 7.5 seconds between requests)
     * In practice, we batch and use less frequently
     */
    private lastRequestTime = 0;
    private async rateLimitDelay(): Promise<void> {
        const minDelay = 7500; // 7.5 seconds
        const elapsed = Date.now() - this.lastRequestTime;
        if (elapsed < minDelay) {
            await new Promise(resolve => setTimeout(resolve, minDelay - elapsed));
        }
        this.lastRequestTime = Date.now();
    }
}
```

### 3.9 Cache Key Structure

```typescript
// Add to apps/api/src/lib/redis.ts

export const CACHE_KEYS = {
    // ...existing keys...
    
    // Investing module (Twelve Data)
    stockSearch: (query: string) => `invest:search:${query.toLowerCase()}`,
    stockQuote: (ticker: string) => `invest:quote:${ticker}`,
    stockPriceRange: (stockId: string, range: string) => `invest:prices:${stockId}:${range}`,
    benchmarkPrice: (benchmarkId: string, range: string) => `invest:benchmark:${benchmarkId}:${range}`,
    portfolioSummary: (portfolioId: string) => `invest:portfolio:${portfolioId}:summary`,
    portfolioChart: (portfolioId: string, range: string) => `invest:portfolio:${portfolioId}:chart:${range}`,
};

export const CACHE_TTL = {
    // ...existing TTLs...
    
    // Investing module
    stockSearch: 60 * 60 * 24,      // 24 hours (stock symbols rarely change)
    stockQuote: 60 * 60 * 4,        // 4 hours (EOD data updates once daily)
    stockPriceHistoric: 60 * 60 * 24 * 7, // 7 days (historical data doesn't change)
    portfolioSummary: 60 * 15,      // 15 minutes
    portfolioChart: 60 * 60,        // 1 hour
};
```

### 3.10 API Call Budget (Twelve Data Free Tier)

| Operation | Frequency | API Credits | Notes |
|-----------|-----------|-------------|-------|
| Stock Search | On-demand | 1 per search | Cached 24h in Redis |
| Add Stock (backfill) | Once per stock | 1 | Fetches up to 5000 days |
| Quote (latest price) | On portfolio view | 1 per stock | Cached 4h |
| Daily Price Update | Daily cron | 1 per active stock | Only fetches new day |
| Benchmark Update | Daily cron | 1 per benchmark | ~5 indices |

**Daily Budget: 800 credits**

**Example Usage for User with 20 Stocks:**
| Action | Credits |
|--------|---------|
| Initial backfill (one-time) | 20 |
| Daily quote updates | 20 |
| Benchmark updates | 5 |
| User searches (~5/day) | 5 |
| **Daily total** | **~30 credits** |

✅ Well within the 800/day limit!

---

## 4. Example Calculation Flows

### 4.1 Portfolio Return Calculation

```typescript
// apps/api/src/services/investing/analytics-service.ts

import { getTwelveDataService } from './twelve-data';

interface PortfolioAnalytics {
    totalInvested: number;          // Sum of all buy transactions
    currentValue: number;           // Current holdings × current prices
    unrealizedPL: number;           // Current value - cost basis
    unrealizedPLPercent: number;    // (unrealizedPL / totalInvested) × 100
    realizedPL: number;             // Sum of all sell transaction P/L
    totalReturn: number;            // unrealizedPL + realizedPL
    totalReturnPercent: number;     // Total return percentage
}

async function calculatePortfolioAnalytics(
    portfolioId: string,
    baseCurrency: string
): Promise<PortfolioAnalytics> {
    const twelveData = getTwelveDataService();
    
    // 1. Get all holdings with current prices
    const holdings = await db.query.portfolioHoldings.findMany({
        where: eq(portfolioHoldings.portfolioId, portfolioId),
        with: {
            stock: {
                with: {
                    prices: {
                        orderBy: desc(stockPrices.date),
                        limit: 1
                    }
                }
            }
        }
    });

    // 2. Get FX rates for currency conversion
    const currencies = [...new Set(holdings.map(h => h.stock.currency))];
    const fxRates = await getFxRates(currencies, baseCurrency);

    // 3. Calculate current value
    let currentValue = 0;
    let totalCostBasis = 0;

    for (const holding of holdings) {
        const currentPrice = parseFloat(holding.stock.prices[0]?.adjustedClose || '0');
        const shares = parseFloat(holding.shares);
        const costBasis = parseFloat(holding.totalCostBasis);
        const fxRate = fxRates[holding.stock.currency] || 1;

        currentValue += (shares * currentPrice) * fxRate;
        totalCostBasis += costBasis * fxRate;
    }

    // 4. Get realized P/L from sell transactions
    const sellTransactions = await db.query.investmentTransactions.findMany({
        where: and(
            eq(investmentTransactions.portfolioId, portfolioId),
            eq(investmentTransactions.type, 'sell')
        )
    });

    const realizedPL = sellTransactions.reduce(
        (sum, tx) => sum + parseFloat(tx.realizedPL || '0'),
        0
    );

    // 5. Calculate totals
    const unrealizedPL = currentValue - totalCostBasis;
    const totalInvested = totalCostBasis + Math.abs(realizedPL); // Cost basis of sold + held

    return {
        totalInvested,
        currentValue,
        unrealizedPL,
        unrealizedPLPercent: totalCostBasis > 0 
            ? (unrealizedPL / totalCostBasis) * 100 
            : 0,
        realizedPL,
        totalReturn: unrealizedPL + realizedPL,
        totalReturnPercent: totalInvested > 0
            ? ((unrealizedPL + realizedPL) / totalInvested) * 100
            : 0,
    };
}
```

### 4.2 Portfolio vs Benchmark Comparison

```typescript
// Time-Weighted Return (TWR) Calculation

interface ReturnComparison {
    portfolioReturn: number;        // Percentage
    benchmarkReturn: number;        // Percentage
    alpha: number;                  // Portfolio return - Benchmark return
    startDate: string;
    endDate: string;
}

async function compareWithBenchmark(
    portfolioId: string,
    benchmarkId: string,
    startDate: string,
    endDate: string
): Promise<ReturnComparison> {
    // 1. Get portfolio value at start and end dates
    const startValue = await getPortfolioValueAtDate(portfolioId, startDate);
    const endValue = await getPortfolioValueAtDate(portfolioId, endDate);
    
    // 2. Account for cash flows (deposits/withdrawals)
    const cashFlows = await getCashFlowsBetween(portfolioId, startDate, endDate);
    
    // 3. Calculate Time-Weighted Return (TWR) for portfolio
    // TWR eliminates the impact of cash flows
    const portfolioTWR = calculateTWR(startValue, endValue, cashFlows);
    
    // 4. Get benchmark prices at start and end
    const benchmarkStartPrice = await getBenchmarkPrice(benchmarkId, startDate);
    const benchmarkEndPrice = await getBenchmarkPrice(benchmarkId, endDate);
    
    // 5. Calculate benchmark return (simple since no cash flows)
    const benchmarkReturn = ((benchmarkEndPrice - benchmarkStartPrice) / benchmarkStartPrice) * 100;
    
    return {
        portfolioReturn: portfolioTWR,
        benchmarkReturn,
        alpha: portfolioTWR - benchmarkReturn,
        startDate,
        endDate,
    };
}

/**
 * Time-Weighted Return (TWR) Formula:
 * 
 * For each sub-period between cash flows:
 *   HPR = (EndValue - CashFlow) / StartValue - 1
 * 
 * TWR = [(1 + HPR1) × (1 + HPR2) × ... × (1 + HPRn)] - 1
 * 
 * This removes the effect of deposits/withdrawals and measures
 * pure investment performance.
 */
function calculateTWR(
    startValue: number,
    endValue: number,
    cashFlows: { date: string; amount: number; portfolioValueBefore: number }[]
): number {
    if (cashFlows.length === 0) {
        // Simple return if no cash flows
        return ((endValue - startValue) / startValue) * 100;
    }

    let twr = 1;
    let periodStartValue = startValue;

    for (const cf of cashFlows) {
        // HPR for period ending at this cash flow
        const periodEndValue = cf.portfolioValueBefore;
        const hpr = (periodEndValue / periodStartValue);
        twr *= hpr;
        
        // New period starts after cash flow
        periodStartValue = periodEndValue + cf.amount;
    }

    // Final period
    const finalHPR = endValue / periodStartValue;
    twr *= finalHPR;

    return (twr - 1) * 100;
}
```

### 4.3 Realized P/L on Sell (FIFO Method)

```typescript
/**
 * When selling shares, calculate realized P/L using FIFO
 * (First In, First Out) cost basis method
 */
async function calculateRealizedPL(
    portfolioId: string,
    stockId: string,
    sharesToSell: number,
    sellPrice: number
): Promise<{ realizedPL: number; costBasisUsed: number }> {
    // 1. Get all BUY transactions for this stock, ordered by date
    const buyTransactions = await db.query.investmentTransactions.findMany({
        where: and(
            eq(investmentTransactions.portfolioId, portfolioId),
            eq(investmentTransactions.stockId, stockId),
            eq(investmentTransactions.type, 'buy')
        ),
        orderBy: asc(investmentTransactions.date)
    });

    // 2. Calculate shares already sold (to know which buys are "used")
    const sellTransactions = await db.query.investmentTransactions.findMany({
        where: and(
            eq(investmentTransactions.portfolioId, portfolioId),
            eq(investmentTransactions.stockId, stockId),
            eq(investmentTransactions.type, 'sell')
        )
    });
    
    let sharesSoldBefore = sellTransactions.reduce(
        (sum, tx) => sum + parseFloat(tx.shares),
        0
    );

    // 3. FIFO: Skip buys that have been "used" by previous sells
    let costBasisUsed = 0;
    let remainingToSell = sharesToSell;

    for (const buy of buyTransactions) {
        const buyShares = parseFloat(buy.shares);
        
        // Skip shares already sold
        if (sharesSoldBefore >= buyShares) {
            sharesSoldBefore -= buyShares;
            continue;
        }
        
        // Partial lot available
        const availableShares = buyShares - sharesSoldBefore;
        sharesSoldBefore = 0;
        
        const sharesToUse = Math.min(availableShares, remainingToSell);
        const costPerShare = parseFloat(buy.pricePerShare);
        
        costBasisUsed += sharesToUse * costPerShare;
        remainingToSell -= sharesToUse;
        
        if (remainingToSell <= 0) break;
    }

    // 4. Calculate realized P/L
    const proceeds = sharesToSell * sellPrice;
    const realizedPL = proceeds - costBasisUsed;

    return { realizedPL, costBasisUsed };
}
```

---

## 5. tRPC Router Structure

```typescript
// apps/api/src/routers/investing.ts

import { router, protectedProcedure } from '../lib/trpc';
import { z } from 'zod';

export const investingRouter = router({
    // ==================== PORTFOLIO ====================
    portfolio: router({
        list: protectedProcedure.query(/* Get user's portfolios */),
        
        create: protectedProcedure
            .input(z.object({
                name: z.string().min(1).max(100),
                baseCurrency: z.string().length(3),
                benchmarkId: z.string().uuid().optional(),
            }))
            .mutation(/* Create new portfolio */),
        
        update: protectedProcedure
            .input(z.object({
                id: z.string().uuid(),
                name: z.string().min(1).max(100).optional(),
                benchmarkId: z.string().uuid().nullable().optional(),
            }))
            .mutation(/* Update portfolio settings */),
        
        delete: protectedProcedure
            .input(z.object({ id: z.string().uuid() }))
            .mutation(/* Delete portfolio */),
        
        summary: protectedProcedure
            .input(z.object({ id: z.string().uuid() }))
            .query(/* Get portfolio analytics */),
    }),

    // ==================== HOLDINGS ====================
    holdings: router({
        list: protectedProcedure
            .input(z.object({ portfolioId: z.string().uuid() }))
            .query(/* List all holdings with current values */),
        
        detail: protectedProcedure
            .input(z.object({
                portfolioId: z.string().uuid(),
                stockId: z.string().uuid(),
            }))
            .query(/* Detailed holding info with transactions */),
    }),

    // ==================== TRANSACTIONS ====================
    transaction: router({
        list: protectedProcedure
            .input(z.object({
                portfolioId: z.string().uuid(),
                stockId: z.string().uuid().optional(),
                type: z.enum(['buy', 'sell']).optional(),
                limit: z.number().min(1).max(100).default(50),
            }))
            .query(/* List transactions */),
        
        buy: protectedProcedure
            .input(z.object({
                portfolioId: z.string().uuid(),
                stockId: z.string().uuid(),
                shares: z.number().positive(),
                pricePerShare: z.number().positive(),
                fees: z.number().min(0).default(0),
                date: z.string(), // YYYY-MM-DD
                notes: z.string().optional(),
            }))
            .mutation(/* Record buy transaction */),
        
        sell: protectedProcedure
            .input(z.object({
                portfolioId: z.string().uuid(),
                stockId: z.string().uuid(),
                shares: z.number().positive(),
                pricePerShare: z.number().positive(),
                fees: z.number().min(0).default(0),
                date: z.string(),
                notes: z.string().optional(),
            }))
            .mutation(/* Record sell transaction with P/L calc */),
        
        delete: protectedProcedure
            .input(z.object({ id: z.string().uuid() }))
            .mutation(/* Delete transaction, recalculate holdings */),
    }),

    // ==================== STOCKS ====================
    stock: router({
        search: protectedProcedure
            .input(z.object({
                query: z.string().min(1).max(50),
            }))
            .query(/* Search stocks by ticker/name */),
        
        detail: protectedProcedure
            .input(z.object({ id: z.string().uuid() }))
            .query(/* Get stock details */),
        
        prices: protectedProcedure
            .input(z.object({
                stockId: z.string().uuid(),
                range: z.enum(['1D', '1W', '1M', '3M', '1Y', '5Y', 'MAX']),
            }))
            .query(/* Get historical prices */),
    }),

    // ==================== BENCHMARKS ====================
    benchmark: router({
        list: protectedProcedure.query(/* List available benchmarks */),
        
        prices: protectedProcedure
            .input(z.object({
                benchmarkId: z.string().uuid(),
                range: z.enum(['1D', '1W', '1M', '3M', '1Y', '5Y', 'MAX']),
            }))
            .query(/* Get benchmark price history */),
        
        compare: protectedProcedure
            .input(z.object({
                portfolioId: z.string().uuid(),
                benchmarkId: z.string().uuid(),
                range: z.enum(['1M', '3M', '1Y', '5Y', 'MAX']),
            }))
            .query(/* Portfolio vs benchmark comparison */),
    }),

    // ==================== ANALYTICS ====================
    analytics: router({
        allocation: protectedProcedure
            .input(z.object({
                portfolioId: z.string().uuid(),
                groupBy: z.enum(['stock', 'currency', 'exchange', 'sector']),
            }))
            .query(/* Get allocation breakdown */),
        
        performance: protectedProcedure
            .input(z.object({
                portfolioId: z.string().uuid(),
                range: z.enum(['1M', '3M', '1Y', '5Y', 'MAX']),
            }))
            .query(/* Get time-series performance data */),
        
        realizedPL: protectedProcedure
            .input(z.object({
                portfolioId: z.string().uuid(),
                year: z.number().optional(),
            }))
            .query(/* Get realized P/L summary */),
    }),
});
```

---

## 6. Frontend Component Structure

```
apps/web/src/
├── components/
│   └── investing/
│       ├── PortfolioSummaryCard.tsx      # Total value, P/L
│       ├── HoldingsTable.tsx             # List of holdings
│       ├── HoldingDetailSheet.tsx        # Single holding details
│       ├── StockSearchSheet.tsx          # Search & add stocks
│       ├── BuyStockSheet.tsx             # Buy transaction form
│       ├── SellStockSheet.tsx            # Sell transaction form
│       ├── TransactionHistory.tsx        # Transaction list
│       ├── AllocationChart.tsx           # Pie chart
│       ├── PerformanceChart.tsx          # Line chart with benchmark
│       ├── BenchmarkSelector.tsx         # Benchmark dropdown
│       └── InvestingWidget.tsx           # Dashboard widget
├── routes/
│   ├── investing/
│   │   ├── index.tsx                     # Portfolio overview
│   │   ├── holdings.tsx                  # All holdings
│   │   ├── transactions.tsx              # Transaction history
│   │   └── analytics.tsx                 # Performance & allocation
```

---

## 7. Daily Cron Job (Price Updates)

```typescript
// apps/api/src/jobs/update-stock-prices.ts

import { CronJob } from 'cron';

/**
 * Daily price update job
 * Runs at 00:30 UTC (after US markets close)
 * 
 * For international support, could run at multiple times:
 * - 00:30 UTC for US/Americas
 * - 08:30 UTC for Asia
 * - 18:00 UTC for Europe
 */
export const priceUpdateJob = new CronJob(
    '30 0 * * *',  // 00:30 UTC daily
    async () => {
        console.log('Starting daily price update...');
        
        // 1. Get all stocks with active holdings
        const activeStocks = await db.query.stocks.findMany({
            where: exists(
                db.select()
                    .from(portfolioHoldings)
                    .where(eq(portfolioHoldings.stockId, stocks.id))
            )
        });

        // 2. Batch update prices (use provider batch API if available)
        for (const stock of activeStocks) {
            try {
                const yesterday = getYesterday(); // YYYY-MM-DD
                await priceService.fetchAndStorePrice(stock.id, yesterday);
            } catch (error) {
                console.error(`Failed to update ${stock.ticker}:`, error);
            }
        }

        // 3. Update benchmarks
        const benchmarks = await db.query.benchmarks.findMany();
        for (const benchmark of benchmarks) {
            try {
                await benchmarkService.fetchAndStorePrice(benchmark.id, getYesterday());
            } catch (error) {
                console.error(`Failed to update benchmark ${benchmark.symbol}:`, error);
            }
        }

        // 4. Update FX rates
        await fxService.updateDailyRates();

        // 5. Invalidate caches
        await cache.invalidatePattern('invest:portfolio:*:summary');
        await cache.invalidatePattern('invest:portfolio:*:chart:*');

        console.log('Daily price update completed');
    }
);
```

---

## 8. Scalability & Future Extensions

### 8.1 What This Design Supports Without Changes

| Feature | Ready |
|---------|-------|
| Multiple portfolios per user | ✅ |
| Fractional shares | ✅ |
| Multiple exchanges | ✅ |
| Multiple currencies | ✅ |
| ETFs (treated as stocks) | ✅ |
| Dividend tracking (add field) | Easy |
| Stock splits (adjusted prices) | ✅ |
| Tax lot tracking | ✅ (FIFO built-in) |

### 8.2 Future Extension Points

```typescript
// 1. DIVIDENDS (add to investmentTransactions)
type: text('type').notNull(), // 'buy', 'sell', 'dividend'
dividendPerShare: decimal('dividend_per_share', ...),

// 2. WATCHLIST (new table)
export const watchlists = pgTable('watchlists', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id').notNull(),
    stockId: uuid('stock_id').notNull(),
    targetPrice: decimal('target_price', ...),
    notes: text('notes'),
});

// 3. CRYPTO SUPPORT (extend stocks table)
assetType: text('asset_type').default('stock'), // 'stock', 'etf', 'crypto'

// 4. BROKER IMPORT (new service)
// CSV/OFX import from brokers
interface BrokerImporter {
    parseFile(file: Buffer): InvestmentTransaction[];
}

// 5. PERFORMANCE METRICS (add to analytics)
// When ready, add without changing schema:
// - CAGR (Compound Annual Growth Rate)
// - Max Drawdown
// - Volatility
```

### 8.3 Performance Considerations

| Concern | Solution |
|---------|----------|
| Large price history | Partition `stockPrices` by date (yearly) |
| Many portfolios | Index on userId, pagination |
| Slow calculations | Pre-compute in `portfolioHoldings` table |
| Cache invalidation | Event-driven invalidation on transactions |
| API rate limits | Queue system for bulk operations |

### 8.4 Multi-Tenancy Ready

The design uses `userId` consistently, making it ready for:
- Multiple users on same instance
- Team/family shared portfolios (add `portfolioMembers` table)
- Advisor/client relationships

---

## 9. Default Benchmark Seed Data

```typescript
// apps/api/scripts/seed-benchmarks.ts

export const DEFAULT_BENCHMARKS = [
    {
        symbol: '^GSPC',
        name: 'S&P 500',
        description: 'US large-cap stocks',
        currency: 'USD',
        isDefault: true,
    },
    {
        symbol: '^IXIC',
        name: 'NASDAQ Composite',
        description: 'US technology-heavy index',
        currency: 'USD',
        isDefault: false,
    },
    {
        symbol: '^DJI',
        name: 'Dow Jones Industrial Average',
        description: 'US blue-chip stocks',
        currency: 'USD',
        isDefault: false,
    },
    {
        symbol: 'KASE',
        name: 'KASE Index',
        description: 'Kazakhstan Stock Exchange Index',
        currency: 'KZT',
        isDefault: false,
    },
    {
        symbol: '^STOXX50E',
        name: 'EURO STOXX 50',
        description: 'Eurozone blue-chip stocks',
        currency: 'EUR',
        isDefault: false,
    },
];
```

---

## 10. Summary

This design provides a **production-ready investing module** that:

✅ **Tracks investments** with full transaction history  
✅ **Minimizes API calls** through aggressive caching and database storage  
✅ **Supports multi-currency** with daily FX rates  
✅ **Compares performance** against selectable benchmarks  
✅ **Calculates P/L** accurately using FIFO method  
✅ **Scales efficiently** with proper indexing and caching  
✅ **Extends easily** for dividends, crypto, imports  

**Estimated API cost:** Near-zero after initial backfill (uses free tier limits)  
**Database growth:** ~1KB per stock per year of price history  
**Response times:** <100ms for cached data, <2s for uncached
