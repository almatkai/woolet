import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { CreditCard, Check, X } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { CurrencyDisplay } from '@/components/CurrencyDisplay';

export function CreditWidget({ gridParams }: { gridParams?: { w: number; h: number } }) {
    const { data: credits, isLoading } = trpc.credit.list.useQuery();
    const activeCredits = (credits || []).filter((c: any) => c.status === 'active');
    const gridW = gridParams?.w ?? 0;
    const gridH = gridParams?.h ?? 0;
    const is2x1 = gridW === 2 && gridH === 1;
    const is1x2 = gridW === 1 && gridH === 2;
    const is2x2 = gridW === 2 && gridH === 2;
    const isLargerThan2x2 = (gridW > 2 || gridH > 2) && !(gridW === 2 && gridH === 1);
    
    // Get current month in YYYY-MM format
    const currentMonth = new Date().toISOString().slice(0, 7);
    
    // Calculate this month's total payment and check status
    const monthlyPayment = activeCredits.reduce((sum: number, c: any) => sum + Number(c.monthlyPayment), 0);
    
    // Check if all credits are paid for this month
    const allPaidThisMonth = activeCredits.every((c: any) => 
        c.payments?.some((p: any) => p.monthYear === currentMonth)
    );
    
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
            <CardHeader className={cn('p-3 pb-1', isCompactStyle && 'p-2 pb-0')}>
                <div className="flex items-center justify-between">
                    <CardTitle className="dashboard-widget__title truncate text-sm">Credits</CardTitle>
                    <CreditCard className="dashboard-widget__icon" />
                </div>
                {!hideCardDescription && <CardDescription className="dashboard-widget__desc text-[10px] sm:text-xs truncate">Your credit cards & loans</CardDescription>}
            </CardHeader>
            <CardContent className={cn('flex-1 overflow-y-auto p-3 pt-0', isCompactStyle && 'p-2 pt-0')}>
                {isLoading ? (
                    <div className="space-y-2">
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-4 w-48" />
                    </div>
                ) : activeCredits.length === 0 ? (
                    <p className="dashboard-widget__desc text-[10px] sm:text-xs">No active credits.</p>
                ) : isNx1 ? (
                    // Nx1 layout (height=1, width>1): Show only the most important info - monthly payment
                    <div className="flex items-center justify-between h-full">
                        <div className="flex items-center gap-3">
                            <div>
                                <p className="dashboard-widget__meta text-[10px]">This Month</p>
                                <div className="dashboard-widget__value text-lg">
                                    <CurrencyDisplay amount={monthlyPayment} currency="KZT" />
                                </div>
                            </div>
                            <Badge variant={allPaidThisMonth ? "default" : "destructive"} className="dashboard-widget__badge flex items-center gap-1 text-[10px] h-5 px-2">
                                {allPaidThisMonth ? (
                                    <><Check className="h-2.5 w-2.5" /> Paid</>
                                ) : (
                                    <><X className="h-2.5 w-2.5" /> Unpaid</>
                                )}
                            </Badge>
                        </div>
                        <div className="text-right">
                            <p className="dashboard-widget__meta text-[10px]">{activeCredits.length} Active</p>
                        </div>
                    </div>
                ) : showTwoColumn ? (
                    <div className="grid grid-cols-2 gap-4 h-full">
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <p className="dashboard-widget__meta text-[10px]">This Month</p>
                                <Badge variant={allPaidThisMonth ? "default" : "destructive"} className="dashboard-widget__badge flex items-center gap-1 text-[10px] h-5 px-2">
                                    {allPaidThisMonth ? (
                                        <><Check className="h-2.5 w-2.5" /> Paid</>
                                    ) : (
                                        <><X className="h-2.5 w-2.5" /> Unpaid</>
                                    )}
                                </Badge>
                            </div>
                            <div className="dashboard-widget__value text-base">
                                <CurrencyDisplay amount={monthlyPayment} currency="KZT" />
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <p className="dashboard-widget__meta text-[10px]">{is2x2 ? `All Credits (${activeCredits.length})` : 'Top Credits (4)'}</p>
                            <div className="space-y-1">
                                {displayCredits.map((credit: any) => {
                                    const isPaidThisMonth = credit.payments?.some((p: any) => p.monthYear === currentMonth);
                                    return (
                                        <div key={credit.id} className="dashboard-widget__item flex items-center justify-between p-1.5 rounded-md bg-muted/30 text-[11px]">
                                            <div className="flex items-center gap-1.5 max-w-[60%]">
                                                {isPaidThisMonth ? (
                                                    <Check className="h-2.5 w-2.5 text-green-600 flex-shrink-0" />
                                                ) : (
                                                    <X className="h-2.5 w-2.5 text-red-600 flex-shrink-0" />
                                                )}
                                                <span className="truncate">{credit.name}</span>
                                            </div>
                                            <span className="font-medium whitespace-nowrap ml-2 text-[11px]">
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
                                <CurrencyDisplay amount={monthlyPayment} currency="KZT" />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <p className="dashboard-widget__meta">Active Credits ({activeCredits.length})</p>
                            <div className="space-y-1.5">
                                {activeCredits.map((credit: any) => {
                                    const isPaidThisMonth = credit.payments?.some((p: any) => p.monthYear === currentMonth);
                                    return (
                                        <div key={credit.id} className="dashboard-widget__item flex items-center justify-between p-2 rounded-md bg-muted/30">
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
                    </div>
                ) : (
                    <div className="space-y-1">
                        <div className="space-y-0.5">
                            {activeCredits.slice(0, 3).map((credit: any) => {
                                const isPaidThisMonth = credit.payments?.some((p: any) => p.monthYear === currentMonth);
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
