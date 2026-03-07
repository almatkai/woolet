import React, { useEffect } from 'react';
import posthog from 'posthog-js';
import { PostHogProvider as PHProvider } from 'posthog-js/react';
import { useAuth, useUser } from '@clerk/clerk-react';
import { useLocation } from '@tanstack/react-router';
import { trpc } from '@/lib/trpc';

const POSTHOG_KEY = import.meta.env.VITE_PUBLIC_POSTHOG_KEY;
const POSTHOG_HOST = import.meta.env.VITE_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com';
const POSTHOG_UI_HOST = import.meta.env.VITE_PUBLIC_POSTHOG_UI_HOST || 'https://us.posthog.com';

if (typeof window !== 'undefined' && POSTHOG_KEY) {
    posthog.init(POSTHOG_KEY, {
        api_host: POSTHOG_HOST,
        ui_host: POSTHOG_UI_HOST,
        person_profiles: 'identified_only',
        capture_pageview: false, // We'll handle this manually
        capture_exceptions: true,
    });
}

const AUTH_EXCLUDED_PATHS = ['/login', '/register', '/sso-callback'];
const ACTIVE_USER_MIN_DWELL_MS = 60_000;

function isTrackingEligiblePath(pathname: string) {
    return !AUTH_EXCLUDED_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

export function PostHogPageviewTracker() {
    const location = useLocation();
    const { isSignedIn } = useAuth();

    useEffect(() => {
        if (!posthog || !isSignedIn || !isTrackingEligiblePath(location.pathname)) {
            return;
        }

        posthog.capture('$pageview', {
            $current_url: window.location.href,
            is_authenticated: true,
            route_path: location.pathname,
        });
    }, [isSignedIn, location.pathname, location.search, location.hash]);

    useEffect(() => {
        if (!posthog || !isSignedIn || !isTrackingEligiblePath(location.pathname)) {
            return;
        }

        const enteredAt = new Date().toISOString();
        const timeout = window.setTimeout(() => {
            posthog.capture('authenticated_active_user', {
                route_path: location.pathname,
                route_search: location.search,
                dwell_time_seconds: ACTIVE_USER_MIN_DWELL_MS / 1000,
                entered_at: enteredAt,
                timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            });
        }, ACTIVE_USER_MIN_DWELL_MS);

        return () => window.clearTimeout(timeout);
    }, [isSignedIn, location.pathname, location.search]);

    return null;
}

export function PostHogUserIdentifier() {
    const { isSignedIn } = useAuth();
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

            const sessionStartKey = `ph-auth-session-started:${user.id}`;
            if (!sessionStorage.getItem(sessionStartKey)) {
                posthog.capture('authenticated_session_started', {
                    first_path: window.location.pathname,
                    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                    language: navigator.language,
                });

                // PostHog enriches this with geoip properties ($geoip_country_name, etc.)
                posthog.capture('authenticated_location_observed', {
                    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                    language: navigator.language,
                });

                sessionStorage.setItem(sessionStartKey, '1');
            }

            const pendingOauthFlow = sessionStorage.getItem('pending_oauth_auth_flow');
            if (pendingOauthFlow === 'sign_in') {
                posthog.capture('auth_signin_succeeded', { method: 'google_oauth' });
                sessionStorage.removeItem('pending_oauth_auth_flow');
            }
            if (pendingOauthFlow === 'sign_up') {
                posthog.capture('auth_signup_succeeded', { method: 'google_oauth' });
                sessionStorage.removeItem('pending_oauth_auth_flow');
            }
        } else if (!isSignedIn && posthog) {
            posthog.reset();
        }
    }, [isSignedIn, user, me]);

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
