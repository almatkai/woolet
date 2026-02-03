import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Brain, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, X, Crown, ArrowRight, Rocket } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { useState, useEffect } from 'react';
import posthog from 'posthog-js';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { useUser } from '@clerk/clerk-react';
import { usePricing } from '@/components/PricingContext';
import { format, parseISO } from 'date-fns';

const STOCK_COLORS = [
    'text-red-600 dark:text-red-400',
    'text-orange-600 dark:text-orange-400',
    'text-amber-600 dark:text-amber-400',
    'text-yellow-600 dark:text-yellow-400',
    'text-lime-600 dark:text-lime-400',
    'text-green-600 dark:text-green-400',
    'text-emerald-600 dark:text-emerald-400',
    'text-teal-600 dark:text-teal-400',
    'text-cyan-600 dark:text-cyan-400',
    'text-sky-600 dark:text-sky-400',
    'text-blue-600 dark:text-blue-400',
    'text-indigo-600 dark:text-indigo-400',
    'text-violet-600 dark:text-violet-400',
    'text-purple-600 dark:text-purple-400',
    'text-fuchsia-600 dark:text-fuchsia-400',
    'text-pink-600 dark:text-pink-400',
    'text-rose-600 dark:text-rose-400',
];

const getStockColor = (text: string) => {
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
        hash = text.charCodeAt(i) + ((hash << 5) - hash);
    }
    return STOCK_COLORS[Math.abs(hash) % STOCK_COLORS.length];
};

const LOCKED_CARD_STORAGE_KEY = 'aiDigestLockedCardDismissed';

