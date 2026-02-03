import { useMemo, useState, useEffect } from 'react';
import posthog from 'posthog-js';
import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    Area,
    AreaChart as RechartsAreaChart,
    CartesianGrid,
    ResponsiveContainer,
    Tooltip as RechartsTooltip,
    XAxis,
    YAxis,
} from 'recharts';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight, DollarSign, Wallet, PieChart, BarChart3, LineChart, Trophy, AlertCircle, Trash2, ExternalLink, Cpu, Droplets, Stethoscope, Globe, Newspaper, Plus, Minus } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { AddInvestmentSheet } from '@/components/AddInvestmentSheet';
import { EditInvestmentTransactionSheet } from '@/components/EditInvestmentTransactionSheet';
import { Skeleton } from '@/components/ui/skeleton';
import { CurrencyDisplay } from '@/components/CurrencyDisplay';

import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

import { AiDigestCard } from '@/components/investing/AiDigestCard';

interface StockItem {
    id: string;
    ticker: string;
    name: string;
    exchange?: string | null;
    currency: string;
}

interface HoldingSummary {
    stockId: string;
    ticker: string;
    name: string;
    quantity: number;
    averageCostBasis: number;
    currentPrice: number;
    currentValue: number;
    unrealizedPL: number;
    unrealizedPLPercent: number;
    currency: string;
}

interface Transaction {
    id: string;
    type: 'buy' | 'sell';
    quantity: number;
    pricePerShare: number;
    date: string;
    notes?: string | null;
    stock: {
        ticker: string;
        name: string;
    };
}

interface HoldingWithAllocation extends HoldingSummary {
    allocation: number;
}

type TradeType = 'buy' | 'sell';

interface NewsLinkProps {
    title: string;
    description: string;
    url: string;
    icon: React.ReactNode;
}

function NewsLink({ title, description, url, icon }: NewsLinkProps) {
    return (
        <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-start justify-between p-2.5 border rounded-lg bg-muted/20 hover:bg-muted/40 transition-colors group"
        >
            <div className="flex items-start gap-3">
                <div className="p-1.5 mt-0.5 bg-background rounded-md border text-muted-foreground group-hover:text-primary transition-colors shrink-0">
                    {icon}
                </div>
                <div className="flex-1 min-w-0">
                    <p className="font-semibold text-xs leading-tight group-hover:text-primary transition-colors line-clamp-2">{title}</p>
                    <p className="text-[10px] text-muted-foreground mt-1 line-clamp-2 leading-relaxed">{description}</p>
                </div>
            </div>
            <ExternalLink className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity mt-1 shrink-0" />
        </a>
    );
}

function NewsFeed({ category, icon }: { category: 'latest' | 'ai' | 'oil' | 'medical', icon: React.ReactNode }) {
    const { data: news, isLoading, error } = trpc.news.getNewsByCategory.useQuery({ category });

    if (isLoading) {
        return (
            <div className="space-y-2 mt-3">
                {[...Array(5)].map((_, i) => (
                    <div key={i} className="p-2.5 border rounded-lg flex gap-3">
                        <Skeleton className="h-8 w-8 rounded-md shrink-0" />
                        <div className="flex-1 space-y-1.5 min-w-0">
                            <Skeleton className="h-3 w-3/4" />
                            <Skeleton className="h-2 w-full" />
                            <Skeleton className="h-2 w-1/2" />
                        </div>
                    </div>
                ))}
            </div>
        );
    }

    if (error || !news || news.length === 0) {
        return (
            <div className="mt-3 p-4 text-center border border-dashed rounded-lg bg-muted/10">
                <p className="text-xs text-muted-foreground font-medium">No live news available right now.</p>
                <p className="text-[10px] text-muted-foreground mt-1">Please try again in a few minutes.</p>
            </div>
        );
    }

    return (
        <div className="space-y-2 mt-3">
            {news.slice(0, 7).map((item: any, i: number) => (
                <NewsLink
                    key={i}
                    title={item.title}
                    description={item.description}
                    url={item.link}
                    icon={icon}
                />
            ))}
        </div>
    );
}

