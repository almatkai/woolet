import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

export function SpendingAnomalyCard() {
    const { data: anomalies, isLoading } = trpc.ai.getSpendingAnomalies.useQuery(undefined, {
        staleTime: 1000 * 60 * 60 * 24, // Check once a day roughly
        refetchOnWindowFocus: false,
    });

    if (isLoading) return null; // Don't show skeleton for this, as it's optional/alert-based
    if (!anomalies) return null; // No anomalies found

    return (
        <Card className="border-orange-200 dark:border-orange-900 bg-orange-50/10 dark:bg-orange-900/10 mb-4">
            <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                    <CardTitle className="text-lg font-medium">Spending Alert</CardTitle>
                </div>
            </CardHeader>
            <CardContent>
                <div className="prose prose-sm dark:prose-invert max-w-none text-muted-foreground">
                    {typeof anomalies === 'string' && anomalies.trim().length > 0 && (
                        <ReactMarkdown children={anomalies} />
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
