import { describe, expect, test, mock, beforeAll } from "bun:test";
import { TRPCError } from "@trpc/server";

// Mock services before importing the router
const mockTwelveData = {
  searchStocks: mock(() => Promise.resolve([])),
  getQuote: mock(() => Promise.resolve({ close: 150, date: "2023-01-01" })),
  getDailyPrices: mock(() => Promise.resolve([])),
};

mock.module("../../src/services/investing/twelve-data", () => ({
  getTwelveDataService: () => mockTwelveData,
}));

const mockPriceService = {
  backfillStockHistory: mock(() => Promise.resolve()),
  getDateRange: mock(() => ({ start: "2023-01-01", end: "2023-12-31" })),
  getStockPrices: mock(() => Promise.resolve([])),
};

mock.module("../../src/services/investing/price-service", () => ({
  priceService: mockPriceService,
}));

const mockAnalyticsService = {
  calculatePortfolioSummary: mock(() => Promise.resolve({})),
  getPortfolioChart: mock(() => Promise.resolve([])),
  getPortfolioBenchmarkComparison: mock(() => Promise.resolve([])),
  invalidatePortfolioCache: mock(() => Promise.resolve()),
  calculateRealizedPL: mock(() => Promise.resolve(100)),
};

mock.module("../../src/services/investing/analytics-service", () => ({
  analyticsService: mockAnalyticsService,
}));

const mockInvestingCache = {
  invalidatePattern: mock(() => Promise.resolve()),
  clearAll: mock(() => Promise.resolve()),
  getStats: mock(() => Promise.resolve({})),
  resetStats: mock(() => Promise.resolve()),
  getOrFetch: mock((key: string, fetcher: any) => fetcher()),
};

mock.module("../../src/lib/investing-cache", () => ({
  investingCache: mockInvestingCache,
}));

const mockCache = {
  del: mock(() => Promise.resolve()),
};

mock.module("../../src/lib/redis", () => ({
  cache: mockCache,
  CACHE_KEYS: {
    stockQuote: (id: string) => `quote:${id}`,
  },
}));

// Now import the router
import { investingRouter } from "../../src/routers/investing";
import { createMockContext } from "../utils";

