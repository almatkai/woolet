
import { cache, CACHE_KEYS } from '../lib/redis';
import { db } from '../db';
import { fxRates, currencies } from '../db/schema';
import { eq, and } from 'drizzle-orm';

const API_KEY = process.env.CURRENCY_API_KEY;
const API_URL = `https://v6.exchangerate-api.com/v6/${API_KEY}/latest/USD`;
const CACHE_TTL = 60 * 60 * 24; // 24 hours

interface ExchangeRateResponse {
    result: string;
    documentation: string;
    terms_of_use: string;
    time_last_update_unix: number;
    time_last_update_utc: string;
    time_next_update_unix: number;
    time_next_update_utc: string;
    base_code: string;
    conversion_rates: Record<string, number>;
}

class CurrencyExchangeService {

    constructor() {
        if (!API_KEY) {
            console.warn('CURRENCY_API_KEY not set. Currency exchange features will be limited.');
        }
    }

    /**
     * Get exchange rates for any base currency.
     * Internally we only store USD-based rates and compute cross-rates.
     *
     * When baseCurrency = 'USD' → returns raw USD rates (1 USD = X).
     * When baseCurrency = 'KZT' → returns KZT-based rates:
     *   rate(KZT → X) = rate(USD → X) / rate(USD → KZT)
     *
     * Example with KZT (1 USD = 450 KZT, 1 USD = 0.85 EUR):
     *   rate(KZT → EUR) = 0.85 / 450 ≈ 0.00189
     *   rate(KZT → USD) = 1 / 450 ≈ 0.00222
     *   rate(KZT → KZT) = 1
     */
    async getExchangeRates(baseCurrency: string = 'USD'): Promise<Record<string, number>> {
        const usdRates = await this.getUsdRates();

        // If base is USD, return as-is
        if (baseCurrency === 'USD') {
            return usdRates;
        }

        // Cross-rate conversion: rate(base → X) = rate(USD → X) / rate(USD → base)
        const usdToBase = usdRates[baseCurrency];
        if (!usdToBase) {
            console.warn(`⚠️  Base currency ${baseCurrency} not found in USD rates, falling back to USD`);
            return usdRates;
        }

        const converted: Record<string, number> = {};
        for (const [currency, usdRate] of Object.entries(usdRates)) {
            if (currency === baseCurrency) {
                converted[currency] = 1; // 1 KZT = 1 KZT
            } else {
                converted[currency] = usdRate / usdToBase;
            }
        }

        return converted;
    }

    /**
     * Get USD-based rates from Cache or DB
     * Returns rates as USD -> Currency (e.g., USD -> EUR = 0.85)
     */
    private async getUsdRates(): Promise<Record<string, number>> {
        const cacheKey = `${CACHE_KEYS.CURRENCY_RATES}:USD`;

        // Try redis cache
        const cached = await cache.get<Record<string, number>>(cacheKey);
        if (cached) {
            console.log('📦 Using cached USD rates');
            return cached;
        }

        // Try DB (currencies table) - includes both API and manual rates
        const dbCurrencies = await db.query.currencies.findMany();
        if (dbCurrencies.length > 0) {
            console.log(`💾 Loading ${dbCurrencies.length} currencies from database`);
            const rates: Record<string, number> = {};
            // exchangeRate in DB is USD based (1 USD = X Currency)
            dbCurrencies.forEach(c => {
                const rate = parseFloat(c.exchangeRate);
                // Only include currencies with valid rates (not the default "1")
                // Exception: USD should always be 1
                if (c.code === 'USD' || rate !== 1) {
                    rates[c.code] = rate;
                }
            });
            
            // Also check fxRates table for manual rates from today
            const today = new Date().toISOString().split('T')[0];
            const manualRates = await db.query.fxRates.findMany({
                where: and(
                    eq(fxRates.date, today),
                    eq(fxRates.fromCurrency, 'USD')
                )
            });
            
            // Override with manual rates if they exist
            manualRates.forEach(r => {
                rates[r.toCurrency] = parseFloat(r.rate);
            });
            
            // Cache it
            await cache.set(cacheKey, rates, CACHE_TTL);
            return rates;
        }

        // Fallback to API fetch if DB is empty (first run)
        console.log('⚠️  No rates in cache or DB, fetching from API...');
        return await this.fetchAndStoreRates();
    }

