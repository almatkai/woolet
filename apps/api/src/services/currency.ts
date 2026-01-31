import { cache, CACHE_KEYS, CACHE_TTL } from '../lib/redis';

const EXCHANGE_API_URL = 'https://api.exchangerate-api.com/v4/latest';

interface ExchangeRates {
    base: string;
    rates: Record<string, number>;
    date: string;
}

export class CurrencyService {
    static async getRate(from: string, to: string): Promise<number> {
        if (from === to) return 1;

        const cacheKey = CACHE_KEYS.exchangeRate(from, to);

        // Check cache first
        const cached = await cache.get<number>(cacheKey);
        if (cached !== null) {
            return cached;
        }

        try {
            // Fetch from API
            const response = await fetch(`${EXCHANGE_API_URL}/${from}`);
            if (!response.ok) {
                throw new Error(`Exchange rate API error: ${response.status}`);
            }

            const data = await response.json() as ExchangeRates;
            const rate = data.rates[to];

            if (!rate) {
                throw new Error(`Exchange rate not found for ${from} -> ${to}`);
            }

            // Cache the rate
            await cache.set(cacheKey, rate, CACHE_TTL.exchangeRate);

            return rate;
        } catch (error) {
            console.error('Currency conversion error:', error);
            throw error;
        }
    }

    static async convert(amount: number, from: string, to: string): Promise<{
        convertedAmount: number;
        rate: number;
    }> {
        const rate = await this.getRate(from, to);
        return {
            convertedAmount: Number((amount * rate).toFixed(2)),
            rate,
        };
    }

    // Get display info for a currency
    static getCurrencySymbol(currency: string): string {
        const symbols: Record<string, string> = {
            USD: '$',
            EUR: '€',
            GBP: '£',
            JPY: '¥',
            KZT: '₸',
            RUB: '₽',
            CNY: '¥',
            INR: '₹',
            BTC: '₿',
        };
        return symbols[currency] || currency;
    }
}
