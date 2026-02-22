import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import posthog from 'posthog-js';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { MessageCircle, X, Send, History, PlusCircle, Trash2 } from 'lucide-react';
import { SidebarMenu, SidebarMenuItem, SidebarMenuButton } from '@/components/ui/sidebar';
import ReactMarkdown from 'react-markdown';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { Skeleton } from '@/components/ui/skeleton';
import { MomoIcon } from './MomoIcon';
import { MomoIconWrapper } from './MomoIconWrapper';

interface Message {
    role: 'user' | 'model';
    text: string;
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

    const chatMutation = trpc.ai.chat.useMutation({
        onSuccess: (data: any) => {
            setMessages(prev => [...prev, { role: 'model', text: data.response }]);
            if (data.sessionId && !currentSessionId) {
                setCurrentSessionId(data.sessionId);
                utils.ai.listSessions.invalidate();
            }
            utils.ai.getChatUsage.invalidate();
        },
        onError: (error: any) => {
            console.error(error);
            const message = error.message || 'Sorry, I encountered an error. Try again!';
            setMessages(prev => [...prev, { role: 'model', text: message }]);
        }
    });

    const handleSend = (inputValue: string) => {
        if (!inputValue.trim()) return;

        const newMsg: Message = { role: 'user', text: inputValue };
        setMessages(prev => [...prev, newMsg]);
        setHasSentMessage(true);
        chatMutation.mutate({ message: newMsg.text, sessionId: currentSessionId });
        posthog.capture('ai_message_sent', { session_id: currentSessionId, message_length: newMsg.text.length });
    };

    const handleNewChat = () => {
        setMessages([{ role: 'model', text: 'Hi! I\'m Woo. Ask me anything about your finances!' }]);
        setHasSentMessage(false);
    };

    return { messages, setMessages, handleSend, handleNewChat, chatMutation, hasSentMessage, setHasSentMessage };
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

    const { isAngry, setIsAngry } = useAngryState(isOpen, false);
    const { messages, setMessages, handleSend, handleNewChat, chatMutation } = useChatLogic(currentSessionId, setCurrentSessionId);
    const utils = trpc.useUtils();

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
                                                                        {typeof m.text === 'string' && m.text.trim().length > 0 && (
                                                                            <ReactMarkdown children={m.text} />
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            ))}
                                                            {chatMutation.isLoading && (
                                                                <div className="flex justify-start">
                                                                    <div className="bg-muted rounded-lg px-3 py-2 text-sm text-muted-foreground animate-pulse">
                                                                        Thinking...
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

export function AiChatFloatingItem({ variant = 'desktop' }: { variant?: 'desktop' | 'mobile' }) {
    const [isOpen, setIsOpen] = useState(false);
    const [view, setView] = useState<'chat' | 'history'>('chat');
    const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
    const [inputValue, setInputValue] = useState('');
    const [sidebarHovered, setSidebarHovered] = useState(false);
    const [sidebarPressed, setSidebarPressed] = useState(false);
    const [hasSentMessage, setHasSentMessage] = useState(false);
    const [mobileViewportHeight, setMobileViewportHeight] = useState<number | null>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const utils = trpc.useUtils();
    const { isAngry, setIsAngry } = useAngryState(isOpen, hasSentMessage);
    const { messages, setMessages, handleSend, handleNewChat, chatMutation, setHasSentMessage: setMsgSent } = useChatLogic(currentSessionId, setCurrentSessionId);



    useEffect(() => {
        if (isOpen && view === 'chat') {
            const timer = setTimeout(() => {
                inputRef.current?.focus();
            }, 300);
            return () => clearTimeout(timer);
        }
    }, [isOpen, view]);

    useEffect(() => {
        if (!isOpen || variant !== 'mobile') return;

        const updateHeight = () => {
            const nextHeight = Math.max(window.visualViewport?.height ?? window.innerHeight, 320) * 0.8;
            setMobileViewportHeight(Math.max(320, Math.floor(nextHeight)));
        };

        updateHeight();

        const viewport = window.visualViewport;
        viewport?.addEventListener('resize', updateHeight);
        viewport?.addEventListener('scroll', updateHeight);
        window.addEventListener('resize', updateHeight);

        const previousBodyOverflow = document.body.style.overflow;
        const previousBodyOverscrollBehavior = document.body.style.overscrollBehavior;
        document.body.style.overflow = 'hidden';
        document.body.style.overscrollBehavior = 'none';

        return () => {
            viewport?.removeEventListener('resize', updateHeight);
            viewport?.removeEventListener('scroll', updateHeight);
            window.removeEventListener('resize', updateHeight);
            document.body.style.overflow = previousBodyOverflow;
            document.body.style.overscrollBehavior = previousBodyOverscrollBehavior;
        };
    }, [isOpen, variant]);

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

        const newMsg: Message = { role: 'user', text: inputValue };
        setMessages(prev => [...prev, newMsg]);
        setInputValue('');
        setHasSentMessage(true);
        setMsgSent(true);
        chatMutation.mutate({ message: newMsg.text, sessionId: currentSessionId });
        posthog.capture('ai_message_sent', { session_id: currentSessionId, message_length: newMsg.text.length });
    };

    const mobilePanelHeight = mobileViewportHeight
        ? `${Math.max(320, mobileViewportHeight - 8)}px`
        : 'calc(100dvh - 0.5rem)';

    return (
        <>
            <div className={cn(
                variant === 'desktop'
                    ? "fixed bottom-6 left-6 z-[45] hidden min-[850px]:flex"
                    : "fixed bottom-4 right-4 z-[45] flex min-[850px]:hidden",
                "pointer-events-auto items-center justify-center"
            )}>
                <button
                    onClick={() => setIsOpen(true)}
                    onMouseEnter={() => setSidebarHovered(true)}
                    onMouseLeave={() => { setSidebarHovered(false); setSidebarPressed(false); }}
                    onMouseDown={() => setSidebarPressed(true)}
                    onMouseUp={() => { setSidebarPressed(false); setIsOpen(true); }}
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

            {createPortal(
                <AnimatePresence>
                    {isOpen && (
                        <div className="fixed inset-0 left-0 z-[46] flex items-end p-2 md:p-4 pointer-events-none w-full h-full">
                            <div className="pointer-events-auto w-full md:w-auto h-full md:h-auto flex items-end justify-center md:justify-start">
                                <motion.div
                                    layoutId="ai-chat-container"
                                    className="bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 rounded-2xl md:rounded-3xl overflow-hidden shadow-2xl border-purple-200 dark:border-purple-800 w-full md:w-[350px] flex flex-col md:h-[600px]"
                                    style={variant === 'mobile' ? { height: mobilePanelHeight, maxHeight: mobilePanelHeight } : undefined}
                                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                                >
                                    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                                        <CardHeader className="px-3 py-2 md:p-3 border-b bg-purple-50/50 dark:bg-purple-900/20 flex flex-row items-center justify-between space-y-0 shrink-0">
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
                                                                        {typeof m.text === 'string' && m.text.trim().length > 0 && <ReactMarkdown children={m.text} />}
                                                                    </div>
                                                                </div>
                                                            ))}
                                                            {chatMutation.isLoading && (
                                                                <div className="flex justify-start">
                                                                    <div className="bg-muted rounded-lg px-3 py-2 text-sm text-muted-foreground animate-pulse">Thinking...</div>
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

                                        <CardFooter className="px-3 py-2 md:p-3 border-t bg-background/50 backdrop-blur-sm shrink-0">
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
                            </div>
                        </div>
                    )}
                </AnimatePresence>,
                document.body
            )}
        </>
    );
}