describe("Investing Router", () => {
  const mockUser = {
    id: "test-user-id",
    testMode: false
  };

  const stockId = "123e4567-e89b-12d3-a456-426614174000";

  test("addStock should create a stock record", async () => {
    const mockDb = {
      query: {
        users: { findFirst: mock(() => Promise.resolve(mockUser)) },
        stocks: { findFirst: mock(() => Promise.resolve(null)) },
      },
      insert: mock(() => ({
        values: mock(() => ({
          returning: mock(() => Promise.resolve([{ id: stockId, ticker: "AAPL", isManual: false }]))
        }))
      })),
    };

    const ctx = createMockContext({ db: mockDb as any });
    const caller = investingRouter.createCaller(ctx);

    const result = await caller.addStock({
      ticker: "AAPL",
      name: "Apple Inc.",
      currency: "USD",
      exchange: "NASDAQ",
    });

    expect(result.ticker).toBe("AAPL");
    expect(mockDb.insert).toHaveBeenCalled();
  });

  test("searchStocks should call twelveData service", async () => {
    const ctx = createMockContext();
    const caller = investingRouter.createCaller(ctx);
    const result = await caller.searchStocks({ query: "AAPL" });
    expect(result).toBeDefined();
  });

  test("updateManualPrice should create or update price record", async () => {
    const mockStock = { id: stockId, userId: "test-user-id", isManual: true };
    const mockDb = {
      query: {
        stocks: { findFirst: mock(() => Promise.resolve(mockStock)) },
        stockPrices: { findFirst: mock(() => Promise.resolve(null)) },
      },
      insert: mock(() => ({
        values: mock(() => ({
          returning: mock(() => Promise.resolve([]))
        }))
      })),
      update: mock(() => ({
        set: mock(() => ({
          where: mock(() => Promise.resolve())
        }))
      })),
    };

    const ctx = createMockContext({ db: mockDb as any });
    const caller = investingRouter.createCaller(ctx);

    const result = await caller.updateManualPrice({
      stockId,
      price: 155,
      date: "2023-01-02"
    });

    expect(result.success).toBe(true);
    expect(mockDb.insert).toHaveBeenCalled();
  });

  test("buyStock should record transaction and update holding", async () => {
    const mockStock = { id: stockId, userId: "test-user-id", ticker: "AAPL" };
    const mockHolding = { id: "holding-1", quantity: "10", averageCostBasis: "140" };

    const mockDb = {
      query: {
        users: { findFirst: mock(() => Promise.resolve(mockUser)) },
        stocks: { findFirst: mock(() => Promise.resolve(mockStock)) },
        portfolioHoldings: { findFirst: mock(() => Promise.resolve(mockHolding)) },
      },
      insert: mock(() => ({
        values: mock(() => ({
          returning: mock(() => Promise.resolve([]))
        }))
      })),
      update: mock(() => ({
        set: mock(() => ({
          where: mock(() => Promise.resolve())
        }))
      })),
    };

    const ctx = createMockContext({ db: mockDb as any });
    const caller = investingRouter.createCaller(ctx);

    const result = await caller.buyStock({
      stockId: stockId,
      date: "2023-01-01",
      quantity: 5,
      pricePerShare: 150,
      currency: "USD"
    });

    expect(result.success).toBe(true);
    expect(mockDb.insert).toHaveBeenCalled(); // Transaction
    expect(mockDb.update).toHaveBeenCalled(); // Holding update
  });

  test("sellStock should fail if insufficient quantity", async () => {
    const mockHolding = { id: "holding-1", quantity: "2", averageCostBasis: "140" };

    const mockDb = {
      query: {
        users: { findFirst: mock(() => Promise.resolve(mockUser)) },
        portfolioHoldings: { findFirst: mock(() => Promise.resolve(mockHolding)) },
      },
    };

    const ctx = createMockContext({ db: mockDb as any });
    const caller = investingRouter.createCaller(ctx);

    let error;
    try {
      await caller.sellStock({
        stockId: stockId,
        date: "2023-01-01",
        quantity: 5, // 5 > 2
        pricePerShare: 160,
        currency: "USD"
      });
    } catch (e) {
      error = e;
    }

    expect(error).toBeDefined();
    expect((error as TRPCError).code).toBe("BAD_REQUEST");
  });

  test("deleteStock should fail if holdings exist", async () => {
    const mockHolding = { id: "holding-1", quantity: "10" };
    const mockDb = {
      query: {
        portfolioHoldings: { findFirst: mock(() => Promise.resolve(mockHolding)) },
      },
    };

    const ctx = createMockContext({ db: mockDb as any });
    const caller = investingRouter.createCaller(ctx);

    let error;
    try {
      await caller.deleteStock({ stockId });
    } catch (e) {
      error = e;
    }

    expect(error).toBeDefined();
    expect((error as TRPCError).code).toBe("BAD_REQUEST");
  });

  test("deleteStock should succeed if no holdings", async () => {
    const mockDb = {
      query: {
        portfolioHoldings: { findFirst: mock(() => Promise.resolve(null)) },
        investmentTransactions: { findFirst: mock(() => Promise.resolve(null)) },
      },
      delete: mock(() => ({
        where: mock(() => Promise.resolve())
      })),
    };

    const ctx = createMockContext({ db: mockDb as any });
    const caller = investingRouter.createCaller(ctx);

    const result = await caller.deleteStock({ stockId });
    expect(result.success).toBe(true);
    expect(mockDb.delete).toHaveBeenCalled();
  });

  test("updateTransaction should update transaction and recalculate holding", async () => {
    const transactionId = "123e4567-e89b-12d3-a456-426614174000";
    const mockTransaction = { id: transactionId, userId: "test-user-id", stockId: "stock-1" };
    const mockDb = {
      query: {
        investmentTransactions: {
          findFirst: mock(() => Promise.resolve(mockTransaction)),
          findMany: mock(() => Promise.resolve([])),
        },
        portfolioHoldings: { findFirst: mock(() => Promise.resolve({ id: "holding-1" })) },
      },
      update: mock(() => ({
        set: mock(() => ({
          where: mock(() => Promise.resolve())
        }))
      })),
    };

    const ctx = createMockContext({ db: mockDb as any });
    const caller = investingRouter.createCaller(ctx);

    const result = await caller.updateTransaction({
      id: transactionId,
      date: "2023-01-01",
      quantity: 10,
      pricePerShare: 150
    });

    expect(result.success).toBe(true);
    expect(mockDb.update).toHaveBeenCalled();
  });

  test("deleteTransaction should delete transaction and recalculate holding", async () => {
    const transactionId = "123e4567-e89b-12d3-a456-426614174001";
    const mockTransaction = { id: transactionId, userId: "test-user-id", stockId: "stock-1" };
    const mockDb = {
      query: {
        investmentTransactions: {
          findFirst: mock(() => Promise.resolve(mockTransaction)),
          findMany: mock(() => Promise.resolve([])),
        },
        portfolioHoldings: { findFirst: mock(() => Promise.resolve({ id: "holding-1" })) },
      },
      delete: mock(() => ({
        where: mock(() => Promise.resolve())
      })),
      update: mock(() => ({
        set: mock(() => ({
          where: mock(() => Promise.resolve())
        }))
      })),
    };

    const ctx = createMockContext({ db: mockDb as any });
    const caller = investingRouter.createCaller(ctx);

    const result = await caller.deleteTransaction({ id: transactionId });

    expect(result.success).toBe(true);
    expect(mockDb.delete).toHaveBeenCalled();
  });

  test("deleteAllStocks should call delete on stocks table", async () => {
    const mockDb = {
      delete: mock(() => ({
        where: mock(() => Promise.resolve())
      })),
    };

    const ctx = createMockContext({ db: mockDb as any });
    const caller = investingRouter.createCaller(ctx);

    const result = await caller.deleteAllStocks();
    expect(result.success).toBe(true);
    expect(mockDb.delete).toHaveBeenCalled();
  });

  test("getPortfolioSummary should call analytics service", async () => {
    const ctx = createMockContext();
    const caller = investingRouter.createCaller(ctx);
    const result = await caller.getPortfolioSummary();
    expect(result).toBeDefined();
  });

  test("getPortfolioChart should call analytics service", async () => {
    const ctx = createMockContext();
    const caller = investingRouter.createCaller(ctx);
    const result = await caller.getPortfolioChart({ range: "1Y" });
    expect(result).toBeDefined();
  });

  test("getBenchmarkComparison should call analytics service", async () => {
    const ctx = createMockContext();
    const caller = investingRouter.createCaller(ctx);
    const result = await caller.getBenchmarkComparison({ range: "1Y" });
    expect(result).toBeDefined();
  });

  test("getStockPriceHistory should query db", async () => {
    const mockDb = {
      query: {
        stockPrices: {
          findMany: mock(() => Promise.resolve([]))
        }
      }
    };
    const ctx = createMockContext({ db: mockDb as any });
    const caller = investingRouter.createCaller(ctx);
    const result = await caller.getStockPriceHistory({ stockId, range: "1Y" });
    expect(result).toBeDefined();
  });

  test("listStocks should query db", async () => {
    const mockDb = {
      query: {
        stocks: {
          findMany: mock(() => Promise.resolve([]))
        }
      }
    };
    const ctx = createMockContext({ db: mockDb as any });
    const caller = investingRouter.createCaller(ctx);
    const result = await caller.listStocks();
    expect(result).toBeDefined();
  });

  test("getQuote should call twelveData service", async () => {
    const ctx = createMockContext();
    const caller = investingRouter.createCaller(ctx);
    const result = await caller.getQuote({ ticker: "AAPL" });
    expect(result).toBeDefined();
  });

  test("getPriceForDate should call service and find closest date", async () => {
    const mockPrices = [
      { date: "2023-01-01", close: 150 },
      { date: "2022-12-31", close: 148 }
    ];

    mockTwelveData.getDailyPrices.mockImplementation(() => Promise.resolve(mockPrices as any));

    const ctx = createMockContext();
    const caller = investingRouter.createCaller(ctx);

    // Exact match
    const result1 = await caller.getPriceForDate({ ticker: "AAPL", date: "2023-01-01" });
    expect(result1).not.toBeNull();
    if (result1) {
      expect(result1.price).toBe(150);
    }

    // Closest prior date (Sunday is requested, Friday is returned)
    const result2 = await caller.getPriceForDate({ ticker: "AAPL", date: "2023-01-02" });
    expect(result2).not.toBeNull();
    if (result2) {
      expect(result2.price).toBe(150);
      expect(result2.date).toBe("2023-01-01");
    }
  });

  test("getCacheStats should return cache stats", async () => {
    const ctx = createMockContext();
    const caller = investingRouter.createCaller(ctx);
    const result = await caller.getCacheStats();
    expect(result.cache).toBeDefined();
  });

  test("clearCache should succeed", async () => {
    const ctx = createMockContext();
    const caller = investingRouter.createCaller(ctx);
    const result = await caller.clearCache();
    expect(result.success).toBe(true);
  });

  test("resetCacheStats should succeed", async () => {
    const ctx = createMockContext();
    const caller = investingRouter.createCaller(ctx);
    const result = await caller.resetCacheStats();
    expect(result.success).toBe(true);
  });
});
