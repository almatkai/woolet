
import { useMemo, useState, useEffect } from 'react';
import posthog from 'posthog-js';
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
import { TiltCard } from '@/components/ui/cursor-wander-card';
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
    const activeAccount = bank.visibleAccounts.find((a) => a.id === activeCardId) ?? null;

    const handleCardTabClick = (accountId: string) => {
        setActiveCardId((prev) => (prev === accountId ? null : accountId));
    };

    const CARD_W = 328;
    const CARD_H = 180;
    const TAB_H = 110;
    const TAB_OVERLAP = 112;
    const TAB_STACK_OFFSET = 18;
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
                        {bank.visibleAccounts.map((account, index) => {
                            const N = bank.visibleAccounts.length;
                            const isActive = account.id === activeCardId;
                            return (
                                <button
                                    key={account.id}
                                    onClick={() => handleCardTabClick(account.id)}
                                    className={cn(
                                        "absolute flex w-full text-left rounded-t-xl px-4 py-1 text-sm font-medium text-white transition-all cursor-pointer",
                                        isActive ? "opacity-40" : "hover:brightness-110 hover:translate-y-[-8px] hover:[transform:perspective(600px)_rotateX(-20deg)_translateY(-8px)]",
                                    )}
                                    style={{
                                        backgroundColor: getCardColor(index),
                                        zIndex: N - index,
                                        bottom: `${index * TAB_TRANSFORM_Y}px`,
                                        minHeight: `${TAB_H}px`,
                                    }}
                                >
                                    {account.name}
                                    {account.last4Digits && (
                                        <span className="ml-1.5 opacity-80">{account.last4Digits}</span>
                                    )}
                                </button>
                            );
                        })}
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
                    <div className="flex items-end justify-between mt-auto">
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

                {/* Pulled-out card — overlays on top of wallet */}
                {activeAccount && (
                    <div
                        className="absolute left-0 right-0 flex justify-center"
                        style={{ bottom: 0, zIndex: 20 }}
                    >
                        <TiltCard maxTilt={10} className="drop-shadow-2xl">
                            <div
                                className="rounded-2xl p-5 flex flex-col justify-between text-white relative overflow-hidden"
                                style={{
                                    width: CARD_W,
                                    height: CARD_H,
                                    backgroundColor: getCardColor(bank.visibleAccounts.indexOf(activeAccount)),
                                    boxShadow: '0 20px 40px -8px rgba(0,0,0,0.35)',
                                }}
                            >
                                {/* Top row: name + actions */}
                                <div className="flex items-start justify-between">
                                    <h3 className="font-bold text-lg leading-tight">
                                        {activeAccount.name}
                                        {activeAccount.last4Digits && (
                                            <span className="ml-1.5 font-normal opacity-80">{activeAccount.last4Digits}</span>
                                        )}
                                    </h3>
                                    <div className="flex items-center gap-0.5">
                                        <DeleteConfirm
                                            title="Delete this account?"
                                            description={`This will permanently delete "${activeAccount.name}". This action cannot be undone.`}
                                            onConfirm={() => {
                                                onDeleteAccount(activeAccount.id);
                                                setActiveCardId(null);
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
                                            onClick={() => onSelectAccount(activeAccount)}
                                            className="h-7 w-7 text-white/80 hover:text-white hover:bg-white/20"
                                        >
                                            <Pencil className="h-3.5 w-3.5" />
                                        </Button>
                                        <AddCurrencyBalanceSheet accountId={activeAccount.id} accountName={activeAccount.name}
                                            trigger={
                                                <Button variant="ghost" size="icon" className="h-7 w-7 text-white/80 hover:text-white hover:bg-white/20">
                                                    <Plus className="h-3.5 w-3.5" />
                                                </Button>
                                            }
                                        />
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => setActiveCardId(null)}
                                            className="h-7 w-7 text-white/80 hover:text-white hover:bg-white/20 ml-1"
                                        >
                                            <X className="h-3.5 w-3.5" />
                                        </Button>
                                    </div>
                                </div>

                                {/* Currency balances */}
                                <div className="flex flex-col gap-0.5">
                                    {activeAccount.currencyBalances.map((cb) => (
                                        <TransferSheet
                                            key={cb.id}
                                            preselectedSenderId={cb.id}
                                            trigger={
                                                <button className="text-left text-sm font-medium text-white/90 hover:text-white transition-colors cursor-pointer">
                                                    {cb.currencyCode} {Number(cb.balance).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                                                </button>
                                            }
                                        />
                                    ))}
                                </div>
                            </div>
                        </TiltCard>
                    </div>
                )}
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