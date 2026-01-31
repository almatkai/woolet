import { describe, expect, test, mock } from "bun:test";
import { currencyRouter } from "../../src/routers/currency";
import { createMockContext } from "../utils";

describe("Currency Router", () => {
  test("list should return all currencies", async () => {
    const mockDb = {
      select: mock(() => ({
        from: mock(() => Promise.resolve([
            { code: "USD", name: "US Dollar", symbol: "$" },
            { code: "EUR", name: "Euro", symbol: "€" }
        ])),
      })),
    };
    
    const ctx = createMockContext({ db: mockDb as any });
    const caller = currencyRouter.createCaller(ctx);
    
    const result = await caller.list();
    expect(result).toHaveLength(2);
    expect(result[0].code).toBe("USD");
    expect(mockDb.select).toHaveBeenCalled();
  });
});
