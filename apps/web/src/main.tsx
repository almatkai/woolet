import React from 'react';
import ReactDOM from 'react-dom/client';
import { ClerkProvider } from '@clerk/clerk-react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createRouter } from '@tanstack/react-router';
import { httpBatchLink, loggerLink } from '@trpc/client';
import { Toaster } from 'sonner';
import { trpc } from './lib/trpc';
import { routeTree } from './routeTree.gen';
import './index.css';
import superjson from 'superjson';
import { ThemeProvider } from './components/theme-provider';
import { PostHogProvider } from './components/PostHogProvider';
import { PricingProvider } from './components/PricingProvider';
import { initErrorTracking, GlitchTip } from './lib/error-tracking';

// Test
// Clerk publishable key
const VITE_CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
if (!VITE_CLERK_PUBLISHABLE_KEY) {
    console.warn('Missing VITE_CLERK_PUBLISHABLE_KEY - Using demo mode');
}

if (import.meta.env.PROD && VITE_CLERK_PUBLISHABLE_KEY?.startsWith('pk_test_')) {
    console.error(
        'Clerk production domain is running with a test publishable key. Use a Clerk production/live instance for stable HTTPS auth on custom domains.'
    );
}

// Initialize Error Tracking (PostHog)
initErrorTracking();

// Create query client
const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 1000 * 60, // 1 minute
            retry: 1,
            onError: (err: any) => {
                GlitchTip.captureException(err);
            },
        },
        mutations: {
            onError: (err: any) => {
                GlitchTip.captureException(err);
            },
        },
    },
});

// Create tRPC client
const trpcClient = trpc.createClient({
    transformer: superjson,
    links: [
        loggerLink({
            enabled: (opts) =>
                import.meta.env.DEV ||
                (opts.direction === 'down' && opts.result instanceof Error),
            logger: (opts) => {
                if (opts.direction === 'down' && opts.result instanceof Error) {
                    GlitchTip.captureException(opts.result);
                }
            },
        }),
        httpBatchLink({
            url: '/trpc',
            async headers() {
                try {
                    const token = await window.Clerk?.session?.getToken();
                    return token ? { Authorization: `Bearer ${token}` } : {};
                } catch {
                    return {};
                }
            },
        }),
    ],
});

// Remove old Workbox app shell workers that can keep serving stale bundles.
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        void (async () => {
            let removedLegacyWorker = false;
            const registrations = await navigator.serviceWorker.getRegistrations();
            for (const registration of registrations) {
                const urls = [
                    registration.active?.scriptURL,
                    registration.waiting?.scriptURL,
                    registration.installing?.scriptURL,
                ].filter((value): value is string => Boolean(value));

                const hasPushWorker = urls.some((url) => url.endsWith('/push-sw.js'));
                if (!hasPushWorker) {
                    removedLegacyWorker = true;
                    await registration.unregister();
                }
            }

            if ('caches' in window) {
                const cacheKeys = await caches.keys();
                await Promise.all(
                    cacheKeys
                        .filter((key) => key.includes('workbox') || key.includes('precache'))
                        .map((key) => caches.delete(key))
                );
            }

            // Force a single refresh after unregistering legacy workers so the page reboots cleanly.
            const reloadFlag = 'sw-migration-reloaded-once';
            if (removedLegacyWorker && !sessionStorage.getItem(reloadFlag)) {
                sessionStorage.setItem(reloadFlag, '1');
                window.location.reload();
            }
        })();
    });
}

// Create router
const router = createRouter({
    routeTree,
    defaultPreload: 'intent',
    defaultPreloadDelay: 50,
    defaultPreloadStaleTime: 1000 * 60 * 5,
});

// Add message listener for service worker navigation
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'NAVIGATE') {
            const url = new URL(event.data.url, window.location.origin);
            const path = url.pathname + url.search + url.hash;
            router.navigate({ to: path });
        }
    });
}

// Type declaration for router
declare module '@tanstack/react-router' {
    interface Register {
        router: typeof router;
    }
}

// Extend window for Clerk types
declare global {
    interface Window {
        Clerk?: {
            session?: {
                getToken: () => Promise<string | null>;
            };
        };
    }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <ClerkProvider
            publishableKey={VITE_CLERK_PUBLISHABLE_KEY || 'pk_test_demo'}
        >
            <PostHogProvider>
                <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
                    <trpc.Provider client={trpcClient} queryClient={queryClient}>
                        <QueryClientProvider client={queryClient}>
                            <PricingProvider>
                                <RouterProvider router={router} />
                                <Toaster
                                    position="bottom-right"
                                    richColors
                                    closeButton
                                    duration={5000}
                                    offset={{ right: '24px', bottom: 'var(--toast-bottom-offset, 24px)' }}
                                    toastOptions={{
                                        className: 'max-[600px]:!top-4 max-[600px]:!right-4 max-[600px]:!bottom-auto max-[600px]:!left-auto max-[600px]:!fixed max-[600px]:!w-auto max-[600px]:!min-w-[200px]',
                                    }}
                                />
                            </PricingProvider>
                        </QueryClientProvider>
                    </trpc.Provider>
                </ThemeProvider>
            </PostHogProvider>
        </ClerkProvider>
    </React.StrictMode>
);
