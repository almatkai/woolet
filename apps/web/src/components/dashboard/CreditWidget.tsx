import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { CreditCard, Check, X } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { CurrencyDisplay } from '@/components/CurrencyDisplay';
import { getPaymentStatusOptions, getTargetMonthStr, isPaidForTargetMonth } from "@/lib/payment-status";
import { Link } from '@tanstack/react-router';

export function CreditWidget({ gridParams }: { gridParams?: { w: number; h: number } }) {
    const { data: credits, isLoading } = trpc.credit.list.useQuery();
    const { data: settings } = trpc.settings.getUserSettings.useQuery();
    const activeCredits = (credits || []).filter((c: any) => c.status === 'active');
    const gridW = gridParams?.w ?? 0;
    const gridH = gridParams?.h ?? 0;
    const is2x1 = gridW === 2 && gridH === 1;
    const is1x2 = gridW === 1 && gridH === 2;
    const is2x2 = gridW === 2 && gridH === 2;
    const isLargerThan2x2 = (gridW > 2 || gridH > 2) && !(gridW === 2 && gridH === 1);
    
    // Logic settings
    const { logic, period } = getPaymentStatusOptions(settings, 'credit');
    
    // Calculate this month's total payment and check status
    const monthlyPayment = activeCredits.reduce((sum: number, c: any) => sum + Number(c.monthlyPayment), 0);
    
    // Check if all credits are paid for this target month
    const allPaidThisMonth = activeCredits.every((c: any) => {
        const targetMonthStr = getTargetMonthStr(c.billingDay, { logic, period });
        return isPaidForTargetMonth(c.payments, targetMonthStr, true);
    });
    
    const is1x3 = gridW === 1 && gridH === 3;
    const is1x1 = gridW === 1 && gridH === 1;
    const isNx1 = gridH === 1 && gridW > 1; // Height 1, width > 1 (e.g., 2x1, 3x1, etc.)
    const isCompactStyle = is1x1;
    const showTwoColumn = is2x1 || is2x2;
    const showDetails = !isCompactStyle && !isNx1; // Hide details in Nx1 layout to save space
    const hideCardDescription = isNx1 || is1x1; // Hide CardDescription in Nx1 and 1x1 layouts
    const sortedCredits = [...activeCredits]
        .sort((a: any, b: any) => Number(b.monthlyPayment) - Number(a.monthlyPayment));
    const displayCredits = is2x1 ? sortedCredits.slice(0, 4) : sortedCredits;

    return (
        <Card className={cn('dashboard-widget h-full flex flex-col', isCompactStyle && 'dashboard-widget--compact')}>
            <Link to="/financial/credits" className="block">
                <CardHeader className="dashboard-widget__header p-2 pb-1 hover:bg-muted/50 transition-colors">
                    <div className="flex items-center justify-between gap-2">
                        <CardTitle className="dashboard-widget__title truncate">Credits</CardTitle>
                        {isCompactStyle ? (
                            <div className="dashboard-widget__header-value">
                                <CurrencyDisplay amount={monthlyPayment} currency={settings?.defaultCurrency || "USD"} abbreviate />
                            </div>
                        ) : (
                            <CreditCard className="dashboard-widget__icon" />
                        )}
                    </div>
                    {!hideCardDescription && <CardDescription className="dashboard-widget__desc truncate">Your credit cards & loans</CardDescription>}
                </CardHeader>
            </Link>
            <CardContent className={cn('flex-1 overflow-y-auto p-3 pt-0', isCompactStyle && 'p-2 pt-1 pb-2')}>
                {isLoading ? (
                    <div className="space-y-2">
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-4 w-48" />
                    </div>
                ) : activeCredits.length === 0 ? (
                    <p className="dashboard-widget__desc">No active credits.</p>
                ) : isCompactStyle ? (
                    <div className="h-full flex items-end">
                        <p className="dashboard-widget__sub w-full truncate">
                            {activeCredits.length} active • {allPaidThisMonth ? 'paid' : 'unpaid'}
                        </p>
                    </div>
                ) : isNx1 ? (
                    // Nx1 layout (height=1, width>1): Show only the most important info - monthly payment
                    <div className="flex items-center justify-between h-full">
                        <div className="flex items-center gap-3">
                            <div>
                                <div className="dashboard-widget__value text-lg">
                                    <CurrencyDisplay amount={monthlyPayment} currency={settings?.defaultCurrency || "USD"} />
                                </div>
                            </div>
                            <Badge variant={allPaidThisMonth ? "default" : "destructive"} className="dashboard-widget__badge flex items-center gap-1 text-xs h-5 px-2">
                                {allPaidThisMonth ? (
                                    <><Check className="h-2.5 w-2.5" /> Paid</>
                                ) : (
                                    <><X className="h-2.5 w-2.5" /> Unpaid</>
                                )}
                            </Badge>
                        </div>
                        <div className="text-right">
                            <p className="dashboard-widget__meta">{activeCredits.length} Active</p>
                        </div>
                    </div>
                ) : showTwoColumn ? (
                    <div className="grid grid-cols-2 gap-4 h-full">
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <div className="dashboard-widget__value">
                                    <CurrencyDisplay amount={monthlyPayment} currency={settings?.defaultCurrency || "USD"} />
                                </div>
                                <Badge variant={allPaidThisMonth ? "default" : "destructive"} className="dashboard-widget__badge flex items-center gap-1 text-xs h-5 px-2">
                                    {allPaidThisMonth ? (
                                        <><Check className="h-2.5 w-2.5" /> Paid</>
                                    ) : (
                                        <><X className="h-2.5 w-2.5" /> Unpaid</>
                                    )}
                                </Badge>
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <p className="dashboard-widget__meta">{is2x2 ? `All Credits (${activeCredits.length})` : 'Top Credits (4)'}</p>
                            <div className="space-y-1">
                                {displayCredits.map((credit: any) => {
                                    const targetMonthStr = getTargetMonthStr(credit.billingDay, { logic, period });
                                    const isPaidThisMonth = isPaidForTargetMonth(credit.payments, targetMonthStr, true);
                                    return (
                                        <div key={credit.id} className="dashboard-widget__item flex items-center justify-between p-1.5 rounded-md bg-muted/30 gap-2">
                                            <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                                {isPaidThisMonth ? (
                                                    <Check className="h-2.5 w-2.5 text-green-600 flex-shrink-0" />
                                                ) : (
                                                    <X className="h-2.5 w-2.5 text-red-600 flex-shrink-0" />
                                                )}
                                                <span className="truncate text-sm font-medium">{credit.name}</span>
                                            </div>
                                            <span className="whitespace-nowrap flex-shrink-0">
                                                <CurrencyDisplay amount={credit.monthlyPayment} currency={credit.currency} />
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                ) : isLargerThan2x2 || is1x3 || is1x2 ? (
                    <div className="space-y-3">
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <div className="dashboard-widget__value">
                                    <CurrencyDisplay amount={monthlyPayment} currency={settings?.defaultCurrency || "USD"} />
                                </div>
                                <Badge variant={allPaidThisMonth ? "default" : "destructive"} className="dashboard-widget__badge flex items-center gap-1">
                                    {allPaidThisMonth ? (
                                        <><Check className="h-3 w-3" /> Paid</>
                                    ) : (
                                        <><X className="h-3 w-3" /> Unpaid</>
                                    )}
                                </Badge>
                            </div>
                            
                        </div>
                        <div className="space-y-2">
                            <p className="dashboard-widget__meta">Active Credits ({activeCredits.length})</p>
                            <div className="space-y-1.5">
                                {activeCredits.map((credit: any) => {
                                    const targetMonthStr = getTargetMonthStr(credit.billingDay, { logic, period });
                                    const isPaidThisMonth = isPaidForTargetMonth(credit.payments, targetMonthStr, true);
                                    return (
                                        <div key={credit.id} className="dashboard-widget__item flex items-center justify-between p-2 rounded-md bg-muted/30">
                                            <div className="flex items-center gap-2 max-w-[60%]">
                                                {isPaidThisMonth ? (
                                                    <Check className="h-3 w-3 text-green-600 flex-shrink-0" />
                                                ) : (
                                                    <X className="h-3 w-3 text-red-600 flex-shrink-0" />
                                                )}
                                                <span className="truncate text-sm font-medium">{credit.name}</span>
                                            </div>
                                            <span className="whitespace-nowrap ml-2">
                                                <CurrencyDisplay amount={credit.monthlyPayment} currency={credit.currency} />
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-1">
                        <div className="space-y-0.5">
                            {activeCredits.slice(0, 3).map((credit: any) => {
                                const targetMonthStr = getTargetMonthStr(credit.billingDay, { logic, period });
                                const isPaidThisMonth = isPaidForTargetMonth(credit.payments, targetMonthStr, true);
                                return (
                                    <div key={credit.id} className="dashboard-widget__item flex items-center justify-between p-1 rounded-md bg-muted/30">
                                        <div className="flex items-center gap-2 max-w-[60%]">
                                            {isPaidThisMonth ? (
                                                <Check className="h-3 w-3 text-green-600 flex-shrink-0" />
                                            ) : (
                                                <X className="h-3 w-3 text-red-600 flex-shrink-0" />
                                            )}
                                            <span className="truncate">{credit.name}</span>
                                        </div>
                                        <span className="font-medium whitespace-nowrap ml-2">
                                            <CurrencyDisplay amount={credit.monthlyPayment} currency={credit.currency} />
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
