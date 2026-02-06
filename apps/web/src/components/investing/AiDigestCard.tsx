import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Brain, ChevronDown, ChevronUp, X, Crown, ArrowRight, Rocket, Calendar as CalendarIcon, Send } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { useState, useEffect, useRef } from 'react';
import posthog from 'posthog-js';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { useUser } from '@clerk/clerk-react';
import { usePricing } from '@/components/PricingContext';
import { format, parseISO, isSameDay } from 'date-fns';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

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
    const [showLockedCard, setShowLockedCard] = useState<boolean | null>(null);
    const [selectedDate, setSelectedDate] = useState<Date>(new Date());
    const [isCalendarOpen, setIsCalendarOpen] = useState(false);
    const [optimisticFollowUps, setOptimisticFollowUps] = useState<Array<{ id: string; specs: string; date: string }>>([]);
    const [chatError, setChatError] = useState<string | null>(null);
    const chatEndRef = useRef<HTMLDivElement>(null);

    // Load dismissed state from localStorage on mount
    useEffect(() => {
        if (user?.id) {
            const storageKey = `${LOCKED_CARD_STORAGE_KEY}_${user.id}`;
            const dismissed = localStorage.getItem(storageKey);
            setShowLockedCard(dismissed !== 'true');
        } else {
            setShowLockedCard(true);
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

    const { data: availableDates } = trpc.ai.getAvailableDigestDates.useQuery(undefined, {
        enabled: !limitsLoading && hasDigestAccessFrontend,
    });

    const isDateAvailable = (date: Date) => {
        if (!availableDates) return isSameDay(date, new Date());
        return isSameDay(date, new Date()) || availableDates.some((d: string) => isSameDay(parseISO(d), date));
    };

    const { data, isLoading, error, refetch: refetchDigest } = trpc.ai.getDailyDigest.useQuery(
        { date: format(selectedDate, 'yyyy-MM-dd') },
        {
            staleTime: 1000 * 60 * 60, // Cache for 1 hour
            refetchOnWindowFocus: false,
            refetchInterval: (result: any) => {
                // If pending, poll every 5 seconds
                if (result?.digest === '__PENDING__') return 5000;
                return false;
            },
            enabled: !limitsLoading, // Always check backend for double verification
            retry: 3,
        }
    );

    const regenerateMutation = trpc.ai.regenerateDigest.useMutation({
        onMutate: (variables: { specs: string; date?: string }) => {
            const tempId = `temp-${Date.now()}`;
            setOptimisticFollowUps((prev) => [
                ...prev,
                {
                    id: tempId,
                    specs: variables.specs,
                    date: variables.date || format(selectedDate, 'yyyy-MM-dd'),
                },
            ]);
        },
        onSuccess: () => {
            setCustomSpecs('');
            setChatError(null);
            setOptimisticFollowUps((prev) => prev.filter((fu) => fu.date !== format(selectedDate, 'yyyy-MM-dd')));
            refetchDigest(); // This will fetch the new follow-ups
            posthog.capture('ai_digest_regenerated');
        },
        onError: (err: { message?: string }) => {
            setOptimisticFollowUps((prev) => prev.filter((fu) => fu.date !== format(selectedDate, 'yyyy-MM-dd')));
            const message = err.message || 'Could not send question';
            if (message.toLowerCase().includes('limit')) {
                setChatError('Sorry, you’ve run out of questions for today.');
            }
            toast.error(message);
        }
    });

    const quickQuestions = [
        'How does this impact my portfolio?*',
        'Any risks I should watch for?*',
        'Summary for my biggest holdings?*',
        'Macro events impacting semiconductors?*',
    ];

    const isToday = isSameDay(selectedDate, new Date());
    const selectedDateKey = format(selectedDate, 'yyyy-MM-dd');
    const optimisticForDate = optimisticFollowUps.filter((fu) => fu.date === selectedDateKey);
    const followUpItems = [
        ...(data?.followUps || []).map((fu: { id: string; specs: string; content: string }) => ({ ...fu, pending: false })),
        ...optimisticForDate.map((fu) => ({ ...fu, content: null, pending: true })),
    ];

    useEffect(() => {
        if (chatEndRef.current) {
            chatEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
        }
    }, [followUpItems.length]);

    if (limitsLoading || isLoading || showLockedCard === null) {
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
    const showPendingState = isToday && isTodayPending;

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
                        <div className="flex items-center gap-2 mt-0.5">
                            {showPendingState ? (
                                <p className="text-[10px] text-primary animate-pulse uppercase tracking-wider font-semibold">
                                    Generating Today's Insight...
                                </p>
                            ) : (
                                <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
                                    {format(selectedDate, 'MMMM d, yyyy')}
                                </p>
                            )}

                            <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
                                <PopoverTrigger asChild>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-4 w-4 rounded-full p-0 text-muted-foreground hover:text-primary"
                                    >
                                        <CalendarIcon className="h-3 w-3" />
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="start">
                                    <Calendar
                                        mode="single"
                                        selected={selectedDate}
                                        onSelect={(date) => {
                                            if (date && isDateAvailable(date)) {
                                                setSelectedDate(date);
                                                setIsCalendarOpen(false);
                                            }
                                        }}
                                        disabled={(date) => !isDateAvailable(date) || date > new Date()}
                                        initialFocus
                                    />
                                </PopoverContent>
                            </Popover>
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-1">
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
                            ) : data?.digest ? (
                                <>
                                    <div className="max-h-[500px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-muted-foreground/20 hover:scrollbar-thumb-muted-foreground/40 transition-colors">
                                        <div className="space-y-6">
                                            {/* Original Digest */}
                                            <div className="prose prose-sm dark:prose-invert max-w-none text-zinc-900 dark:text-zinc-100">
                                                <ReactMarkdown
                                                    children={data.digest}
                                                    components={{
                                                        strong: ({ ...props }) => {
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
                                            </div>

                                            {/* Follow-up Q&A Thread */}
                                            {followUpItems.length > 0 && (
                                                <div className="pt-4 border-t border-border/40 space-y-4">
                                                    {followUpItems.map((fu: any) => (
                                                        <div key={fu.id} className="space-y-3">
                                                            <div className="flex justify-end">
                                                                <div className="bg-primary/10 rounded-2xl rounded-tr-none px-4 py-2 max-w-[85%] border border-primary/20">
                                                                    <p className="text-sm font-medium">{fu.specs}</p>
                                                                </div>
                                                            </div>
                                                            <div className="flex justify-start">
                                                                <div className="bg-muted/50 rounded-2xl rounded-tl-none px-4 py-2 max-w-[85%] border border-border/50">
                                                                    {fu.pending ? (
                                                                        <div className="flex items-center gap-1 text-muted-foreground">
                                                                            <span className="h-2 w-2 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:-0.2s]" />
                                                                            <span className="h-2 w-2 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:-0.1s]" />
                                                                            <span className="h-2 w-2 rounded-full bg-muted-foreground/50 animate-bounce" />
                                                                        </div>
                                                                    ) : (
                                                                        <div className="prose prose-sm dark:prose-invert max-w-none text-zinc-900 dark:text-zinc-100">
                                                                            <ReactMarkdown children={fu.content} />
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ))}
                                                    {chatError && (
                                                        <div className="flex justify-start">
                                                            <div className="bg-destructive/10 text-destructive rounded-2xl rounded-tl-none px-4 py-2 max-w-[85%] border border-destructive/20">
                                                                <p className="text-sm font-medium">{chatError}</p>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                            <div ref={chatEndRef} />
                                        </div>
                                    </div>

                                    {isToday && data?.canRegenerate && (
                                        <div className="mt-6 pt-6 border-t border-border/60">
                                            <div className="rounded-2xl border border-border/60 bg-muted/30 p-4">
                                                <div className="flex items-center justify-between mb-3">
                                                    <div className="flex items-center gap-2">
                                                        <Crown className="h-3.5 w-3.5 text-amber-500" />
                                                        <p className="text-xs font-semibold text-foreground">Follow-up Questions</p>
                                                    </div>
                                                    <p className="text-[10px] text-muted-foreground bg-background/50 px-2 py-0.5 rounded-full border border-border/50">
                                                        {data.remainingRegenerations}/{data.regenerationLimit} left today
                                                    </p>
                                                </div>

                                                <div className="flex flex-wrap gap-2 mb-4">
                                                    {quickQuestions.map((question) => (
                                                        <Button
                                                            key={question}
                                                            type="button"
                                                            variant="outline"
                                                            size="sm"
                                                            className="h-7 px-2 text-[10px] rounded-full bg-background border-border/60 hover:bg-muted/50 hover:text-primary transition-colors"
                                                            onClick={() => setCustomSpecs(question.replace(/\*$/, '').trim())}
                                                            disabled={regenerateMutation.isLoading}
                                                        >
                                                            {question.replace(/\*$/, '')}
                                                        </Button>
                                                    ))}
                                                </div>

                                                <div className="relative">
                                                    <Textarea
                                                        value={customSpecs}
                                                        onChange={(event) => setCustomSpecs(event.target.value)}
                                                        placeholder="Ask Woo about this digest..."
                                                        className="min-h-[80px] text-sm rounded-xl pr-12 focus-visible:ring-1 focus-visible:ring-primary/30 resize-none bg-background/80"
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter' && !e.shiftKey && customSpecs.trim().length >= 3) {
                                                                e.preventDefault();
                                                                regenerateMutation.mutate({ specs: customSpecs, date: format(selectedDate, 'yyyy-MM-dd') });
                                                            }
                                                        }}
                                                    />
                                                    <Button
                                                        type="button"
                                                        size="icon"
                                                        className="absolute bottom-2 right-2 h-8 w-8 rounded-lg shadow-sm"
                                                        disabled={
                                                            regenerateMutation.isLoading ||
                                                            data.remainingRegenerations <= 0 ||
                                                            customSpecs.trim().length < 3
                                                        }
                                                        onClick={() => regenerateMutation.mutate({ specs: customSpecs, date: format(selectedDate, 'yyyy-MM-dd') })}
                                                    >
                                                        {regenerateMutation.isLoading ? (
                                                            <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                                        ) : (
                                                            <Send className="h-4 w-4" />
                                                        )}
                                                    </Button>
                                                </div>
                                                <p className="text-[10px] text-muted-foreground mt-2 italic text-center">
                                                    * News-based insights only, not recommendations.
                                                </p>
                                            </div>
                                        </div>
                                    )}

                                    {!isToday && (
                                        <div className="mt-4 pt-4 border-t border-border/40 flex justify-center">
                                            <p className="text-xs text-muted-foreground italic bg-muted/30 px-3 py-1.5 rounded-full border border-border/50">
                                                Go back to <span className="font-medium cursor-pointer text-primary hover:underline" onClick={() => setSelectedDate(new Date())}>Today</span> to ask follow-up questions.
                                            </p>
                                        </div>
                                    )}
                                </>
                            ) : (
                                <div className="py-8 text-center">
                                    <div className="bg-muted/30 rounded-full w-12 h-12 flex items-center justify-center mx-auto mb-3">
                                        <Brain className="h-6 w-6 text-muted-foreground/50" />
                                    </div>
                                    <p className="text-sm text-muted-foreground">No digest found for this date.</p>
                                </div>
                            )}
                        </CardContent>
                    </motion.div>
                )}
            </AnimatePresence>
        </Card>
    );
}
