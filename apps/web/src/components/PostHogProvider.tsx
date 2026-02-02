import React, { useEffect } from 'react';
import posthog from 'posthog-js';
import { PostHogProvider as PHProvider } from 'posthog-js/react';
import { useAuth, useUser } from '@clerk/clerk-react';
import { useLocation } from '@tanstack/react-router';
import { trpc } from '@/lib/trpc';

const POSTHOG_KEY = import.meta.env.VITE_PUBLIC_POSTHOG_KEY;
const POSTHOG_HOST = import.meta.env.VITE_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com';

if (typeof window !== 'undefined' && POSTHOG_KEY) {
    posthog.init(POSTHOG_KEY, {
        api_host: POSTHOG_HOST,
        person_profiles: 'identified_only',
        capture_pageview: false, // We'll handle this manually
    });
}

export function PostHogPageviewTracker() {
    const location = useLocation();

    useEffect(() => {
        if (posthog) {
            posthog.capture('$pageview', {
                $current_url: window.location.href,
            });
        }
    }, [location]);

    return null;
}

export function PostHogUserIdentifier() {
    const { user } = useUser();
    const { data: me } = trpc.user.me.useQuery(undefined, {
        enabled: !!user,
    });

    useEffect(() => {
        if (user && posthog) {
            const properties: Record<string, any> = {
                email: user.primaryEmailAddress?.emailAddress,
                fullName: user.fullName,
                username: user.username,
            };

            if (me) {
                properties.defaultCurrency = me.defaultCurrency;
                properties.testMode = me.testMode;
            }

            posthog.identify(user.id, properties);
        } else if (!user && posthog) {
            posthog.reset();
        }
    }, [user, me]);

    return null;
}

export function PostHogProvider({ children }: { children: React.ReactNode }) {
    if (!POSTHOG_KEY) return <>{children}</>;
    
    return (
        <PHProvider client={posthog}>
            {children}
        </PHProvider>
    );
}
