import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Home, Check, X, Wallet } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { CurrencyDisplay } from '@/components/CurrencyDisplay';
import { MortgagePaymentSheet } from '@/components/MortgagePaymentSheet';
import { getPaymentStatusOptions, getTargetMonthStr, isPaidForTargetMonth } from "@/lib/payment-status";
import { Link } from '@tanstack/react-router';

export function MortgageWidget({ gridParams }: { gridParams?: { w: number; h: number } }) {
    const { data: mortgages, isLoading } = trpc.mortgage.list.useQuery();
    const { data: settings } = trpc.settings.getUserSettings.useQuery();
    const [payingMortgage, setPayingMortgage] = useState<any>(null);
    
    const activeMortgages = (mortgages || []).filter((m: any) => m.status === 'active');
    const maxItems = gridParams?.h && gridParams.h <= 2 ? 2 : 3;

    const totalBalance = activeMortgages.reduce((sum: number, m: any) => sum + Number(m.remainingBalance), 0);
    const totalMonthly = activeMortgages.reduce((sum: number, m: any) => sum + Number(m.monthlyPayment), 0);
    const isCompact = (gridParams?.h ?? 0) <= 1;
    
    // Logic settings
    const { logic, period } = getPaymentStatusOptions(settings, 'mortgage');
    
    // Check if all mortgages are paid for this target month
    const allPaidThisMonth = activeMortgages.every((m: any) => {
        const targetMonthStr = getTargetMonthStr(m.paymentDay, { logic, period });
        return isPaidForTargetMonth(m.payments, targetMonthStr, true);
    });

    if (isCompact) {
        return (
            <Card className="dashboard-widget dashboard-widget--compact h-full flex flex-col justify-between">
                <Link to="/financial/mortgages" className="block">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 p-2 pb-1 hover:bg-muted/50 transition-colors">
                        <CardTitle className="dashboard-widget__title truncate text-sm">Mortgages</CardTitle>
                        <Home className="dashboard-widget__icon" />
                    </CardHeader>
                </Link>
                <CardContent className="p-2 pt-0">
                    <div className="dashboard-widget__value">
                        <CurrencyDisplay 
                            amount={totalBalance} 
                            currency={activeMortgages.length > 0 ? activeMortgages[0].currency : undefined} 
                        />
                    </div>
                    <p className="dashboard-widget__sub mt-1">
                        {activeMortgages.length} active {activeMortgages.length === 1 ? 'loan' : 'loans'}
                    </p>
                </CardContent>
            </Card>
        );
    }

    return (
        <>
            <Card className={cn('dashboard-widget h-full flex flex-col', isCompact && 'dashboard-widget--compact')}>
                <Link to="/financial/mortgages" className="block">
                    <CardHeader className="p-3 pb-1 hover:bg-muted/50 transition-colors">
                        <div className="flex items-center justify-between">
                            <CardTitle className="dashboard-widget__title truncate text-sm">Mortgages</CardTitle>
                            <Home className="dashboard-widget__icon" />
                        </div>
                    </CardHeader>
                </Link>
                <CardContent className="flex-1 overflow-y-auto p-3 pt-0">
                    {isLoading ? (
                        <div className="space-y-2">
                            <Skeleton className="h-4 w-32" />
                            <Skeleton className="h-4 w-48" />
                        </div>
                    ) : activeMortgages.length === 0 ? (
                        <p className="dashboard-widget__desc text-[10px] sm:text-xs">No active mortgages found.</p>
                    ) : (
                        <div className="space-y-3">
                            {/* This Month Status */}
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <p className="dashboard-widget__meta">This Month</p>
                                    <Badge variant={allPaidThisMonth ? "default" : "destructive"} className="dashboard-widget__badge flex items-center gap-1">
                                        {allPaidThisMonth ? (
                                            <><Check className="h-3 w-3" /> Paid</>
                                        ) : (
                                            <><X className="h-3 w-3" /> Unpaid</>
                                        )}
                                    </Badge>
                                </div>
                                <div className="dashboard-widget__value">
                                    <CurrencyDisplay amount={totalMonthly} currency={activeMortgages[0]?.currency || 'KZT'} />
                                </div>
                            </div>
                            
                            {/* Active Mortgages */}
                            <div className="space-y-2">
                                <p className="dashboard-widget__meta">Active ({activeMortgages.length})</p>
                                <div className="space-y-1.5">
                                    {activeMortgages.slice(0, maxItems).map((mortgage: any) => {
                                        const targetMonthStr = getTargetMonthStr(mortgage.paymentDay, { logic, period });
                                        const isPaidThisMonth = isPaidForTargetMonth(mortgage.payments, targetMonthStr, true);
                                        return (
                                            <div 
                                                key={mortgage.id} 
                                                className="dashboard-widget__item flex items-center justify-between p-2 rounded-md bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors"
                                                onClick={() => setPayingMortgage(mortgage)}
                                            >
                                                <div className="flex items-center gap-2 max-w-[60%]">
                                                    {isPaidThisMonth ? (
                                                        <Check className="h-3 w-3 text-green-600 flex-shrink-0" />
                                                    ) : (
                                                        <X className="h-3 w-3 text-red-600 flex-shrink-0" />
                                                    )}
                                                    <span className="truncate">{mortgage.propertyName}</span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <span className="font-medium whitespace-nowrap text-xs">
                                                        <CurrencyDisplay amount={mortgage.monthlyPayment} currency={mortgage.currency} />
                                                    </span>
                                                    <Wallet className="h-3 w-3 text-muted-foreground" />
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                            
                            {/* Total Remaining */}
                            <div className="pt-2 border-t">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs text-muted-foreground">Total Remaining</span>
                                    <span className="font-medium text-orange-500">
                                        <CurrencyDisplay amount={totalBalance} currency={activeMortgages[0]?.currency || 'KZT'} />
                                    </span>
                                </div>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>
            
            <MortgagePaymentSheet
                open={!!payingMortgage}
                onOpenChange={(open) => {
                    if (!open) setPayingMortgage(null);
                }}
                mortgage={payingMortgage}
            />
        </>
    );
}
