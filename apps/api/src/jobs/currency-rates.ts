import { currencyExchangeService } from '../services/currency-exchange-service';

// List of all major currencies to fetch
const ALL_CURRENCIES = [
    'USD', 'EUR', 'JPY', 'GBP', 'CNY', 'CHF', 'AUD', 'CAD', 
    'HKD', 'SGD', 'INR', 'KRW', 'SEK', 'MXN', 'NZD', 'BRL',
    'PLN', 'NOK', 'DKK', 'CZK', 'HUF', 'TRY', 'ZAR', 'THB'
];

/**
 * Fetch and cache exchange rates for all major currencies
 */
export async function fetchAllCurrencyRates() {
    console.log('🔄 Starting currency rates fetch job...');
    const startTime = Date.now();
    
    try {
        // Fetch rates for USD as base (most common)
        console.log('Fetching USD rates...');
        await currencyExchangeService.getExchangeRates('USD');
        
        // Also fetch EUR rates for European users
        console.log('Fetching EUR rates...');
        await currencyExchangeService.getExchangeRates('EUR');
        
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log(`✅ Currency rates fetch completed in ${duration}s`);
    } catch (error) {
        console.error('❌ Error fetching currency rates:', error);
        throw error;
    }
}

/**
 * Initialize currency rates cron job
 * Runs every 12 hours to fetch fresh rates
 */
export function startCurrencyRatesCron() {
    const TWELVE_HOURS = 12 * 60 * 60 * 1000; // 12 hours in milliseconds
    
    console.log('⏰ Starting currency rates cron job (every 12 hours)...');
    
    // Fetch immediately on startup
    fetchAllCurrencyRates().catch(error => {
        console.error('Initial currency fetch failed:', error);
    });
    
    // Then fetch every 12 hours
    setInterval(() => {
        fetchAllCurrencyRates().catch(error => {
            console.error('Scheduled currency fetch failed:', error);
        });
    }, TWELVE_HOURS);
    
    console.log('✅ Currency rates cron job initialized');
}
