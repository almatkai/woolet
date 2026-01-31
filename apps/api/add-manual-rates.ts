// Script to add manual currency rates for unsupported currencies
// Run with: bun run add-manual-rates.ts

import { db } from './src/db';
import { fxRates } from './src/db/schema';

async function addManualRates() {
    const today = new Date().toISOString().split('T')[0];
    
    // Add USD to KZT rate (as of Jan 2026, approximately 502 KZT per USD)
    const rates = [
        { from: 'USD', to: 'KZT', rate: 502.0 },
        { from: 'USD', to: 'RUB', rate: 95.0 }, // Approximate RUB rate
    ];

    console.log(`Adding manual rates for ${today}...`);

    for (const { from, to, rate } of rates) {
        try {
            await db.insert(fxRates).values({
                date: today,
                fromCurrency: from,
                toCurrency: to,
                rate: rate.toString(),
            }).onConflictDoNothing();
            
            console.log(`✓ Added ${from} → ${to}: ${rate}`);
        } catch (error) {
            console.error(`✗ Failed to add ${from} → ${to}:`, error);
        }
    }

    console.log('Done!');
    process.exit(0);
}

addManualRates().catch(console.error);
