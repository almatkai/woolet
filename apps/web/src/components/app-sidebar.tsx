'use client';

import { Link, useRouterState } from '@tanstack/react-router';
import { useUser, UserProfile } from '@clerk/clerk-react';
import { dark } from '@clerk/themes';
import {
    LayoutDashboard,
    Wallet,
    Receipt,
    Users,
    CreditCard,
    TrendingUp,
    Settings,
    ChevronUp,
    PiggyBank,
    Home,
    FlaskConical,
    CalendarClock,
    User,
} from 'lucide-react';
import { trpc } from '@/lib/trpc';

import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarGroup,
    SidebarGroupContent,
    SidebarGroupLabel,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
} from '@/components/ui/sidebar';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
// Dialog components removed (unused)

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { AiChatSidebarItem } from '@/components/AiChatWidget';
import { PricingCtaBanner } from '@/components/PricingCtaBanner';
import { useState } from 'react';

const mainNavItems = [
    { title: 'Dashboard', url: '/', icon: LayoutDashboard },
    { title: 'Accounts', url: '/accounts', icon: Wallet },
    { title: 'Spending', url: '/spending', icon: Receipt },
    { title: 'Debts', url: '/debts', icon: Users },
    { title: 'Subscriptions', url: '/subscriptions', icon: CalendarClock },
];

const financialItems = [
    { title: 'Credits', url: '/financial/credits', icon: CreditCard },
    { title: 'Mortgages', url: '/financial/mortgages', icon: Home },
    { title: 'Deposits', url: '/financial/deposits', icon: PiggyBank },
];

const investingItems = [
    { title: 'Investing', url: '/investing', icon: TrendingUp },
];

// comingSoonItems removed (unused)

