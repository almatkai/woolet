export interface StockSearchResult {
    ticker: string;
    name: string;
    exchange: string;
    currency: string;
}

export interface StockPrice {
    date: string;
    open: number;
    high: number;
    low: number;
    close: number;
    adjustedClose: number;
    volume: number;
}

export interface PortfolioSummary {
    totalInvested: number;
    currentValue: number;
    unrealizedPL: number;
    unrealizedPLPercent: number;
    realizedPL: number;
    totalReturn: number;
    totalReturnPercent: number;
    holdings: HoldingSummary[];
    // NEW: Cash tracking
    cash: {
        availableBalance: Record<string, number>;
        settledBalance: Record<string, number>;
        totalCash: number;
    };
    // Enhanced totals
    totalPortfolioValue: number; // stocks + cash
    stockValue: number; // just stock holdings (same as currentValue)
    cashAllocationPercent: number;
}

export interface HoldingSummary {
    stockId: string;
    ticker: string;
    name: string;
    quantity: number;
    averageCostBasis: number;
    currentPrice: number;
    currentValue: number;
    unrealizedPL: number;
    unrealizedPLPercent: number;
    currency: string;
    isManual?: boolean;
    lastUpdated?: string;
    isStale?: boolean;
}

export interface PortfolioChartPoint {
    date: string;
    value: number;
}

export interface BenchmarkComparison {
    portfolio: {
        startValue: number;
        endValue: number;
        return: number;
        returnPercent: number;
        chartData: PortfolioChartPoint[];
    };
    benchmark: {
        startValue: number;
        endValue: number;
        return: number;
        returnPercent: number;
        chartData: PortfolioChartPoint[];
    };
}
