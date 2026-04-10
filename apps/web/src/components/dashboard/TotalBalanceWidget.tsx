import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { trpc } from '@/lib/trpc';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { CurrencyDisplay } from '@/components/CurrencyDisplay';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Link } from '@tanstack/react-router';
import { Wallet, Landmark, CreditCard, ArrowRight } from 'lucide-react';
import { WidgetFooter } from './WidgetFooter';

interface AccountBalance {
    accountId: string;
    accountName: string;
    bankName: string;
    balances: Array<{
        currencyCode: string;
        balance: number;
    }>;
    totalBalance: number;
}

type GridParams = { w: number; h: number; breakpoint?: string };

export function TotalBalanceWidget({ gridParams }: { gridParams?: GridParams }) {
    const { data: hierarchy, isLoading } = trpc.bank.getHierarchy.useQuery();

    const bp = gridParams?.breakpoint;
    const isSmallBp = bp === 'sm' || bp === 'xs';
    const isNarrowCard = (gridParams?.w ?? 0) <= 1;
    const isShortCard = (gridParams?.h ?? 0) <= 2;

    const isCompact = isShortCard || isNarrowCard;
    const isTall = (gridParams?.h ?? 0) > (isSmallBp ? 2 : 2);

    // Process hierarchy into account balances sorted by total balance desc
    const accounts: AccountBalance[] = React.useMemo(() => {
        if (!hierarchy) return [];
        
        const result: AccountBalance[] = [];
        
        hierarchy.forEach((bank: any) => {
            bank.accounts.forEach((account: any) => {
                const balances = account.currencyBalances.map((cb: any) => ({
                    currencyCode: cb.currencyCode,
                    balance: Number(cb.balance)
                }));
                
                const totalBalance = balances.reduce((sum: number, b: { balance: number }) => sum + b.balance, 0);
                
                result.push({
                    accountId: account.id,
                    accountName: account.name,
                    bankName: bank.name,
                    balances,
                    totalBalance
                });
            });
        });
        
        // Sort by total balance descending
        return result.sort((a, b) => b.totalBalance - a.totalBalance);
    }, [hierarchy]);

    // Calculate totals by currency
    const totalsByCurrency: Record<string, number> = React.useMemo(() => {
        const totals: Record<string, number> = {};
        accounts.forEach(acc => {
            acc.balances.forEach(b => {
                totals[b.currencyCode] = (totals[b.currencyCode] || 0) + b.balance;
            });
        });
        return totals;
    }, [accounts]);

    const totalBalanceValue = React.useMemo(() => {
        return accounts.reduce((sum, acc) => sum + acc.totalBalance, 0);
    }, [accounts]);

    const totalAccounts = accounts.length;
    const visibleAccounts = isTall ? accounts.slice(0, 4) : accounts.slice(0, 2);
    
    // Get primary display value
    const activeBalances = Object.entries(totalsByCurrency).filter(([_, amount]) => amount !== 0);
    const primaryCurrency = activeBalances.length > 0 ? activeBalances[0][0] : 'KZT';
    const primaryAmount = activeBalances.length > 0 ? activeBalances[0][1] : 0;

    if (isLoading) {
        return (
            <Card className={cn('dashboard-widget h-full rounded-[32px] overflow-hidden', isCompact && 'dashboard-widget--compact')}>
                <CardHeader className="p-3 pb-2">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-7 w-28 mt-1" />
                </CardHeader>
                <CardContent className="p-3 pt-0">
                    <Skeleton className="h-12 w-full" />
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className={cn('dashboard-widget h-full flex flex-col group overflow-hidden rounded-[32px]', isCompact && 'dashboard-widget--compact')}>
            <Link to="/accounts" className="block flex-1 flex flex-col min-h-0">
                <CardHeader className="p-3 pb-1 flex flex-row items-start justify-between hover:bg-muted/30 transition-colors rounded-t-xl cursor-pointer">
                    <div className="flex flex-col min-w-0 flex-1">
                        <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-0.5">Total Balance</div>
                        <div className="flex items-baseline gap-1.5 flex-wrap">
                            <span className="text-lg sm:text-xl font-bold tracking-tight whitespace-nowrap">
                                <CurrencyDisplay amount={primaryAmount} currency={primaryCurrency} abbreviate={primaryAmount > 1000000} />
                            </span>
                            {activeBalances.length > 1 && (
                                <span className="text-[9px] text-muted-foreground font-medium bg-muted px-1 rounded uppercase">
                                    +{activeBalances.length - 1} more
                                </span>
                            )}
                        </div>
                    </div>
                    <div className="p-1.5 bg-primary/10 rounded-md group-hover:bg-primary/20 transition-colors">
                        <Wallet className="h-4 w-4 text-primary" />
                    </div>
                </CardHeader>

                <CardContent className="px-3 py-1 flex-1 flex flex-col min-h-0">
                    <div className="flex-1 space-y-1.5 overflow-hidden py-1">
                        {visibleAccounts.map((account, i) => {
                            const colors = ['text-blue-500', 'text-emerald-500', 'text-purple-500', 'text-amber-500'];
                            return (
                                <div
                                    key={account.accountId}
                                    className="flex items-center justify-between gap-2 p-1.5 rounded-md bg-muted/40 hover:bg-muted/60 transition-colors"
                                >
                                    <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                        <Landmark className={cn("h-3 w-3 flex-shrink-0", colors[i % colors.length])} />
                                        <span className="text-[10px] font-bold truncate leading-tight">{account.accountName}</span>
                                    </div>
                                    <span className="text-[10px] font-bold whitespace-nowrap">
                                        <CurrencyDisplay
                                            amount={account.totalBalance}
                                            abbreviate
                                        />
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </CardContent>
            </Link>

            <WidgetFooter>
                <span className="text-[9px] font-medium text-muted-foreground uppercase tracking-wider">
                    {totalAccounts} Accounts
                </span>
                <Link to="/accounts" className="text-[9px] font-bold text-primary hover:underline uppercase tracking-wider">
                    Manage
                </Link>
            </WidgetFooter>
        </Card>
    );
}
