
import { useMemo, useState, useEffect, useRef } from 'react';
import posthog from 'posthog-js';
import { motion, useAnimation } from 'framer-motion';
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
import { Trash2, Pencil, Plus, CircleDollarSign, X } from 'lucide-react';
import { toast } from 'sonner';
import { SettingsBankSheet } from '@/components/SettingsBankSheet';
import { cn } from '@/lib/utils';

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
    const CARD_W = 328;
    const CARD_W_ACTIVE = 312;
    const CARD_H = 180;
    const TAB_TRANSFORM_Y = 38;

    const baseZIndex = totalCards - index;
    const inactiveBottom = index * TAB_TRANSFORM_Y;
    const activeY = (totalCards - 1) * TAB_TRANSFORM_Y - inactiveBottom + 20;

    const controls = useAnimation();
    const isInitialMount = useRef(true);

    useEffect(() => {
        if (isInitialMount.current) {
            isInitialMount.current = false;
            // set initial state without animation
            controls.set({
                y: isActive ? activeY : 0,
                scale: isActive ? 1 : 1,
                zIndex: isActive ? 100 : baseZIndex,
            });
            return;
        }

        if (isActive) {
            controls.start({
                y: [0, -CARD_H - 10, activeY],
                scale: [1, 1.05, 1],
                zIndex: [100, 100, 100],
            });
        } else {
            controls.start({
                y: [activeY, -CARD_H - 10, 0],
                scale: [1, 1.05, 1],
                zIndex: [100, 100, baseZIndex],
            });
        }
    }, [isActive, activeY, baseZIndex, controls]);

    // Inactive position is relative to its regular spot in the flex stack
    // Active position needs to sit neatly over the wallet.
    // The wallet is right below the card wrapper.

    return (
        <motion.div
            onClick={!isActive ? onTabClick : undefined}
            animate={controls}
            transition={{
                duration: 0.6,
                times: [0, 0.5, 1],
                ease: "easeInOut",
                zIndex: { duration: 0.01 },
            }}
            className={cn(
                "absolute flex flex-col justify-between text-white overflow-hidden rounded-2xl p-5",
                isActive ? "shadow-2xl" : "cursor-pointer transition-all hover:brightness-110 hover:translate-y-[-8px] hover:[transform:perspective(600px)_rotateX(-20deg)_translateY(-8px)]"
            )}
            style={{
                width: CARD_W_ACTIVE,
                height: CARD_H,
                backgroundColor: getCardColor(index),
                bottom: inactiveBottom,
                zIndex: baseZIndex, // fallback
                boxShadow: isActive ? '0 20px 40px -8px rgba(0,0,0,0.35)' : undefined,
            }}
        >
            {/* Top row: name + actions, visible fully when active or partially when inactive */}
            <div className="flex items-start justify-between relative z-10">
                <h3 className={cn("font-bold leading-tight", isActive ? "text-lg" : "text-sm mt-[-4px]")}>
                    {account.name}
                    {account.last4Digits && (
                        <span className="ml-1.5 font-normal opacity-80">{account.last4Digits}</span>
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
                    "flex flex-col gap-0.5 mt-auto transition-opacity duration-300",
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
                                className="text-left text-sm font-medium text-white/90 hover:text-white transition-colors cursor-pointer"
                            >
                                {cb.currencyCode} {Number(cb.balance).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
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
    onDeleteBank,
    onDeleteAccount,
    onSelectAccount,
}: {
    bank: Bank & { visibleAccounts: Account[] };
    onDeleteBank: () => void;
    onDeleteAccount: (id: string) => void;
    onSelectAccount: (account: Account) => void;
}) {
    const [activeCardId, setActiveCardId] = useState<string | null>(null);

    const handleCardTabClick = (accountId: string) => {
        setActiveCardId((prev) => (prev === accountId ? null : accountId));
    };

    const CARD_W = 328;
    const CARD_H = 180;
    const TAB_H = 164;
    const TAB_TRANSFORM_Y = 34;

    return (
        <div className="flex flex-col items-center w-full max-w-[368px] mx-auto">
            {/* Wallet wrapper — card overlays on top */}
            <div className="relative w-[328px]">
                {/* Card tabs peeking out from top of wallet */}
                {bank.visibleAccounts.length > 0 && (
                    <div
                        className="relative ml-2 mr-2"
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
                                onClose={() => setActiveCardId(null)}
                                onDeleteAccount={onDeleteAccount}
                                onSelectAccount={onSelectAccount}
                            />
                        ))}
                    </div>
                )}

                {/* Wallet body */}
                <div
                    className="flex flex-col relative rounded-2xl bg-muted border border-border shadow-lg p-5 pt-4"
                    style={{ width: CARD_W, minHeight: CARD_H, zIndex: 20 }}
                >
                    {/* Bank actions */}
                    <div className="flex items-center justify-end gap-0.5 mb-2">
                        <DeleteConfirm
                            title="Delete this institution?"
                            description={`This will permanently delete "${bank.name}" and all its ${bank.accounts.length} accounts. This action cannot be undone.`}
                            onConfirm={onDeleteBank}
                            trigger={
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-red-500">
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            }
                        />
                        <SettingsBankSheet
                            bank={bank}
                            trigger={
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary">
                                    <Pencil className="h-4 w-4" />
                                </Button>
                            }
                        />
                        <AddAccountSheet bankId={bank.id} bankName={bank.name}
                            trigger={
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary">
                                    <Plus className="h-4 w-4" />
                                </Button>
                            }
                        />
                    </div>

                    {/* Bank name & aggregated balances in a horizontal stack */}
                    <div className="flex items-end justify-between mt-auto z-10 relative">
                        <h3 className="font-bold text-lg text-foreground leading-tight">{bank.name}</h3>
                        <div className="text-right">
                            {aggregateBalances(bank.visibleAccounts).map(({ code, total }) => (
                                <p key={code} className="text-base font-bold text-foreground">
                                    {Number(total).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}{code}
                                </p>
                            ))}
                        </div>
                    </div>

                    {bank.visibleAccounts.length === 0 && (
                        <p className="text-sm text-muted-foreground text-center mt-4">
                            No accounts yet. Add one to get started.
                        </p>
                    )}
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
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12">
                    {banksWithAccounts.map((bank) => (
                        <WalletBank
                            key={bank.id}
                            bank={bank}
                            onDeleteBank={() => deleteBank.mutate({ id: bank.id })}
                            onDeleteAccount={(id) => deleteAccount.mutate({ id })}
                            onSelectAccount={setSelectedAccount}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}