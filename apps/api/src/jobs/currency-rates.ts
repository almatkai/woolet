import { currencyExchangeService } from '../services/currency-exchange-service';
import { GlitchTip } from '../lib/error-tracking';
import { redis } from '../lib/redis';

const FETCH_LOCK_KEY = 'currency:rates:fetch:lock';
const LAST_SUCCESS_KEY = 'currency:rates:last-success-ts';
const LOCK_TTL_SECONDS = 120;
const MIN_API_REFRESH_SECONDS = Number(process.env.CURRENCY_MIN_REFRESH_SECONDS || 60 * 60 * 6); // 6h default

async function shouldSkipExternalFetch(): Promise<boolean> {
    try {
        const lastSuccessTs = await redis.get(LAST_SUCCESS_KEY);
        if (!lastSuccessTs) return false;

        const elapsedSeconds = (Date.now() - Number(lastSuccessTs)) / 1000;
        if (elapsedSeconds < MIN_API_REFRESH_SECONDS) {
            const remainingMinutes = Math.ceil((MIN_API_REFRESH_SECONDS - elapsedSeconds) / 60);
            console.log(`⏭️  Skipping API fetch (fresh enough). Next fetch allowed in ~${remainingMinutes}m`);
            return true;
        }
    } catch (error) {
        // If Redis is unavailable, do not block the job.
        console.warn('⚠️  Could not read currency fetch freshness from Redis, proceeding with fetch.');
    }

    return false;
}

/**
 * Fetch and cache exchange rates from API (USD base only)
 * All other currencies are calculated from USD rates
 */
export async function fetchAllCurrencyRates() {
    console.log('🔄 Starting currency rates fetch job...');
    const startTime = Date.now();
    let lockAcquired = false;
    
    try {
        if (await shouldSkipExternalFetch()) {
            return;
        }

        try {
            const lockResult = await redis.set(FETCH_LOCK_KEY, String(Date.now()), 'EX', LOCK_TTL_SECONDS, 'NX');
            lockAcquired = lockResult === 'OK';
        } catch {
            console.warn('⚠️  Could not acquire currency fetch lock, proceeding without lock.');
            lockAcquired = true;
        }

        if (!lockAcquired) {
            console.log('⏭️  Currency fetch is already running in another worker. Skipping this run.');
            return;
        }

        if (await shouldSkipExternalFetch()) {
            return;
        }

        // Fetch USD rates from API and store in DB
        console.log('Fetching USD-based rates from API...');
        await currencyExchangeService.fetchAndStoreRates('USD');

        try {
            await redis.set(LAST_SUCCESS_KEY, String(Date.now()), 'EX', MIN_API_REFRESH_SECONDS * 4);
        } catch {
            // non-fatal
        }
        
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log(`✅ Currency rates fetch completed in ${duration}s`);
    } catch (error) {
        console.error('❌ Error fetching currency rates:', error);
        GlitchTip.captureException(error, { extra: { job: 'fetchAllCurrencyRates' } });
        throw error;
    } finally {
        if (lockAcquired) {
            await redis.del(FETCH_LOCK_KEY).catch(() => undefined);
        }
    }
}

/**
 * Initialize currency rates cron job
 * Runs every 30 minutes to fetch fresh rates
 */
export function startCurrencyRatesCron() {
    const POLL_INTERVAL_MS = 30 * 60 * 1000; // Keep scheduler frequent; fetch is throttled by MIN_API_REFRESH_SECONDS.
    
    console.log(`⏰ Starting currency rates cron job (poll every 30 minutes, API refresh min ${Math.floor(MIN_API_REFRESH_SECONDS / 60)} minutes)...`);
    
    // Fetch immediately on startup
    fetchAllCurrencyRates().catch(error => {
        console.error('Initial currency fetch failed:', error);
    });
    
    // Then fetch every 30 minutes
    setInterval(() => {
        fetchAllCurrencyRates().catch(error => {
            console.error('Scheduled currency fetch failed:', error);
        });
    }, POLL_INTERVAL_MS);
    
    console.log('✅ Currency rates cron job initialized');
}
