import { PostHog } from 'posthog-node';

type CaptureContext = {
    tags?: Record<string, unknown>;
    extra?: Record<string, unknown>;
    level?: string;
    [key: string]: unknown;
};

let posthogClient: PostHog | null = null;
let currentDistinctId: string | undefined;

function normalizeContext(context?: CaptureContext): Record<string, unknown> {
    if (!context) return {};

    const { tags, extra, level, ...rest } = context;
    return {
        ...(tags ? { tags } : {}),
        ...(extra ? extra : {}),
        ...(level ? { level } : {}),
        ...rest,
    };
}

export const initErrorTracking = () => {
    const apiKey = process.env.VITE_PUBLIC_POSTHOG_KEY || process.env.POSTHOG_API_KEY;
    const host = process.env.POSTHOG_HOST || process.env.VITE_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com';

    if (!apiKey) {
        console.warn('⚠️ POSTHOG_API_KEY not found, API error tracking disabled');
        return;
    }

    posthogClient = new PostHog(apiKey, {
        host,
        flushAt: 1,
        flushInterval: 5000,
        enableExceptionAutocapture: true,
    });

    console.log('✅ PostHog initialized for API error tracking');
};

export const GlitchTip = {
    captureException(error: unknown, context?: CaptureContext) {
        if (!posthogClient) return;
        posthogClient.captureException(error, currentDistinctId, normalizeContext(context));
    },
    captureMessage(message: string, context?: CaptureContext) {
        if (!posthogClient) return;
        posthogClient.capture({
            distinctId: currentDistinctId,
            event: 'server_log_message',
            properties: {
                message,
                ...normalizeContext(context),
            },
        });
    },
    setUser(user: { id?: string } | null) {
        currentDistinctId = user?.id;
        if (!posthogClient || !user?.id) return;

        posthogClient.identify({
            distinctId: user.id,
            properties: {
                api_last_seen_at: new Date().toISOString(),
            },
        });
    },
};

// Helper to flush events before process exits
export const flushEvents = async () => {
    if (!posthogClient) return;
    await posthogClient.flush();
};
