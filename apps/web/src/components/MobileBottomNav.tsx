'use client';

import { useState } from 'react';
import { Link, useRouterState } from '@tanstack/react-router';
import {
    LayoutDashboard,
    CalendarClock,
    Plus,
    TrendingUp,
    MoreHorizontal,
    Wallet,
    Receipt,
    Users,
    CreditCard,
    Home,
    PiggyBank,
    Settings,
    X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { UniversalAddSheet } from '@/components/UniversalAddSheet';
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
} from '@/components/ui/sheet';

const primaryTabs = [
    { title: 'Dashboard', url: '/', icon: LayoutDashboard },
    { title: 'Subscriptions', url: '/subscriptions', icon: CalendarClock },
    { title: 'Investing', url: '/investing', icon: TrendingUp },
];

const moreItems = [
    { title: 'Accounts', url: '/accounts', icon: Wallet },
    { title: 'Spending', url: '/spending', icon: Receipt },
    { title: 'Debts', url: '/debts', icon: Users },
    { title: 'Credits', url: '/financial/credits', icon: CreditCard },
    { title: 'Mortgages', url: '/financial/mortgages', icon: Home },
    { title: 'Deposits', url: '/financial/deposits', icon: PiggyBank },
    { title: 'Settings', url: '/settings', icon: Settings },
];

export function MobileBottomNav() {
    const router = useRouterState();
    const currentPath = router.location.pathname;
    const [addOpen, setAddOpen] = useState(false);
    const [moreOpen, setMoreOpen] = useState(false);

    const isActive = (url: string) => {
        if (url === '/') return currentPath === '/';
        return currentPath.startsWith(url);
    };

    const isMoreActive = moreItems.some((item) => isActive(item.url));

    return (
        <>
            <UniversalAddSheet open={addOpen} onOpenChange={setAddOpen} />

            {/* More Sheet */}
            <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
                <SheetContent
                    side="bottom"
                    showClose={false}
                    className="rounded-t-2xl pb-[env(safe-area-inset-bottom)] max-h-[70vh]"
                >
                    <SheetHeader className="pb-4">
                        <div className="flex items-center justify-between">
                            <SheetTitle className="text-base font-semibold">More</SheetTitle>
                            <button
                                onClick={() => setMoreOpen(false)}
                                className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-muted-foreground hover:text-foreground transition-colors"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                    </SheetHeader>
                    <div className="grid grid-cols-4 gap-1 pb-4">
                        {moreItems.map((item) => (
                            <Link
                                key={item.title}
                                to={item.url}
                                onClick={() => setMoreOpen(false)}
                                className={cn(
                                    'flex flex-col items-center gap-1.5 rounded-xl p-3 transition-colors',
                                    isActive(item.url)
                                        ? 'bg-primary/10 text-primary'
                                        : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                                )}
                            >
                                <div
                                    className={cn(
                                        'flex h-10 w-10 items-center justify-center rounded-xl',
                                        isActive(item.url) ? 'bg-primary/15' : 'bg-muted'
                                    )}
                                >
                                    <item.icon className="h-5 w-5" />
                                </div>
                                <span className="text-[10px] font-medium leading-tight text-center">
                                    {item.title}
                                </span>
                            </Link>
                        ))}
                    </div>
                </SheetContent>
            </Sheet>

            {/* Bottom Nav Bar — only visible at ≤470px */}
            <nav
                className={cn(
                    'hidden max-[470px]:flex',
                    'fixed bottom-0 left-0 right-0 z-50',
                    'border-t bg-background/95 backdrop-blur-md',
                    'pb-[env(safe-area-inset-bottom)]'
                )}
            >
                <div className="flex w-full items-end justify-around px-2 pt-2 pb-2">
                    {/* Dashboard */}
                    <NavTab
                        title="Dashboard"
                        url="/"
                        icon={LayoutDashboard}
                        active={isActive('/')}
                    />

                    {/* Subscriptions */}
                    <NavTab
                        title="Subs"
                        url="/subscriptions"
                        icon={CalendarClock}
                        active={isActive('/subscriptions')}
                    />

                    {/* Center FAB */}
                    <div className="flex flex-col items-center -mt-6">
                        <button
                            onClick={() => setAddOpen(true)}
                            className={cn(
                                'flex h-14 w-14 items-center justify-center rounded-full',
                                'bg-primary text-primary-foreground',
                                'shadow-[0_4px_20px_0px] shadow-primary/50',
                                'transition-all duration-150 active:scale-90 hover:scale-105',
                                'ring-[3px] ring-background'
                            )}
                            aria-label="Add"
                        >
                            <Plus className="h-6 w-6" strokeWidth={2.5} />
                        </button>
                        <span className="mt-1.5 text-[10px] font-medium text-primary">Add</span>
                    </div>

                    {/* Investing */}
                    <NavTab
                        title="Investing"
                        url="/investing"
                        icon={TrendingUp}
                        active={isActive('/investing')}
                    />

                    {/* More */}
                    <button
                        onClick={() => setMoreOpen(true)}
                        className={cn(
                            'flex flex-col items-center gap-1 pb-0.5 min-w-[48px] transition-colors',
                            isMoreActive ? 'text-primary' : 'text-muted-foreground'
                        )}
                    >
                        <MoreHorizontal className="h-5 w-5" />
                        <span className="text-[10px] font-medium">More</span>
                        {isMoreActive && (
                            <span className="absolute bottom-1.5 h-1 w-1 rounded-full bg-primary" />
                        )}
                    </button>
                </div>
            </nav>
        </>
    );
}

interface NavTabProps {
    title: string;
    url: string;
    icon: React.ElementType;
    active: boolean;
}

function NavTab({ title, url, icon: Icon, active }: NavTabProps) {
    return (
        <Link
            to={url}
            className={cn(
                'relative flex flex-col items-center gap-1 pb-0.5 min-w-[48px] transition-colors',
                active ? 'text-primary' : 'text-muted-foreground'
            )}
        >
            <Icon className="h-5 w-5" />
            <span className="text-[10px] font-medium">{title}</span>
            {active && (
                <span className="absolute -bottom-0.5 h-0.5 w-4 rounded-full bg-primary" />
            )}
        </Link>
    );
}