    /**
     * Fetch rates from API (USD base only) and store in DB/Cache
     * This should be called by the cron job every 30 minutes
     */
    public async fetchAndStoreRates(base: string = 'USD'): Promise<Record<string, number>> {
        // We only fetch USD base from exchangerate-api
        if (base !== 'USD') {
            console.log(`⚠️  Requested fetch for ${base}, but we only fetch USD base and calculate other currencies from it.`);
        }

        if (!API_KEY) {
            console.error('❌ CURRENCY_API_KEY not set. Cannot fetch exchange rates.');
            return { USD: 1 };
        }

        console.log('🌐 Fetching fresh USD-based rates from exchangerate-api.com...');
        const response = await fetch(API_URL);
        if (!response.ok) {
            throw new Error(`Failed to fetch rates: ${response.statusText}`);
        }

        const data = await response.json() as ExchangeRateResponse;
        if (data.result !== 'success') {
            throw new Error(`API Error: ${(data as any)['error-type']}`);
        }

        const rates = data.conversion_rates;
        const today = new Date().toISOString().split('T')[0];
        const currencyCount = Object.keys(rates).length;

        console.log(`✅ Fetched ${currencyCount} currency rates from API`);

        // 1. Update Currencies Table (Latest Rates)
        // We do this sequentially or Promise.all.
        // For 165 currencies, Promise.all is fine.
        const updates = Object.entries(rates).map(async ([code, rate]) => {
            // Update currency table
            try {
                // We use a safe update - only if currency exists
                await db.update(currencies)
                    .set({ exchangeRate: String(rate) })
                    .where(eq(currencies.code, code));

            } catch (e) {
                // ignore errors for unknown currencies or just log
            }
        });

        // 2. Insert into fxRates for History (USD -> X)
        // We can bulk insert this.
        const historyInserts = Object.entries(rates).map(([code, rate]) => ({
            date: today,
            fromCurrency: 'USD',
            toCurrency: code,
            rate: String(rate)
        }));

        // Batch insert history
        // Split into chunks if needed, but 165 is small enough for postgres
        if (historyInserts.length > 0) {
            await db.insert(fxRates)
                .values(historyInserts)
                .onConflictDoNothing();
        }

        await Promise.all(updates);

        // 3. Cache USD rates
        const cacheKey = `${CACHE_KEYS.CURRENCY_RATES}:USD`;
        await cache.set(cacheKey, rates, CACHE_TTL);

        console.log(`💾 Stored ${currencyCount} rates in DB and cache`);
        return rates;
    }

    /**
    * Get rate history for a currency pair
    */
    async getRateHistory(fromCurrency: string, toCurrency: string, days: number = 30): Promise<Array<{ date: string; rate: number }>> {
        // Implementation for history.
        // If fromCurrency is USD, we can query fxRates directly.
        // If not, we might need to join or fetch two series and calculate.
        // For simplicity: We only support USD based history or we infer.
        // But the user might want EUR -> GBP history.
        // If we only store USD -> X history, we have to calculate cross history.

        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);
        const startDateStr = startDate.toISOString().split('T')[0];

        // Get USD -> From history
        const usdToFrom = await db.query.fxRates.findMany({
            where: and(
                eq(fxRates.fromCurrency, 'USD'),
                eq(fxRates.toCurrency, fromCurrency)
            ),
            orderBy: (fxRates, { desc }) => [desc(fxRates.date)],
            limit: days,
        });

        // Get USD -> To history
        const usdToTo = await db.query.fxRates.findMany({
            where: and(
                eq(fxRates.fromCurrency, 'USD'),
                eq(fxRates.toCurrency, toCurrency)
            ),
            orderBy: (fxRates, { desc }) => [desc(fxRates.date)],
            limit: days,
        });

        // Match by date
        const history: Array<{ date: string; rate: number }> = [];
        const toMap = new Map<string, number>(usdToTo.map(r => [r.date, parseFloat(r.rate)]));
        const fromMap = new Map<string, number>(usdToFrom.map(r => [r.date, parseFloat(r.rate)]));

        // Get all unique dates
        const dates = new Set([...toMap.keys(), ...fromMap.keys()]);

        // If fromCurrency is USD, rate is just USD->To
        // If toCurrency is USD, rate is 1 / (USD->From)

        Array.from(dates).sort().forEach(date => {
            if (date < startDateStr) return;

            let rate: number | null = null;

            if (fromCurrency === 'USD') {
                rate = toMap.get(date) ?? null;
            } else if (toCurrency === 'USD') {
                const f = fromMap.get(date);
                rate = f ? 1 / f : null;
            } else {
                const f = fromMap.get(date);
                const t = toMap.get(date);
                if (f && t) {
                    rate = t / f;
                }
            }

            if (rate !== null) {
                history.push({ date, rate });
            }
        });

        return history.sort((a, b) => a.date.localeCompare(b.date));
    }


    /**
     * Convert amount
     */
    async convert(amount: number, fromCurrency: string, toCurrency: string): Promise<number> {
        if (fromCurrency === toCurrency) return amount;
        const rates = await this.getExchangeRates('USD'); // Get base rates
        // Rate(From -> To) = Rate(USD -> To) / Rate(USD -> From)
        const usdToFrom = rates[fromCurrency];
        const usdToTo = rates[toCurrency];

        if (!usdToFrom || !usdToTo) {
            throw new Error(`Cannot convert ${fromCurrency} to ${toCurrency}: missing rates`);
        }

        return amount * (usdToTo / usdToFrom);
    }

    /**
    * Get all available currencies (used for tests or validation)
    */
    async getMajorCurrencies(): Promise<string[]> {
        // Return list from DB
        const list = await db.query.currencies.findMany({
            columns: { code: true }
        });
        return list.map(c => c.code);
    }

    // Alias for cron job compatibility
    async fetchAllRates(): Promise<void> {
        await this.fetchAndStoreRates('USD');
    }
}

export const currencyExchangeService = new CurrencyExchangeService();
