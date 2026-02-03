import { cache, CACHE_KEYS } from '../lib/redis';
import { db } from '../db';
import { fxRates } from '../db/schema';
import { eq, and } from 'drizzle-orm';

// Currencies supported by FreeCurrencyAPI (free tier)
// Note: KZT and RUB are NOT supported by this API
const SUPPORTED_CURRENCIES = [
    'USD', 'EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'NZD', 
    'CNY', 'INR', 'HKD', 'SGD', 'KRW', 'MXN', 'BRL', 'PLN',
    'SEK', 'NOK', 'DKK', 'CZK', 'HUF', 'TRY', 'ZAR', 'THB'
];

interface ExchangeRateResponse {
    data: {
        [key: string]: number;
    };
}

class CurrencyExchangeService {
    private apiKey: string;
    private apiUrl = 'https://api.freecurrencyapi.com/v1/latest';
    private cacheExpiry = 60 * 60 * 12; // 12 hours in seconds

    constructor() {
        this.apiKey = process.env.CURRENCY_API_KEY || '';
        if (!this.apiKey) {
            console.warn('CURRENCY_API_KEY not set. Currency exchange features will be limited.');
        }
    }

    /**
     * Get exchange rates for a base currency
     * Uses cache and database to minimize API calls
     * Updates database once per day
     * Supports ANY currency by cross-converting through USD
     */
    async getExchangeRates(baseCurrency: string = 'USD'): Promise<Record<string, number>> {
        // Try cache first
        const cacheKey = `${CACHE_KEYS.CURRENCY_RATES}:${baseCurrency}`;
        const cached = await cache.get<Record<string, number>>(cacheKey);
        
        if (cached) {
            return cached;
        }

        // If base currency is supported by API, fetch directly
        if (SUPPORTED_CURRENCIES.includes(baseCurrency)) {
            return await this.getDirectRates(baseCurrency);
        }

        // For unsupported currencies (like KZT), convert through USD
        return await this.getCrossRates(baseCurrency);
    }

    /**
     * Get direct rates from API for supported currencies
     */
    private async getDirectRates(baseCurrency: string): Promise<Record<string, number>> {
        const today = new Date().toISOString().split('T')[0];

        // Try database for today's rates
        const dbRates = await db.query.fxRates.findMany({
            where: and(
                eq(fxRates.fromCurrency, baseCurrency),
                eq(fxRates.date, today)
            ),
        });

        if (dbRates.length > 0) {
            const rates: Record<string, number> = {};
            dbRates.forEach(rate => {
                rates[rate.toCurrency] = parseFloat(rate.rate);
            });
            
            // Cache for 12 hours
            const cacheKey = `${CACHE_KEYS.CURRENCY_RATES}:${baseCurrency}`;
            await cache.set(cacheKey, rates, this.cacheExpiry);
            return rates;
        }

        // Fetch from API
        return await this.fetchAndStoreRates(baseCurrency);
    }

    /**
     * Get cross rates through USD for unsupported currencies
     * Example: For KZT, we get USD→KZT and USD→EUR, then calculate KZT→EUR = (USD→EUR) / (USD→KZT)
     */
    private async getCrossRates(baseCurrency: string): Promise<Record<string, number>> {
        // Get USD rates to all supported currencies
        const usdRates = await this.getDirectRates('USD');
        
        // Get rate from USD to base currency (e.g., USD→KZT)
        const usdToBase = await this.getUsdRate(baseCurrency);
        
        if (!usdToBase) {
            // Return minimal rates if currency not found (user needs to add manual rate)
            console.warn(`Currency ${baseCurrency} has no USD rate stored. Please add a manual rate.`);
            return { [baseCurrency]: 1 };
        }

        // Calculate cross rates: BASE→X = (USD→X) / (USD→BASE)
        const rates: Record<string, number> = {};
        rates[baseCurrency] = 1; // Base currency to itself
        
        // Add USD rate (inverse of USD→BASE)
        rates['USD'] = 1 / usdToBase;

        for (const [currency, usdToTarget] of Object.entries(usdRates)) {
            if (currency !== 'USD') {
                rates[currency] = usdToTarget / usdToBase;
            }
        }

        // Cache for 12 hours
        const cacheKey = `${CACHE_KEYS.CURRENCY_RATES}:${baseCurrency}`;
        await cache.set(cacheKey, rates, this.cacheExpiry);

        return rates;
    }

