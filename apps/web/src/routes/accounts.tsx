
import { useMemo, useState, useEffect, useLayoutEffect, useRef } from 'react';
import posthog from 'posthog-js';
import { motion, useAnimation, useMotionValue, useSpring, useTransform, useMotionTemplate } from 'framer-motion';
import { DeleteConfirm } from '@/components/DeleteConfirm';
import { AddBankSheet } from '@/components/AddBankSheet';
import { AddAccountSheet } from '@/components/AddAccountSheet';
import { AddCurrencyBalanceSheet } from '@/components/AddCurrencyBalanceSheet';
import { AccountActionSheet } from '@/components/AccountActionSheet';
import { PageHeader } from '@/components/PageHeader';
import { TransferSheet } from '@/components/TransferSheet';
import { Button } from '@/components/ui/button';
import { trpc } from '@/lib/trpc';
import { Skeleton } from '@/components/ui/skeleton';
import { Trash2, Pencil, Plus, CircleDollarSign, X, Wifi } from 'lucide-react';
import { toast } from 'sonner';
import { SettingsBankSheet } from '@/components/SettingsBankSheet';
import { cn } from '@/lib/utils';
import Leather from '../../public/assets/leather.webp';

interface CurrencyBalance {
    id: string;
    currencyCode: string;
    balance: string | number;
}

interface Account {
    id: string;
    name: string;
    type: string;
    icon?: string | null;
    last4Digits?: string | null;
    currencyBalances: CurrencyBalance[];
}

interface Bank {
    id: string;
    name: string;
    icon?: string | null;
    color?: string | null;
    accounts: Account[];
}

// Predefined card colors for accounts within a bank
const CARD_COLORS = [
    '#8B5CF6', // purple
    '#06B6D4', // cyan
    '#EC4899', // pink
    '#F59E0B', // amber
    '#10B981', // emerald
    '#3B82F6', // blue
    '#EF4444', // red
    '#6366F1', // indigo
];

function getCardColor(index: number): string {
    return CARD_COLORS[index % CARD_COLORS.length];
}

/** Deterministic 0–1 from seed so each card gets stable random tilt/shift. */
function seededRandom(seed: string): number {
    let h = 0;
    for (let i = 0; i < seed.length; i++) h = ((h << 5) - h + seed.charCodeAt(i)) | 0;
    return (Math.abs(h) % 1e6) / 1e6;
}

