import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import posthog from 'posthog-js';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { MessageCircle, X, Send, History, PlusCircle, Trash2, Loader2, CheckCircle2 } from 'lucide-react';
import { SidebarMenu, SidebarMenuItem, SidebarMenuButton, useSidebar } from '@/components/ui/sidebar';
import ReactMarkdown from 'react-markdown';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { Skeleton } from '@/components/ui/skeleton';
import { MomoIcon } from './MomoIcon';
import { MomoIconWrapper } from './MomoIconWrapper';
import { useNavigate } from '@tanstack/react-router';

interface Message {
    role: 'user' | 'model';
    text: string;
    trace?: AgentTraceStep[];
    actionPath?: string;
}

interface AgentTraceStep {
    key: string;
    label: string;
    detail?: string;
    status?: 'done' | 'running' | 'pending';
}

function createClientRequestId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return `req-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function AgentTraceView({ steps, loading = false }: { steps: AgentTraceStep[]; loading?: boolean }) {
    if (!steps.length) return null;

    return (
        <div className="mb-2 rounded-md border border-slate-300/60 dark:border-slate-700/70 bg-slate-100/60 dark:bg-slate-900/40 px-2.5 py-2">
            <div className="mb-1.5 text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Agent Execution
            </div>
            <div className="space-y-1.5">
                {steps.map((step) => {
                    const isDone = step.status === 'done';
                    const isRunning = step.status === 'running';
                    return (
                        <div key={step.key} className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                            <div className="flex items-center gap-1.5">
                                {isDone ? (
                                    <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                                ) : isRunning ? (
                                    <Loader2 className={cn("h-3 w-3 text-slate-400", loading ? "animate-spin" : "")} />
                                ) : (
                                    <span className="h-3 w-3 rounded-full bg-slate-300/80 dark:bg-slate-600/80" />
                                )}
                                <span>{step.label}...</span>
                            </div>
                            {step.detail ? (
                                <div className="pl-4 text-[11px] text-slate-500 dark:text-slate-400 break-words">
                                    Result: {step.detail}
                                </div>
                            ) : null}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// Shared hook for anger state management
function useAngryState(isOpen: boolean, hasSentMessage: boolean) {
    const [isAngry, setIsAngry] = useState(false);
    const wasOpen = useRef(isOpen);

    useEffect(() => {
        if (wasOpen.current && !isOpen && !hasSentMessage) {
            // Use setTimeout to avoid synchronous setState in effect (React Compiler warning)
            const angerTimer = setTimeout(() => setIsAngry(true), 0);
            const resetTimer = setTimeout(() => setIsAngry(false), 5000);
            return () => {
                clearTimeout(angerTimer);
                clearTimeout(resetTimer);
            };
        }
        wasOpen.current = isOpen;
    }, [isOpen, hasSentMessage]);

    return { isAngry, setIsAngry };
}

// Shared hook for chat logic
function useChatLogic(currentSessionId: string | null, setCurrentSessionId: (id: string | null) => void) {
    const utils = trpc.useUtils();
    const [messages, setMessages] = useState<Message[]>([
        { role: 'model', text: 'Hi! I\'m Woo. Ask me anything about your finances!' }
    ]);
    const [hasSentMessage, setHasSentMessage] = useState(false);
    const [pendingRequestId, setPendingRequestId] = useState<string | null>(null);

    const chatMutation = trpc.ai.chat.useMutation({
        onSuccess: (data: any) => {
            const clientActionPath =
                data?.clientAction?.type === 'navigate' && typeof data?.clientAction?.path === 'string'
                    ? data.clientAction.path
                    : undefined;
            setMessages(prev => [...prev, {
                role: 'model',
                text: data.response,
                trace: Array.isArray(data.agentTrace) ? data.agentTrace : [],
                actionPath: clientActionPath,
            }]);
            if (data.sessionId && !currentSessionId) {
                setCurrentSessionId(data.sessionId);
                utils.ai.listSessions.invalidate();
            }
            utils.ai.getChatUsage.invalidate();
            setPendingRequestId(null);
        },
        onError: (error: any) => {
            console.error(error);
            const message = error.message || 'Sorry, I encountered an error. Try again!';
            setMessages(prev => [...prev, { role: 'model', text: message }]);
            setPendingRequestId(null);
        }
    });

    const handleSend = (inputValue: string) => {
        if (!inputValue.trim()) return;

        const clientRequestId = createClientRequestId();
        const newMsg: Message = { role: 'user', text: inputValue };
        setMessages(prev => [...prev, newMsg]);
        setHasSentMessage(true);
        setPendingRequestId(clientRequestId);
        chatMutation.mutate({ message: newMsg.text, sessionId: currentSessionId, clientRequestId });
        posthog.capture('ai_message_sent', { session_id: currentSessionId, message_length: newMsg.text.length });
    };

    const handleNewChat = () => {
        setMessages([{ role: 'model', text: 'Hi! I\'m Woo. Ask me anything about your finances!' }]);
        setHasSentMessage(false);
    };

    return { messages, setMessages, handleSend, handleNewChat, chatMutation, hasSentMessage, setHasSentMessage, pendingRequestId };
}

export function AiChatSidebarItem() {
    const [isOpen, setIsOpen] = useState(false);
    const [view, setView] = useState<'chat' | 'history'>('chat');
    const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
    const [inputValue, setInputValue] = useState('');
    const [sidebarHovered, setSidebarHovered] = useState(false);
    const [sidebarPressed, setSidebarPressed] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const navigate = useNavigate();

    const { isAngry, setIsAngry } = useAngryState(isOpen, false);
    const { messages, setMessages, handleSend, handleNewChat, chatMutation, pendingRequestId } = useChatLogic(currentSessionId, setCurrentSessionId);
    const utils = trpc.useUtils();
    const { data: liveTraceData } = trpc.ai.getLiveTrace.useQuery(
        { requestId: pendingRequestId || '' },
        {
            enabled: isOpen && chatMutation.isLoading && Boolean(pendingRequestId),
            refetchInterval: chatMutation.isLoading ? 400 : false,
            refetchIntervalInBackground: true,
        }
    );
    const liveTrace = Array.isArray(liveTraceData?.trace) ? liveTraceData.trace : [];

    // Queries
    const { data: usage } = trpc.ai.getChatUsage.useQuery(undefined, { enabled: isOpen });
    const { data: sessions, isLoading: isHistoryLoading } = trpc.ai.listSessions.useQuery(undefined, { enabled: isOpen && view === 'history' });

    // Mutations
    const loadSessionMutation = trpc.ai.getSession.useMutation({
        onSuccess: (data: any) => {
            setMessages((data.messages || []).map((m: any) => ({
                role: m.role,
                text: m.content
            })));
            setCurrentSessionId(data.id);
        }
    });

    const deleteSessionMutation = trpc.ai.deleteSession.useMutation({
        onSuccess: () => {
            utils.ai.listSessions.invalidate();
            toast.success('Chat deleted');
        }
    });

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, isOpen, view]);

    const handleInputSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        handleSend(inputValue);
        setInputValue('');
    };

    return (
        <>
            <SidebarMenu>
                <SidebarMenuItem>
                    <SidebarMenuButton
                        size="lg"
                        onClick={() => setIsOpen(true)}
                        onMouseEnter={() => setSidebarHovered(true)}
                        onMouseLeave={() => { setSidebarHovered(false); setSidebarPressed(false); }}
                        onMouseDown={() => setSidebarPressed(true)}
                        onMouseUp={() => { setSidebarPressed(false); setIsOpen(true); }}
                        className="group relative h-auto py-1.5 px-3 rounded-2xl cursor-pointer transition-all duration-200 border-none flex items-center gap-3 w-full bg-transparent hover:bg-transparent text-white"
                    >
                        <motion.div
                            layoutId="ai-chat-container"
                            className={cn("absolute inset-0 rounded-2xl z-0", !isOpen ? "bg-purple-500" : "bg-transparent")}
                            transition={{ type: "spring", stiffness: 300, damping: 30 }}
                        />
                        <div className="flex-shrink-0 relative z-10">
                            <motion.div
                                layoutId="woo-wallet-icon-box"
                                className="flex items-center justify-center"
                                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                            >
                                <MomoIcon
                                    className={cn("size-10", !isOpen ? "text-white" : "text-transparent")}
                                    isHovered={sidebarHovered}
                                    isPressed={sidebarPressed}
                                    isAngry={isAngry}
                                />
                            </motion.div>
                        </div>
                        <div className={cn("flex-1 text-left leading-tight transition-opacity duration-200 z-10", isOpen ? "opacity-0" : "opacity-100")}>
                            <span className="text-xl font-bold tracking-tight text-white group-hover:drop-shadow-[0_0_8px_rgba(255,255,255,0.4)] transition-all duration-200">Woo</span>
                        </div>
                    </SidebarMenuButton>
                </SidebarMenuItem>
            </SidebarMenu>

            {createPortal(
                <AnimatePresence>
                    {isOpen && (
                        <div className="fixed inset-y-0 left-0 z-[46] flex items-end p-4 pointer-events-none">
                            <div className="pointer-events-auto">
                                <motion.div
                                    layoutId="ai-chat-container"
                                    className="bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 rounded-3xl overflow-hidden shadow-2xl border-purple-200 dark:border-purple-800 w-[350px] h-[600px] max-h-[85vh] flex flex-col"
                                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                                >
                                    <div className="flex-1 flex flex-col overflow-hidden">
                                        <CardHeader className="p-3 border-b bg-purple-50/50 dark:bg-purple-900/20 flex flex-row items-center justify-between space-y-0">
                                            <div className="flex items-center gap-2">
                                                <MomoIconWrapper
                                                    layoutId="woo-wallet-icon-box"
                                                    height="h-6"
                                                    width="w-6"
                                                    iconClassName="h-4 w-4"
                                                />
                                                <div className="flex flex-col">
                                                    <CardTitle className="text-sm font-medium leading-none">
                                                        {usage?.tierTitle || 'Woo'}
                                                    </CardTitle>
                                                    {usage && (
                                                        <span className="text-[10px] text-muted-foreground mt-0.5">
                                                            {usage.remaining} / {usage.limit || usage.lifetimeLimit} {usage.limit > 0 ? 'left today' : 'questions left'}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-1">
                                                {view === 'chat' ? (
                                                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setView('history')} title="History">
                                                        <History className="h-4 w-4" />
                                                    </Button>
                                                ) : (
                                                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setView('chat')} title="Back to Chat">
                                                        <MessageCircle className="h-4 w-4" />
                                                    </Button>
                                                )}
                                                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleNewChat} title="New Chat">
                                                    <PlusCircle className="h-4 w-4" />
                                                </Button>
                                                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setIsOpen(false)}>
                                                    <X className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </CardHeader>

                                        <CardContent className="flex-1 p-0 overflow-hidden relative">
                                            {view === 'chat' ? (
                                                <div className="absolute inset-0 overflow-y-auto p-4 space-y-4" ref={scrollRef}>
                                                    {loadSessionMutation.isLoading ? (
                                                        <div className="space-y-4">
                                                            {[1, 2, 3].map((i) => (
                                                                <div key={i} className="space-y-2">
                                                                    <div className="flex justify-end">
                                                                        <Skeleton className="h-10 w-2/3 rounded-lg" />
                                                                    </div>
                                                                    <div className="flex justify-start">
                                                                        <Skeleton className="h-20 w-3/4 rounded-lg" />
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <>
                                                            {messages.map((m, i) => (
                                                                <div key={i} className={cn(
                                                                    "flex w-full",
                                                                    m.role === 'user' ? "justify-end" : "justify-start"
                                                                )}>
                                                                    <div className={cn(
                                                                        "max-w-[80%] rounded-lg px-3 py-2 text-sm",
                                                                        m.role === 'user'
                                                                            ? "bg-purple-600 text-white"
                                                                            : "bg-muted text-foreground"
                                                                    )}>
                                                                        {m.role === 'model' && m.trace && m.trace.length > 0 && (
                                                                            <AgentTraceView steps={m.trace} />
                                                                        )}
                                                                        {typeof m.text === 'string' && m.text.trim().length > 0 && (
                                                                            <ReactMarkdown children={m.text} />
                                                                        )}
                                                                        {m.role === 'model' && m.actionPath && (
                                                                            <div className="mt-2">
                                                                                <Button
                                                                                    size="sm"
                                                                                    variant="secondary"
                                                                                    className="h-7 text-xs"
                                                                                    onClick={() => navigate({ to: m.actionPath as any })}
                                                                                >
                                                                                    Open {m.actionPath}
                                                                                </Button>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            ))}
                                                            {chatMutation.isLoading && (
                                                                <div className="flex justify-start">
                                                                    <div className="max-w-[80%] bg-muted rounded-lg px-3 py-2 text-sm text-muted-foreground">
                                                                        {liveTrace.length > 0 ? (
                                                                            <AgentTraceView steps={liveTrace} loading />
                                                                        ) : (
                                                                            <div className="flex items-center gap-2">
                                                                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                                                <span>Starting...</span>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </>
                                                    )}
                                                </div>
                                            ) : (
                                                <div className="absolute inset-0 overflow-y-auto">
                                                    <div className="p-2 space-y-2">
                                                        <h3 className="text-xs font-semibold text-muted-foreground px-2 py-1 uppercase">Recent Chats</h3>
                                                        {isHistoryLoading ? (
                                                            <div className="space-y-3">
                                                                {[1, 2, 3, 4, 5].map((i) => (
                                                                    <div key={i} className="flex flex-col space-y-2 p-2">
                                                                        <div className="flex justify-between items-center">
                                                                            <Skeleton className="h-4 w-32" />
                                                                            <Skeleton className="h-3 w-16" />
                                                                        </div>
                                                                        <Skeleton className="h-3 w-48" />
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        ) : (
                                                            <>
                                                                {sessions?.length === 0 && (
                                                                    <p className="text-sm text-center text-muted-foreground py-8">No chat history yet.</p>
                                                                )}
                                                                {sessions?.map((session: any) => (
                                                                    <div
                                                                        key={session.id}
                                                                        className={cn(
                                                                            "flex items-center justify-between p-2 rounded-md hover:bg-muted cursor-pointer group",
                                                                            currentSessionId === session.id ? "bg-muted" : ""
                                                                        )}
                                                                        onClick={() => {
                                                                            setMessages([]);
                                                                            setView('chat');
                                                                            loadSessionMutation.mutate({ sessionId: session.id });
                                                                        }}
                                                                    >
                                                                        <div className="flex flex-col overflow-hidden">
                                                                            <span className="text-sm font-medium truncate">{session.title}</span>
                                                                            <span className="text-xs text-muted-foreground">
                                                                                {new Date(session.updatedAt).toLocaleDateString()}
                                                                            </span>
                                                                        </div>
                                                                        <Button
                                                                            variant="ghost"
                                                                            size="icon"
                                                                            className="h-6 w-6 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-500"
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                deleteSessionMutation.mutate({ sessionId: session.id });
                                                                            }}
                                                                        >
                                                                            <Trash2 className="h-3 w-3" />
                                                                        </Button>
                                                                    </div>
                                                                ))}
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                        </CardContent>

                                        <CardFooter className="p-3 border-t bg-background">
                                            {view === 'chat' && (
                                                <form
                                                    className="flex w-full items-center space-x-2 pointer-events-auto"
                                                    onSubmit={handleInputSubmit}
                                                >
                                                    <Label htmlFor="ai-chat-input" className="sr-only">Ask about your spending</Label>
                                                    <Input
                                                        ref={inputRef}
                                                        autoFocus
                                                        id="ai-chat-input"
                                                        name="ai-chat-input"
                                                        placeholder="Ask about your spending..."
                                                        value={inputValue}
                                                        onChange={e => setInputValue(e.target.value)}
                                                        className="flex-1 h-9 pointer-events-auto"
                                                    />
                                                    <Button
                                                        type="submit"
                                                        size="icon"
                                                        className="h-9 w-9 pointer-events-auto"
                                                        disabled={chatMutation.isLoading || (usage?.remaining === 0 && !chatMutation.isLoading)}
                                                    >
                                                        <Send className="h-4 w-4" />
                                                    </Button>
                                                </form>
                                            )}
                                        </CardFooter>
                                    </div>
                                </motion.div>
                            </div>
                        </div>
                    )}
                </AnimatePresence>,
                document.body
            )}
        </>
    );
}

export function AiChatFloatingItem() {
    const { isMobile: isSidebarMobile } = useSidebar();
    const [isOpen, setIsOpen] = useState(false);
    const [view, setView] = useState<'chat' | 'history'>('chat');
    const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
    const [inputValue, setInputValue] = useState('');
    const [sidebarHovered, setSidebarHovered] = useState(false);
    const [sidebarPressed, setSidebarPressed] = useState(false);
    const [hasSentMessage, setHasSentMessage] = useState(false);
    const [compactPanelHeight, setCompactPanelHeight] = useState<number | null>(null);
    const [compactBottomOffset, setCompactBottomOffset] = useState<number>(8);
    const [isWideChatViewport, setIsWideChatViewport] = useState<boolean>(() => {
        if (typeof window === 'undefined') return false;
        return window.matchMedia('(min-width: 640px)').matches;
    });
    const scrollRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const navigate = useNavigate();

    const utils = trpc.useUtils();
    const { isAngry, setIsAngry } = useAngryState(isOpen, hasSentMessage);
    const { messages, setMessages, handleSend, handleNewChat, chatMutation, setHasSentMessage: setMsgSent, pendingRequestId } = useChatLogic(currentSessionId, setCurrentSessionId);
    const { data: liveTraceData } = trpc.ai.getLiveTrace.useQuery(
        { requestId: pendingRequestId || '' },
        {
            enabled: isOpen && chatMutation.isLoading && Boolean(pendingRequestId),
            refetchInterval: chatMutation.isLoading ? 400 : false,
            refetchIntervalInBackground: true,
        }
    );
    const liveTrace = Array.isArray(liveTraceData?.trace) ? liveTraceData.trace : [];
    const openChat = () => {
        setIsAngry(false);
        setIsOpen(true);
    };

    useEffect(() => {
        if (isOpen && view === 'chat') {
            const timer = setTimeout(() => {
                inputRef.current?.focus();
            }, 300);
            return () => clearTimeout(timer);
        }
    }, [isOpen, view]);

    useEffect(() => {
        const mql = window.matchMedia('(min-width: 640px)');
        const syncViewport = () => setIsWideChatViewport(mql.matches);
        syncViewport();
        mql.addEventListener('change', syncViewport);
        return () => mql.removeEventListener('change', syncViewport);
    }, []);

    useEffect(() => {
        if (!isOpen || isWideChatViewport) {
            setCompactPanelHeight(null);
            setCompactBottomOffset(8);
            return;
        }

        const updateCompactMetrics = () => {
            const viewport = window.visualViewport;
            const viewportHeight = viewport?.height ?? window.innerHeight;
            const keyboardInset = Math.max(
                0,
                window.innerHeight - viewportHeight - (viewport?.offsetTop ?? 0)
            );

            setCompactPanelHeight(Math.max(320, Math.floor(viewportHeight * 0.72)));
            setCompactBottomOffset(Math.max(8, Math.floor(keyboardInset + 8)));
        };

        updateCompactMetrics();
        const viewport = window.visualViewport;
        viewport?.addEventListener('resize', updateCompactMetrics);
        viewport?.addEventListener('scroll', updateCompactMetrics);
        window.addEventListener('resize', updateCompactMetrics);

        return () => {
            viewport?.removeEventListener('resize', updateCompactMetrics);
            viewport?.removeEventListener('scroll', updateCompactMetrics);
            window.removeEventListener('resize', updateCompactMetrics);
        };
    }, [isOpen, isWideChatViewport]);

    // Queries
    const { data: usage } = trpc.ai.getChatUsage.useQuery(undefined, { enabled: isOpen });
    const { data: sessions, isLoading: isHistoryLoading } = trpc.ai.listSessions.useQuery(undefined, { enabled: isOpen && view === 'history' });

    // Mutations
    const loadSessionMutation = trpc.ai.getSession.useMutation({
        onSuccess: (data: any) => {
            setMessages((data.messages || []).map((m: any) => ({ role: m.role, text: m.content })));
            setCurrentSessionId(data.id);
        }
    });

    const deleteSessionMutation = trpc.ai.deleteSession.useMutation({
        onSuccess: () => {
            utils.ai.listSessions.invalidate();
            toast.success('Chat deleted');
        }
    });

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, isOpen, view]);

    const handleInputSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!inputValue.trim()) return;

        handleSend(inputValue);
        setInputValue('');
        setHasSentMessage(true);
        setMsgSent(true);
    };

    const handleNewChatClick = () => {
        handleNewChat();
        setCurrentSessionId(null);
        setView('chat');
        setHasSentMessage(false);
        setMsgSent(false);
    };

    const isCompactViewport = !isWideChatViewport;
    const triggerPositionClass = isSidebarMobile ? "bottom-4 right-4" : "bottom-6 right-6";
    const panelPositionClass = isCompactViewport
        ? "fixed inset-x-0 z-[46] pointer-events-auto mx-auto"
        : "fixed bottom-6 right-6 z-[46] pointer-events-auto";
    const panelClassName = cn(
        "bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 overflow-hidden shadow-2xl border-purple-200 dark:border-purple-800 flex flex-col",
        isCompactViewport
            ? "w-[95vw] rounded-3xl"
            : "w-[350px] rounded-3xl"
    );
    const panelStyle = isCompactViewport
        ? {
            height: compactPanelHeight ? `${compactPanelHeight}px` : '72dvh',
            maxHeight: compactPanelHeight ? `${compactPanelHeight}px` : '72dvh',
            bottom: `${compactBottomOffset}px`,
        }
        : { height: '600px', maxHeight: '85vh' };

    return (
        <>
            {!isOpen && (
                <div className={cn("fixed z-[45] pointer-events-auto items-center justify-center", triggerPositionClass)}>
                    <button
                        onClick={openChat}
                        onMouseEnter={() => setSidebarHovered(true)}
                        onMouseLeave={() => { setSidebarHovered(false); setSidebarPressed(false); }}
                        onMouseDown={() => setSidebarPressed(true)}
                        onMouseUp={() => setSidebarPressed(false)}
                        className="relative h-14 w-14 rounded-2xl shadow-lg cursor-pointer transition-all duration-500 flex items-center justify-center pointer-events-auto overflow-hidden bg-transparent hover:bg-transparent"
                    >
                        <motion.div
                            layoutId="ai-chat-container"
                            className={cn("absolute inset-0 rounded-2xl z-0", !isOpen ? "bg-purple-500" : "bg-transparent")}
                            transition={{ type: "spring", stiffness: 300, damping: 30 }}
                        />
                        <div className="relative z-10">
                            <motion.div
                                layoutId="woo-wallet-icon-box"
                                className="flex items-center justify-center"
                                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                            >
                                <MomoIcon
                                    className={cn("size-10", !isOpen ? "text-white" : "text-transparent")}
                                    isHovered={sidebarHovered}
                                    isPressed={sidebarPressed}
                                    isAngry={isAngry}
                                />
                            </motion.div>
                        </div>
                    </button>
                </div>
            )}

            {createPortal(
                <AnimatePresence>
                    {isOpen && (
                        <motion.div
                            layoutId="ai-chat-container"
                            className={cn(panelPositionClass, panelClassName)}
                            style={panelStyle}
                            transition={{ type: "spring", stiffness: 300, damping: 30 }}
                        >
                            <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                                <CardHeader className="px-3 py-2 border-b bg-purple-50/50 dark:bg-purple-900/20 flex flex-row items-center justify-between space-y-0 shrink-0">
                                    <div className="flex items-center gap-2">
                                        <MomoIconWrapper
                                            layoutId="woo-wallet-icon-box"
                                            height="h-6"
                                            width="w-6"
                                            iconClassName="h-4 w-4"
                                        />
                                        <div className="flex flex-col">
                                            <CardTitle className="text-sm font-medium leading-none">
                                                {usage?.tierTitle || 'Woo'}
                                            </CardTitle>
                                            {usage && (
                                                <span className="text-[10px] text-muted-foreground mt-0.5">
                                                    {usage.remaining} / {usage.limit || usage.lifetimeLimit} {usage.limit > 0 ? 'left today' : 'questions left'}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        {view === 'chat' ? (
                                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setView('history')} title="History">
                                                <History className="h-4 w-4" />
                                            </Button>
                                        ) : (
                                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setView('chat')} title="Back to Chat">
                                                <MessageCircle className="h-4 w-4" />
                                            </Button>
                                        )}
                                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleNewChatClick} title="New Chat">
                                            <PlusCircle className="h-4 w-4" />
                                        </Button>
                                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setIsOpen(false)}>
                                            <X className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </CardHeader>

                                <CardContent className="flex-1 min-h-0 p-0 overflow-hidden relative">
                                            {/* Chat View */}
                                            {view === 'chat' ? (
                                                <div className="absolute inset-0 overflow-y-auto overscroll-contain p-4 space-y-4" ref={scrollRef}>
                                                    {loadSessionMutation.isLoading ? (
                                                        <div className="space-y-4">
                                                            {[1, 2, 3].map((i) => (
                                                                <div key={i} className="space-y-2">
                                                                    <div className="flex justify-end"><Skeleton className="h-10 w-2/3 rounded-lg" /></div>
                                                                    <div className="flex justify-start"><Skeleton className="h-20 w-3/4 rounded-lg" /></div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <>
                                                            {messages.map((m, i) => (
                                                                <div key={i} className={cn("flex w-full", m.role === 'user' ? "justify-end" : "justify-start")}>
                                                                    <div className={cn("max-w-[80%] rounded-lg px-3 py-2 text-sm", m.role === 'user' ? "bg-purple-600 text-white" : "bg-muted text-foreground")}>
                                                                        {m.role === 'model' && m.trace && m.trace.length > 0 && (
                                                                            <AgentTraceView steps={m.trace} />
                                                                        )}
                                                                        {typeof m.text === 'string' && m.text.trim().length > 0 && <ReactMarkdown children={m.text} />}
                                                                        {m.role === 'model' && m.actionPath && (
                                                                            <div className="mt-2">
                                                                                <Button
                                                                                    size="sm"
                                                                                    variant="secondary"
                                                                                    className="h-7 text-xs"
                                                                                    onClick={() => navigate({ to: m.actionPath as any })}
                                                                                >
                                                                                    Open {m.actionPath}
                                                                                </Button>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            ))}
                                                            {chatMutation.isLoading && (
                                                                <div className="flex justify-start">
                                                                    <div className="max-w-[80%] bg-muted rounded-lg px-3 py-2 text-sm text-muted-foreground">
                                                                        {liveTrace.length > 0 ? (
                                                                            <AgentTraceView steps={liveTrace} loading />
                                                                        ) : (
                                                                            <div className="flex items-center gap-2">
                                                                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                                                <span>Starting...</span>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </>
                                                    )}
                                                </div>
                                            ) : (
                                                /* History View */
                                                <div className="absolute inset-0 overflow-y-auto overscroll-contain">
                                                    <div className="p-2 space-y-2">
                                                        <h3 className="text-xs font-semibold text-muted-foreground px-2 py-1 uppercase">Recent Chats</h3>
                                                        {isHistoryLoading ? (
                                                            <div className="space-y-3">
                                                                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
                                                            </div>
                                                        ) : (
                                                            <>
                                                                {sessions?.map((session: any) => (
                                                                    <div key={session.id} className="flex items-center justify-between p-2 hover:bg-accent rounded-lg cursor-pointer group" onClick={() => { loadSessionMutation.mutate({ sessionId: session.id }); setView('chat'); }}>
                                                                        <div className="flex-1 min-w-0 mr-2">
                                                                            <p className="text-sm font-medium truncate">{session.title}</p>
                                                                            <p className="text-xs text-muted-foreground">{new Date(session.updatedAt).toLocaleDateString()}</p>
                                                                        </div>
                                                                        <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => { e.stopPropagation(); if (confirm('Delete chat?')) deleteSessionMutation.mutate({ sessionId: session.id }); }}>
                                                                            <Trash2 className="h-3 w-3 text-destructive" />
                                                                        </Button>
                                                                    </div>
                                                                ))}
                                                                {sessions?.length === 0 && <div className="text-center py-8 text-muted-foreground text-sm">No recent chats</div>}
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                </CardContent>

                                <CardFooter className="px-3 py-2 border-t bg-background/50 backdrop-blur-sm shrink-0">
                                            {view === 'chat' && (
                                                <form
                                                    className="flex w-full items-center space-x-2 pointer-events-auto"
                                                    onSubmit={handleInputSubmit}
                                                >
                                                    <Label htmlFor="ai-chat-input-mobile" className="sr-only">Ask about your spending</Label>
                                                    <Input
                                                        ref={inputRef}
                                                        autoFocus
                                                        id="ai-chat-input-mobile"
                                                        name="ai-chat-input-mobile"
                                                        placeholder="Ask about your spending..."
                                                        value={inputValue}
                                                        onChange={e => setInputValue(e.target.value)}
                                                        className="flex-1 h-9 pointer-events-auto"
                                                    />
                                                    <Button type="submit" size="icon" className="h-9 w-9 pointer-events-auto" disabled={chatMutation.isLoading || (usage?.remaining === 0 && !chatMutation.isLoading)}>
                                                        <Send className="h-4 w-4" />
                                                    </Button>
                                                </form>
                                            )}
                                </CardFooter>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>,
                document.body
            )}
        </>
    );
}
