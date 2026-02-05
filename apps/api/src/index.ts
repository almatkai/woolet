import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger as honoLogger } from 'hono/logger';
import { secureHeaders } from 'hono/secure-headers';
import { trpcServer } from '@hono/trpc-server';
import { clerkMiddleware } from '@hono/clerk-auth';

import { appRouter } from './routers';
import { createContext } from './lib/trpc';
import { rateLimitMiddleware } from './middleware/rate-limit';
import { startCurrencyRatesCron } from './jobs/currency-rates';
import { logger } from './lib/logger';
import { initErrorTracking, GlitchTip } from './lib/error-tracking';
import { runMigrations } from './db/migrate';

// Initialize Error Tracking (GlitchTip)
initErrorTracking();

// Run migrations on startup
runMigrations().catch((err) => {
    logger.error('Startup migration failed', err);
});

const app = new Hono();

// Global middleware
app.use('*', honoLogger((str) => {
    logger.info(str);
}));
app.use('*', secureHeaders());
app.use('*', cors({
    origin: process.env.WEB_URL || 'http://localhost:3000',
    credentials: true,
}));

// Clerk auth middleware
app.use('*', clerkMiddleware());

// Rate limiting
app.use('/trpc/*', rateLimitMiddleware);

// Health check
app.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));

app.onError((err, c) => {
    logger.error({
        err,
        path: c.req.path,
        method: c.req.method,
    }, '❌ Application Error');
    
    // Capture exception in GlitchTip
    GlitchTip.captureException(err, {
        extra: {
            path: c.req.path,
            method: c.req.method,
        }
    });
    
    const isDev = process.env.NODE_ENV === 'development';

    if (isDev) {
        notifier.notify({
            title: 'Woolet API Error',
            message: `${c.req.method} ${c.req.path}: ${err.message}`,
            sound: 'Basso', // macOS specific sound
        });
    }

    return c.json({
        error: err.message,
        ...(isDev && { stack: err.stack })
    }, 500);
});

// tRPC handler
app.use('/trpc/*', trpcServer({
    router: appRouter,
    createContext,
}));

const port = parseInt(process.env.PORT || '3001');

// Start background jobs
startCurrencyRatesCron();

console.log(`🚀 API server running on http://localhost:${port}`);

export default {
    port,
    fetch: app.fetch,
};