export function AiDigestCard() {
    const { user } = useUser();
    const { openPricing } = usePricing();
    const [isOpen, setIsOpen] = useState(true);
    const [customSpecs, setCustomSpecs] = useState('');
    const [activeDigest, setActiveDigest] = useState<string | null>(null);
    const [remainingRegenerations, setRemainingRegenerations] = useState<number | null>(null);
    const [showLockedCard, setShowLockedCard] = useState(true);

    // Load dismissed state from localStorage on mount
    useEffect(() => {
        if (user?.id) {
            const storageKey = `${LOCKED_CARD_STORAGE_KEY}_${user.id}`;
            const dismissed = localStorage.getItem(storageKey);
            if (dismissed === 'true') {
                setShowLockedCard(false);
            }
        }
    }, [user?.id]);

    const handleCloseLockedCard = () => {
        if (user?.id) {
            const storageKey = `${LOCKED_CARD_STORAGE_KEY}_${user.id}`;
            localStorage.setItem(storageKey, 'true');
            setShowLockedCard(false);
        }
    };

    const { data: limitsData, isLoading: limitsLoading } = trpc.bank.getLimitsAndUsage.useQuery();
    const hasDigestAccessFrontend = !!limitsData?.features?.hasAiMarketDigest;

    const { data, isLoading, error } = trpc.ai.getDailyDigest.useQuery(undefined, {
        staleTime: 1000 * 60 * 60, // Cache for 1 hour
        refetchOnWindowFocus: false,
        refetchInterval: (result: any) => {
            // If pending, poll every 5 seconds
            if (result?.digest === '__PENDING__') return 5000;
            return false;
        },
        enabled: !limitsLoading, // Always check backend for double verification
        retry: 3,
    });

    const { data: historyData, refetch: refetchHistory } = trpc.ai.getDigestHistory.useQuery(undefined, {
        enabled: !limitsLoading && hasDigestAccessFrontend,
        staleTime: 1000 * 60 * 5,
    });
    
    const [historyIndex, setHistoryIndex] = useState(0);

    const regenerateMutation = trpc.ai.regenerateDigest.useMutation({
        onSuccess: (result: { digest: string; remainingRegenerations: number }) => {
            setActiveDigest(result.digest);
            setRemainingRegenerations(result.remainingRegenerations);
            setHistoryIndex(0);
            refetchHistory();
            posthog.capture('ai_digest_regenerated');
        },
        onError: (err: { message?: string }) => {
            toast.error(err.message || 'Could not regenerate digest');
        }
    });

    useEffect(() => {
        if (data?.digest && !data?.locked && historyIndex === 0) {
            setActiveDigest(data.digest);
            setRemainingRegenerations(data.remainingRegenerations);
            posthog.capture('ai_digest_loaded');
        }
    }, [data, hasDigestAccessFrontend, historyIndex]);

    useEffect(() => {
        if (historyData && historyData.length > 0) {
            const entry = historyData[historyIndex];
            if (entry) {
                setActiveDigest(entry.content);
            }
        }
    }, [historyIndex, historyData]);

    const quickQuestions = [
        'Which holdings are outperforming based on recent news and price action?*',
        'Which holdings are under pressure or trending down this week?*',
        'What are the biggest risk headlines affecting my portfolio today?*',
        'Summarize macro events impacting my sectors and ETFs.*',
        'Which tickers show elevated short interest headlines or bearish sentiment?*',
    ];

    if (limitsLoading || isLoading) {
        return (
            <Card className="col-span-1 md:col-span-2 lg:col-span-3">
                <CardHeader>
                    <div className="flex items-center gap-2">
                        <Brain className="h-5 w-5 text-zinc-500 animate-pulse" />
                        <CardTitle>Market Insights</CardTitle>
                    </div>
                    <CardDescription>Analyzing market trends...</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="space-y-2">
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="h-4 w-[90%]" />
                        <Skeleton className="h-4 w-[80%]" />
                    </div>
                </CardContent>
            </Card>
        );
    }

    // Double verification: Check both frontend limits and backend response
    const isLocked = !hasDigestAccessFrontend || data?.locked;

    if (isLocked && showLockedCard) {
        return (
            <div className="relative overflow-hidden rounded-xl border border-amber-500/30 bg-gradient-to-br from-amber-500/10 via-orange-500/10 to-purple-500/10 p-5">
                <Button
                    variant="ghost"
                    size="icon"
                    className="absolute top-2 right-2 h-8 w-8 rounded-full hover:bg-amber-500/10 text-muted-foreground z-20"
                    onClick={handleCloseLockedCard}
                >
                    <X className="h-4 w-4" />
                </Button>
                
                <div className="flex items-start gap-4">
                    <div className="p-2.5 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 shrink-0 shadow-lg shadow-amber-500/20">
                        <Crown className="h-6 w-6 text-white" />
                    </div>
                    <div className="flex-1">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                            <h3 className="text-base font-semibold text-foreground">
                                Market Insight Digest 📊
                            </h3>
                            <span className="inline-flex items-center rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400 border border-amber-500/20">
                                <Rocket className="h-3 w-3 mr-1" />
                                Pro/Premium
                            </span>
                        </div>
                        <p className="text-sm text-muted-foreground mb-4">
                            Unlock AI-powered daily analysis of your portfolio news, sentiment, and risk factors.
                        </p>
                        
                        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4 mb-4">
                            <h4 className="font-medium text-sm mb-2 text-foreground flex items-center gap-2">
                                <Rocket className="h-4 w-4 text-amber-500" />
                                Premium Features:
                            </h4>
                            <ul className="space-y-2 text-sm text-muted-foreground">
                                <li className="flex items-start gap-2">
                                    <span className="text-amber-500 mt-0.5">•</span>
                                    <span>Daily AI-powered analysis of your stocks and ETFs</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <span className="text-amber-500 mt-0.5">•</span>
                                    <span>Recent news sentiment and price action insights</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <span className="text-amber-500 mt-0.5">•</span>
                                    <span className="font-medium text-foreground">Custom regeneration with your own focus questions</span>
                                </li>
                            </ul>
                        </div>

                        <div className="flex items-center justify-between">
                            <p className="text-xs text-muted-foreground">
                                Current plan: <span className="font-medium text-foreground">{data?.userTier || 'Free'}</span>
                            </p>
                            <Button 
                                size="sm" 
                                className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white border-0 font-medium group"
                                onClick={() => openPricing()}
                            >
                                <Rocket className="h-4 w-4 mr-2" />
                                Upgrade Now
                                <ArrowRight className="h-4 w-4 ml-2 group-hover:translate-x-0.5 transition-transform" />
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    if (isLocked && !showLockedCard) {
        return null;
    }

    const isTodayPending = data?.digest === '__PENDING__';
    const hasTodayInHistory = historyData?.[0]?.digestDate === data?.digestDate;
    const showPendingState = historyIndex === 0 && isTodayPending && !hasTodayInHistory;

    if (error) {
        return (
            <Card className="transition-all duration-300">
                <CardHeader className="pb-3">
                    <div className="flex items-center gap-2">
                        <Brain className="h-5 w-5 text-destructive" />
                        <CardTitle className="text-lg font-medium">Market Insight Digest 📊</CardTitle>
                    </div>
                    <CardDescription className="text-xs text-destructive">
                        {error.message || 'Failed to load digest. Please try again later.'}
                    </CardDescription>
                </CardHeader>
            </Card>
        );
    }

    return (
        <Card className="transition-all duration-300">
            <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
                <div className="flex items-center gap-2">
                    <motion.div
                        animate={{ 
                            rotate: [0, 10, -10, 0],
                            scale: [1, 1.1, 1]
                        }}
                        transition={{ 
                            duration: 4, 
                            repeat: Infinity,
                            ease: "easeInOut" 
                        }}
                    >
                        <Brain className={`h-5 w-5 ${showPendingState ? 'text-primary animate-pulse' : 'text-primary'}`} />
                    </motion.div>
                    <div>
                        <CardTitle className="text-lg font-medium">Market Insight Digest 📊</CardTitle>
                        {showPendingState ? (
                            <p className="text-[10px] text-primary animate-pulse uppercase tracking-wider font-semibold">
                                Generating Today's Insight...
                            </p>
                        ) : (
                            historyData && historyData[historyIndex] && (
                                <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
                                    {format(parseISO(historyData[historyIndex].digestDate), 'MMMM d, yyyy')}
                                </p>
                            )
                        )}
                    </div>
                </div>
                <div className="flex items-center gap-1">
                    {historyData && historyData.length > 1 && (
                        <div className="flex items-center gap-1 mr-2 px-1 py-0.5 rounded-md bg-muted/50 border border-border/50">
                            <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-6 w-6 rounded-sm hover:bg-background" 
                                disabled={historyIndex >= historyData.length - 1}
                                onClick={() => setHistoryIndex(prev => prev + 1)}
                                title="Previous digest"
                            >
                                <ChevronLeft className="h-3 w-3" />
                            </Button>
                            <span className="text-[10px] font-medium min-w-[2.5rem] text-center">
                                {historyIndex + 1} / {historyData.length}
                            </span>
                            <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-6 w-6 rounded-sm hover:bg-background" 
                                disabled={historyIndex === 0}
                                onClick={() => setHistoryIndex(prev => prev - 1)}
                                title="Next digest"
                            >
                                <ChevronRight className="h-3 w-3" />
                            </Button>
                        </div>
                    )}
                    <Button 
                        variant="ghost" 
                        size="sm" 
                        className="h-8 w-8 p-0" 
                        onClick={() => setIsOpen(!isOpen)}
                    >
                        {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </Button>
                </div>
            </CardHeader>
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3, ease: "easeInOut" }}
                        style={{ overflow: 'hidden' }}
                    >
                        <CardContent>
                            {showPendingState ? (
                                <div className="space-y-3 py-2">
                                    <Skeleton className="h-4 w-full" />
                                    <Skeleton className="h-4 w-[90%]" />
                                    <Skeleton className="h-4 w-[80%]" />
                                    <p className="text-xs text-muted-foreground mt-4 italic">
                                        Generating your personalized digest... This can take 1-2 minutes. We're analyzing your portfolio and gathering market insights.
                                    </p>
                                </div>
                            ) : (
                                <>
                                    <div className="max-h-[450px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-muted-foreground/20 hover:scrollbar-thumb-muted-foreground/40 transition-colors">
                                        <div className="prose prose-sm dark:prose-invert max-w-none text-zinc-900 dark:text-zinc-100">
                                            {typeof activeDigest === 'string' && activeDigest.trim().length > 0 && (
                                                <ReactMarkdown
                                                    children={activeDigest}
                                                    components={{
                                                        strong: ({ node, ...props }) => {
                                                            const text = typeof props.children === 'string' 
                                                                ? props.children 
                                                                : Array.isArray(props.children) 
                                                                    ? props.children.join('') 
                                                                    : String(props.children);
                                                            const colorClass = getStockColor(text);
                                                            return <strong className={`${colorClass} font-bold`}>{props.children}</strong>;
                                                        }
                                                    }}
                                                />
                                            )}
                                        </div>
                                    </div>

                                    {historyIndex === 0 && data?.canRegenerate && (
                                        <div className="mt-6 pt-6 border-t border-border/60">
                                            <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
                                                <div className="flex items-center justify-between">
                                                    <p className="text-xs font-semibold text-muted-foreground">Customize digest (Premium)</p>
                                                    <p className="text-xs text-muted-foreground">
                                                        {Math.max(0, remainingRegenerations ?? data.remainingRegenerations)}/{data.regenerationLimit} left today
                                                    </p>
                                                </div>
                                                <div className="mt-2 flex flex-wrap gap-2">
                                                    {quickQuestions.map((question) => (
                                                        <Button
                                                            key={question}
                                                            type="button"
                                                            variant="outline"
                                                            size="sm"
                                                            className="h-7 px-2 text-[11px]"
                                                            onClick={() => setCustomSpecs(question.replace(/\*$/, '').trim())}
                                                        >
                                                            {question}
                                                        </Button>
                                                    ))}
                                                </div>
                                                <Textarea
                                                    value={customSpecs}
                                                    onChange={(event) => setCustomSpecs(event.target.value)}
                                                    placeholder="Add your focus or question (e.g., highlight semiconductor news or ETFs)..."
                                                    className="mt-3 min-h-[70px] text-xs"
                                                />
                                                <div className="mt-2 flex items-center justify-between">
                                                    <p className="text-[11px] text-muted-foreground">* News-based insights only, not recommendations.</p>
                                                    <Button
                                                        type="button"
                                                        size="sm"
                                                        disabled={
                                                            regenerateMutation.isLoading ||
                                                            (remainingRegenerations ?? data.remainingRegenerations) <= 0 ||
                                                            customSpecs.trim().length < 5
                                                        }
                                                        onClick={() => regenerateMutation.mutate({ specs: customSpecs })}
                                                    >
                                                        {regenerateMutation.isLoading ? 'Regenerating...' : 'Regenerate'}
                                                    </Button>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </>
                            )}
                        </CardContent>
                    </motion.div>
                )}
            </AnimatePresence>
        </Card>
    );
}
