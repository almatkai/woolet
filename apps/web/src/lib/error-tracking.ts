import * as Sentry from '@sentry/react';

export const initErrorTracking = () => {
    const DSN = import.meta.env.VITE_GLITCHTIP_DSN_WEB;
    
    if (DSN) {
        Sentry.init({
            dsn: DSN,
            environment: import.meta.env.MODE,
            // Sentry v7 compatible - disable performance monitoring for GlitchTip
            tracesSampleRate: 0,
            beforeSend(event) {
                console.log('📤 Sending event to GlitchTip:', event.event_id);
                return event;
            },
        });
        console.log('✅ GlitchTip initialized for Web');
    } else {
        console.warn('⚠️ VITE_GLITCHTIP_DSN_WEB not found, error tracking disabled');
    }
};

export { Sentry as GlitchTip };
