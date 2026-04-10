import React from 'react';
import { Link } from '@tanstack/react-router';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Users, Check, ArrowRight, UserPlus } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { CurrencyDisplay } from '@/components/CurrencyDisplay';
import { WidgetFooter } from './WidgetFooter';

type GridParams = { w: number; h: number; breakpoint?: string };

export function SplitBillWidget({ gridParams }: { gridParams?: GridParams }) {
    const { data: summary, isLoading } = trpc.splitBill.getOwedSummary.useQuery();

    const bp = gridParams?.breakpoint;
    const isSmallBp = bp === 'sm' || bp === 'xs';
    const isNarrow = (gridParams?.w ?? 0) <= 1;
    const isShort = (gridParams?.h ?? 0) <= 2;
    const isCompact = isNarrow || isShort;
    const isTall = (gridParams?.h ?? 0) > (isSmallBp ? 2 : 2);

    if (isLoading) {
        return (
            <Card className="dashboard-widget h-full overflow-hidden">
                <CardHeader className="p-3 pb-2">
                    <Skeleton className="h-4 w-24" />
                </CardHeader>
                <CardContent className="p-3 pt-0">
                    <Skeleton className="h-8 w-32 mb-4" />
                    <Skeleton className="h-12 w-full" />
                </CardContent>
            </Card>
        );
    }

    const totalOwed = summary?.total || 0;
    const participants = summary?.byParticipant || [];
    const visibleParticipants = isTall ? participants.slice(0, 4) : participants.slice(0, 2);

    return (
        <Card className={cn('dashboard-widget h-full flex flex-col group overflow-hidden', isCompact && 'dashboard-widget--compact')}>
            <div className="flex-1 flex flex-col min-h-0 min-w-0">
                <CardHeader className="p-3 pb-1 flex flex-row items-start justify-between">
                    <div className="flex flex-col min-w-0 flex-1">
                        <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-0.5">Split Bills</div>
                        <div className="flex items-baseline gap-2 flex-wrap">
                            <span className="text-lg font-bold tracking-tight whitespace-nowrap text-emerald-600 dark:text-emerald-500">
                                <CurrencyDisplay amount={totalOwed} abbreviate={totalOwed > 1000000} />
                            </span>
                            <span className="text-[10px] text-muted-foreground font-medium ml-1">owed to you</span>
                        </div>
                    </div>
                    <div className="p-1.5 bg-emerald-500/10 rounded-md group-hover:bg-emerald-500/20 transition-colors">
                        <Users className="h-4 w-4 text-emerald-500" />
                    </div>
                </CardHeader>

                <CardContent className="px-3 py-1 flex-1 flex flex-col min-h-0">
                    <div className="flex-1 space-y-1.5 overflow-hidden py-1">
                        {participants.length === 0 ? (
                            <div className="flex items-center justify-center h-full text-center py-4">
                                <p className="text-[10px] text-muted-foreground italic uppercase tracking-wider">No pending splits</p>
                            </div>
                        ) : (
                            visibleParticipants.map((item: any) => (
                                <div key={item.participant.id} className="flex items-center justify-between gap-2 p-1.5 rounded-md bg-muted/40 hover:bg-muted/60 transition-colors group/item">
                                    <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                        <div 
                                            className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold text-white shadow-sm flex-shrink-0"
                                            style={{ backgroundColor: item.participant.color }}
                                        >
                                            {item.participant.name.charAt(0).toUpperCase()}
                                        </div>
                                        <div className="flex flex-col min-w-0">
                                            <span className="text-[10px] font-bold truncate leading-tight">{item.participant.name}</span>
                                            <span className="text-[8px] text-muted-foreground uppercase">Pending</span>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-[10px] font-bold text-emerald-600">
                                            <CurrencyDisplay amount={item.remaining} abbreviate />
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </CardContent>
            </div>

            <WidgetFooter>
                <span className="text-[9px] font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                    <UserPlus className="h-2.5 w-2.5" />
                    {participants.length} People
                </span>
                <Link to="/spending" className="dashboard-widget__footer-action text-[9px] font-bold text-primary flex items-center gap-0.5 hover:underline uppercase tracking-wider">
                    Details <ArrowRight className="h-2.5 w-2.5" />
                </Link>
            </WidgetFooter>
        </Card>
    );
}
