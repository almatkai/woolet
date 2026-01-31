import { db } from './db';
import { investmentTransactions, portfolioHoldings } from './db/schema';
import { analyticsService } from './services/investing/analytics-service';
import { priceService } from './services/investing/price-service';
import { investingCache } from './lib/investing-cache';
import { eq, desc } from 'drizzle-orm';

async function main() {
    const tx = await db.query.investmentTransactions.findFirst();
    if (!tx) {
        process.exit(0);
    }
    const userId = tx.userId;
    console.log('Analyzing User:', userId);

    console.log('Clearing investment cache...');
    await investingCache.clearAll();

    const range = priceService.getDateRange('1Y');
    const holdings = await db.query.portfolioHoldings.findMany({
        where: eq(portfolioHoldings.userId, userId),
        with: { stock: true }
    });

    console.log('\n--- Data Availability ---');
    for (const h of holdings) {
        const prices = await priceService.getStockPrices(h.stockId, range.start, range.end);
        console.log(`${h.stock.ticker}: data up to ${prices.length > 0 ? prices[prices.length - 1].date : 'N/A'} (count: ${prices.length})`);
    }

    console.log('\n--- Raw Portfolio Values from Service (SHOULD BE FORWARD-FILLED NOW) ---');
    const rawChart = await analyticsService.getPortfolioChart(userId, '1Y');
    console.table(rawChart.slice(-10));

    process.exit(0);
}

main().catch(console.error);
