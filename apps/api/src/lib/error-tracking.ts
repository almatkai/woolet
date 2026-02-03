import * as Sentry from '@sentry/node';

export const initErrorTracking = () => {
    const DSN = process.env.GLITCHTIP_DSN_API;
    
    if (DSN) {
        Sentry.init({
            dsn: DSN,
            environment: process.env.NODE_ENV || 'development',
            // Sentry v7 compatible options
            tracesSampleRate: 0,
            beforeSend(event) {
                console.log('📤 Sending event to GlitchTip:', event.event_id);
                return event;
            },
        });
        console.log('✅ GlitchTip initialized for API with DSN:', DSN.replace(/\/\/.*@/, '//<key>@'));
    } else {
        console.warn('⚠️ GLITCHTIP_DSN_API not found, error tracking disabled');
    }
};

// Helper to flush events before process exits
export const flushEvents = async () => {
    await Sentry.close(2000);
};

export { Sentry as GlitchTip };