export function AppSidebar() {
    const router = useRouterState();
    const { user } = useUser();
    const { data: limitsData } = trpc.user.getLimits.useQuery();
    const isTestMode = limitsData?.testMode;
    const currentPath = router.location.pathname;
    const preloadProps = { preload: 'render' as const, preloadDelay: 0 };
    const [accountDialogOpen, setAccountDialogOpen] = useState(false);

    const isActive = (url: string) => {
        if (url === '/') return currentPath === '/';
        return currentPath.startsWith(url);
    };

    return (
        <Sidebar variant="sidebar">
            <SidebarHeader>
                <SidebarMenu>
                    <SidebarMenuItem>
                        <SidebarMenuButton size="lg" asChild>
                            <Link to="/" {...preloadProps}>
                                <img src="/assets/woolet-icon.png" alt="Woolet " className="size-8 rounded-lg" />
                                <div className="flex flex-col gap-0.5 leading-none">
                                    <span className="font-semibold">Woolet </span>
                                </div>
                            </Link>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                </SidebarMenu>
            </SidebarHeader>

            <SidebarContent>
                {/* Main Navigation */}
                <SidebarGroup>
                    <SidebarGroupLabel>Overview</SidebarGroupLabel>
                    <SidebarGroupContent>
                        <SidebarMenu>
                            {mainNavItems.map((item) => (
                                <SidebarMenuItem key={item.title}>
                                    <SidebarMenuButton asChild isActive={isActive(item.url)}>
                                        <Link to={item.url} {...preloadProps}>
                                            <item.icon className="size-4" />
                                            <span>{item.title}</span>
                                        </Link>
                                    </SidebarMenuButton>
                                </SidebarMenuItem>
                            ))}
                        </SidebarMenu>
                    </SidebarGroupContent>
                </SidebarGroup>

                {/* Financial Products */}
                <SidebarGroup>
                    <SidebarGroupLabel>Financial Products</SidebarGroupLabel>
                    <SidebarGroupContent>
                        <SidebarMenu>
                            {financialItems.map((item) => (
                                <SidebarMenuItem key={item.title}>
                                    <SidebarMenuButton asChild isActive={isActive(item.url)}>
                                        <Link to={item.url} {...preloadProps}>
                                            <item.icon className="size-4" />
                                            <span>{item.title}</span>
                                        </Link>
                                    </SidebarMenuButton>
                                </SidebarMenuItem>
                            ))}
                        </SidebarMenu>
                    </SidebarGroupContent>
                </SidebarGroup>

                {/* Investing */}
                <SidebarGroup>
                    <SidebarGroupLabel>Investing</SidebarGroupLabel>
                    <SidebarGroupContent>
                        <SidebarMenu>
                            {investingItems.map((item) => (
                                <SidebarMenuItem key={item.title}>
                                    <SidebarMenuButton asChild isActive={isActive(item.url)}>
                                        <Link to={item.url} {...preloadProps}>
                                            <item.icon className="size-4" />
                                            <span>{item.title}</span>
                                        </Link>
                                    </SidebarMenuButton>
                                </SidebarMenuItem>
                            ))}
                        </SidebarMenu>
                    </SidebarGroupContent>
                </SidebarGroup>

                {/* Coming Soon */}
                {/* <SidebarGroup>
                    <SidebarGroupLabel>Coming Soon</SidebarGroupLabel>
                    <SidebarGroupContent>
                        <SidebarMenu>
                            {comingSoonItems.map((item) => (
                                <SidebarMenuItem key={item.title}>
                                    <SidebarMenuButton asChild isActive={isActive(item.url)}>
                                        <Link to={item.url} className="opacity-60" {...preloadProps}>
                                            <item.icon className="size-4" />
                                            <span>{item.title}</span>
                                        </Link>
                                    </SidebarMenuButton>
                                    <SidebarMenuBadge className="bg-primary/10 text-primary text-xs">
                                        {item.badge}
                                    </SidebarMenuBadge>
                                </SidebarMenuItem>
                            ))}
                        </SidebarMenu>
                    </SidebarGroupContent>
                </SidebarGroup> */}
            </SidebarContent>

            <SidebarFooter>
                {isTestMode && (
                    <SidebarMenu>
                        <SidebarMenuItem>
                            <SidebarMenuButton asChild size="lg" className="bg-amber-100 text-amber-700 hover:bg-amber-200 hover:text-amber-800 hover:no-underline border border-amber-200 mb-2 h-10 transition-colors">
                                <Link to="/settings" {...preloadProps}>
                                    <div className="flex items-center justify-center size-8 rounded-lg bg-amber-200/50 text-amber-700 shrink-0">
                                        <FlaskConical className="size-4" />
                                    </div>
                                    <div className="flex flex-col gap-0.5 leading-tight group-data-[collapsible=icon]:hidden">
                                        <span className="font-semibold text-xs">Its' Test Mode</span>
                                        <span className="text-xs opacity-80">Tap to disable</span>
                                    </div>
                                </Link>
                            </SidebarMenuButton>
                        </SidebarMenuItem>
                    </SidebarMenu>
                )}

                <PricingCtaBanner variant="sidebar" className="mb-2" />

                <AiChatSidebarItem />

                <SidebarMenu>
                    <SidebarMenuItem>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <SidebarMenuButton
                                    size="lg"
                                    className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                                >
                                    <Avatar className="h-8 w-8 rounded-lg">
                                        <AvatarImage src={user?.imageUrl} alt={user?.fullName || ''} />
                                        <AvatarFallback className="rounded-lg">
                                            {user?.firstName?.charAt(0) || 'U'}
                                        </AvatarFallback>
                                    </Avatar>
                                    <div className="grid flex-1 text-left text-sm leading-tight">
                                        <span className="truncate font-semibold">{user?.fullName || 'User'}</span>
                                        <span className="truncate text-xs text-muted-foreground">
                                            {user?.primaryEmailAddress?.emailAddress || 'email@example.com'}
                                        </span>
                                    </div>
                                    <ChevronUp className="ml-auto size-4" />
                                </SidebarMenuButton>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent
                                className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
                                side="top"
                                align="end"
                                sideOffset={4}
                            >
                                <DropdownMenuItem onClick={() => setAccountDialogOpen(true)}>
                                    <User className="size-4 mr-2" />
                                    Account
                                </DropdownMenuItem>
                                <DropdownMenuItem asChild>
                                    <Link to="/settings" className="flex items-center" {...preloadProps}>
                                        <Settings className="size-4 mr-2" />
                                        Settings
                                    </Link>
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </SidebarMenuItem>
                </SidebarMenu>
            </SidebarFooter>

            {/* Account Dialog - Portal Overlay */}
            {accountDialogOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setAccountDialogOpen(false)}>
                    <div className="relative bg-transparent rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto flex justify-center" onClick={(e) => e.stopPropagation()}>
                        <div>
                            <button
                                onClick={() => setAccountDialogOpen(false)}
                                className="absolute top-4 right-4 z-10 p-2 rounded-full bg-background/80 hover:bg-background text-muted-foreground hover:text-foreground transition-colors"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="18" y1="6" x2="6" y2="18"></line>
                                    <line x1="6" y1="6" x2="18" y2="18"></line>
                                </svg>
                            </button>
                            <UserProfile
                                appearance={{
                                    baseTheme: dark,
                                    elements: {
                                        badge: "bg-primary/20 text-primary border-primary/20 px-3 py-1 rounded-full text-xs font-bold",
                                    },
                                }}
                            />
                        </div>
                    </div>
                </div>
            )}
        </Sidebar>
    );
}
