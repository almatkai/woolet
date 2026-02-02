import posthog from 'posthog-js';

const POSTHOG_KEY = import.meta.env.VITE_PUBLIC_POSTHOG_KEY;
const POSTHOG_HOST = import.meta.env.VITE_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com';

export const initPostHog = () => {
    if (typeof window !== 'undefined' && POSTHOG_KEY) {
        posthog.init(POSTHOG_KEY, {
            api_host: POSTHOG_HOST,
            person_profiles: 'identified_only', // or 'always' if you want to create profiles for anonymous users as well
            capture_pageview: false, // We'll handle this manually with TanStack Router
        });
    }
    return posthog;
};

export { posthog };
