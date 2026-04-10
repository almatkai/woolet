import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { AlertTriangle, ArrowRight } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { Link } from '@tanstack/react-router';
import { cn } from '@/lib/utils';

export function SpendingAnomalyCard() {
    const { data: anomalies, isLoading } = trpc.ai.getSpendingAnomalies.useQuery(undefined, {
        staleTime: 1000 * 60 * 60 * 24, // Check once a day roughly
        refetchOnWindowFocus: false,
    });

    if (isLoading) return null; 
    if (!anomalies) return null;

    return (
        <Card className="dashboard-widget border-orange-200 dark:border-orange-900 bg-orange-50/10 dark:bg-orange-900/10 group overflow-hidden">
            <div className="flex-1 flex flex-col min-h-0 min-w-0">
                <CardHeader className="p-3 pb-1 flex flex-row items-start justify-between">
                    <div className="flex flex-col min-w-0 flex-1">
                        <div className="text-[11px] font-bold text-orange-600 dark:text-orange-400 uppercase tracking-wider mb-0.5">AI Insights</div>
                        <div className="flex items-baseline gap-1.5 flex-wrap">
                            <span className="text-lg font-bold tracking-tight text-orange-700 dark:text-orange-300 whitespace-nowrap">
                                Spending Alert
                            </span>
                        </div>
                    </div>
                    <div className="p-1.5 bg-orange-500/10 rounded-md group-hover:bg-orange-500/20 transition-colors">
                        <AlertTriangle className="h-4 w-4 text-orange-500" />
                    </div>
                </CardHeader>

                <CardContent className="px-3 py-1 flex-1 flex flex-col min-h-0">
                    <div className="prose prose-xs dark:prose-invert max-w-none text-muted-foreground line-clamp-3">
                        {typeof anomalies === 'string' && anomalies.trim().length > 0 && (
                            <ReactMarkdown children={anomalies} />
                        )}
                    </div>
                </CardContent>
            </div>

            <div className="dashboard-widget__footer px-3 py-1.5 border-t border-orange-200/50 dark:border-orange-900/50 bg-orange-50/20 dark:bg-orange-900/20 flex items-center justify-between">
                <span className="text-[9px] font-medium text-orange-600/80 dark:text-orange-400/80 uppercase tracking-wider">
                    AI Powered Analysis
                </span>
                <Link to="/spending" className="dashboard-widget__footer-action text-[9px] font-bold text-orange-600 dark:text-orange-400 flex items-center gap-0.5 hover:underline uppercase tracking-wider">
                    Details <ArrowRight className="h-2.5 w-2.5" />
                </Link>
            </div>
        </Card>
    );
}
