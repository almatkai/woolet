import { router, publicProcedure } from '../lib/trpc';
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { newsService } from '../services/investing/news-service';
import { investingCache } from '../lib/investing-cache';

// Simple rate limiting for public endpoints
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 30;
const requestLog = new Map<string, number[]>();

function checkRateLimit(identifier: string): boolean {
    const now = Date.now();
    const requests = requestLog.get(identifier) || [];
    
    // Remove old requests outside the window
    const validRequests = requests.filter(time => now - time < RATE_LIMIT_WINDOW);
    
    if (validRequests.length >= MAX_REQUESTS_PER_WINDOW) {
        return false;
    }
    
    validRequests.push(now);
    requestLog.set(identifier, validRequests);
    return true;
}

export const newsRouter = router({
    getNewsByCategory: publicProcedure
        .input(z.object({
            category: z.enum(['latest', 'ai', 'oil', 'medical'])
        }))
        .query(async ({ ctx, input }) => {
            // Get identifier from userId or IP
            const identifier = ctx.userId || 'anonymous';
            
            if (!checkRateLimit(identifier)) {
                throw new TRPCError({
                    code: 'TOO_MANY_REQUESTS',
                    message: 'Rate limit exceeded. Please try again later.'
                });
            }
            
            return await newsService.getNewsByCategory(input.category);
        }),
});
