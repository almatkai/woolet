'use client';

import { Link, useRouterState } from '@tanstack/react-router';
import { useUser, SignOutButton } from '@clerk/clerk-react';
import {
    LayoutDashboard,
    Wallet,
    Receipt,
    Users,
    CreditCard,
    TrendingUp,
    Bitcoin,
    Settings,
    LogOut,
    ChevronUp,
    PiggyBank,
    Home,
    FlaskConical,
    CalendarClock,
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
    SidebarMenuBadge,
} from '@/components/ui/sidebar';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { AiChatSidebarItem } from '@/components/AiChatWidget';

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

const comingSoonItems = [
    { title: 'Crypto', url: '/coming-soon/crypto', icon: Bitcoin, badge: 'Soon' },
];

export function AppSidebar() {
    const router = useRouterState();
    const { user } = useUser();
    const { data: limitsData } = trpc.user.getLimits.useQuery();
    const isTestMode = limitsData?.testMode;
    const currentPath = router.location.pathname;
    const preloadProps = { preload: 'render' as const, preloadDelay: 0 };

    const isActive = (url: string) => {
        if (url === '/') return currentPath === '/';
        return currentPath.startsWith(url);
    };

    return (
        <Sidebar variant="inset">
            <SidebarHeader>
                <SidebarMenu>
                    <SidebarMenuItem>
                        <SidebarMenuButton size="lg" asChild>
                            <Link to="/" {...preloadProps}>
                                <img src="/assets/woolet-icon.png" alt="Woo-Let " className="size-8 rounded-lg" />
                                <div className="flex flex-col gap-0.5 leading-none">
                                    <span className="font-semibold">Woo-Let </span>
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
                <SidebarGroup>
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
                </SidebarGroup>
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
                                <DropdownMenuItem asChild>
                                    <Link to="/settings" className="flex items-center gap-2" {...preloadProps}>
                                        <Settings className="size-4" />
                                        Settings
                                    </Link>
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <SignOutButton>
                                    <DropdownMenuItem className="flex items-center gap-2 text-destructive focus:text-destructive">
                                        <LogOut className="size-4" />
                                        Sign out
                                    </DropdownMenuItem>
                                </SignOutButton>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </SidebarMenuItem>
                </SidebarMenu>
            </SidebarFooter>
        </Sidebar>
    );
}