function AccountCard({
    account,
    index,
    totalCards,
    isActive,
    onTabClick,
    onClose,
    onDeleteAccount,
    onSelectAccount,
}: {
    account: Account;
    index: number;
    totalCards: number;
    isActive: boolean;
    onTabClick: () => void;
    onClose: () => void;
    onDeleteAccount: (id: string) => void;
    onSelectAccount: (account: Account) => void;
}) {
    const CARD_W = 308;
    const CARD_W_ACTIVE = 342;
    const CARD_H = 180;
    const TAB_TRANSFORM_Y = 38;
    const WALLET_Z_INDEX = 20;
    const ACTIVE_CARD_Z_INDEX = WALLET_Z_INDEX + 1;

    const baseZIndex = totalCards - index;
    const inactiveBottom = index * TAB_TRANSFORM_Y;
    const activeY = (index + 1) * TAB_TRANSFORM_Y ;
    // Per-card random tilt (max 1.5°) and shift (1–6px any direction), stable via account.id
    const stackRandom = useMemo(() => {
        const r1 = seededRandom(account.id + 'r');
        const r2 = seededRandom(account.id + 'x');
        const r3 = seededRandom(account.id + 'y');
        return {
            rotateZ: (r1 - 0.5) * 3,
            x: (r2 - 0.5) * 12,
            y: (r3 - 0.5) * 12,
        };
    }, [account.id]);

    const controls = useAnimation();
    const [cardScale, setCardScale] = useState(1);
    const hasInitialized = useRef(false);
    const prevIsActive = useRef(isActive);
    const isAnimating = useRef(false);
    const isHovering = useRef(false);
    const normalizedLast4 = (account.last4Digits ?? '').replace(/\D/g, '').slice(-4);

    const mouseX = useMotionValue(0);
    const mouseY = useMotionValue(0);
    const isHovered = useMotionValue(0);

    const springConfig = { stiffness: 400, damping: 30 };
    const rotateX = useSpring(useTransform(mouseY, [-0.5, 0.5], ["15deg", "-15deg"]), springConfig);
    const rotateY = useSpring(useTransform(mouseX, [-0.5, 0.5], ["-15deg", "15deg"]), springConfig);
    
    const bgX = useSpring(useTransform(mouseX, [-0.5, 0.5], ["0%", "100%"]), springConfig);
    const bgY = useSpring(useTransform(mouseY, [-0.5, 0.5], ["0%", "100%"]), springConfig);

    const glareOpacity = useSpring(isHovered, springConfig);
    const glareBg = useMotionTemplate`radial-gradient(circle at ${bgX} ${bgY}, rgba(255,255,255,0.4) 0%, transparent 60%)`;

    const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!isActive) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const px = (e.clientX - rect.left) / rect.width - 0.5;
        const py = (e.clientY - rect.top) / rect.height - 0.5;
        mouseX.set(px);
        mouseY.set(py);
    };

    const handleMouseEnter = () => {
        isHovering.current = true;
        if (isActive) {
            isHovered.set(1);
            return;
        }
        if (!isAnimating.current) {
            void controls.start({
                y: stackRandom.y - 22,
                rotateX: -20,
                scale: 1.04,
                transition: { type: 'spring', stiffness: 400, damping: 30 },
            });
        }
    };

    const handleMouseLeave = () => {
        isHovering.current = false;
        if (isActive) {
            mouseX.set(0);
            mouseY.set(0);
            isHovered.set(0);
            return;
        }
        if (!isAnimating.current) {
            void controls.start({
                y: stackRandom.y,
                rotateX: 0,
                scale: 1,
                transition: { type: 'spring', stiffness: 400, damping: 30 },
            });
        }
    };

    useLayoutEffect(() => {
        if (hasInitialized.current) {
            return;
        }

        hasInitialized.current = true;
        prevIsActive.current = isActive;
        controls.set({
            x: isActive ? 0 : stackRandom.x,
            y: isActive ? activeY : stackRandom.y,
            rotateZ: isActive ? 0 : stackRandom.rotateZ,
            scale: 1,
        });
    }, [activeY, baseZIndex, controls, isActive, ACTIVE_CARD_Z_INDEX, stackRandom]);

    useEffect(() => {
        if (!hasInitialized.current) {
            return;
        }

        if (prevIsActive.current === isActive) {
            if (!isAnimating.current) {
                controls.set({
                    x: isActive ? 0 : stackRandom.x,
                    y: isActive ? activeY : stackRandom.y,
                    rotateZ: isActive ? 0 : stackRandom.rotateZ,
                    scale: 1,
                });
            }
            return;
        }

        prevIsActive.current = isActive;
        const liftY = -CARD_H + 10;
        let cancelled = false;

        const runAnimation = async () => {
            isAnimating.current = true;
            if (isActive) {
                isHovering.current = false;
                await controls.start({
                    x: [stackRandom.x, stackRandom.x, 0],
                    y: [stackRandom.y, -CARD_H + 30, activeY],
                    rotateZ: [stackRandom.rotateZ, stackRandom.rotateZ, 0],
                    scale: [1, 1.25, 1],
                    zIndex: [baseZIndex, ACTIVE_CARD_Z_INDEX, ACTIVE_CARD_Z_INDEX],
                    transition: {
                        duration: 0.3,
                        times: [0, 0.5, 1]
                    },
                });
                isAnimating.current = false;
                return;
            }

            await controls.start({
                x: stackRandom.x,
                y: liftY,
                rotateZ: stackRandom.rotateZ,
                scale: 1.25,
                transition: {
                    duration: 0.2,
                    ease: 'circInOut',
                },
            });

            if (cancelled) {
                isAnimating.current = false;
                return;
            }
            setCardScale(1);
            await controls.start({
                x: stackRandom.x,
                y: stackRandom.y,
                rotateZ: stackRandom.rotateZ,
                scale: 1,
                zIndex: baseZIndex,
                transition: {
                    delay: 0.1,
                    duration: 0.1,
                },
            });

            isAnimating.current = false;

            // If cursor is still over the card after deactivation, show hover state
            if (isHovering.current) {
                void controls.start({
                    y: stackRandom.y - 22,
                    rotateX: -20,
                    scale: 1.04,
                    transition: { type: 'spring', stiffness: 400, damping: 30 },
                });
            }
        };

        void runAnimation();

        return () => {
            cancelled = true;
            // Don't stop controls — let animation reach its final position naturally
        };
    }, [activeY, baseZIndex, controls, isActive, ACTIVE_CARD_Z_INDEX, stackRandom]);

    // Inactive position is relative to its regular spot in the flex stack
    // Active position needs to sit neatly over the wallet.
    // The wallet is right below the card wrapper.

    return (
        <motion.div
            onClick={!isActive ? onTabClick : undefined}
            onMouseMove={handleMouseMove}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            initial={false}
            animate={controls}
            transformTemplate={(transforms, generated) =>
                !isActive ? `perspective(600px) ${generated}` : generated
            }
            className={cn(
                "absolute flex flex-col justify-between text-white overflow-hidden rounded-2xl p-5",
                isActive ? "shadow-2xl" : "cursor-pointer hover:brightness-110"
            )}
            style={{
                width: isActive ? CARD_W_ACTIVE : CARD_W,
                height: CARD_H,
                backgroundColor: getCardColor(index),
                bottom: inactiveBottom,
                rotateX: isActive ? rotateX : 0,
                rotateY: isActive ? rotateY : 0,
                scale: cardScale,
                zIndex: isActive ? ACTIVE_CARD_Z_INDEX : baseZIndex,
                boxShadow: isActive ? '0 20px 40px -10px rgba(0,0,0,0.5)' : undefined,
                transformStyle: "preserve-3d",
            }}
        >
            {/* Dynamic Glare Overlay */}
            {isActive && (
                <motion.div 
                    className="pointer-events-none absolute inset-0 z-50 rounded-2xl mix-blend-overlay"
                    style={{ background: glareBg, opacity: glareOpacity }}
                />
            )}
            
            {/* Texture/Grain Overlay */}
            <div className="pointer-events-none absolute inset-0 mix-blend-overlay opacity-20" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")` }}></div>

            {/* Hologram / Chip & Contactless */}
            <motion.div 
                initial={{ opacity: 0 }} 
                animate={{ opacity: isActive ? 1 : 0 }} 
                className="absolute left-5 top-[56px] flex items-center gap-3 z-10 pointer-events-none"
            >
                <svg className="w-[38px] h-[28px] opacity-70" viewBox="0 0 40 28" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <rect x="0.5" y="0.5" width="39" height="27" rx="4.5" stroke="currentColor" strokeWidth="1" fill="none" />
                    <path d="M 0 9 L 14 9 M 0 19 L 14 19 M 26 9 L 40 9 M 26 19 L 40 19 M 14 0 L 14 28 M 26 0 L 26 28" stroke="currentColor" strokeWidth="0.8" opacity="0.8" />
                    <rect x="14" y="9" width="12" height="10" fill="currentColor" fillOpacity="0.15" />
                </svg>
                <Wifi className="w-5 h-5 opacity-60 rotate-90" />
            </motion.div>

            {/* Card Number from account data (no fake fallback). */}
            {normalizedLast4 && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: isActive ? 1 : 0 }}
                    className="absolute left-5 bottom-[4.5rem] font-mono text-[1.1rem] tracking-[0.15em] opacity-90 flex items-center gap-3 z-10 pointer-events-none drop-shadow-sm"
                >
                    <span className="text-[12px] pt-[2px] opacity-80">•••• •••• ••••</span>
                    <span>{normalizedLast4}</span>
                </motion.div>
            )}

            {/* Top row: name + actions, visible fully when active or partially when inactive */}
            <div className="flex items-start justify-between relative z-20">
                <h3 className={cn("font-bold leading-tight", isActive ? "text-lg drop-shadow-sm" : "text-sm mt-[-4px]")}>
                    {account.name}
                    {!isActive && normalizedLast4 && (
                        <span className="ml-1.5 font-normal opacity-80">{normalizedLast4}</span>
                    )}
                </h3>
                
                <div
                    className={cn(
                        "flex items-center gap-0.5 transition-opacity duration-300",
                        isActive ? "opacity-100" : "opacity-0 pointer-events-none"
                    )}
                >
                    <DeleteConfirm
                        title="Delete this account?"
                        description={`This will permanently delete "${account.name}". This action cannot be undone.`}
                        onConfirm={() => {
                            onDeleteAccount(account.id);
                            onClose();
                        }}
                        trigger={
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-white/80 hover:text-white hover:bg-white/20">
                                <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                        }
                    />
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                            e.stopPropagation();
                            onSelectAccount(account);
                        }}
                        className="h-7 w-7 text-white/80 hover:text-white hover:bg-white/20"
                    >
                        <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <AddCurrencyBalanceSheet
                        accountId={account.id}
                        accountName={account.name}
                        trigger={
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-white/80 hover:text-white hover:bg-white/20">
                                <Plus className="h-3.5 w-3.5" />
                            </Button>
                        }
                    />
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                            e.stopPropagation();
                            onClose();
                        }}
                        className="h-7 w-7 text-white/80 hover:text-white hover:bg-white/20 ml-1"
                    >
                        <X className="h-3.5 w-3.5" />
                    </Button>
                </div>
            </div>

            {/* Currency balances - fade out when inactive so they don't peek out weirdly */}
            <div
                className={cn(
                    "flex flex-col gap-0.5 mt-auto transition-opacity duration-300 relative z-20",
                    isActive ? "opacity-100" : "opacity-0 pointer-events-none"
                )}
            >
                {account.currencyBalances.map((cb) => (
                    <TransferSheet
                        key={cb.id}
                        preselectedSenderId={cb.id}
                        trigger={
                            <button
                                onClick={(e) => e.stopPropagation()}
                                className="text-left text-[15px] font-bold text-white/95 hover:text-white transition-colors cursor-pointer drop-shadow-sm flex items-center justify-between"
                            >
                                <span>{cb.currencyCode}</span>
                                <span>{Number(cb.balance).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</span>
                            </button>
                        }
                    />
                ))}
            </div>
        </motion.div>
    );
}

