# AI Usage Tracking - Implementation Guide

## Overview

This guide explains how to implement real AI usage tracking in production based on the test suite we created.

## Database Schema

### Table: `ai_usage`
Tracks AI question usage per user with daily and lifetime counters.

```sql
CREATE TABLE ai_usage (
    id UUID PRIMARY KEY,
    user_id TEXT REFERENCES users(id),
    question_count_today INTEGER,
    question_count_lifetime INTEGER,
    last_reset_date DATE,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);
```

## Service Implementation

### `AIUsageService` (`src/services/ai-usage-service.ts`)

Main service for checking and tracking AI usage:

```typescript
// Before making an AI call
await aiUsageService.checkAndIncrementUsage(userId, userTier);

// This will:
// 1. Check if user is within their tier limits
// 2. Increment usage counters if allowed
// 3. Throw TRPCError if limit reached
```

### Integration with AI Router

Update `/src/routers/ai.ts`:

```typescript
import { aiUsageService } from '../services/ai-usage-service';

export const aiRouter = router({
    chat: protectedProcedure
        .input(z.object({
            message: z.string(),
            sessionId: z.string().uuid().optional(),
        }))
        .mutation(async ({ ctx, input }) => {
            // CHECK USAGE FIRST (before calling AI)
            await aiUsageService.checkAndIncrementUsage(
                ctx.userId!,
                ctx.user.subscriptionTier || 'free'
            );

            // Now proceed with AI call
            const response = await createChatCompletionWithFallback({
                messages: [...],
                model: MODEL_FLASH,
            });

            // If AI call fails, you might want to decrement counter
            // (implement rollback logic if needed)

            return response;
        }),

    // Get user's AI usage stats
    getAIUsage: protectedProcedure
        .query(async ({ ctx }) => {
            return await aiUsageService.getUsage(
                ctx.userId!,
                ctx.user.subscriptionTier || 'free'
            );
        }),

    // AI Market Digest - check tier feature access
    getDailyDigest: protectedProcedure
        .query(async ({ ctx }) => {
            const userTier = ctx.user.subscriptionTier || 'free';
            const limits = TIER_LIMITS[userTier];

            if (!limits.hasAiMarketDigest) {
                throw new TRPCError({
                    code: 'FORBIDDEN',
                    message: 'AI Market Digest is a Pro/Premium feature. Upgrade to access!'
                });
            }

            const digestLength = limits.aiDigestLength; // 'short' or 'complete'
            return await digestService.generateDailyDigest(
                ctx.userId!,
                digestLength
            );
        }),
});
```

## Daily Counter Reset

### Option 1: Cron Job (Recommended)

Create a cron job that runs daily at midnight:

```typescript
// src/jobs/reset-ai-counters.ts
import { aiUsageService } from '../services/ai-usage-service';

export async function resetAICountersJob() {
    try {
        await aiUsageService.resetDailyCounters();
        console.log('✅ Daily AI counters reset successfully');
    } catch (error) {
        console.error('❌ Failed to reset AI counters:', error);
    }
}

// In your main server file or scheduler
import { CronJob } from 'cron';

const job = new CronJob('0 0 * * *', resetAICountersJob); // Every day at midnight
job.start();
```

### Option 2: Database Trigger (Already Included)

The migration includes a PostgreSQL trigger that auto-resets counters on update.

## Frontend Integration

### Display Usage to Users

```typescript
// In your React component
const { data: usage } = trpc.ai.getAIUsage.useQuery();

return (
    <div className="ai-usage-widget">
        <h3>Woo AI Questions</h3>
        
        {usage.dailyLimit !== 'unlimited' && (
            <div>
                <p>Today: {usage.daily} / {usage.dailyLimit}</p>
                <p>Remaining: {usage.remainingToday}</p>
            </div>
        )}
        
        {usage.lifetimeLimit !== 'unlimited' && (
            <div>
                <p>Lifetime: {usage.lifetime} / {usage.lifetimeLimit}</p>
                <p>Remaining: {usage.remainingLifetime}</p>
            </div>
        )}
        
        {usage.remainingToday === 0 && (
            <div className="upgrade-prompt">
                <p>Daily limit reached!</p>
                <Button onClick={() => navigate('/pricing')}>
                    Upgrade to Premium for 20 questions/day
                </Button>
            </div>
        )}
    </div>
);
```

