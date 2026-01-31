import { db } from './db';
import { investmentTransactions, stocks } from './db/schema';
import { analyticsService } from './services/investing/analytics-service';
import { eq, desc } from 'drizzle-orm';

async function main() {
    // 1. Get a user (we know userId from previous logs or fetch first)
    const tx = await db.query.investmentTransactions.findFirst();
    if (!tx) {
        console.log('No transactions found.');
        process.exit(0);
    }
    const userId = tx.userId;
    console.log('Analyzing User:', userId);

    // 2. Get Transactions
    const transactions = await db.query.investmentTransactions.findMany({
        where: eq(investmentTransactions.userId, userId),
        with: { stock: true },
        orderBy: desc(investmentTransactions.date)
    });

    console.log('\n--- Transaction History ---');
    console.table(transactions.map(t => ({
        date: t.date,
        type: t.type,
        ticker: t.stock.ticker,
        qty: t.quantity,
        price: t.pricePerShare,
        total: t.totalAmount
    })));

    // 3. Get Portfolio Summary (Real Return)
    const summary = await analyticsService.calculatePortfolioSummary(userId);
    console.log('\n--- Portfolio Summary ---');
    console.log('Total Return %:', summary.totalReturnPercent);
    console.log('Total Return $:', summary.totalReturn);

    // 4. Get Chart Data (Simulated Return)
    const benchmark = await analyticsService.getPortfolioBenchmarkComparison(userId, '1Y');
    console.log('\n--- Chart Benchmark Comparison (1Y) ---');
    console.log('Chart Return %:', benchmark.portfolio.returnPercent);
    console.log('Start Value:', benchmark.portfolio.startValue);
    console.log('End Value:', benchmark.portfolio.endValue);

    // Check first/last points
    const pts = benchmark.portfolio.chartData;
    if (pts.length > 0) {
        console.log('First Point:', pts[0]);
        console.log('Last Point:', pts[pts.length - 1]);
    }
    process.exit(0);
}

main();