function WalletBank({
    bank,
    activeCardId,
    onActiveCardChange,
    onDeleteBank,
    onDeleteAccount,
    onSelectAccount,
}: {
    bank: Bank & { visibleAccounts: Account[] };
    activeCardId: string | null;
    onActiveCardChange: (accountId: string | null) => void;
    onDeleteBank: () => void;
    onDeleteAccount: (id: string) => void;
    onSelectAccount: (account: Account) => void;
}) {
    const isActiveWallet = bank.visibleAccounts.some((account) => account.id === activeCardId);

    const handleCardTabClick = (accountId: string) => {
        onActiveCardChange(activeCardId === accountId ? null : accountId);
    };

    const CARD_W = 328;
    const CARD_H = 180;
    const TAB_H = 164;
    const TAB_TRANSFORM_Y = 34;

    return (
        <div
            className="relative flex flex-col items-center w-full max-w-[368px] mx-auto"
            style={{ zIndex: isActiveWallet ? 1 : 0 }}
        >
            {/* Wallet wrapper — card overlays on top */}
            <div className="relative w-[328px] mt-[30px]">
                {/* Wallet Back Panel */}
                <div 
                    className="absolute inset-x-0 bottom-0 rounded-b-2xl rounded-t-3xl border border-white/60 dark:border-white/10 overflow-hidden transition-all duration-300 pointer-events-none bg-cover bg-center brightness-110 dark:brightness-75 drop-shadow-[0_0_15px_rgba(0,0,0,0.5)]"
                    style={{
                        zIndex: -1,
                        top: bank.visibleAccounts.length > 0 ? -12 : 20,
                        backgroundImage: `url(${Leather})`,
                        boxShadow: 'inset 0 4px 6px rgba(255,255,255,0.4), inset 0 -30px 40px rgba(0,0,0,0.6), 0 -4px 15px rgba(0,0,0,0.2)',
                    }}
                >
                    <div className="absolute inset-x-0 bottom-0 h-full bg-gradient-to-t from-black/20 via-black/5 to-transparent dark:from-black/80 dark:via-black/30 dark:to-black/10 pointer-events-none mix-blend-overlay"></div>
                    <div className="absolute inset-x-0 bottom-0 h-full bg-gradient-to-t from-black/10 via-black/0 to-transparent dark:from-black/60 dark:via-black/10 dark:to-transparent pointer-events-none"></div>
                </div>

                {/* Card tabs peeking out from top of wallet */}
                {bank.visibleAccounts.length > 0 && (
                    <div
                        className="relative ml-2 mr-2 flex flex-col items-center"
                        style={{
                            height: `${TAB_H + (bank.visibleAccounts.length - 1) * TAB_TRANSFORM_Y}px`,
                            marginBottom: `-${TAB_H - TAB_TRANSFORM_Y}px`,
                        }}
                    >
                        {bank.visibleAccounts.map((account, index) => (
                            <AccountCard
                                key={account.id}
                                account={account}
                                index={index}
                                totalCards={bank.visibleAccounts.length}
                                isActive={account.id === activeCardId}
                                onTabClick={() => handleCardTabClick(account.id)}
                                onClose={() => onActiveCardChange(null)}
                                onDeleteAccount={onDeleteAccount}
                                onSelectAccount={onSelectAccount}
                            />
                        ))}
                    </div>
                )}

                {/* Wallet body — fixed height so content can pin to bottom */}
                <div
                    className="flex flex-col relative z-20 group drop-shadow-2xl"
                    style={{ 
                        width: CARD_W, 
                        height: CARD_H,
                        minHeight: CARD_H,
                        marginTop: '-16px',
                        filter: 'drop-shadow(0 -4px 12px rgba(0,0,0,0.15)) drop-shadow(0 12px 24px rgba(0,0,0,0.2))'
                    }}
                >
                    {/* Physical Pocket Shape Background */}
                    <div 
                        className="absolute inset-0 rounded-b-2xl overflow-hidden bg-cover bg-center dark:brightness-75"
                        style={{
                            clipPath: `path("M0,16 C0,7 7,0 16,0 L120,0 C128,0 133,4 137,10 C143,22 150,28 164,28 C178,28 185,22 191,10 C195,4 200,0 208,0 L312,0 C321,0 328,7 328,16 L328,1000 L0,1000 Z")`,
                            backgroundImage: `url(${Leather})`,
                            boxShadow: 'inset 0 2px 5px rgba(255,255,255,0.4), inset 0px -2px 10px rgba(0,0,0,0.1)',
                        }}
                    >
                        {/* Leather Texture overlay darkening */}
                        <div className="absolute inset-0 bg-black/0 dark:bg-black/40 pointer-events-none mix-blend-multiply"></div>
                        
                        {/* Inner Gradient Gloss */}
                        <div className="absolute inset-0 pointer-events-none opacity-[0.55] dark:opacity-20 bg-[radial-gradient(ellipse_at_top_center,rgba(255,255,255,0.97)_0%,transparent_70%)] mix-blend-overlay"></div>
                    </div>

                    {/* Top edge lip rendering for stroke & stitches */}
                    <svg className="absolute top-0 left-0 pointer-events-none z-10" width="328" height="40" viewBox="0 0 328 40">
                        {/* Outer Highlight line */}
                        <path d="M1,16 C1,7.5 7.5,1 16,1 L120,1 C128,1 133,5 137,11 C143,23 150,29 164,29 C178,29 185,23 191,11 C195,5 200,1 208,1 L312,1 C320.5,1 327,7.5 327,16" 
                            fill="none" stroke="currentColor" className="text-white dark:text-white/20" strokeWidth="2" strokeOpacity="0.8" />
                        {/* Outer Shadow line */}
                        <path d="M0,16 C0,7 7,0 16,0 L120,0 C128,0 133,4 137,10 C143,22 150,28 164,28 C178,28 185,22 191,10 C195,4 200,0 208,0 L312,0 C321,0 328,7 328,16" 
                            fill="none" stroke="#000000" strokeWidth="1" strokeOpacity="0.25" />
                        {/* Stitching effect top */}
                        <path d="M6,16 C6,10 10,6 16,6 L118,6 C125,6 130,9 133,15 C139,27 148,33 164,33 C180,33 189,27 195,15 C198,9 203,6 210,6 L312,6 C318,6 322,10 322,16" 
                            fill="none" stroke="currentColor" className="text-[#99948D] dark:text-[#5A5854]" strokeWidth="1.5" strokeDasharray="4 3" opacity="0.8"/>
                    </svg>

                    {/* Left/Right/Bottom Stitches */}
                    <div className="absolute left-[5px] top-[16px] bottom-[5px] w-px border-l-[1.5px] border-dashed border-[#99948D]/80 dark:border-[#5A5854]/80 z-10 pointer-events-none rounded-bl-xl"></div>
                    <div className="absolute right-[5px] top-[16px] bottom-[5px] w-px border-r-[1.5px] border-dashed border-[#99948D]/80 dark:border-[#5A5854]/80 z-10 pointer-events-none rounded-br-xl"></div>
                    <div className="absolute left-[5px] right-[5px] bottom-[5px] h-px border-b-[1.5px] border-dashed border-[#99948D]/80 dark:border-[#5A5854]/80 z-10 pointer-events-none rounded-b-xl"></div>

                    {/* Wallet Content */}
                    <div className="relative z-20 flex flex-col h-full min-h-0 p-5 pt-8">
                        {/* Bank actions */}
                        <div className="flex items-center justify-end gap-0.5 mb-2 mt-[-10px] mr-[-5px] shrink-0">
                            <DeleteConfirm
                                title="Delete this institution?"
                                description={`This will permanently delete "${bank.name}" and all its ${bank.accounts.length} accounts. This action cannot be undone.`}
                                onConfirm={onDeleteBank}
                                trigger={
                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-black/50 dark:text-white/40 hover:text-red-600 dark:hover:text-red-400 hover:bg-black/5 dark:hover:bg-white/5">
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                }
                            />
                            <SettingsBankSheet
                                bank={bank}
                                trigger={
                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-black/50 dark:text-white/40 hover:text-black/80 dark:hover:text-white/80 hover:bg-black/5 dark:hover:bg-white/5">
                                        <Pencil className="h-4 w-4" />
                                    </Button>
                                }
                            />
                            <AddAccountSheet bankId={bank.id} bankName={bank.name}
                                trigger={
                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-black/50 dark:text-white/40 hover:text-black/80 dark:hover:text-white/80 hover:bg-black/5 dark:hover:bg-white/5">
                                        <Plus className="h-4 w-4" />
                                    </Button>
                                }
                            />
                        </div>

                        {/* Spacer: pushes bank name & balances to bottom */}
                        <div className="flex-1 min-h-0" />

                        {/* Bank name & aggregated balances at bottom */}
                        <div className="flex items-end justify-between shrink-0 pb-0.5">
                            <div className="relative leading-tight">
                                {/* Top layer */}
                                <h3
                                    className="font-bold text-lg leading-tight"
                                    style={{
                                        color: "#E5B78F",
                                        textShadow: `
                                        0 -1px 0 #F2D1AE,
                                        0 1px 0 #8A4C2C,
                                        0 2px 0 #5E2F1B,
                                        0 3px 4px rgba(0,0,0,0.35)
                                        `
                                    }}
                                    >
                                    {bank.name}
                                </h3>
                            </div>
                            <div className="text-right">
                                {aggregateBalances(bank.visibleAccounts).map(({ code, total }) => (
                                    <p key={code} 
                                    className="text-base font-bold" 
                                    style={{ 
                                        color: '#E5B78F',
                                        textShadow: `
                                        0 -1px 0 #F2D1AE,
                                        0 1px 0 #8A4C2C,
                                        0 2px 0 #5E2F1B,
                                        0 3px 4px rgba(0,0,0,0.35)
                                        `
                                    }}
                                    >
                                        {Number(total).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}{code}
                                    </p>
                                ))}
                            </div>
                        </div>

                        {bank.visibleAccounts.length === 0 && (
                            <p className="text-sm text-white/60 font-medium text-center mt-6">
                                No accounts yet. Add one to get started.
                            </p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

function aggregateBalances(accounts: Account[]) {
    const map = new Map<string, number>();
    for (const acc of accounts) {
        for (const cb of acc.currencyBalances) {
            map.set(cb.currencyCode, (map.get(cb.currencyCode) ?? 0) + Number(cb.balance));
        }
    }
    return Array.from(map.entries()).map(([code, total]) => ({ code, total }));
}

export function AccountsPage() {
    const { data: banks, isLoading } = trpc.bank.getHierarchy.useQuery(undefined, {
        staleTime: 1000 * 60,
    }) as { data: Bank[] | undefined; isLoading: boolean };

    useEffect(() => {
        if (banks) {
            const totalAccounts = banks.reduce((acc, bank) => acc + bank.accounts.length, 0);
            posthog.setPersonProperties({
                bank_count: banks.length,
                account_count: totalAccounts,
            });
            posthog.capture('accounts_viewed', {
                bank_count: banks.length,
                account_count: totalAccounts,
            });
        }
    }, [banks]);

    const banksWithAccounts = useMemo(() => {
        if (!banks) return [];
        return banks.map((bank) => ({
            ...bank,
            visibleAccounts: bank.accounts,
        }));
    }, [banks]);

    const utils = trpc.useUtils();
    const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
    const [activeCardId, setActiveCardId] = useState<string | null>(null);

    const deleteBank = trpc.bank.delete.useMutation({
        onSuccess: () => {
            utils.bank.getHierarchy.invalidate();
            toast.success('Bank deleted');
        },
        onError: () => toast.error('Failed to delete bank'),
    });

    const deleteAccount = trpc.account.delete.useMutation({
        onSuccess: () => {
            utils.bank.getHierarchy.invalidate();
            toast.success('Account deleted');
        },
        onError: () => toast.error('Failed to delete account'),
    });

    if (isLoading) {
        return (
            <div className="space-y-6">
                <PageHeader title="Accounts" subtitle="Manage your finances" variant="one">
                    {null}
                </PageHeader>
                <div className="grid gap-6">
                    <Skeleton className="h-40 w-full" />
                    <Skeleton className="h-40 w-full" />
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <PageHeader
                title="Accounts"
                subtitle="Manage your banks and asset accounts"
                variant="two-with-text"
            >
                <TransferSheet
                    trigger={
                        <Button variant="secondary" className="gap-2 flex-1 sm:flex-none">
                            <CircleDollarSign className="h-4 w-4" />
                            Transfer
                        </Button>
                    }
                />
                <AddBankSheet />
            </PageHeader>

            <AccountActionSheet
                account={selectedAccount}
                open={!!selectedAccount}
                onOpenChange={(open) => !open && setSelectedAccount(null)}
            />

            {(!banks || banks.length === 0) ? (
                <div className="text-center py-12 border rounded-lg bg-muted/20">
                    <p className="text-muted-foreground mb-4">No institutions added yet.</p>
                    <p>Add a bank or brokerage (like Freedom, Interactive Brokers) to get started!</p>
                </div>
            ) : (
                <div className="columns-1 md:columns-2 md:gap-12">
                    {banksWithAccounts.map((bank) => (
                        <div key={bank.id} className="mb-8 break-inside-avoid md:mb-12">
                            <WalletBank
                                bank={bank}
                                onDeleteBank={() => deleteBank.mutate({ id: bank.id })}
                                activeCardId={activeCardId}
                                onActiveCardChange={setActiveCardId}
                                onDeleteAccount={(id) => {
                                    if (activeCardId === id) {
                                        setActiveCardId(null);
                                    }
                                    deleteAccount.mutate({ id });
                                }}
                                onSelectAccount={setSelectedAccount}
                            />
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
