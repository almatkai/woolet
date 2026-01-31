import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Wallet } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { CurrencyDisplay } from '@/components/CurrencyDisplay';
import { ScrollArea } from '@/components/ui/scroll-area';

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
    const compactHeightThreshold = isSmallBp ? 2 : 1;
    const tallHeightThreshold = isSmallBp ? 2 : 1;

    const isCompact = (gridParams?.h ?? 0) <= compactHeightThreshold;
    const isTall = (gridParams?.h ?? 0) > tallHeightThreshold;

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

    const totalAccounts = accounts.length;
    const visibleAccounts = isTall ? accounts.slice(0, 5) : [];
    
    // Get primary display value
    const activeBalances = Object.entries(totalsByCurrency).filter(([_, amount]) => amount !== 0);
    const primaryCurrency = activeBalances.length > 0 ? activeBalances[0][0] : 'KZT';
    const primaryAmount = activeBalances.length > 0 ? activeBalances[0][1] : 0;

    if (isLoading) {
        return (
            <Card className={cn('dashboard-widget h-full', isCompact && 'dashboard-widget--compact')}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 pb-1">
                    <Skeleton className="h-4 w-24" />
                </CardHeader>
                <CardContent className="p-3 pt-0">
                    <Skeleton className="h-8 w-32" />
                </CardContent>
            </Card>
        );
    }

    // Compact view - just show total
    if (isCompact) {
        return (
            <Card className="dashboard-widget dashboard-widget--compact h-full flex flex-col justify-between">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 p-2 pb-1">
                    <CardTitle className="dashboard-widget__title truncate text-sm">Total Balance</CardTitle>
                    <Wallet className="dashboard-widget__icon" />
                </CardHeader>
                <CardContent className="p-2 pt-0">
                    <div className="dashboard-widget__value">
                        <CurrencyDisplay amount={primaryAmount} currency={primaryCurrency} abbreviate />
                    </div>
                    <p className="dashboard-widget__sub mt-0.5 truncate">
                        {totalAccounts} {totalAccounts === 1 ? 'account' : 'accounts'}
                    </p>
                </CardContent>
            </Card>
        );
    }

    // Expanded view with account list
    return (
        <Card className="dashboard-widget h-full flex flex-col">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 pb-1">
                <CardTitle className="dashboard-widget__title truncate text-sm">Total Balance</CardTitle>
                <Wallet className="dashboard-widget__icon" />
            </CardHeader>
            <CardContent className="flex-1 overflow-hidden p-3 pt-0 flex flex-col">
                <div className="dashboard-widget__value mb-2">
                    <CurrencyDisplay amount={primaryAmount} currency={primaryCurrency} abbreviate />
                </div>
                
                {isTall && accounts.length > 0 && (
                    <ScrollArea className="flex-1 -mx-1 px-1">
                        <div className="space-y-1.5">
                            {visibleAccounts.map(account => (
                                <div 
                                    key={account.accountId} 
                                    className="dashboard-widget__item flex items-center justify-between p-1.5 rounded bg-muted/30"
                                >
                                    <div className="flex flex-col min-w-0 flex-1">
                                        <span className="text-xs font-medium truncate">{account.accountName}</span>
                                        <span className="text-[10px] text-muted-foreground truncate">{account.bankName}</span>
                                    </div>
                                    <div className="text-xs font-medium whitespace-nowrap ml-2">
                                        {account.balances.length === 1 ? (
                                            <CurrencyDisplay 
                                                amount={account.balances[0].balance} 
                                                currency={account.balances[0].currencyCode}
                                            />
                                        ) : (
                                            <CurrencyDisplay amount={account.totalBalance} />
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </ScrollArea>
                )}
                
                <p className="dashboard-widget__sub mt-auto pt-1">
                    {totalAccounts > visibleAccounts.length
                        ? `Showing ${visibleAccounts.length} of ${totalAccounts} accounts`
                        : `${totalAccounts} ${totalAccounts === 1 ? 'account' : 'accounts'}`}
                </p>
            </CardContent>
        </Card>
    );
}
