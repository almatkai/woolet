import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { PiggyBank, TrendingUp } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { CurrencyDisplay } from '@/components/CurrencyDisplay';
import { Link } from '@tanstack/react-router';

export function DepositWidget({ gridParams }: { gridParams?: { w: number; h: number } }) {
    const { data: deposits, isLoading } = trpc.deposit.list.useQuery();
    const activeDeposits = (deposits || []).filter((d: any) => d.status === 'active');
    const gridW = gridParams?.w ?? 0;
    const gridH = gridParams?.h ?? 0;
    const is2x1 = gridW === 2 && gridH === 1;
    const is1x2 = gridW === 1 && gridH === 2;
    const is2x2 = gridW === 2 && gridH === 2;
    const isLargerThan2x2 = (gridW > 2 || gridH > 2) && !(gridW === 2 && gridH === 1);
    
    // Calculate total current balance and total principal
    const totalBalance = activeDeposits.reduce((sum: number, d: any) => sum + Number(d.currentBalance), 0);
    const totalPrincipal = activeDeposits.reduce((sum: number, d: any) => sum + Number(d.principalAmount), 0);
    const totalEarned = totalBalance - totalPrincipal;
    
    // Calculate expected earnings this month (simplified)
    const currentDate = new Date();
    const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
    
    const expectedThisMonth = activeDeposits.reduce((sum: number, d: any) => {
        const balance = Number(d.currentBalance);
        const rate = Number(d.interestRate) / 100;
        const frequency = d.compoundingFrequency;
        
        let monthlyEarning = 0;
        if (frequency === 'daily') {
            monthlyEarning = balance * (Math.pow(1 + rate / 365, daysInMonth) - 1);
        } else if (frequency === 'monthly') {
            monthlyEarning = balance * (rate / 12);
        } else if (frequency === 'quarterly') {
            monthlyEarning = balance * (rate / 12); // Approximation
        } else if (frequency === 'annually') {
            monthlyEarning = balance * (rate / 12);
        }
        
        return sum + monthlyEarning;
    }, 0);
    
    const is1x3 = gridW === 1 && gridH === 3;
    const is1x1 = gridW === 1 && gridH === 1;
    const isNx1 = gridH === 1 && gridW > 1; // Height 1, width > 1 (e.g., 2x1, 3x1, etc.)
    const isCompactStyle = is1x1;
    const showTwoColumn = is2x1 || is2x2;
    const showDetails = !isCompactStyle && !isNx1; // Hide details in Nx1 layout to save space
    const hideCardDescription = isNx1 || is1x1; // Hide CardDescription in Nx1 and 1x1 layouts
    const sortedDeposits = [...activeDeposits]
        .sort((a: any, b: any) => Number(b.currentBalance) - Number(a.currentBalance));
    const displayDeposits = is2x1 ? sortedDeposits.slice(0, 4) : sortedDeposits;

    return (
        <Card className={cn('dashboard-widget h-full flex flex-col', isCompactStyle && 'dashboard-widget--compact')}>
            <Link to="/financial/deposits" className="block">
                <CardHeader className="dashboard-widget__header p-2 pb-1 hover:bg-muted/50 transition-colors">
                    <div className="flex items-center justify-between gap-2">
                        <CardTitle className="dashboard-widget__title truncate">Deposits</CardTitle>
                        {isCompactStyle ? (
                            <div className="dashboard-widget__header-value">
                                <CurrencyDisplay amount={totalBalance} abbreviate />
                            </div>
                        ) : (
                            <PiggyBank className="dashboard-widget__icon" />
                        )}
                    </div>
                    {!hideCardDescription && <CardDescription className="dashboard-widget__desc truncate">Your savings & deposits</CardDescription>}
                </CardHeader>
            </Link>
            <CardContent className={cn('flex-1 overflow-y-auto p-3 pt-0', isCompactStyle && 'p-2 pt-1 pb-2')}>
                {isLoading ? (
                    <div className="space-y-2">
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-4 w-48" />
                    </div>
                ) : activeDeposits.length === 0 ? (
                    <p className="dashboard-widget__desc">No active deposits.</p>
                ) : isCompactStyle ? (
                    <div className="h-full flex items-end">
                        <p className="dashboard-widget__sub w-full truncate">
                            {activeDeposits.length} active • +<CurrencyDisplay amount={totalEarned} abbreviate />
                        </p>
                    </div>
                ) : isNx1 ? (
                    // Nx1 layout (height=1, width>1): Show only the most important info - total balance
                    <div className="flex items-center justify-between h-full">
                        <div className="flex items-center gap-4">
                            <div>
                                <p className="dashboard-widget__meta">Total Balance</p>
                                <div className="dashboard-widget__value text-lg">
                                    <CurrencyDisplay amount={totalBalance} />
                                </div>
                            </div>
                            <div>
                                <p className="dashboard-widget__meta flex items-center gap-1 text-xs">
                                    <TrendingUp className="h-2.5 w-2.5 text-green-600" />
                                    Earned
                                </p>
                                <div className="dashboard-widget__value text-green-600 text-sm">
                                    <CurrencyDisplay amount={totalEarned} />
                                </div>
                            </div>
                        </div>
                        <div className="text-right">
                            <p className="dashboard-widget__meta">{activeDeposits.length} Active</p>
                        </div>
                    </div>
                ) : showTwoColumn ? (
                    <div className="grid grid-cols-2 gap-4 h-full">
                        <div className="space-y-2">
                            <div className="grid grid-cols-2 gap-2">
                                <div className="space-y-0.5">
                                    <p className="dashboard-widget__meta">Total Balance</p>
                                    <div className="dashboard-widget__value">
                                        <CurrencyDisplay amount={totalBalance} />
                                    </div>
                                </div>
                                <div className="space-y-0.5">
                                    <p className="dashboard-widget__meta flex items-center gap-1 text-xs">
                                        <TrendingUp className="h-2.5 w-2.5 text-green-600" />
                                        Earned
                                    </p>
                                    <div className="dashboard-widget__value text-green-600 text-sm">
                                        <CurrencyDisplay amount={totalEarned} />
                                    </div>
                                </div>
                            </div>
                            <div className="space-y-0.5">
                                <p className="dashboard-widget__meta">Expected This Month</p>
                                <div className="dashboard-widget__value text-blue-600 text-sm">
                                    ~<CurrencyDisplay amount={expectedThisMonth} />
                                </div>
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <p className="dashboard-widget__meta">{is2x2 ? `All Deposits (${activeDeposits.length})` : 'Top Deposits (4)'}</p>
                            <div className="space-y-1">
                                {displayDeposits.map((deposit: any) => (
                                    <div key={deposit.id} className="dashboard-widget__item flex items-center justify-between text-xs gap-2">
                                        <span className="truncate flex-1 font-medium">{deposit.depositName}</span>
                                        <span className="font-medium whitespace-nowrap text-xs flex-shrink-0">
                                            <CurrencyDisplay amount={deposit.currentBalance} currency={deposit.currency} />
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                ) : isLargerThan2x2 || is1x3 || is1x2 ? (
                    <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                                <p className="dashboard-widget__meta">Total Balance</p>
                                <div className="dashboard-widget__value">
                                    <CurrencyDisplay amount={totalBalance} />
                                </div>
                            </div>
                            <div className="space-y-1">
                                <p className="dashboard-widget__meta flex items-center gap-1">
                                    <TrendingUp className="h-3 w-3 text-green-600" />
                                    Earned
                                </p>
                                <div className="dashboard-widget__value text-green-600">
                                    <CurrencyDisplay amount={totalEarned} />
                                </div>
                            </div>
                        </div>
                        <div className="space-y-1">
                            <p className="dashboard-widget__meta">Expected This Month</p>
                            <div className="dashboard-widget__value text-blue-600">
                                ~<CurrencyDisplay amount={expectedThisMonth} />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <p className="dashboard-widget__meta">Active Deposits ({activeDeposits.length})</p>
                            <div className="space-y-1.5">
                                {activeDeposits.map((deposit: any) => (
                                    <div key={deposit.id} className="dashboard-widget__item flex items-center justify-between gap-2">
                                        <div className="flex flex-col min-w-0 flex-1">
                                            <span className="truncate font-medium">{deposit.depositName}</span>
                                            <span className="dashboard-widget__meta">{deposit.interestRate}% • {deposit.compoundingFrequency}</span>
                                        </div>
                                        <span className="font-medium whitespace-nowrap flex-shrink-0">
                                            <CurrencyDisplay amount={deposit.currentBalance} currency={deposit.currency} />
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-1">
                        <div className="space-y-0.5 mt-0.5">
                            {activeDeposits.slice(0, 1).map((deposit: any) => (
                                <div key={deposit.id} className="dashboard-widget__item flex items-center justify-between bg-muted/30 p-1 rounded-md gap-2">
                                    <span className="truncate flex-1 font-medium">{deposit.depositName}</span>
                                    <span className="font-medium whitespace-nowrap flex-shrink-0">
                                        <CurrencyDisplay amount={deposit.currentBalance} currency={deposit.currency} />
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
