import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Users, Check, ChevronRight, Clock } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { CurrencyDisplay } from '@/components/CurrencyDisplay';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

interface SplitBillWidgetProps {
    gridParams?: { w: number; h: number };
}

export function SplitBillWidget({ gridParams }: SplitBillWidgetProps) {
    const utils = trpc.useUtils();
    const { data: summary, isLoading } = trpc.splitBill.getOwedSummary.useQuery();
    const { data: pendingTransactions } = trpc.splitBill.getPendingSplits.useQuery();

    const settleMutation = trpc.splitBill.settleSplit.useMutation({
        onSuccess: () => {
            utils.splitBill.getOwedSummary.invalidate();
            utils.splitBill.getPendingSplits.invalidate();
            toast.success('Split settled!');
        },
        onError: () => toast.error('Failed to settle split'),
    });

    const isCompact = (gridParams?.h ?? 0) <= 1;
    const isLarge = (gridParams?.w ?? 0) >= 2 && (gridParams?.h ?? 0) >= 2;

    if (isLoading) {
        return (
            <Card className={cn('dashboard-widget h-full', isCompact && 'dashboard-widget--compact')}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 pb-1">
                    <Skeleton className="h-4 w-32" />
                </CardHeader>
                <CardContent className="p-3 pt-0">
                    <Skeleton className="h-8 w-full" />
                </CardContent>
            </Card>
        );
    }

    // Compact view
    if (isCompact) {
        return (
            <Card className="dashboard-widget dashboard-widget--compact h-full flex flex-col justify-between">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 p-2 pb-1">
                    <CardTitle className="dashboard-widget__title truncate text-sm">Split Bills</CardTitle>
                    <Users className="dashboard-widget__icon" />
                </CardHeader>
                <CardContent className="p-2 pt-0">
                    <div className="dashboard-widget__value">
                        <CurrencyDisplay amount={summary?.total || 0} />
                    </div>
                    <p className="dashboard-widget__sub mt-0.5 truncate">
                        {summary?.byParticipant.length || 0} people owe you
                    </p>
                </CardContent>
            </Card>
        );
    }

    // Regular and large views
    return (
        <Card className="dashboard-widget h-full flex flex-col">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 pb-1">
                <div>
                    <CardTitle className="dashboard-widget__title truncate text-sm">Split Bills</CardTitle>
                    <CardDescription className="dashboard-widget__desc text-[10px] sm:text-xs truncate">
                        Who owes you money
                    </CardDescription>
                </div>
                <Users className="dashboard-widget__icon" />
            </CardHeader>
            <CardContent className="flex-1 overflow-hidden p-3 pt-0">
                {!summary?.byParticipant.length ? (
                    <div className="flex flex-col items-center justify-center h-full text-center">
                        <Users className="h-8 w-8 text-muted-foreground mb-2" />
                        <p className="text-sm text-muted-foreground">No pending splits</p>
                        <p className="text-xs text-muted-foreground mt-1">
                            Add people to transactions to track who owes you
                        </p>
                    </div>
                ) : (
                    <div className="h-full flex flex-col">
                        {/* Total */}
                        <div className="bg-muted rounded-lg p-3 mb-3">
                            <div className="text-xs text-muted-foreground">Total owed to you</div>
                            <div className="text-2xl font-bold">
                                <CurrencyDisplay amount={summary.total} />
                            </div>
                        </div>

                        {/* By Person */}
                        <ScrollArea className="flex-1">
                            <div className="space-y-2">
                                {summary.byParticipant.map((item: any) => (
                                    <div
                                        key={item.participant.id}
                                        className="dashboard-widget__item flex items-center gap-3 p-2"
                                    >
                                        <div
                                            className="w-8 h-8 rounded-full flex items-center justify-center text-white font-medium shrink-0"
                                            style={{ backgroundColor: item.participant.color }}
                                        >
                                            {item.participant.name.charAt(0).toUpperCase()}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="font-medium text-sm truncate">{item.participant.name}</div>
                                            {item.participant.contactValue && (
                                                <div className="text-xs text-muted-foreground truncate">
                                                    {item.participant.contactValue}
                                                </div>
                                            )}
                                        </div>
                                        <div className="text-right shrink-0">
                                            <div className="font-semibold text-sm">
                                                <CurrencyDisplay amount={item.remaining} />
                                            </div>
                                            {item.totalPaid > 0 && (
                                                <div className="text-xs text-green-500">
                                                    Paid: <CurrencyDisplay amount={item.totalPaid} />
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </ScrollArea>

                        {/* Recent Pending Splits (in large view) */}
                        {isLarge && pendingTransactions && pendingTransactions.length > 0 && (
                            <div className="mt-3 pt-3 border-t">
                                <div className="text-xs font-medium text-muted-foreground mb-2">
                                    Recent Pending
                                </div>
                                <div className="space-y-1">
                                    {pendingTransactions.slice(0, 3).map((tx: any) => (
                                        <div key={tx.id} className="text-xs flex items-center justify-between">
                                            <span className="truncate flex-1">
                                                {tx.description || tx.category?.name || 'Transaction'}
                                            </span>
                                            <div className="flex items-center gap-1 ml-2">
                                                {tx.splits.map((s: any) => (
                                                    <Badge
                                                        key={s.id}
                                                        variant={s.status === 'settled' ? 'secondary' : 'outline'}
                                                        className="text-[10px] h-5"
                                                        style={{ borderColor: s.participant.color }}
                                                    >
                                                        {s.status === 'pending' && <Clock className="h-2.5 w-2.5 mr-0.5" />}
                                                        {s.status === 'settled' && <Check className="h-2.5 w-2.5 mr-0.5" />}
                                                        {s.participant.name.split(' ')[0]}
                                                    </Badge>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
