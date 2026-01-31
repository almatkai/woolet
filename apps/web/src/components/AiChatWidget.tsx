import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { MessageCircle, X, Send, Bot, History, PlusCircle, Trash2, Wallet } from 'lucide-react';
import { SidebarMenu, SidebarMenuItem, SidebarMenuButton } from '@/components/ui/sidebar';
import ReactMarkdown from 'react-markdown';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { Skeleton } from '@/components/ui/skeleton';

interface Message {
    role: 'user' | 'model';
    text: string;
}

export function AiChatSidebarItem() {
    const [isOpen, setIsOpen] = useState(false);
    const [view, setView] = useState<'chat' | 'history'>('chat');
    const [messages, setMessages] = useState<Message[]>([
        { role: 'model', text: 'Hi! I\'m Woo. Ask me anything about your finances!' }
    ]);
    const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
    const [inputValue, setInputValue] = useState('');
    const [sidebarHovered, setSidebarHovered] = useState(false);
    const [sidebarPressed, setSidebarPressed] = useState(false);
    const [hasSentMessage, setHasSentMessage] = useState(false);
    const [isAngry, setIsAngry] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);

    const utils = trpc.useUtils();

    // Angry state trigger logic
    useEffect(() => {
        if (isOpen) {
            setHasSentMessage(false);
            setIsAngry(false);
        } else {
            // If closed and no messages were sent, make it angry
            if (!hasSentMessage && currentSessionId) {
                // We only get angry if we actually had a session going or were at least looking at one
                // But simpler: if opened and closed without sending, be angry
            }

            // Refined logic: if it was open and we close it without sending
            // We need to know if it transition from open to closed
        }
    }, [isOpen]);

    // Track state transitions for anger
    const wasOpen = useRef(isOpen);
    useEffect(() => {
        if (wasOpen.current && !isOpen && !hasSentMessage) {
            setIsAngry(true);
            const timer = setTimeout(() => setIsAngry(false), 5000);
            return () => clearTimeout(timer);
        }
        wasOpen.current = isOpen;
    }, [isOpen, hasSentMessage]);

    // Queries
    const { data: sessions, isLoading: isHistoryLoading } = trpc.ai.listSessions.useQuery(undefined, {
        enabled: isOpen && view === 'history',
    });

    // Mutations
    const chatMutation = trpc.ai.chat.useMutation({
        onSuccess: (data: any) => {
            setMessages(prev => [...prev, { role: 'model', text: data.response }]);
            if (data.sessionId && !currentSessionId) {
                setCurrentSessionId(data.sessionId);
                utils.ai.listSessions.invalidate();
            }
        },
        onError: (error: any) => {
            console.error(error);
            setMessages(prev => [...prev, { role: 'model', text: 'Sorry, I encountered an error. Try again!' }]);
        }
    });

    const loadSessionMutation = trpc.ai.getSession.useMutation({
        onSuccess: (data: any) => {
            setMessages(data.messages.map((m: any) => ({
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

    const handleSend = () => {
        if (!inputValue.trim()) return;

        const newMsg: Message = { role: 'user', text: inputValue };
        setMessages(prev => [...prev, newMsg]);
        setInputValue('');

        setHasSentMessage(true);
        chatMutation.mutate({
            message: newMsg.text,
            sessionId: currentSessionId
        });
    };

    const handleNewChat = () => {
        setMessages([{ role: 'model', text: 'Hi! I\'m Woo. Ask me anything about your finances!' }]);
        setCurrentSessionId(null);
        setView('chat');
    };

    function MomoIcon({ className, isHovered, isPressed, isAngry }: { className?: string, isHovered?: boolean, isPressed?: boolean, isAngry?: boolean }) {
        // Animation states
        const [leftEyeScale, setLeftEyeScale] = useState(1);
        const [rightEyeScale, setRightEyeScale] = useState(1);
        const [breathScale, setBreathScale] = useState(1);
        const [headTilt, setHeadTilt] = useState(0);
        const [headBob, setHeadBob] = useState(0);
        const [smileAmount, setSmileAmount] = useState(0);
        const [leftBrowRaise, setLeftBrowRaise] = useState(0);
        const [rightBrowRaise, setRightBrowRaise] = useState(0);
        const [eyeOffsetX, setEyeOffsetX] = useState(0);
        const [eyeOffsetY, setEyeOffsetY] = useState(0);

        const [excitement, setExcitement] = useState(0);
        const [curiosity, setCuriosity] = useState(0);
        const [blinkPhase, setBlinkPhase] = useState(0);
        const [pupilDilate, setPupilDilate] = useState(1);

        // Complex idle animation scheduler with more variety
        useEffect(() => {
            const animations = [
                // Double blink - rapid
                () => {
                    setLeftEyeScale(0.1);
                    setRightEyeScale(0.1);
                    setTimeout(() => {
                        setLeftEyeScale(1);
                        setRightEyeScale(1);
                        setTimeout(() => {
                            setLeftEyeScale(0.1);
                            setRightEyeScale(0.1);
                            setTimeout(() => {
                                setLeftEyeScale(1);
                                setRightEyeScale(1);
                            }, 80);
                        }, 100);
                    }, 80);
                },
                // Slow wink with smile
                () => {
                    const isLeft = Math.random() > 0.5;
                    setSmileAmount(1);
                    if (isLeft) {
                        setLeftEyeScale(0.1);
                        setLeftBrowRaise(-1.5);
                        setTimeout(() => {
                            setLeftEyeScale(1);
                            setLeftBrowRaise(0);
                            setSmileAmount(0);
                        }, 400);
                    } else {
                        setRightEyeScale(0.1);
                        setRightBrowRaise(-1.5);
                        setTimeout(() => {
                            setRightEyeScale(1);
                            setRightBrowRaise(0);
                            setSmileAmount(0);
                        }, 400);
                    }
                },
                // Curious head tilt with eyebrow raise
                () => {
                    const tilt = (Math.random() - 0.5) * 12;
                    setHeadTilt(tilt);
                    setCuriosity(1);
                    if (tilt > 0) {
                        setLeftBrowRaise(-2);
                    } else {
                        setRightBrowRaise(-2);
                    }
                    setTimeout(() => {
                        setHeadTilt(0);
                        setCuriosity(0);
                        setLeftBrowRaise(0);
                        setRightBrowRaise(0);
                    }, 1200);
                },
                // Excitement bounce
                () => {
                    setExcitement(1);
                    setSmileAmount(1);
                    setHeadBob(-2);
                    setTimeout(() => setHeadBob(0), 150);
                    setTimeout(() => setHeadBob(-2), 300);
                    setTimeout(() => {
                        setHeadBob(0);
                        setExcitement(0);
                        setSmileAmount(0);
                    }, 450);
                },

                // Pupil dilation (surprise/interest)
                () => {
                    setPupilDilate(1.4);
                    setTimeout(() => setPupilDilate(1), 800);
                },
                // Side glance with follow-through
                () => {
                    const offsetX = (Math.random() - 0.5) * 2;
                    const offsetY = (Math.random() - 0.5) * 1;
                    setEyeOffsetX(offsetX);
                    setEyeOffsetY(offsetY);
                    setTimeout(() => {
                        setEyeOffsetX(offsetX * 0.5);
                        setEyeOffsetY(offsetY * 0.5);
                    }, 400);
                    setTimeout(() => {
                        setEyeOffsetX(0);
                        setEyeOffsetY(0);
                    }, 800);
                },
                // Slow blink with breath hold
                () => {
                    setBreathScale(0.98);
                    setLeftEyeScale(0.1);
                    setRightEyeScale(0.1);
                    setTimeout(() => {
                        setBreathScale(1);
                        setLeftEyeScale(1);
                        setRightEyeScale(1);
                    }, 600);
                },
                // Thoughtful look (eyes up)
                () => {
                    setEyeOffsetY(-1);
                    setSmileAmount(0.5);
                    setTimeout(() => {
                        setEyeOffsetY(0);
                        setSmileAmount(0);
                    }, 1000);
                },
                // Playful eye roll
                () => {
                    setEyeOffsetY(-1);
                    setTimeout(() => {
                        setEyeOffsetX(1);
                        setEyeOffsetY(0);
                    }, 200);
                    setTimeout(() => {
                        setEyeOffsetX(0);
                    }, 600);
                },
                // Content sigh (eyes half closed)
                () => {
                    setLeftEyeScale(0.6);
                    setRightEyeScale(0.6);
                    setSmileAmount(1);
                    setTimeout(() => {
                        setLeftEyeScale(1);
                        setRightEyeScale(1);
                        setSmileAmount(0);
                    }, 900);
                },
                // Confused look (eyebrows inwards)
                () => {
                    setLeftBrowRaise(1.5);
                    setRightBrowRaise(1.5);
                    setHeadTilt(3);
                    setTimeout(() => {
                        setLeftBrowRaise(0);
                        setRightBrowRaise(0);
                        setHeadTilt(0);
                    }, 800);
                },
            ];

            // Breathing animation (constant subtle with variation)
            const breathingInterval = setInterval(() => {
                const breathIntensity = 1 + (Math.random() * 0.02);
                setBreathScale(breathIntensity);
                setTimeout(() => setBreathScale(1), 2000 + Math.random() * 1000);
            }, 4000);

            // Random idle animations with weighted probabilities
            const idleInterval = setInterval(() => {
                const rand = Math.random();
                let animIndex;
                if (rand < 0.3) {
                    animIndex = 0; // Double blink - most common
                } else if (rand < 0.5) {
                    animIndex = 2; // Curious tilt
                } else if (rand < 0.6) {
                    animIndex = 3; // Excitement
                } else if (rand < 0.7) {
                    animIndex = 5; // Nose twitch
                } else {
                    animIndex = Math.floor(Math.random() * animations.length);
                }
                animations[animIndex]();
            }, 2500 + Math.random() * 3000);

            return () => {
                clearInterval(breathingInterval);
                clearInterval(idleInterval);
            };
        }, []);

        // Hover excitement effect
        useEffect(() => {
            if (isHovered) {
                setExcitement(1);
                setSmileAmount(1);
                setPupilDilate(1.2);
            } else {
                setExcitement(0);
                setSmileAmount(0);
                setPupilDilate(1);
            }
        }, [isHovered]);

        const mouthPath = smileAmount > 0
            ? `M7 ${16.5 - smileAmount * 0.5} Q12 ${19.5 + smileAmount} 17 ${16.5 - smileAmount * 0.5}`
            : "M8 17 Q12 18.5 16 17";

        return (
            <motion.div
                className={cn("relative", className)}
                animate={{
                    scale: isPressed ? 0.85 : isHovered ? 1.15 : breathScale,
                    rotate: isPressed ? -8 : isHovered ? 8 + headTilt : headTilt,
                    y: headBob + (excitement * -1),
                }}
                transition={{ 
                    type: "spring", 
                    stiffness: 400, 
                    damping: 15,
                    mass: 0.8
                }}
            >
                <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="w-full h-full"
                >
                    {/* Wallet Body with subtle gradient effect via stroke */}
                    <motion.rect 
                        x="2" y="5" width="20" height="15" rx="3" ry="3"
                        animate={{
                            strokeWidth: isHovered ? 2 : 1.5,
                        }}
                        transition={{ duration: 0.2 }}
                    />
                    <motion.path 
                        d="M2 8h20"
                        animate={{
                            strokeWidth: isHovered ? 2 : 1.5,
                        }}
                        transition={{ duration: 0.2 }}
                    />



                    {/* Left Eyebrow with more expressiveness */}
                    <motion.path
                        d={isAngry ? "M6 12.5 Q8.5 13.5 11 12.5" : "M6 11.5 Q8.5 10.5 11 11.5"}
                        strokeWidth="1.2"
                        fill="none"
                        animate={{
                            y: leftBrowRaise + (curiosity * (headTilt > 0 ? -1 : 0.5)),
                            d: isAngry ? "M6 12.5 Q8.5 13.5 11 12.5" : "M6 11.5 Q8.5 10.5 11 11.5"
                        }}
                        transition={{ duration: 0.12, type: "spring", stiffness: 300 }}
                    />

                    {/* Right Eyebrow with more expressiveness */}
                    <motion.path
                        d={isAngry ? "M13 12.5 Q15.5 13.5 18 12.5" : "M13 11.5 Q15.5 10.5 18 11.5"}
                        strokeWidth="1.2"
                        fill="none"
                        animate={{
                            y: rightBrowRaise + (curiosity * (headTilt < 0 ? -1 : 0.5)),
                            d: isAngry ? "M13 12.5 Q15.5 13.5 18 12.5" : "M13 11.5 Q15.5 10.5 18 11.5"
                        }}
                        transition={{ duration: 0.12, type: "spring", stiffness: 300 }}
                    />

                    {/* Left Eye with enhanced animation */}
                    <motion.ellipse
                        cx={8.5 + (eyeOffsetX || 0)}
                        cy={14 + (eyeOffsetY || 0)}
                        rx="1.3"
                        ry={1.3 * (leftEyeScale || 1)}
                        fill="currentColor"
                        animate={{
                            cx: 8.5 + (eyeOffsetX || 0),
                            ry: isHovered ? 1.7 * (leftEyeScale || 1) : 1.3 * (leftEyeScale || 1),
                            rx: isHovered ? 1.5 : 1.3,
                        }}
                        transition={{ duration: 0.06, type: "spring", stiffness: 400 }}
                    />
                    {/* Left Pupil with dilation */}
                    {(leftEyeScale || 1) > 0.3 && (
                        <motion.circle
                            cx={8.5 + (eyeOffsetX || 0) * 1.5}
                            cy={14 + (eyeOffsetY || 0)}
                            r={0.5 * pupilDilate}
                            fill="black"
                            animate={{ 
                                cx: 8.5 + (eyeOffsetX || 0) * 1.5,
                                r: 0.5 * pupilDilate,
                            }}
                            transition={{ duration: 0.06, type: "spring", stiffness: 400 }}
                        />
                    )}

                    {/* Right Eye with enhanced animation */}
                    <motion.ellipse
                        cx={15.5 + (eyeOffsetX || 0)}
                        cy={14 + (eyeOffsetY || 0)}
                        rx="1.3"
                        ry={1.3 * (rightEyeScale || 1)}
                        fill="currentColor"
                        animate={{
                            cx: 15.5 + (eyeOffsetX || 0),
                            ry: isHovered ? 1.7 * (rightEyeScale || 1) : 1.3 * (rightEyeScale || 1),
                            rx: isHovered ? 1.5 : 1.3,
                        }}
                        transition={{ duration: 0.06, type: "spring", stiffness: 400 }}
                    />
                    {/* Right Pupil with dilation */}
                    {(rightEyeScale || 1) > 0.3 && (
                        <motion.circle
                            cx={15.5 + (eyeOffsetX || 0) * 1.5}
                            cy={14 + (eyeOffsetY || 0)}
                            r={0.5 * pupilDilate}
                            fill="black"
                            animate={{ 
                                cx: 15.5 + (eyeOffsetX || 0) * 1.5,
                                r: 0.5 * pupilDilate,
                            }}
                            transition={{ duration: 0.06, type: "spring", stiffness: 400 }}
                        />
                    )}

                    {/* Eye sparkles with more intensity on hover */}
                    {isHovered && (leftEyeScale || 1) > 0.5 && (
                        <>
                            <motion.circle 
                                cx={9 + (eyeOffsetX || 0)} 
                                cy="13" 
                                r="0.7" 
                                fill="white" 
                                opacity="0.95"
                                animate={{ r: [0.7, 0.9, 0.7] }}
                                transition={{ duration: 1.5, repeat: Infinity }}
                            />
                            <motion.circle 
                                cx={16 + (eyeOffsetX || 0)} 
                                cy="13" 
                                r="0.7" 
                                fill="white" 
                                opacity="0.95"
                                animate={{ r: [0.7, 0.9, 0.7] }}
                                transition={{ duration: 1.5, repeat: Infinity, delay: 0.2 }}
                            />
                            {/* Extra sparkle */}
                            <circle cx={7.5 + (eyeOffsetX || 0)} cy="12.5" r="0.4" fill="white" opacity="0.7" />
                            <circle cx={17.5 + (eyeOffsetX || 0)} cy="12.5" r="0.4" fill="white" opacity="0.7" />
                        </>
                    )}



                    {/* Mouth with more expressive curves */}
                    <motion.path
                        d={isAngry ? "M9 18.5 Q12 16.5 15 18.5" : isPressed ? "M8 17 Q12 14 16 17" : isHovered ? "M6 15.5 Q12 21.5 18 15.5" : mouthPath}
                        strokeWidth="1.4"
                        fill="none"
                        animate={{
                            d: isAngry ? "M9 18.5 Q12 16.5 15 18.5" : isPressed ? "M8 17 Q12 14 16 17" : isHovered ? "M6 15.5 Q12 21.5 18 15.5" : mouthPath,
                            strokeWidth: isHovered ? 1.8 : 1.4,
                        }}
                        transition={{ duration: 0.15, type: "spring", stiffness: 200 }}
                    />

                    {/* Enhanced blush on hover */}
                    {isHovered && (
                        <>
                            <motion.circle 
                                cx="5" 
                                cy="15.5" 
                                r="1.4" 
                                fill="currentColor" 
                                opacity="0.2"
                                animate={{ r: [1.4, 1.6, 1.4] }}
                                transition={{ duration: 2, repeat: Infinity }}
                            />
                            <motion.circle 
                                cx="19" 
                                cy="15.5" 
                                r="1.4" 
                                fill="currentColor" 
                                opacity="0.2"
                                animate={{ r: [1.4, 1.6, 1.4] }}
                                transition={{ duration: 2, repeat: Infinity, delay: 0.3 }}
                            />
                        </>
                    )}

                    {/* Excitement lines when hovered */}
                    {isHovered && (
                        <>
                            <motion.path
                                d="M3 14 L4 15"
                                strokeWidth="1"
                                animate={{ opacity: [0, 1, 0] }}
                                transition={{ duration: 1, repeat: Infinity }}
                            />
                            <motion.path
                                d="M21 14 L20 15"
                                strokeWidth="1"
                                animate={{ opacity: [0, 1, 0] }}
                                transition={{ duration: 1, repeat: Infinity, delay: 0.5 }}
                            />
                        </>
                    )}
                </svg>
            </motion.div>
        );
    }

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
                        onMouseUp={() => setSidebarPressed(false)}
                        className="group h-auto py-1.5 px-3 bg-purple-500 hover:bg-purple-600 active:bg-purple-700 text-white rounded-2xl cursor-pointer transition-all duration-200 border-none flex items-center gap-3 w-full"
                    >
                        <div className="flex-shrink-0 relative">
                            <motion.div
                                layoutId="woo-wallet-icon-box"
                                className="flex items-center justify-center"
                                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                            >
                                {!isOpen && (
                                    <MomoIcon
                                        className="size-10 text-white"
                                        isHovered={sidebarHovered}
                                        isPressed={sidebarPressed}
                                        isAngry={isAngry}
                                    />
                                )}
                            </motion.div>
                        </div>
                        <div className={cn("flex-1 text-left leading-tight transition-opacity duration-200", isOpen ? "opacity-0" : "opacity-100")}>
                            <span className="text-xl font-bold tracking-tight text-white group-hover:text-white group-hover:drop-shadow-[0_0_8px_rgba(255,255,255,0.4)] transition-all duration-200">Hey!</span>
                        </div>
                    </SidebarMenuButton>
                </SidebarMenuItem>
            </SidebarMenu>

            {createPortal(
                <AnimatePresence>
                    {isOpen && (
                        <div className="fixed inset-y-0 left-0 z-[9999] flex items-end p-4 pointer-events-none">
                            <div className="pointer-events-auto">
                                <motion.div
                                    initial={{ opacity: 0, x: -20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: -20 }}
                                    transition={{ duration: 0.2 }}
                                >
                                    <Card className="w-[350px] h-[600px] max-h-[85vh] flex flex-col shadow-2xl border-purple-200 dark:border-purple-800 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 rounded-3xl overflow-hidden">
                                        <CardHeader className="p-3 border-b bg-purple-50/50 dark:bg-purple-900/20 flex flex-row items-center justify-between space-y-0">
                                            <div className="flex items-center gap-2">
                                                <motion.div
                                                    layoutId="woo-wallet-icon-box"
                                                    className="p-1.5 bg-purple-500 rounded-lg flex items-center justify-center"
                                                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                                                >
                                                    <MomoIcon
                                                        className="h-6 w-6 text-white"
                                                    />
                                                </motion.div>
                                                <CardTitle className="text-sm font-medium">Woo</CardTitle>
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
                                                    className="flex w-full items-center space-x-2"
                                                    onSubmit={(e) => { e.preventDefault(); handleSend(); }}
                                                >
                                                    <Input
                                                        placeholder="Ask about your spending..."
                                                        value={inputValue}
                                                        onChange={e => setInputValue(e.target.value)}
                                                        className="flex-1 h-9"
                                                    />
                                                    <Button type="submit" size="icon" className="h-9 w-9" disabled={chatMutation.isLoading}>
                                                        <Send className="h-4 w-4" />
                                                    </Button>
                                                </form>
                                            )}
                                        </CardFooter>
                                    </Card>
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
