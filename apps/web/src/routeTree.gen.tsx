import { createRootRoute, createRoute, Outlet, Link } from '@tanstack/react-router';
import { SignedIn, SignedOut, SignInButton, useAuth } from '@clerk/clerk-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { SidebarProvider, SidebarTrigger, SidebarInset } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/app-sidebar';
import { Separator } from '@/components/ui/separator';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import { Dashboard } from './routes/index';
import { AccountsPage } from './routes/accounts';
import { SpendingPage } from './routes/spending';
import { DebtsPage } from './routes/debts';
import { InvestingPage } from './routes/investing';
import { SettingsPage } from './routes/settings';
import CreditsPage from './routes/financial/credits';
import MortgagesPage from './routes/financial/mortgages';
import DepositsPage from './routes/financial/deposits';
import { SubscriptionsPage } from './routes/subscriptions';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Bitcoin, Moon, Sun, Eclipse, FlaskConical, AlertTriangle, Trash2 } from 'lucide-react';
import { useTheme } from '@/components/theme-provider';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { trpc } from '@/lib/trpc';
import { DeleteConfirm } from '@/components/DeleteConfirm';
import { toast } from 'sonner';
import { useNavigate } from '@tanstack/react-router';

// Root layout with sidebar
function RootLayout() {
    const { isSignedIn } = useAuth();

    return (
        <SidebarProvider>
            <SignedIn>
                <AppSidebar />
            </SignedIn>
            <SidebarInset className={!isSignedIn ? "!m-0 !rounded-none !border-0 !shadow-none bg-background" : ""}>
                <SignedIn>
                    <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
                        <SidebarTrigger className="-ml-1" />
                        <Separator orientation="vertical" className="mr-2 h-4" />
                        <div className="flex flex-1 items-center justify-between">
                            <DateRangePicker />
                        </div>
                    </header>
                </SignedIn>
                <main className={cn("flex-1", isSignedIn ? "p-6" : "p-0")}>
                    <Outlet />
                </main>
            </SidebarInset>
        </SidebarProvider>
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

export const settingsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/settings',
    component: SettingsPage,
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
    comingSoonCryptoRoute,
    settingsRoute,
]);
