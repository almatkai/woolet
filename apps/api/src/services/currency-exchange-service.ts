
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
     * Get exchange rates for a base currency
     * Returns a map of target currency -> rate
     * Example: getExchangeRates('EUR') returns { USD: 1.1, GBP: 0.85, ... }
     */
    async getExchangeRates(baseCurrency: string = 'USD'): Promise<Record<string, number>> {
        // 1. Get USD base rates (source of truth)
        const usdRates = await this.getUsdRates();

        // 2. If base is USD, return as is
        if (baseCurrency === 'USD') {
            return usdRates;
        }

        // 3. Convert to base currency
        // Rate(Base -> Target) = Rate(USD -> Target) / Rate(USD -> Base)
        const usdToBase = usdRates[baseCurrency];
        if (!usdToBase) {
            throw new Error(`Base currency ${baseCurrency} not found in rates`);
        }

        const rates: Record<string, number> = {};
        for (const [target, usdToTarget] of Object.entries(usdRates)) {
            rates[target] = usdToTarget / usdToBase;
        }

        return rates;
    }

    /**
     * Get USD-based rates from Cache or DB
     */
    private async getUsdRates(): Promise<Record<string, number>> {
        const cacheKey = `${CACHE_KEYS.CURRENCY_RATES}:USD`;

        // Try redis cache
        const cached = await cache.get<Record<string, number>>(cacheKey);
        if (cached) {
            return cached;
        }

        // Try DB (currencies table)
        const dbCurrencies = await db.query.currencies.findMany();
        if (dbCurrencies.length > 0) {
            const rates: Record<string, number> = {};
            // Assuming exchangeRate in DB is USD based (1 USD = X Currency)
            dbCurrencies.forEach(c => {
                rates[c.code] = parseFloat(c.exchangeRate);
            });
            // Cache it
            await cache.set(cacheKey, rates, CACHE_TTL);
            return rates;
        }

        // Fallback to API sync if empty
        return await this.fetchAndStoreRates();
    }

    /**
     * Fetch rates from API (USD base) and store in DB/Cache
     */
    public async fetchAndStoreRates(base: string = 'USD'): Promise<Record<string, number>> {
        // We ignore 'base' param for API fetch because we only fetch USD base from exchangerate-api
        // and calculate others. But we keep the signature compatible or just log it.
        if (base !== 'USD') {
            console.log(`Requested fetch for ${base}, but we always fetch USD and convert.`);
        }

        if (!API_KEY) {
            console.warn('No API Key, returning default rates (1.0)');
            return { USD: 1 };
        }

        console.log('Fetching fresh rates from API...');
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
