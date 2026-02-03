
import { useMemo, useState, useEffect } from 'react';
import posthog from 'posthog-js';
import { DeleteConfirm } from '@/components/DeleteConfirm';
import { AddBankSheet } from '@/components/AddBankSheet';
import { AddAccountSheet } from '@/components/AddAccountSheet';
import { AddCurrencyBalanceSheet } from '@/components/AddCurrencyBalanceSheet';
import { AccountActionSheet } from '@/components/AccountActionSheet';
import { TransferSheet } from '@/components/TransferSheet';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { trpc } from '@/lib/trpc';
import { Skeleton } from '@/components/ui/skeleton';
import { Trash2, Pencil, History, CircleDollarSign } from 'lucide-react';
import { toast } from 'sonner';
import { SettingsBankSheet } from '@/components/SettingsBankSheet';
import { IconDisplay } from '@/components/IconDisplay';

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
    currencyBalances: CurrencyBalance[];
}

interface Bank {
    id: string;
    name: string;
    icon?: string | null;
    color?: string | null;
    accounts: Account[];
}

export function AccountsPage() {
    // Fetch hierarchy
    const { data: banks, isLoading } = trpc.bank.getHierarchy.useQuery(undefined, {
        staleTime: 1000 * 60,
    }) as { data: Bank[] | undefined, isLoading: boolean };

    useEffect(() => {
        if (banks) {
            const totalAccounts = banks.reduce((acc, bank) => acc + bank.accounts.length, 0);
            posthog.setPersonProperties({ 
                bank_count: banks.length,
                account_count: totalAccounts 
            });
            posthog.capture('accounts_viewed', { 
                bank_count: banks.length,
                account_count: totalAccounts 
            });
        }
    }, [banks]);

    // Show all banks with all accounts
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
        onError: () => toast.error('Failed to delete bank')
    });

    const deleteAccount = trpc.account.delete.useMutation({
        onSuccess: () => {
            utils.bank.getHierarchy.invalidate();
            toast.success('Account deleted');
        },
        onError: () => toast.error('Failed to delete account')
    });

    if (isLoading) {
        return (
            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold">Accounts</h1>
                        <p className="text-muted-foreground">Manage your finances</p>
                    </div>
                </div>
                <div className="grid gap-6">
                    <Skeleton className="h-40 w-full" />
                    <Skeleton className="h-40 w-full" />
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-8">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold">Accounts</h1>
                    <p className="text-muted-foreground">Manage your banks and asset accounts</p>
                </div>
                <div className="flex gap-2">
                    <TransferSheet trigger={
                        <Button variant="secondary" className="gap-2">
                            <CircleDollarSign className="h-4 w-4" />
                            Transfer
                        </Button>
                    } />
                    <AddBankSheet />
                </div>
            </div>

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
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-8">
                    {banksWithAccounts.map((bank) => (
                        <Card key={bank.id} className="overflow-hidden border-2">
                            <div
                                className="h-2 w-full"
                                style={{ backgroundColor: bank.color || '#000000' }}
                            />
                            <CardHeader className="flex flex-row items-center justify-between bg-muted/30 pb-3 md:pb-4">
                                <div className="flex items-center gap-2 md:gap-3">
                                    <div className="flex h-8 w-8 md:h-10 md:w-10 items-center justify-center rounded-lg bg-white shadow-sm text-lg md:text-xl border">
                                        <IconDisplay icon={bank.icon} fallback="🏦" className="h-4 w-4 md:h-6 md:w-6 text-black" />
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <CardTitle className="text-lg md:text-xl">{bank.name}</CardTitle>
                                        <SettingsBankSheet
                                            bank={bank}
                                            trigger={
                                                <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-primary">
                                                    <Pencil className="h-3 w-3" />
                                                </Button>
                                            }
                                        />
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <AddAccountSheet bankId={bank.id} bankName={bank.name} />
                                    <DeleteConfirm
                                        title="Delete this institution?"
                                        description={`This will permanently delete "${bank.name}" and all its ${bank.accounts.length} accounts. This action cannot be undone.`}
                                        onConfirm={() => deleteBank.mutate({ id: bank.id })}
                                        trigger={
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="text-muted-foreground hover:text-red-500"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        }
                                    />
                                </div>
                            </CardHeader>
                            <CardContent className="p-0">
                                {bank.visibleAccounts.length === 0 ? (
                                    <div className="p-8 text-center text-muted-foreground text-sm">
                                        No accounts yet. Add one to get started.
                                    </div>
                                ) : (
                                    <div className="divide-y">
                                        {bank.visibleAccounts.map((account) => (
                                            <div key={account.id} className="flex items-start justify-between p-3 md:p-4 hover:bg-muted/10 transition-colors group">
                                                <div className="flex gap-3 md:gap-4">
                                                    <div className="flex h-8 w-8 md:h-10 md:w-10 items-center justify-center rounded-full bg-muted text-base md:text-lg">
                                                        <IconDisplay icon={account.icon} fallback="💳" className="h-4 w-4 md:h-5 md:w-5" />
                                                    </div>
                                                    <div>
                                                        <h4 className="font-semibold text-sm md:text-base">{account.name}</h4>
                                                        <p className="text-xs text-muted-foreground capitalize mb-2">{account.type}</p>

                                                        <div className="flex flex-wrap gap-2">
                                                            {account.currencyBalances.map((cb) => (
                                                                <TransferSheet
                                                                    key={cb.id}
                                                                    preselectedSenderId={cb.id}
                                                                    trigger={
                                                                        <button
                                                                            className="inline-flex items-center px-2 py-1 rounded bg-secondary text-xs font-mono hover:bg-secondary/80 transition-colors cursor-pointer border border-transparent hover:border-primary/20"
                                                                            title="Click to transfer"
                                                                        >
                                                                            <span className="font-bold mr-1">{cb.currencyCode}</span>
                                                                            {Number(cb.balance).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                                                                        </button>
                                                                    }
                                                                />
                                                            ))}
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        onClick={() => setSelectedAccount(account)}
                                                        title="History & Actions"
                                                        className="h-8 w-8 text-muted-foreground hover:text-primary"
                                                    >
                                                        <History className="h-4 w-4" />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        onClick={() => setSelectedAccount(account)}
                                                        title="Edit Account"
                                                        className="h-8 w-8 text-muted-foreground hover:text-primary"
                                                    >
                                                        <Pencil className="h-4 w-4" />
                                                    </Button>
                                                    <AddCurrencyBalanceSheet accountId={account.id} accountName={account.name} />
                                                    <DeleteConfirm
                                                        title="Delete this account?"
                                                        description={`This will permanently delete "${account.name}". This action cannot be undone.`}
                                                        onConfirm={() => deleteAccount.mutate({ id: account.id })}
                                                        trigger={
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                className="h-8 w-8 text-muted-foreground hover:text-red-500"
                                                            >
                                                                <Trash2 className="h-3 w-3" />
                                                            </Button>
                                                        }
                                                    />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
}