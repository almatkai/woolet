import posthog from 'posthog-js';

export const initErrorTracking = () => {
    if (!import.meta.env.VITE_PUBLIC_POSTHOG_KEY) {
        console.warn('⚠️ VITE_PUBLIC_POSTHOG_KEY not found, PostHog error tracking disabled');
        return;
    }

    // PostHog is initialized in PostHogProvider; this only documents intent.
    console.log('✅ PostHog error tracking enabled for Web');
};

type CaptureContext = {
    tags?: Record<string, unknown>;
    extra?: Record<string, unknown>;
    level?: string;
};

function flattenCaptureContext(context?: CaptureContext) {
    if (!context) return {};

    return {
        ...(context.tags ? { tags: context.tags } : {}),
        ...(context.extra ? context.extra : {}),
        ...(context.level ? { level: context.level } : {}),
    };
}

export const GlitchTip = {
    captureException(error: unknown, context?: CaptureContext) {
        posthog.captureException(error, flattenCaptureContext(context));
    },
    setUser(user: { id?: string; email?: string; username?: string } | null) {
        if (!user) {
            posthog.unregister('error_tracking_user_id');
            return;
        }

        posthog.register({ error_tracking_user_id: user.id });
        posthog.setPersonProperties({
            ...(user.email ? { email: user.email } : {}),
            ...(user.username ? { username: user.username } : {}),
        });
    },
    captureMessage(message: string, context?: CaptureContext) {
        posthog.capture('client_log_message', {
            message,
            ...flattenCaptureContext(context),
        });
    },
};