### Warning Before Limit

```typescript
const { mutate: askAI, isLoading } = trpc.ai.chat.useMutation({
    onError: (error) => {
        if (error.data?.code === 'FORBIDDEN') {
            // Show upgrade modal
            showUpgradeModal(error.message);
        }
    }
});

// Warn when approaching limit
if (usage.remainingToday === 1) {
    return (
        <Alert>
            ⚠️ You have 1 AI question remaining today. 
            Upgrade to Pro for 5 questions per day!
        </Alert>
    );
}
```

## Error Handling

### User-Friendly Error Messages

```typescript
try {
    await askAI({ message: userQuestion });
} catch (error) {
    if (error.code === 'FORBIDDEN') {
        // Tier-specific messages
        if (userTier === 'free') {
            showModal({
                title: "Free AI Questions Used Up",
                message: "You've used all 3 free AI questions. Upgrade to Pro for 5 questions per day!",
                cta: "Upgrade to Pro ($8/month)"
            });
        } else if (userTier === 'pro') {
            showModal({
                title: "Daily Limit Reached",
                message: "You've used all 5 questions today. Try again tomorrow or upgrade to Premium for 20/day!",
                cta: "Upgrade to Premium ($20/month)"
            });
        }
    }
}
```

## Testing in Production

### Manual Testing Steps

1. **Free User:**
   - Ask 3 questions → should work
   - Ask 4th question → should be blocked with upgrade message

2. **Pro User:**
   - Ask 5 questions in one day → should work
   - Ask 6th question → should be blocked
   - Wait until next day → counter should reset → 5 more questions available

3. **Premium User:**
   - Ask 20 questions in one day → should work
   - Ask 21st question → should be blocked
   - Counter resets next day

### Monitoring

```typescript
// Add logging to track usage patterns
console.log(`AI Question: User ${userId} (${tier}) - ${daily}/${dailyLimit} today, ${lifetime} lifetime`);

// Track in analytics
analytics.track('AI_Question_Asked', {
    userId,
    tier,
    dailyCount: daily,
    lifetimeCount: lifetime,
    remainingToday,
});
```

## Rollback Strategy

If an AI call fails after incrementing counter:

```typescript
async function askAIWithRollback(userId: string, tier: string, message: string) {
    // Increment counter
    await aiUsageService.checkAndIncrementUsage(userId, tier);
    
    try {
        // Call AI
        const response = await createChatCompletion(message);
        return response;
    } catch (error) {
        // Rollback counter on failure
        await db.update(aiUsage)
            .set({
                questionCountToday: sql`question_count_today - 1`,
                questionCountLifetime: sql`question_count_lifetime - 1`
            })
            .where(eq(aiUsage.userId, userId));
        
        throw error;
    }
}
```

## Performance Considerations

1. **Cache usage data** in Redis for 1 minute to reduce DB queries
2. **Batch reset job** - reset all users at once at midnight
3. **Index on user_id** - already included in migration
4. **Index on last_reset_date** - helps with bulk reset queries

## Security Notes

1. **Always check tier on backend** - never trust frontend
2. **Validate user owns the session** - prevent usage spoofing
3. **Rate limit the endpoint** - prevent abuse even within limits
4. **Log suspicious activity** - track users hitting limits repeatedly

## Summary

✅ Database schema created  
✅ Service implementation ready  
✅ Router integration guide provided  
✅ Frontend examples included  
✅ Cron job setup documented  
✅ Error handling patterns defined  
✅ Testing strategy outlined

**All you need to do:**
1. Run the migration
2. Add `aiUsageService.checkAndIncrementUsage()` before AI calls
3. Set up daily cron job
4. Add usage display to frontend
5. Test with different tiers

The system is production-ready! 🚀
