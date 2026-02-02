import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Brain, ChevronDown, ChevronUp } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { useState, useEffect } from 'react';
import posthog from 'posthog-js';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';

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

export function AiDigestCard() {
    const [isOpen, setIsOpen] = useState(true);
    const { data: digest, isLoading, error } = trpc.ai.getDailyDigest.useQuery(undefined, {
        staleTime: 1000 * 60 * 60, // Cache for 1 hour
        refetchOnWindowFocus: false,
    });

    useEffect(() => {
        if (digest) {
            posthog.capture('ai_digest_loaded');
        }
    }, [digest]);

    if (isLoading) {
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

    if (error) {
        return null;
    }

    if (!digest) return null;

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
                        <Brain className="h-5 w-5 text-primary" />
                    </motion.div>
                    <CardTitle className="text-lg font-medium">Market Insight Digest</CardTitle>
                </div>
                <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-8 w-8 p-0" 
                    onClick={() => setIsOpen(!isOpen)}
                >
                    {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>
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
                            <div className="prose prose-sm dark:prose-invert max-w-none text-zinc-900 dark:text-zinc-100">
                                {typeof digest === 'string' && digest.trim().length > 0 && (
                                    <ReactMarkdown
                                        children={digest}
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
                        </CardContent>
                    </motion.div>
                )}
            </AnimatePresence>
        </Card>
    );
}