export function InvestingPage() {
    const [tradeOpen, setTradeOpen] = useState(false);
    const [tradeType, setTradeType] = useState<TradeType>('buy');
    const [tradeStock, setTradeStock] = useState<StockItem | null>(null);
    const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
    const [tradeQuantity, setTradeQuantity] = useState('');
    const [tradePrice, setTradePrice] = useState('');
    const [tradeDate, setTradeDate] = useState(() => new Date().toISOString().split('T')[0]);
    const [tradeNotes, setTradeNotes] = useState('');
    const [cashDialogOpen, setCashDialogOpen] = useState(false);
    const [cashAmount, setCashAmount] = useState('');
    const [cashCurrency, setCashCurrency] = useState('USD');
    const [cashType, setCashType] = useState<'deposit' | 'withdraw'>('deposit');
    const [cashNotes, setCashNotes] = useState('');

    const { data: summary, isLoading: isSummaryLoading } = trpc.investing.getPortfolioSummary.useQuery();
    const { data: stocks, isLoading: isStocksLoading } = trpc.investing.listStocks.useQuery();
    const { data: transactions } = trpc.investing.getTransactions.useQuery({});
    const { data: cashBalances } = trpc.investing.getInvestmentCashBalance.useQuery();
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 10;
    const chartRange = '1Y';
    const { data: benchmarkComparison, isLoading: isBenchmarkLoading } = trpc.investing.getBenchmarkComparison.useQuery({
        range: chartRange,
    });

    const utils = trpc.useUtils();

    useEffect(() => {
        if (summary) {
            posthog.setPersonProperties({ 
                investment_count: summary.holdings.length,
                total_investment_value: summary.totalValue
            });
            posthog.capture('investing_viewed', { 
                investment_count: summary.holdings.length,
                total_investment_value: summary.totalValue
            });
        }
    }, [summary]);

    const buyStock = trpc.investing.buyStock.useMutation({
        onSuccess: () => {
            utils.investing.getPortfolioSummary.invalidate();
            utils.investing.listStocks.invalidate();
            utils.investing.getTransactions.invalidate();
            toast.success('Buy transaction recorded');
            resetTrade();
        },
        onError: (error: any) => toast.error(error.message || 'Failed to record buy'),
    });

    const sellStock = trpc.investing.sellStock.useMutation({
        onSuccess: () => {
            utils.investing.getPortfolioSummary.invalidate();
            utils.investing.listStocks.invalidate();
            utils.investing.getTransactions.invalidate();
            toast.success('Sell transaction recorded');
            resetTrade();
        },
        onError: (error: any) => toast.error(error.message || 'Failed to record sell'),
    });

    const deleteAllStocks = trpc.investing.deleteAllStocks.useMutation({
        onSuccess: () => {
            utils.investing.getPortfolioSummary.invalidate();
            utils.investing.listStocks.invalidate();
            utils.investing.getTransactions.invalidate();
            utils.investing.getInvestmentCashBalance.invalidate();
            toast.success('All stocks deleted');
        },
        onError: (error: any) => toast.error(error.message || 'Failed to delete stocks'),
    });

    const depositCash = trpc.investing.depositToInvestment.useMutation({
        onSuccess: () => {
            utils.investing.getPortfolioSummary.invalidate();
            utils.investing.getInvestmentCashBalance.invalidate();
            toast.success('Cash deposited to investment account');
        },
        onError: (error: any) => toast.error(error.message || 'Failed to deposit cash'),
    });

    const withdrawCash = trpc.investing.withdrawFromInvestment.useMutation({
        onSuccess: () => {
            utils.investing.getPortfolioSummary.invalidate();
            utils.investing.getInvestmentCashBalance.invalidate();
            toast.success('Cash withdrawn from investment account');
        },
        onError: (error: any) => toast.error(error.message || 'Failed to withdraw cash'),
    });

    const holdingsByStockId = useMemo(() => {
        const map = new Map<string, HoldingSummary>();
        (summary?.holdings || []).forEach((holding: HoldingSummary) => {
            map.set(holding.stockId, holding);
        });
        return map;
    }, [summary]);

    // Calculate allocation percentages for holdings
    const holdingsWithAllocation: HoldingWithAllocation[] = useMemo(() => {
        if (!summary?.holdings || summary.holdings.length === 0) return [];
        const total = summary.currentValue || 1;
        return (summary.holdings as HoldingSummary[]).map((h) => ({
            ...h,
            allocation: (h.currentValue / total) * 100,
        })).sort((a, b) => b.currentValue - a.currentValue);
    }, [summary]);

    const portfolioHighlights = useMemo(() => {
        if (!summary?.holdings || summary.holdings.length === 0) return null;
        const h = [...summary.holdings] as HoldingSummary[];
        // Sort by PL %
        const byPerformance = [...h].sort((a, b) => b.unrealizedPLPercent - a.unrealizedPLPercent);
        const best = byPerformance[0];
        const worst = byPerformance[byPerformance.length - 1];

        // Sort by Value
        const byValue = [...h].sort((a, b) => b.currentValue - a.currentValue);
        const largest = byValue[0];

        return { best, worst, largest };
    }, [summary]);

    const totalInvested = summary?.totalInvested ?? 0;
    const currentValue = summary?.stockValue ?? 0; // Stock value only
    const totalCash = summary?.cash?.totalCash ?? 0;
    const totalPortfolioValue = summary?.totalPortfolioValue ?? 0; // Stocks + cash
    const cashAllocationPercent = summary?.cashAllocationPercent ?? 0;
    const totalReturn = summary?.totalReturn ?? 0;
    const totalReturnPercent = summary?.totalReturnPercent ?? 0;
    const totalQuantity = summary?.holdings?.reduce((sum: number, h: HoldingSummary) => sum + h.quantity, 0) ?? 0;
    const avgBuyPrice = totalQuantity > 0 ? totalInvested / totalQuantity : 0;

    const openTrade = (type: TradeType, stock: StockItem) => {
        setTradeType(type);
        setTradeStock(stock);
        setTradeQuantity('');
        setTradePrice('');
        setTradeNotes('');
        setTradeOpen(true);
    };

    const resetTrade = () => {
        setTradeOpen(false);
        setTradeStock(null);
        setTradeQuantity('');
        setTradePrice('');
        setTradeNotes('');
        setTradeDate(new Date().toISOString().split('T')[0]);
    };

    const submitTrade = () => {
        if (!tradeStock) return;
        const quantity = Number(tradeQuantity);
        const pricePerShare = Number(tradePrice);

        if (!quantity || quantity <= 0 || !pricePerShare || pricePerShare <= 0) {
            toast.error('Enter valid quantity and price');
            return;
        }

        const payload = {
            stockId: tradeStock.id,
            date: tradeDate,
            quantity,
            pricePerShare,
            currency: tradeStock.currency,
            notes: tradeNotes || undefined,
        };

        if (tradeType === 'buy') {
            buyStock.mutate(payload);
        } else {
            sellStock.mutate(payload);
        }
    };

    const formatNumber = (value: number) =>
        value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr);
        return date.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
    };

    const isLoading = isSummaryLoading || isStocksLoading;
    const isChartLoading = isLoading || isBenchmarkLoading;

    // Allocation colors
    const allocationColors = [
        'bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-orange-500',
        'bg-pink-500', 'bg-cyan-500', 'bg-yellow-500', 'bg-red-400'
    ];

    const chartData = useMemo(() => {
        const portfolioSeries = benchmarkComparison?.portfolio?.chartData || [];
        const benchmarkSeries = benchmarkComparison?.benchmark?.chartData || [];
        if (portfolioSeries.length === 0 || benchmarkSeries.length === 0) return [];

        const benchmarkMap = new Map(benchmarkSeries.map((point: any) => [point.date, point.value]));
        return portfolioSeries.map((point: any) => ({
            date: point.date,
            portfolio: point.value,
            benchmark: benchmarkMap.get(point.date) ?? 0,
        }));
    }, [benchmarkComparison]);

    const portfolioReturnPercent = benchmarkComparison?.portfolio?.returnPercent ?? 0;
    const benchmarkReturnPercent = benchmarkComparison?.benchmark?.returnPercent ?? 0;
    const outperformance = portfolioReturnPercent - benchmarkReturnPercent;

    const formatShortDate = (value: string, index: number) => {
        const date = new Date(value);
        const month = date.toLocaleDateString('en-US', { month: 'short' });

        // Show year on January or if it's the very first tick
        if (date.getMonth() === 0 || index === 0) {
            return `${month} '${date.getFullYear().toString().slice(-2)}`;
        }
        return month;
    };

    return (
        <div className="space-y-4 h-full">
            {/* Header with Add Button */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold">Investing</h1>
                    <p className="text-sm text-muted-foreground">Track stocks, ETFs, and portfolio performance</p>
                </div>
                <AddInvestmentSheet />
            </div>

            {/* Edit Transaction Sheet */}
            <EditInvestmentTransactionSheet
                open={!!editingTransaction}
                onOpenChange={(open) => !open && setEditingTransaction(null)}
                transaction={editingTransaction}
            />

            {/* AI Digest */}
            <AiDigestCard />

            {/* Cash & Portfolio Value Row */}
            <div className="flex flex-col lg:flex-row gap-4">
                
                {/* Asset Performance Metrics - Fixed width 186px, appears first on mobile */}
                <Card className="flex flex-col w-full lg:w-[186px] shrink-0 order-3 lg:order-3">
                    <CardHeader className="pb-2 pt-4 px-4">
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                            <BarChart3 className="h-4 w-4" />
                            Asset Performance Metrics
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="px-4 pb-4">
                        {/* Desktop: Vertical layout */}
                        <div className="hidden lg:flex flex-col gap-4">
                            <div className="flex items-center gap-2">
                                <div className="p-1.5 rounded-full bg-muted">
                                    <DollarSign className="h-4 w-4 text-muted-foreground" />
                                </div>
                                <div>
                                    <div className="text-xs text-muted-foreground">Total Invested</div>
                                    <div className="text-sm font-semibold">
                                        <CurrencyDisplay amount={totalInvested} currency="USD" />
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="p-1.5 rounded-full bg-muted">
                                    <Wallet className="h-4 w-4 text-green-500" />
                                </div>
                                <div>
                                    <div className="text-xs text-muted-foreground">Current Value</div>
                                    <div className="text-sm font-semibold text-green-500">
                                        <CurrencyDisplay amount={currentValue} currency="USD" className="text-green-500" />
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="p-1.5 rounded-full bg-muted">
                                    <TrendingUp className="h-4 w-4 text-green-500" />
                                </div>
                                <div>
                                    <div className="text-xs text-muted-foreground">Total Return</div>
                                    <div className={`text-sm font-semibold ${totalReturn >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                        <CurrencyDisplay
                                            amount={totalReturn}
                                            currency="USD"
                                            className={totalReturn >= 0 ? 'text-green-500' : 'text-red-500'}
                                            showSign
                                        /> ({totalReturnPercent.toFixed(1)}%)
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="p-1.5 rounded-full bg-muted">
                                    <DollarSign className="h-4 w-4 text-muted-foreground" />
                                </div>
                                <div>
                                    <div className="text-xs text-muted-foreground">Avg Buy Price</div>
                                    <div className="text-sm font-semibold">
                                        <CurrencyDisplay amount={avgBuyPrice} currency="USD" />
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="p-1.5 rounded-full bg-muted">
                                    <PieChart className="h-4 w-4 text-muted-foreground" />
                                </div>
                                <div>
                                    <div className="text-xs text-muted-foreground">Total Units Owned</div>
                                    <div className="text-sm font-semibold">
                                        <CurrencyDisplay amount={totalQuantity} abbreviate={false} />
                                    </div>
                                </div>
                            </div>
                        </div>
                        {/* Mobile: 3-column grid layout - Total Return spans 2 rows on right (sm+) */}
                        <div className="hidden sm:flex lg:hidden flex-col gap-3">
                            <div className="grid grid-cols-[1fr_1fr_auto] gap-3">
                                {/* Left column - Row 1: Total Invested */}
                                <div className="flex items-center gap-2">
                                    <div className="p-1.5 rounded-full bg-muted">
                                        <DollarSign className="h-4 w-4 text-muted-foreground" />
                                    </div>
                                    <div>
                                        <div className="text-xs text-muted-foreground">Total Invested</div>
                                        <div className="text-sm font-semibold">
                                            <CurrencyDisplay amount={totalInvested} currency="USD" />
                                        </div>
                                    </div>
                                </div>
                                {/* Middle column - Row 1: Current Value */}
                                <div className="flex items-center gap-2">
                                    <div className="p-1.5 rounded-full bg-muted">
                                        <Wallet className="h-4 w-4 text-green-500" />
                                    </div>
                                    <div>
                                        <div className="text-xs text-muted-foreground">Current Value</div>
                                        <div className="text-sm font-semibold text-green-500">
                                            <CurrencyDisplay amount={currentValue} currency="USD" className="text-green-500" />
                                        </div>
                                    </div>
                                </div>
                                {/* Right column - spans 2 rows: Total Return */}
                                <div className="flex items-center gap-2 row-span-2 px-3 py-2 rounded-lg bg-muted/30">
                                    <div className="p-1.5 rounded-full bg-muted">
                                        <TrendingUp className={`h-4 w-4 ${totalReturn >= 0 ? 'text-green-500' : 'text-red-500'}`} />
                                    </div>
                                    <div>
                                        <div className="text-xs text-muted-foreground">Total Return</div>
                                        <div className={`text-sm font-bold ${totalReturn >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                            <CurrencyDisplay
                                                amount={totalReturn}
                                                currency="USD"
                                                className={totalReturn >= 0 ? 'text-green-500' : 'text-red-500'}
                                                showSign
                                            />
                                        </div>
                                        <div className={`text-xs ${totalReturn >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                            ({totalReturnPercent.toFixed(1)}%)
                                        </div>
                                    </div>
                                </div>
                                {/* Left column - Row 2: Avg Buy Price */}
                                <div className="flex items-center gap-2">
                                    <div className="p-1.5 rounded-full bg-muted">
                                        <DollarSign className="h-4 w-4 text-muted-foreground" />
                                    </div>
                                    <div>
                                        <div className="text-xs text-muted-foreground">Avg Buy Price</div>
                                        <div className="text-sm font-semibold">
                                            <CurrencyDisplay amount={avgBuyPrice} currency="USD" />
                                        </div>
                                    </div>
                                </div>
                                {/* Middle column - Row 2: Total Units */}
                                <div className="flex items-center gap-2">
                                    <div className="p-1.5 rounded-full bg-muted">
                                        <PieChart className="h-4 w-4 text-muted-foreground" />
                                    </div>
                                    <div>
                                        <div className="text-xs text-muted-foreground">Total Units</div>
                                        <div className="text-sm font-semibold">
                                            <CurrencyDisplay amount={totalQuantity} abbreviate={false} />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        {/* Extra small screens (<600px): 3 rows with Total Return at bottom */}
                        <div className="flex sm:hidden flex-col gap-3">
                            {/* Row 1: Total Invested & Current Value */}
                            <div className="flex gap-4">
                                <div className="flex items-center gap-2 flex-1">
                                    <div className="p-1.5 rounded-full bg-muted">
                                        <DollarSign className="h-4 w-4 text-muted-foreground" />
                                    </div>
                                    <div>
                                        <div className="text-xs text-muted-foreground">Total Invested</div>
                                        <div className="text-sm font-semibold">
                                            <CurrencyDisplay amount={totalInvested} currency="USD" />
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 flex-1">
                                    <div className="p-1.5 rounded-full bg-muted">
                                        <Wallet className="h-4 w-4 text-green-500" />
                                    </div>
                                    <div>
                                        <div className="text-xs text-muted-foreground">Current Value</div>
                                        <div className="text-sm font-semibold text-green-500">
                                            <CurrencyDisplay amount={currentValue} currency="USD" className="text-green-500" />
                                        </div>
                                    </div>
                                </div>
                            </div>
                            {/* Row 2: Avg Buy Price & Total Units */}
                            <div className="flex gap-4">
                                <div className="flex items-center gap-2 flex-1">
                                    <div className="p-1.5 rounded-full bg-muted">
                                        <DollarSign className="h-4 w-4 text-muted-foreground" />
                                    </div>
                                    <div>
                                        <div className="text-xs text-muted-foreground">Avg Buy Price</div>
                                        <div className="text-sm font-semibold">
                                            <CurrencyDisplay amount={avgBuyPrice} currency="USD" />
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 flex-1">
                                    <div className="p-1.5 rounded-full bg-muted">
                                        <PieChart className="h-4 w-4 text-muted-foreground" />
                                    </div>
                                    <div>
                                        <div className="text-xs text-muted-foreground">Total Units</div>
                                        <div className="text-sm font-semibold">
                                            <CurrencyDisplay amount={totalQuantity} abbreviate={false} />
                                        </div>
                                    </div>
                                </div>
                            </div>
                            {/* Row 3: Total Return at bottom */}
                            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30">
                                <div className="p-2 rounded-full bg-muted">
                                    <TrendingUp className={`h-5 w-5 ${totalReturn >= 0 ? 'text-green-500' : 'text-red-500'}`} />
                                </div>
                                <div>
                                    <div className="text-xs text-muted-foreground">Total Return</div>
                                    <div className={`text-base font-bold ${totalReturn >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                        <CurrencyDisplay
                                            amount={totalReturn}
                                            currency="USD"
                                            className={totalReturn >= 0 ? 'text-green-500' : 'text-red-500'}
                                            showSign
                                        /> <span className="text-sm">({totalReturnPercent.toFixed(1)}%)</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Asset Growth - Auto width, fills remaining space */}
                <Card className="flex flex-col flex-1 min-w-0 order-2 lg:order-1 min-h-[300px]">
                    <CardHeader className="pb-2 pt-4 px-4">
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                            <LineChart className="h-4 w-4" />
                            Asset Growth
                        </CardTitle>
                        <CardDescription className="text-xs">Portfolio value over time</CardDescription>
                    </CardHeader>
                    <CardContent className="px-4 pb-4 flex-1 flex flex-col min-h-[300px]">
                        {isChartLoading ? (
                            <div className="h-64 bg-muted animate-pulse rounded" />
                        ) : currentValue === 0 || chartData.length === 0 ? (
                            <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">
                                <div className="text-center">
                                    <LineChart className="h-8 w-8 mx-auto mb-2 opacity-50" />
                                    <p>Add investments to see growth chart</p>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-3 flex-1 flex flex-col h-full">
                                <div className="flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-2">
                                        <Badge className="bg-green-500/10 text-green-600 hover:bg-green-500/10">
                                            Portfolio {portfolioReturnPercent >= 0 ? '+' : ''}{portfolioReturnPercent.toFixed(1)}%
                                        </Badge>
                                        <Badge className="bg-orange-500/10 text-orange-600 hover:bg-orange-500/10">
                                            S&P 500 {benchmarkReturnPercent >= 0 ? '+' : ''}{benchmarkReturnPercent.toFixed(1)}%
                                        </Badge>
                                    </div>
                                    <div className={`text-xs font-medium ${outperformance >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                                        {outperformance >= 0 ? 'Outperformed' : 'Underperformed'} by {Math.abs(outperformance).toFixed(1)}%
                                    </div>
                                </div>
                                <div className="w-full" style={{ height: 250 }}>
                                    <ResponsiveContainer width="100%" height={250}>
                                        <RechartsAreaChart data={chartData} margin={{ left: 8, right: 8 }}>
                                            <CartesianGrid vertical={false} strokeDasharray="3 3" />
                                            <XAxis
                                                dataKey="date"
                                                tickLine={false}
                                                axisLine={false}
                                                tickMargin={8}
                                                tickFormatter={formatShortDate}
                                            />
                                            <YAxis
                                                tickFormatter={(value) => `${value}%`}
                                                tickLine={false}
                                                axisLine={false}
                                                width={40}
                                            />
                                            <RechartsTooltip
                                                cursor={{ stroke: 'hsl(var(--border))' }}
                                                contentStyle={{
                                                    background: 'hsl(var(--card))',
                                                    border: '1px solid hsl(var(--border))',
                                                    color: 'hsl(var(--foreground))',
                                                    borderRadius: 'var(--radius)',
                                                    boxShadow: '0 8px 20px rgba(0,0,0,0.25)',
                                                }}
                                                labelStyle={{ color: 'hsl(var(--muted-foreground))' }}
                                                formatter={(value: number, name: string) => [
                                                    `${value.toFixed(2)}%`,
                                                    name === 'portfolio' ? 'Portfolio' : 'S&P 500',
                                                ]}
                                                labelFormatter={(label) =>
                                                    new Date(label).toLocaleDateString('en-US', {
                                                        month: 'short',
                                                        day: '2-digit',
                                                        year: 'numeric',
                                                    })
                                                }
                                            />
                                            <Area
                                                type="natural"
                                                dataKey="benchmark"
                                                stroke="#f97316"
                                                fill="rgba(249, 115, 22, 0.2)"
                                                strokeWidth={2}
                                            />
                                            <Area
                                                type="natural"
                                                dataKey="portfolio"
                                                stroke="#22c55e"
                                                fill="rgba(34, 197, 94, 0.25)"
                                                strokeWidth={2}
                                            />
                                        </RechartsAreaChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Second Row: My Stocks & Asset Allocation */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* My Stocks */}
                <Card className="flex flex-col">
                    <CardHeader className="pb-2 pt-4 px-4 flex flex-row items-center justify-between">
                        <div className="flex flex-col space-y-1.5">
                            <CardTitle className="text-sm font-medium flex items-center gap-2">
                                <TrendingUp className="h-4 w-4" />
                                My Stocks
                            </CardTitle>
                            <CardDescription className="text-xs">Your tracked stocks and holdings</CardDescription>
                        </div>
                        {stocks && stocks.length > 0 && (
                            <AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-red-500">
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                    <AlertDialogHeader>
                                        <AlertDialogTitle>Delete all stocks?</AlertDialogTitle>
                                        <AlertDialogDescription>
                                            This action cannot be undone. This will permanently delete all your stocks, holdings, and transaction history.
                                        </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                        <AlertDialogAction
                                            className="bg-red-500 hover:bg-red-600"
                                            onClick={() => deleteAllStocks.mutate()}
                                        >
                                            Delete All
                                        </AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                        )}
                    </CardHeader>
                    <CardContent className="px-4 pb-4">
                        {isStocksLoading ? (
                            <div className="space-y-2">
                                {[1, 2, 3].map((i) => (
                                    <div key={i} className="h-10 bg-muted animate-pulse rounded" />
                                ))}
                            </div>
                        ) : (!stocks || stocks.length === 0) ? (
                            <div className="h-28 flex items-center justify-center text-sm text-muted-foreground">
                                <div className="text-center">
                                    <TrendingUp className="h-8 w-8 mx-auto mb-2 opacity-50" />
                                    <p>No stocks added yet</p>
                                    <p className="text-xs mt-1">Click "Add Investment" to get started</p>
                                </div>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow className="text-xs">
                                            <TableHead className="py-2 h-8">Ticker</TableHead>
                                            <TableHead className="py-2 h-8">Name</TableHead>
                                            <TableHead className="py-2 h-8 text-right">Shares</TableHead>
                                            <TableHead className="py-2 h-8 text-right">Value</TableHead>
                                            <TableHead className="py-2 h-8 text-right">P/L</TableHead>
                                            <TableHead className="py-2 h-8 text-center">Actions</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {stocks.map((stock: StockItem) => {
                                            const holding = holdingsByStockId.get(stock.id);
                                            return (
                                                <TableRow key={stock.id} className="text-xs">
                                                    <TableCell className="py-1.5 font-semibold">{stock.ticker}</TableCell>
                                                    <TableCell className="py-1.5 text-muted-foreground max-w-[100px] truncate">{stock.name}</TableCell>
                                                    <TableCell className="py-1.5 text-right">
                                                        {holding ? holding.quantity.toFixed(2) : '0'}
                                                    </TableCell>
                                                    <TableCell className="py-1.5 text-right">
                                                        {holding ? <CurrencyDisplay amount={holding.currentValue} currency="USD" abbreviate={false} /> : '-'}
                                                    </TableCell>
                                                    <TableCell className={`py-1.5 text-right ${holding && holding.unrealizedPL >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                                        {holding ? (
                                                            <CurrencyDisplay
                                                                amount={holding.unrealizedPL}
                                                                currency="USD"
                                                                className={holding.unrealizedPL >= 0 ? 'text-green-500' : 'text-red-500'}
                                                                showSign
                                                                abbreviate={false}
                                                            />
                                                        ) : '-'}
                                                    </TableCell>
                                                    <TableCell className="py-1.5 text-center">
                                                        <div className="flex gap-1 justify-center">
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                className="h-6 text-[10px] text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-900/20"
                                                                onClick={() => openTrade('buy', stock)}
                                                            >
                                                                <ArrowUpRight className="h-3 w-3 mr-0.5" />
                                                                Buy
                                                            </Button>
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                className="h-6 text-[10px] text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                                                                onClick={() => openTrade('sell', stock)}
                                                            >
                                                                <ArrowDownRight className="h-3 w-3 mr-0.5" />
                                                                Sell
                                                            </Button>
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })}
                                    </TableBody>
                                </Table>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Asset Allocation */}
                <Card className="flex flex-col">
                    <CardHeader className="pb-2 pt-4 px-4">
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                            <PieChart className="h-4 w-4" />
                            Asset Allocation
                        </CardTitle>
                        <CardDescription className="text-xs">Portfolio breakdown by holding</CardDescription>
                    </CardHeader>
                    <CardContent className="px-4 pb-4">
                        {isLoading ? (
                            <div className="space-y-2">
                                {[1, 2, 3].map((i) => (
                                    <div key={i} className="h-10 bg-muted animate-pulse rounded" />
                                ))}
                            </div>
                        ) : holdingsWithAllocation.length === 0 ? (
                            <div className="h-28 flex items-center justify-center text-sm text-muted-foreground">
                                <div className="text-center">
                                    <PieChart className="h-8 w-8 mx-auto mb-2 opacity-50" />
                                    <p>No holdings to display</p>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {holdingsWithAllocation.map((holding, index) => (
                                    <div key={holding.stockId} className="space-y-1">
                                        <div className="flex items-center justify-between text-xs">
                                            <div className="flex items-center gap-2">
                                                <div
                                                    className={`w-2 h-2 rounded-full ${allocationColors[index % allocationColors.length]}`}
                                                />
                                                <span className="font-medium">{holding.ticker}</span>
                                                <span className="text-muted-foreground truncate max-w-[120px]">
                                                    {holding.name}
                                                </span>
                                            </div>
                                            <div className="text-right">
                                                <span className="font-medium">
                                                    <CurrencyDisplay amount={holding.currentValue} currency="USD" abbreviate={false} />
                                                </span>
                                                <span className="text-muted-foreground ml-2">
                                                    {holding.allocation.toFixed(1)}%
                                                </span>
                                            </div>
                                        </div>
                                        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                                            <div
                                                className={`h-full ${allocationColors[index % allocationColors.length]} rounded-full`}
                                                style={{ width: `${Math.min(holding.allocation, 100)}%` }}
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Bottom Grid: Transaction History & Highlights & Recent Buys */}
            <div className="grid grid-cols-1 lg:grid-cols-8 gap-4">
                {/* Transaction History */}
                {transactions && transactions.length > 0 && (
                    <Card className="col-span-1 lg:col-span-4 flex flex-col">
                        <CardHeader className="pb-2 pt-4 px-4">
                            <CardTitle className="text-sm font-medium">Transaction History</CardTitle>
                        </CardHeader>
                        <CardContent className="px-4 pb-4">
                            <div className="overflow-x-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow className="text-xs">
                                            <TableHead className="py-2 h-8">Date</TableHead>
                                            <TableHead className="py-2 h-8">Operation</TableHead>
                                            <TableHead className="py-2 h-8">Asset</TableHead>
                                            <TableHead className="py-2 h-8 text-right">Price</TableHead>
                                            <TableHead className="py-2 h-8 text-right">Quantity</TableHead>
                                            <TableHead className="py-2 h-8 text-right">Total</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {(() => {
                                            const startIndex = (currentPage - 1) * itemsPerPage;
                                            const paginatedTxs = transactions.slice(startIndex, startIndex + itemsPerPage);
                                            return paginatedTxs.map((tx: Transaction) => {
                                                const quantity = Number(tx.quantity ?? 0);
                                                const pricePerShare = Number(tx.pricePerShare ?? 0);

                                                return (
                                                    <TableRow
                                                        key={tx.id}
                                                        className="text-xs cursor-pointer hover:bg-muted/50"
                                                        onClick={() => setEditingTransaction(tx)}
                                                    >
                                                        <TableCell className="py-1.5">{formatDate(tx.date)}</TableCell>
                                                        <TableCell className="py-1.5">
                                                            <span className={`flex items-center gap-1 ${tx.type === 'buy' ? 'text-green-500' : 'text-red-500'}`}>
                                                                {tx.type === 'buy' ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                                                                {tx.type === 'buy' ? 'Buy' : 'Sell'}
                                                            </span>
                                                        </TableCell>
                                                        <TableCell className="py-1.5">
                                                            <span className="font-medium">{tx.stock.ticker}</span>
                                                            <span className="text-muted-foreground ml-1">({tx.stock.name})</span>
                                                        </TableCell>
                                                        <TableCell className="py-1.5 text-right">
                                                            <CurrencyDisplay amount={pricePerShare} currency="USD" abbreviate={false} />
                                                        </TableCell>
                                                        <TableCell className="py-1.5 text-right">{quantity.toFixed(4)}</TableCell>
                                                        <TableCell className="py-1.5 text-right font-medium">
                                                            <CurrencyDisplay amount={quantity * pricePerShare} currency="USD" abbreviate={false} />
                                                        </TableCell>
                                                    </TableRow>
                                                );
                                            });
                                        })()}
                                    </TableBody>
                                </Table>
                            </div>
                            {/* Pagination Controls */}
                            <div className="flex items-center justify-between mt-4">
                                <div className="text-xs text-muted-foreground">
                                    Showing {Math.min(transactions.length, (currentPage - 1) * itemsPerPage + 1)}-
                                    {Math.min(transactions.length, currentPage * itemsPerPage)} of {transactions.length} transactions
                                </div>
                                <div className="flex gap-2">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-8 text-[10px]"
                                        onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                        disabled={currentPage === 1}
                                    >
                                        Previous
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-8 text-[10px]"
                                        onClick={() => setCurrentPage(prev => Math.min(Math.ceil(transactions.length / itemsPerPage), prev + 1))}
                                        disabled={currentPage >= Math.ceil(transactions.length / itemsPerPage)}
                                    >
                                        Next
                                    </Button>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* Portfolio Highlights */}
                {portfolioHighlights && (
                    <Card className="flex flex-col col-span-4 lg:col-span-2">
                        <CardHeader className="pb-2 pt-4 px-4">
                            <CardTitle className="text-sm font-medium flex items-center gap-2">
                                <Trophy className="h-4 w-4 text-yellow-500" />
                                Portfolio Highlights
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="px-4 pb-4 space-y-4">
                            {/* Best Performer */}
                            <div className="flex items-center justify-between p-3 border rounded-lg bg-muted/20">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-green-100 dark:bg-green-900/20 rounded-full">
                                        <TrendingUp className="h-4 w-4 text-green-600 dark:text-green-400" />
                                    </div>
                                    <div>
                                        <p className="text-xs text-muted-foreground">Best Performer</p>
                                        <p className="font-semibold text-sm">{portfolioHighlights.best.ticker}</p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className="text-green-600 dark:text-green-400 font-bold text-sm">
                                        +{portfolioHighlights.best.unrealizedPLPercent.toFixed(2)}%
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                        +${formatNumber(portfolioHighlights.best.unrealizedPL)}
                                    </p>
                                </div>
                            </div>

                            {/* Worst Performer */}
                            <div className="flex items-center justify-between p-3 border rounded-lg bg-muted/20">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-red-100 dark:bg-red-900/20 rounded-full">
                                        <TrendingDown className="h-4 w-4 text-red-600 dark:text-red-400" />
                                    </div>
                                    <div>
                                        <p className="text-xs text-muted-foreground">Worst Performer</p>
                                        <p className="font-semibold text-sm">{portfolioHighlights.worst.ticker}</p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className="text-red-600 dark:text-red-400 font-bold text-sm">
                                        {portfolioHighlights.worst.unrealizedPLPercent.toFixed(2)}%
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                        ${formatNumber(portfolioHighlights.worst.unrealizedPL)}
                                    </p>
                                </div>
                            </div>

                            {/* Largest Holding */}
                            <div className="flex items-center justify-between p-3 border rounded-lg bg-muted/20">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-blue-100 dark:bg-blue-900/20 rounded-full">
                                        <PieChart className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                                    </div>
                                    <div>
                                        <p className="text-xs text-muted-foreground">Largest Holding</p>
                                        <p className="font-semibold text-sm">{portfolioHighlights.largest.ticker}</p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className="font-bold text-sm">
                                        <CurrencyDisplay amount={portfolioHighlights.largest.currentValue} currency="USD" />
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                        {((portfolioHighlights.largest.currentValue / (currentValue || 1)) * 100).toFixed(1)}% of portfolio
                                    </p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* Market Intelligence */}
                <Card className="flex flex-col col-span-4 lg:col-span-2">
                    <CardHeader className="pb-2 pt-4 px-4">
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                            <Newspaper className="h-4 w-4" />
                            Market Intelligence
                        </CardTitle>
                        <CardDescription className="text-xs">Live market news and updates</CardDescription>
                    </CardHeader>
                    <CardContent className="px-4 pb-4">
                        <Tabs defaultValue="latest" className="w-full">
                            <TabsList className="grid w-full grid-cols-4 h-8">
                                <TabsTrigger value="latest" className="text-xs">Latest</TabsTrigger>
                                <TabsTrigger value="ai" className="text-xs">AI & Tech</TabsTrigger>
                                <TabsTrigger value="oil" className="text-xs">Energy</TabsTrigger>
                                <TabsTrigger value="medical" className="text-xs">Healthcare</TabsTrigger>
                            </TabsList>
                            <TabsContent value="latest">
                                <NewsFeed category="latest" icon={<Globe className="h-4 w-4" />} />
                            </TabsContent>
                            <TabsContent value="ai">
                                <NewsFeed category="ai" icon={<Cpu className="h-4 w-4" />} />
                            </TabsContent>
                            <TabsContent value="oil">
                                <NewsFeed category="oil" icon={<Droplets className="h-4 w-4" />} />
                            </TabsContent>
                            <TabsContent value="medical">
                                <NewsFeed category="medical" icon={<Stethoscope className="h-4 w-4" />} />
                            </TabsContent>
                        </Tabs>
                    </CardContent>
                </Card>
            </div>

            {/* Trade Dialog */}
            <Dialog open={tradeOpen} onOpenChange={setTradeOpen}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            {tradeType === 'buy' ? (
                                <>
                                    <ArrowUpRight className="h-5 w-5 text-green-500" />
                                    Buy {tradeStock?.ticker}
                                </>
                            ) : (
                                <>
                                    <ArrowDownRight className="h-5 w-5 text-red-500" />
                                    Sell {tradeStock?.ticker}
                                </>
                            )}
                        </DialogTitle>
                        <DialogDescription>
                            Record a {tradeType} transaction for {tradeStock?.name}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="date" className="text-right text-xs">
                                Date
                            </Label>
                            <Input
                                id="date"
                                type="date"
                                value={tradeDate}
                                onChange={(e) => setTradeDate(e.target.value)}
                                className="col-span-3"
                            />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="quantity" className="text-right text-xs">
                                Quantity
                            </Label>
                            <Input
                                id="quantity"
                                type="number"
                                step="0.0001"
                                placeholder="0.00"
                                value={tradeQuantity}
                                onChange={(e) => setTradeQuantity(e.target.value)}
                                className="col-span-3"
                            />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="price" className="text-right text-xs">
                                Price/Share
                            </Label>
                            <Input
                                id="price"
                                type="number"
                                step="0.01"
                                placeholder="0.00"
                                value={tradePrice}
                                onChange={(e) => setTradePrice(e.target.value)}
                                className="col-span-3"
                            />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="notes" className="text-right text-xs">
                                Notes
                            </Label>
                            <Input
                                id="notes"
                                placeholder="Optional notes..."
                                value={tradeNotes}
                                onChange={(e) => setTradeNotes(e.target.value)}
                                className="col-span-3"
                            />
                        </div>
                        {tradeQuantity && tradePrice && (
                            <div className="grid grid-cols-4 items-center gap-4">
                                <div className="text-right text-xs text-muted-foreground">Total</div>
                                <div className="col-span-3 font-semibold">
                                    <CurrencyDisplay amount={Number(tradeQuantity) * Number(tradePrice)} currency={tradeStock?.currency || 'USD'} />
                                </div>
                            </div>
                        )}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={resetTrade}>
                            Cancel
                        </Button>
                        <Button
                            onClick={submitTrade}
                            className={tradeType === 'buy' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}
                            disabled={buyStock.isPending || sellStock.isPending}
                        >
                            {buyStock.isPending || sellStock.isPending ? 'Recording...' : `Record ${tradeType === 'buy' ? 'Buy' : 'Sell'}`}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Cash Management Dialog */}
            <Dialog open={cashDialogOpen} onOpenChange={setCashDialogOpen}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle>
                            {cashType === 'deposit' ? 'Deposit Cash' : 'Withdraw Cash'}
                        </DialogTitle>
                        <DialogDescription>
                            {cashType === 'deposit' 
                                ? 'Add funds to your investment account from your bank account'
                                : 'Withdraw funds from your investment account to your bank account'
                            }
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="amount">Amount</Label>
                            <Input
                                id="amount"
                                type="number"
                                placeholder="0.00"
                                value={cashAmount}
                                onChange={(e) => setCashAmount(e.target.value)}
                                step="0.01"
                                min="0.01"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="currency">Currency</Label>
                            <select
                                id="currency"
                                value={cashCurrency}
                                onChange={(e) => setCashCurrency(e.target.value)}
                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent"
                            >
                                <option value="USD">USD</option>
                                <option value="EUR">EUR</option>
                                <option value="KZT">KZT</option>
                            </select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="notes">Notes (Optional)</Label>
                            <Input
                                id="notes"
                                placeholder="e.g., Monthly contribution"
                                value={cashNotes}
                                onChange={(e) => setCashNotes(e.target.value)}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setCashDialogOpen(false)}>
                            Cancel
                        </Button>
                        <Button
                            onClick={() => {
                                const amount = parseFloat(cashAmount);
                                if (!amount || amount <= 0) {
                                    toast.error('Please enter a valid amount');
                                    return;
                                }

                                if (cashType === 'deposit') {
                                    depositCash.mutate({
                                        amount,
                                        currency: cashCurrency,
                                        notes: cashNotes,
                                    });
                                } else {
                                    withdrawCash.mutate({
                                        amount,
                                        currency: cashCurrency,
                                        notes: cashNotes,
                                    });
                                }
                                setCashDialogOpen(false);
                                setCashAmount('');
                                setCashNotes('');
                            }}
                            disabled={depositCash.isPending || withdrawCash.isPending}
                        >
                            {depositCash.isPending || withdrawCash.isPending ? 'Processing...' : cashType === 'deposit' ? 'Deposit' : 'Withdraw'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
