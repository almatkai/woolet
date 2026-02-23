import { useState, useMemo } from 'react';
import { Building2, Landmark, ChevronRight, Banknote, TrendingUp, DollarSign, RefreshCw } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
    SheetFooter,
    SheetClose,
} from '@/components/ui/sheet';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { CurrencyDisplay } from '@/components/CurrencyDisplay';
import { IconDisplay } from '@/components/IconDisplay';

interface CurrencyBalance {
    id: string;
    currencyCode: string;
    balance: string | number;
}

interface InvestmentAccount {
    id: string;
    name: string;
    icon?: string | null;
    type: string;
    last4Digits?: string | null;
    currencyBalances: CurrencyBalance[];
}

interface BankWithInvestments {
    id: string;
    name: string;
    icon?: string | null;
    color?: string | null;
    accounts: InvestmentAccount[];
    stockValue: number;
    cashValue: number;
}

interface InvestmentCashBalance {
    id: string;
    currency: string;
    availableBalance: string;
    settledBalance: string;
}

export function SeeInvestingAccountsSheet({ trigger }: { trigger?: React.ReactNode } = {}) {
    const [open, setOpen] = useState(false);
    const [showUSD, setShowUSD] = useState(true);

    // Get user's default currency
    const { data: userSettings } = trpc.settings.getUserSettings.useQuery();
    const baseCurrency = userSettings?.defaultCurrency || 'USD';

    // Fetch banks hierarchy
    const { data: banks, isLoading: isBanksLoading } = trpc.bank.getHierarchy.useQuery(undefined, {
        staleTime: 1000 * 60,
        enabled: open,
    });

    // Fetch investment cash balances
    const { data: cashBalances, isLoading: isCashLoading } = trpc.investing.getInvestmentCashBalance.useQuery(undefined, {
        staleTime: 1000 * 60,
        enabled: open,
    });

    // Fetch portfolio summary for stock values
    const { data: portfolioSummary, isLoading: isPortfolioLoading } = trpc.investing.getPortfolioSummary.useQuery(undefined, {
        staleTime: 1000 * 60,
        enabled: open,
    });

    // Extract investment accounts from banks
    const investmentAccountsByBank = useMemo((): BankWithInvestments[] => {
        if (!banks) return [];

        return banks
            .map((bank: any) => ({
                ...bank,
                accounts: bank.accounts.filter((account: any) => account.type === 'investment'),
            }))
            .filter((bank: any) => bank.accounts.length > 0);
    }, [banks]);

    // Calculate totals per account
    const accountsWithTotals = useMemo(() => {
        const stockValue = portfolioSummary?.stockValue || 0;
        const totalAccounts = investmentAccountsByBank.length;

        // Distribute stock value evenly across accounts for display
        // In a real system, you'd track which stocks are in which account
        const stockValuePerAccount = totalAccounts > 0 ? stockValue / totalAccounts : 0;

        return investmentAccountsByBank.map((bank) => {
            const cashValue = bank.accounts.reduce((sum, account) => {
                return sum + account.currencyBalances.reduce((s, b) => s + Number(b.balance), 0);
            }, 0);

            return {
                ...bank,
                stockValue: stockValuePerAccount,
                cashValue,
            };
        });
    }, [investmentAccountsByBank, portfolioSummary]);

    // Calculate cash totals from investment accounts' currency balances
    const cashTotals = useMemo(() => {
        const totals: Record<string, number> = {};
        let totalCashValue = 0;

        // Sum cash from investment accounts' currency balances
        investmentAccountsByBank.forEach((bank) => {
            bank.accounts.forEach((account) => {
                account.currencyBalances.forEach((balance) => {
                    const amount = Number(balance.balance);
                    const currency = balance.currencyCode;
                    totals[currency] = (totals[currency] || 0) + amount;
                    totalCashValue += amount;
                });
            });
        });

        // Also add investment cash balances (separate tracking)
        if (cashBalances) {
            cashBalances.forEach((cb: InvestmentCashBalance) => {
                const amount = Number(cb.availableBalance);
                totals[cb.currency] = (totals[cb.currency] || 0) + amount;
                totalCashValue += amount;
            });
        }

        return { totals, totalCashValue };
    }, [investmentAccountsByBank, cashBalances]);

    const totalCashValue = cashTotals.totalCashValue;
    const totalStockValue = portfolioSummary?.stockValue || 0;
    const totalLiquidity = totalCashValue + totalStockValue;

    const isLoading = isBanksLoading || isCashLoading || isPortfolioLoading;

    return (
        <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
                {trigger ?? (
                    <Button variant="outline" size="sm" className="gap-2 flex-1 sm:flex-none">
                        <Building2 className="h-4 w-4" />
                        Accounts
                    </Button>
                )}
            </SheetTrigger>
            <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
                <SheetHeader>
                    <SheetTitle className="flex items-center gap-2">
                        <Landmark className="h-5 w-5" />
                        Investment Accounts
                    </SheetTitle>
                    <SheetDescription>
                        View all your investment accounts and total liquidity
                    </SheetDescription>
                </SheetHeader>

                <div className="space-y-6 pt-6">
                    {/* Currency Toggle */}
                    <Card className="bg-muted/50">
                        <CardContent className="p-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <div className="text-xs text-muted-foreground">Display Currency</div>
                                    <div className="text-lg font-semibold">
                                        {showUSD ? 'USD ($)' : `${baseCurrency}`}
                                    </div>
                                </div>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setShowUSD(!showUSD)}
                                    className="gap-2"
                                >
                                    <RefreshCw className="h-4 w-4" />
                                    {showUSD ? `Show ${baseCurrency}` : 'Show USD'}
                                </Button>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Total Liquidity Summary */}
                    <Card className="border-primary/50">
                        <CardContent className="p-4">
                            <div className="flex items-center gap-2 mb-3">
                                <DollarSign className="h-5 w-5 text-primary" />
                                <h3 className="font-semibold">Total Liquidity</h3>
                            </div>
                            <div className="space-y-3">
                                <div className="flex justify-between items-center">
                                    <span className="text-sm text-muted-foreground">Cash Available</span>
                                    {isLoading ? (
                                        <Skeleton className="h-6 w-24" />
                                    ) : (
                                        <span className="text-lg font-semibold">
                                            <CurrencyDisplay amount={totalCashValue} currency="USD" abbreviate={false} />
                                        </span>
                                    )}
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-sm text-muted-foreground">Stocks Value</span>
                                    {isLoading ? (
                                        <Skeleton className="h-6 w-24" />
                                    ) : (
                                        <span className="text-lg font-semibold text-green-600">
                                            <CurrencyDisplay amount={totalStockValue} currency="USD" abbreviate={false} />
                                        </span>
                                    )}
                                </div>
                                <Separator />
                                <div className="flex justify-between items-center">
                                    <span className="text-sm font-medium">Total Liquidity</span>
                                    {isLoading ? (
                                        <Skeleton className="h-7 w-28" />
                                    ) : (
                                        <span className="text-xl font-bold text-primary">
                                            <CurrencyDisplay amount={totalLiquidity} currency="USD" abbreviate={false} />
                                        </span>
                                    )}
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Cash Breakdown */}
                    {totalCashValue > 0 && !isLoading && (
                        <div className="space-y-3">
                            <h3 className="text-sm font-medium flex items-center gap-2">
                                <Banknote className="h-4 w-4 text-green-500" />
                                Investment Cash
                            </h3>
                            <div className="grid grid-cols-2 gap-2">
                                {Object.entries(cashTotals.totals).map(([currency, amount]) => (
                                    <Card key={currency} className="bg-green-500/5 border-green-500/20">
                                        <CardContent className="p-3">
                                            <div className="flex items-center justify-between">
                                                <Badge variant="outline">{currency}</Badge>
                                                <TrendingUp className="h-3 w-3 text-green-500" />
                                            </div>
                                            <div className="mt-2 text-lg font-semibold text-green-600">
                                                <CurrencyDisplay amount={amount} currency={currency} abbreviate={false} />
                                            </div>
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>
                            <Separator />
                        </div>
                    )}

                    {/* Investment Accounts */}
                    <div className="space-y-4">
                        <h3 className="text-sm font-medium flex items-center gap-2">
                            <Building2 className="h-4 w-4" />
                            Account Liquidity
                        </h3>

                        {isLoading ? (
                            <div className="space-y-3">
                                {[1, 2].map((i) => (
                                    <Card key={i}>
                                        <CardContent className="p-4">
                                            <Skeleton className="h-4 w-32 mb-2" />
                                            <Skeleton className="h-3 w-24" />
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>
                        ) : accountsWithTotals.length === 0 ? (
                            <Card className="border-dashed">
                                <CardContent className="p-6 text-center">
                                    <Building2 className="h-8 w-8 mx-auto mb-2 text-muted-foreground opacity-50" />
                                    <p className="text-sm text-muted-foreground">No investment accounts found</p>
                                    <p className="text-xs text-muted-foreground mt-1">
                                        Create an investment account from the Accounts page
                                    </p>
                                </CardContent>
                            </Card>
                        ) : (
                            <div className="space-y-3">
                                {accountsWithTotals.map((bank) => (
                                    <Card key={bank.id}>
                                        <CardContent className="p-4">
                                            <div className="flex items-center justify-between mb-3">
                                                <div className="flex items-center gap-2">
                                                    <IconDisplay icon={bank.icon} fallback="🏦" />
                                                    <span className="font-semibold">{bank.name}</span>
                                                </div>
                                                <Badge variant="secondary" className="text-xs">
                                                    {bank.accounts.length} account{bank.accounts.length !== 1 ? 's' : ''}
                                                </Badge>
                                            </div>

                                            {/* Liquidity Breakdown */}
                                            <div className="space-y-2">
                                                <div className="flex justify-between items-center text-sm">
                                                    <span className="text-muted-foreground">Cash</span>
                                                    <span className="font-medium">
                                                        <CurrencyDisplay amount={bank.cashValue} currency="USD" abbreviate={false} />
                                                    </span>
                                                </div>
                                                <div className="flex justify-between items-center text-sm">
                                                    <span className="text-muted-foreground">Stocks</span>
                                                    <span className="font-medium text-green-600">
                                                        <CurrencyDisplay amount={bank.stockValue} currency="USD" abbreviate={false} />
                                                    </span>
                                                </div>
                                                <Separator />
                                                <div className="flex justify-between items-center">
                                                    <span className="text-sm font-medium">Total Liquidity</span>
                                                    <span className="text-lg font-bold">
                                                        <CurrencyDisplay
                                                            amount={bank.cashValue + bank.stockValue}
                                                            currency="USD"
                                                            abbreviate={false}
                                                        />
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Accounts List */}
                                            <div className="mt-3 pt-3 border-t border-border/50">
                                                <div className="text-xs text-muted-foreground mb-2">
                                                    Accounts in {bank.name}
                                                </div>
                                                {bank.accounts.map((account: InvestmentAccount) => (
                                                    <div
                                                        key={account.id}
                                                        className="flex items-center justify-between p-2 rounded-lg bg-muted/50 mb-2"
                                                    >
                                                        <div className="flex items-center gap-2">
                                                            <IconDisplay icon={account.icon} fallback="💼" />
                                                            <span className="text-sm font-medium">
                                                                {account.name}
                                                                {account.last4Digits && (
                                                                    <span className="ml-1 text-[10px] text-muted-foreground font-normal">
                                                                        ({account.last4Digits})
                                                                    </span>
                                                                )}
                                                            </span>
                                                        </div>
                                                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                                    </div>
                                                ))}

                                                {/* Currency Balances */}
                                                {bank.accounts.some((a: InvestmentAccount) => a.currencyBalances?.length > 0) && (
                                                    <div className="ml-2 mt-2">
                                                        <div className="text-xs text-muted-foreground mb-2">
                                                            Currency Balances
                                                        </div>
                                                        <div className="flex flex-wrap gap-1">
                                                            {bank.accounts.flatMap((a: InvestmentAccount) => a.currencyBalances || []).map((balance: CurrencyBalance) => (
                                                                <Badge
                                                                    key={balance.id}
                                                                    variant="outline"
                                                                    className="text-xs"
                                                                >
                                                                    {balance.currencyCode}
                                                                </Badge>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>
                        )}
                    </div>

                    <SheetFooter>
                        <SheetClose asChild>
                            <Button variant="outline">Close</Button>
                        </SheetClose>
                    </SheetFooter>
                </div>
            </SheetContent>
        </Sheet>
    );
}
