import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { trpc } from '@/lib/trpc';
import { Link } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { CreditCard, Save, Filter, Eye, EyeOff, Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subDays } from 'date-fns';
import { CurrencyDisplay } from '@/components/CurrencyDisplay';
import { MultiSelect } from '@/components/ui/multi-select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';

const STORAGE_KEY = 'woolet :recent-transactions-widget';

interface Transaction {
    id: string;
    amount: string | number;
    description?: string | null;
    date: string;
    type: string;
    category?: {
        id: string;
        name: string;
        icon: string;
    } | null;
    currencyBalance?: {
        currencyCode: string;
        account?: {
            name: string;
        } | null;
    };
}

export function RecentTransactionsWidget({ gridParams }: { gridParams?: { w: number; h: number } }) {
    // State for filters and preferences
    const [excludedCategories, setExcludedCategories] = useState<string[]>(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) {
                try {
                    const parsed = JSON.parse(saved);
                    return parsed.excludedCategories || [];
                } catch (e) {
                    console.error('Failed to parse saved preferences', e);
                }
            }
        }
        return [];
    });

    const [period, setPeriod] = useState<'week' | 'month' | 'all'>(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) {
                try {
                    const parsed = JSON.parse(saved);
                    return parsed.period || 'all';
                } catch (e) {
                    console.error('Failed to parse saved period', e);
                }
            }
        }
        return 'all';
    });

    const [showIncomeOnly, setShowIncomeOnly] = useState(false);
    const [showExpensesOnly, setShowExpensesOnly] = useState(false);

    const utils = trpc.useUtils();
    const { data: user } = trpc.user.me.useQuery();
    const { data: categories } = trpc.category.list.useQuery();

    const updateUser = trpc.user.update.useMutation({
        onSuccess: () => {
            toast.success('Widget preferences saved');
            utils.user.me.invalidate();
        },
        onError: () => {
            toast.error('Failed to save preferences');
        }
    });

    // Sync LocalStorage
    useEffect(() => {
        const prefs = {
            excludedCategories,
            period,
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    }, [excludedCategories, period]);

    // Sync from Database
    useEffect(() => {
        if (user?.preferences) {
            const prefs = user.preferences as any;
            const dbPrefs = prefs?.recentTransactionsWidget;
            if (dbPrefs) {
                if (Array.isArray(dbPrefs.excludedCategories)) {
                    const currentStr = JSON.stringify(excludedCategories.slice().sort());
                    const dbStr = JSON.stringify(dbPrefs.excludedCategories.slice().sort());
                    if (currentStr !== dbStr) {
                        setExcludedCategories(dbPrefs.excludedCategories);
                    }
                }
                if (dbPrefs.period && dbPrefs.period !== period) {
                    setPeriod(dbPrefs.period);
                }
            }
        }
    }, [user]);

    const handleSavePreferences = () => {
        const currentPrefs = (user?.preferences as any) || {};
        updateUser.mutate({
            preferences: {
                ...currentPrefs,
                recentTransactionsWidget: {
                    ...currentPrefs.recentTransactionsWidget,
                    excludedCategories: excludedCategories,
                    period: period,
                }
            }
        });
    };

    // Calculate date range
    const dateRange = useMemo(() => {
        const now = new Date();
        if (period === 'week') {
            return {
                start: startOfWeek(now, { weekStartsOn: 1 }).toISOString(),
                end: endOfWeek(now, { weekStartsOn: 1 }).toISOString()
            };
        } else if (period === 'month') {
            return {
                start: startOfMonth(now).toISOString(),
                end: endOfMonth(now).toISOString()
            };
        }
        return null; // All time
    }, [period]);

    const queryParams = useMemo(() => ({
        limit: 20,
        hideAdjustments: true,
        ...(dateRange && {
            startDate: dateRange.start,
            endDate: dateRange.end
        })
    }), [dateRange]);

    const { data: recentTransactions, isLoading } = trpc.transaction.list.useQuery(queryParams) as { data: { transactions: Transaction[] } | undefined, isLoading: boolean };

    // Filter transactions
    const filteredTransactions = useMemo(() => {
        if (!recentTransactions?.transactions) return [];
        
        return recentTransactions.transactions.filter(tx => {
            // Category filter
            if (excludedCategories.length > 0 && tx.category?.id && excludedCategories.includes(tx.category.id)) {
                return false;
            }
            
            // Type filter
            if (showIncomeOnly && tx.type !== 'income') return false;
            if (showExpensesOnly && tx.type !== 'expense') return false;
            
            return true;
        });
    }, [recentTransactions, excludedCategories, showIncomeOnly, showExpensesOnly]);

    const categoryOptions = categories?.map((cat: any) => ({
        label: cat.name,
        value: cat.id,
        icon: <span className="mr-1">{cat?.icon}</span>
    })) || [];

    // Less restrictive compact mode - only for very small widgets
    const isCompact = (gridParams?.w ?? 0) <= 1 && (gridParams?.h ?? 0) <= 1;

    if (isCompact) {
        const transactions = recentTransactions?.transactions || [];

        return (
            <Card className="dashboard-widget dashboard-widget--compact h-full flex flex-col">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 p-2 pb-1 flex-shrink-0">
                    <CardTitle className="dashboard-widget__title">Recent</CardTitle>
                    <CreditCard className="dashboard-widget__icon" />
                </CardHeader>
                <CardContent className="p-3 pt-1 flex-1 overflow-auto scrollbar-hide">
                    <div className="space-y-2.5">
                        {transactions.length > 0 ? (
                            transactions.map((tx) => (
                                <div key={tx.id} className="flex items-center justify-between gap-3 group">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <div className="h-7 w-7 rounded-full bg-muted/50 flex items-center justify-center text-xs flex-shrink-0 group-hover:bg-muted transition-colors">
                                            {tx.category?.icon || '📄'}
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-[11px] font-semibold text-foreground truncate leading-tight">
                                                {tx.description || tx.category?.name || 'Unknown'}
                                            </p>
                                            <p className="text-[9px] text-muted-foreground truncate leading-tight">
                                                {format(new Date(tx.date), 'MM/dd')} • {tx.currencyBalance?.account?.name || 'Account'}
                                            </p>
                                        </div>
                                    </div>
                                    <div className={cn(
                                        "text-[11px] font-bold whitespace-nowrap",
                                        tx.type === 'income' ? 'text-green-600' : tx.type === 'expense' ? 'text-red-600' : 'text-foreground'
                                    )}>
                                        <CurrencyDisplay 
                                            amount={tx.type === 'expense' ? -Math.abs(Number(tx.amount)) : Number(tx.amount)} 
                                            currency={tx.currencyBalance?.currencyCode || 'USD'} 
                                            showSign 
                                            abbreviate 
                                        />
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="text-[10px] text-muted-foreground text-center py-4 italic">
                                No transactions
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className={cn('dashboard-widget h-full flex flex-col', isCompact && 'dashboard-widget--compact')}>
            <CardHeader className="p-3 pb-1">
                <CardTitle className="dashboard-widget__title truncate text-sm">Recent Transactions</CardTitle>
                <CardDescription className="dashboard-widget__desc text-[10px] sm:text-xs truncate">Your latest spending activity</CardDescription>
            </CardHeader>
            <CardContent className="flex-1 overflow-auto p-3 pt-0">
                <div className="space-y-1 sm:space-y-4">
                    {(recentTransactions?.transactions || []).length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full min-h-[60px] text-center">
                            <p className="dashboard-widget__desc">No recent transactions</p>
                        </div>
                    ) : (
                        recentTransactions?.transactions.map((tx: Transaction) => (
                            <div key={tx.id} className="flex items-center justify-between py-1 px-1 sm:p-2 hover:bg-muted/50 rounded-lg transition-colors">
                                <div className="flex items-center gap-2 sm:gap-3">
                                    <div className="h-6 w-6 sm:h-10 sm:w-10 rounded-full bg-muted flex items-center justify-center dashboard-widget__item">
                                        {tx.category?.icon || '📄'}
                                    </div>
                                    <div>
                                        <p className="dashboard-widget__item font-medium truncate max-w-[100px] sm:max-w-[150px]">{tx.description || tx.category?.name || 'Unknown'}</p>
                                        <p className="dashboard-widget__meta">
                                            {new Date(tx.date).toLocaleDateString()}
                                        </p>
                                    </div>
                                </div>
                                <span className={`dashboard-widget__item font-semibold whitespace-nowrap ${tx.type === 'income' ? 'text-green-600' : tx.type === 'expense' ? 'text-red-600' : 'text-foreground'}`}>
                                    <CurrencyDisplay 
                                        amount={tx.type === 'expense' ? -Math.abs(Number(tx.amount)) : Number(tx.amount)} 
                                        currency={tx.currencyBalance?.currencyCode || 'USD'} 
                                        showSign={tx.type === 'income'}
                                    />
                                </span>
                            </div>
                        ))
                    )}
                </div>
                {(recentTransactions?.transactions || []).length > 0 && (
                    <div className="pt-2 sm:pt-4">
                        <Link to="/spending">
                            <Button variant="outline" className="dashboard-widget__button w-full h-7 sm:h-9">
                                View All
                            </Button>
                        </Link>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
