import type { Context, Next } from 'hono';
import { redis } from '../lib/redis';

const WINDOW_SIZE_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS = 100;

export const rateLimitMiddleware = async (c: Context, next: Next) => {
    const userId = c.get('userId');
    const ip = c.req.header('x-forwarded-for')?.split(',')[0].trim() || c.req.header('x-real-ip') || 'anonymous';
    const identifier = userId ? `user:${userId}` : `ip:${ip}`;
    const key = `ratelimit:${identifier}`;
    const now = Date.now();

    try {
        // Remove old entries and count current window
        await redis.zremrangebyscore(key, 0, now - WINDOW_SIZE_MS);
        const count = await redis.zcard(key);

        c.header('X-RateLimit-Limit', MAX_REQUESTS.toString());
        c.header('X-RateLimit-Remaining', Math.max(0, MAX_REQUESTS - count - 1).toString());
        c.header('X-RateLimit-Reset', Math.ceil((now + WINDOW_SIZE_MS) / 1000).toString());

        if (count >= MAX_REQUESTS) {
            console.warn(`Rate limit exceeded for ${identifier}`);
            return c.json({ 
                error: 'Too Many Requests',
                message: 'You have exceeded the rate limit. Please try again later.'
            }, 429);
        }

        // Add current request
        await redis.zadd(key, now, `${now}:${Math.random()}`);
        await redis.expire(key, 60);

        await next();
    } catch (error) {
        // If Redis fails, reject the request to fail closed
        console.error('Rate limiting error:', error);
        return c.json({ error: 'Service temporarily unavailable' }, 503);
    }
};
