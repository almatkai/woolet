import type { Context, Next } from 'hono';
import { getAuth } from '@hono/clerk-auth';

export const requireAuth = async (c: Context, next: Next) => {
    const auth = getAuth(c);

    if (!auth?.userId) {
        return c.json({ error: 'Unauthorized' }, 401);
    }

    c.set('userId', auth.userId);
    await next();
};
