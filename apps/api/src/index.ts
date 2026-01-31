import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { trpcServer } from '@hono/trpc-server';
import { clerkMiddleware } from '@hono/clerk-auth';

import { appRouter } from './routers';
import { createContext } from './lib/trpc';
import { rateLimitMiddleware } from './middleware/rate-limit';
import { startCurrencyRatesCron } from './jobs/currency-rates';

const app = new Hono();

// Global middleware
app.use('*', logger());
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
    console.error('❌ Application Error:', err);
    const isDev = process.env.NODE_ENV === 'development';
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
