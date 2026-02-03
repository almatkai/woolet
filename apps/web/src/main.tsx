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

// Clerk publishable key
const VITE_CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

if (!VITE_CLERK_PUBLISHABLE_KEY) {
    console.warn('Missing VITE_CLERK_PUBLISHABLE_KEY - Using demo mode');
}

// Initialize Error Tracking (GlitchTip)
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
                process.env.NODE_ENV === 'development' ||
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
                // Get auth token from Clerk if available
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

// Create router
const router = createRouter({
    routeTree,
    defaultPreload: 'intent',
    defaultPreloadDelay: 50,
    defaultPreloadStaleTime: 1000 * 60 * 5, // keep preloaded matches fresh for 5 minutes
});

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
        <ClerkProvider publishableKey={VITE_CLERK_PUBLISHABLE_KEY || 'pk_test_demo'}>
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
                                />
                            </PricingProvider>
                        </QueryClientProvider>
                    </trpc.Provider>
                </ThemeProvider>
            </PostHogProvider>
        </ClerkProvider>
    </React.StrictMode>
);