    /**
     * Get USD rate for any currency from database
     * For example: USD→KZT rate from historical data
     */
    private async getUsdRate(currency: string): Promise<number | null> {
        const today = new Date().toISOString().split('T')[0];
        
        // Try to find USD→currency rate
        const rate = await db.query.fxRates.findFirst({
            where: and(
                eq(fxRates.fromCurrency, 'USD'),
                eq(fxRates.toCurrency, currency),
                eq(fxRates.date, today)
            ),
        });

        if (rate) {
            return parseFloat(rate.rate);
        }

        // Try reverse (currency→USD) and invert
        const reverseRate = await db.query.fxRates.findFirst({
            where: and(
                eq(fxRates.fromCurrency, currency),
                eq(fxRates.toCurrency, 'USD'),
                eq(fxRates.date, today)
            ),
        });

        if (reverseRate) {
            return 1 / parseFloat(reverseRate.rate);
        }

        return null;
    }

    /**
     * Fetch rates from FreeCurrencyAPI and store in database
     */
    private async fetchAndStoreRates(baseCurrency: string): Promise<Record<string, number>> {
        if (!this.apiKey) {
            throw new Error('Currency API key not configured');
        }

        try {
            // Only request supported currencies
            const currencies = SUPPORTED_CURRENCIES.filter(c => c !== baseCurrency).join(',');
            const url = `${this.apiUrl}?apikey=${this.apiKey}&base_currency=${baseCurrency}&currencies=${currencies}`;
            
            const response = await fetch(url);
            
            if (!response.ok) {
                const errorText = await response.text();
                console.error('Currency API error response:', errorText);
                throw new Error(`Currency API error: ${response.status}`);
            }

            const data = await response.json() as ExchangeRateResponse;
            const today = new Date().toISOString().split('T')[0];
            const rates: Record<string, number> = {};

            // Add base currency with rate 1
            rates[baseCurrency] = 1;

            // Store each rate in database - API returns direct values like { EUR: 0.84, GBP: 0.73 }
            const inserts = Object.entries(data.data).map(([currency, rate]) => {
                rates[currency] = rate;
                return {
                    date: today,
                    fromCurrency: baseCurrency,
                    toCurrency: currency,
                    rate: rate.toString(),
                };
            });

            if (inserts.length > 0) {
                await db.insert(fxRates).values(inserts).onConflictDoNothing();
            }

            // Cache the results
            const cacheKey = `${CACHE_KEYS.CURRENCY_RATES}:${baseCurrency}`;
            await cache.set(cacheKey, rates, this.cacheExpiry);

            return rates;
        } catch (error) {
            console.error('Error fetching currency rates:', error);
            throw error;
        }
    }

    /**
     * Get rate history for a currency pair from database
     */
    async getRateHistory(fromCurrency: string, toCurrency: string, days: number = 30): Promise<Array<{ date: string; rate: number }>> {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);
        const startDateStr = startDate.toISOString().split('T')[0];

        const rates = await db.query.fxRates.findMany({
            where: and(
                eq(fxRates.fromCurrency, fromCurrency),
                eq(fxRates.toCurrency, toCurrency)
            ),
            orderBy: (fxRates, { desc }) => [desc(fxRates.date)],
            limit: days,
        });

        return rates.map(rate => ({
            date: rate.date,
            rate: parseFloat(rate.rate),
        }));
    }

    /**
     * Convert amount from one currency to another
     */
    async convert(amount: number, fromCurrency: string, toCurrency: string): Promise<number> {
        if (fromCurrency === toCurrency) {
            return amount;
        }

        // Get rates for base currency
        const rates = await this.getExchangeRates(fromCurrency);
        
        if (!rates[toCurrency]) {
            // Try reverse lookup
            const reverseRates = await this.getExchangeRates(toCurrency);
            if (reverseRates[fromCurrency]) {
                return amount / reverseRates[fromCurrency];
            }
            throw new Error(`No exchange rate found for ${fromCurrency} to ${toCurrency}`);
        }

        return amount * rates[toCurrency];
    }

    /**
     * Get all available currencies
     */
    getMajorCurrencies(): string[] {
        return SUPPORTED_CURRENCIES;
    }

    /**
     * Fetch and store rates for all supported currencies
     * Used by cron job to pre-populate database
     */
    async fetchAllRates(): Promise<void> {
        console.log('Fetching rates for all supported currencies...');
        
        // Fetch rates with USD as base (covers all supported currencies)
        await this.fetchAndStoreRates('USD');
        
        // Also fetch EUR as base for European users
        await this.fetchAndStoreRates('EUR');
        
        console.log('All currency rates fetched and stored successfully');
    }
}

export const currencyExchangeService = new CurrencyExchangeService();
