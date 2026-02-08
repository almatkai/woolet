import { currencyExchangeService } from '../services/currency-exchange-service';
import { GlitchTip } from '../lib/error-tracking';

// List of all major currencies to fetch
const ALL_CURRENCIES = [
    'USD', 'EUR', 'JPY', 'GBP', 'CNY', 'CHF', 'AUD', 'CAD', 
    'HKD', 'SGD', 'INR', 'KRW', 'SEK', 'MXN', 'NZD', 'BRL',
    'PLN', 'NOK', 'DKK', 'CZK', 'HUF', 'TRY', 'ZAR', 'THB'
];

/**
 * Fetch and cache exchange rates from API (USD base only)
 * All other currencies are calculated from USD rates
 */
export async function fetchAllCurrencyRates() {
    console.log('🔄 Starting currency rates fetch job...');
    const startTime = Date.now();
    
    try {
        // Fetch USD rates from API and store in DB
        console.log('Fetching USD-based rates from API...');
        await currencyExchangeService.fetchAndStoreRates('USD');
        
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log(`✅ Currency rates fetch completed in ${duration}s`);
    } catch (error) {
        console.error('❌ Error fetching currency rates:', error);
        GlitchTip.captureException(error, { extra: { job: 'fetchAllCurrencyRates' } });
        throw error;
    }
}

/**
 * Initialize currency rates cron job
 * Runs every 30 minutes to fetch fresh rates
 */
export function startCurrencyRatesCron() {
    const THIRTY_MINUTES = 30 * 60 * 1000; // 30 minutes in milliseconds
    
    console.log('⏰ Starting currency rates cron job (every 30 minutes)...');
    
    // Fetch immediately on startup
    fetchAllCurrencyRates().catch(error => {
        console.error('Initial currency fetch failed:', error);
    });
    
    // Then fetch every 30 minutes
    setInterval(() => {
        fetchAllCurrencyRates().catch(error => {
            console.error('Scheduled currency fetch failed:', error);
        });
    }, THIRTY_MINUTES);
    
    console.log('✅ Currency rates cron job initialized');
}
