import { createRootRoute, createRoute, Outlet, useLocation } from '@tanstack/react-router';
import { SignedIn, useAuth } from '@clerk/clerk-react';
import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { SidebarProvider, SidebarTrigger, SidebarInset } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/app-sidebar';
import { AiChatFloatingItem } from '@/components/AiChatWidget';
import { Separator } from '@/components/ui/separator';

// Routes
import { Dashboard } from './routes/index';
import { AccountsPage } from './routes/accounts';
import { SpendingPage } from './routes/spending';
import { DebtsPage } from './routes/debts';
import { InvestingPage } from './routes/investing';
import CreditsPage from './routes/financial/credits';
import MortgagesPage from './routes/financial/mortgages';
import DepositsPage from './routes/financial/deposits';
import { SubscriptionsPage } from './routes/subscriptions';
import { LoginPage } from './routes/login';
import { RegisterPage } from './routes/register';
import { SSOCallbackPage } from './routes/sso-callback';
import { PricingPage } from './routes/pricing';
import AdminRoute from './routes/admin';
// AccountPage no longer used as a route - now shown in dialog
import { SettingsPage } from './routes/settings';
import { NotificationsPage } from './routes/notifications';

// Layouts
import { SettingsLayout } from '@/components/SettingsLayout';

import { Bitcoin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PostHogPageviewTracker, PostHogUserIdentifier } from './components/PostHogProvider';

// Root layout with sidebar
function RootLayout() {
    const { isSignedIn } = useAuth();
    const location = useLocation();
    const isSettingsRoute = location.pathname.startsWith('/settings');
    const isAuthRoute = location.pathname.startsWith('/login')
        || location.pathname.startsWith('/register')
        || location.pathname.startsWith('/sso-callback');
    const isAdminRoute = location.pathname.startsWith('/admin');

    // Admin route should have minimal layout
    if (isAdminRoute) {
        return (
            <>
                <PostHogUserIdentifier />
                <PostHogPageviewTracker />
                <main className="h-full overflow-y-auto p-0">
                    <Outlet />
                </main>
            </>
        );
    }

    return (
        <>
            <PostHogUserIdentifier />
            <PostHogPageviewTracker />
            <SidebarProvider>
                <SignedIn>
                    {!isAuthRoute && <AppSidebar />}
                </SignedIn>
                <SidebarInset className={!isSignedIn || isAuthRoute ? "!m-0 !rounded-none !border-0 !shadow-none bg-background" : ""}>
                    <SignedIn>
                        {!isAuthRoute && (
                            <header className={cn(
                                "sticky top-0 z-40 flex h-16 shrink-0 items-center gap-2 border-b bg-background px-4"
                            )}>
                                <SidebarTrigger className="-ml-1" />
                                <Separator orientation="vertical" className="hidden sm:block mr-2 h-4" />
                            </header>
                        )}
                    </SignedIn>
                    <main className={cn("flex-1 w-full overflow-y-auto overflow-x-hidden", isSignedIn && !isSettingsRoute && !isAuthRoute ? "p-3 md:p-6" : "p-0")}>
                        <Outlet />
                    </main>
                </SidebarInset>
            </SidebarProvider>

            <SignedIn>
                {!isAuthRoute && (
                    <AiChatFloatingItem variant="mobile" />
                )}
            </SignedIn>
        </>
    );
}

// Coming Soon Pages
function ComingSoonCrypto() {
    return (
        <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-orange-500 to-yellow-500">
                <Bitcoin className="h-10 w-10 text-white" />
            </div>
            <h1 className="text-3xl font-bold mb-4">Crypto Coming Soon</h1>
            <p className="text-muted-foreground mb-8 max-w-md">
                Track your cryptocurrency holdings across multiple wallets and exchanges.
            </p>
            <Button variant="outline" disabled>
                Notify Me When Available
            </Button>
        </div>
    );
}

// Define routes
export const rootRoute = createRootRoute({
    component: RootLayout,
});

export const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: Dashboard,
});

export const accountsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/accounts',
    component: AccountsPage,
});

export const spendingRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/spending',
    component: SpendingPage,
});

export const debtsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/debts',
    component: DebtsPage,
});

export const creditsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/financial/credits',
    component: CreditsPage,
});

export const mortgagesRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/financial/mortgages',
    component: MortgagesPage,
});

export const depositsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/financial/deposits',
    component: DepositsPage,
});

export const investingRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/investing',
    component: InvestingPage,
});

export const subscriptionsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/subscriptions',
    component: SubscriptionsPage,
});

export const comingSoonCryptoRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/coming-soon/crypto',
    component: ComingSoonCrypto,
});

// Settings Layout and its children
export const settingsLayoutRoute = createRoute({
    getParentRoute: () => rootRoute,
    id: 'settings-layout',
    component: SettingsLayout,
});

// Account route removed - Account is now accessed via dialog from sidebar

export const settingsRoute = createRoute({
    getParentRoute: () => settingsLayoutRoute,
    path: '/settings',
    component: SettingsPage,
});

export const loginRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/login',
    component: LoginPage,
});

export const registerRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/register',
    component: RegisterPage,
});

export const ssoCallbackRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/sso-callback',
    component: SSOCallbackPage,
});

export const pricingRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/pricing',
    component: PricingPage,
});

export const adminRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/admin',
    component: AdminRoute,
});

export const notificationsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/notifications',
    component: NotificationsPage,
});

// Route tree
export const routeTree = rootRoute.addChildren([
    indexRoute,
    accountsRoute,
    spendingRoute,
    debtsRoute,
    investingRoute,
    creditsRoute,
    mortgagesRoute,
    depositsRoute,
    subscriptionsRoute,
    notificationsRoute,
    settingsLayoutRoute.addChildren([
        settingsRoute,
    ]),
    loginRoute,
    registerRoute,
    ssoCallbackRoute,
    pricingRoute,
    adminRoute,
]);
