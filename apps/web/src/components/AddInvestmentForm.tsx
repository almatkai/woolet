import { useState, useMemo, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { TrendingUp, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';

interface StockSearchResult {
    ticker: string;
    name: string;
    exchange: string;
    currency: string;
}

interface CurrencyBalance {
    id: string;
    currencyCode: string;
    balance: string | number;
}

interface InvestmentAccount {
    id: string;
    name: string;
    icon?: string | null;
    bankName: string;
    bankIcon?: string | null;
    currencyBalances: CurrencyBalance[];
}

const addInvestmentSchema = z.object({
    accountId: z.string().min(1, "Account is required"),
    currencyBalanceId: z.string().optional(),
    ticker: z.string().min(1, "Ticker is required"),
    name: z.string().min(1, "Name is required"),
    exchange: z.string().optional(),
    currency: z.string().min(1, "Currency is required"),
    date: z.string().min(1, "Date is required"),
    quantity: z.string().min(1, "Quantity is required"),
    pricePerShare: z.string().min(1, "Price is required"),
    notes: z.string().optional(),
});

type AddInvestmentForm = z.infer<typeof addInvestmentSchema>;

interface AddInvestmentFormProps {
    onSuccess: () => void;
    onCancel: () => void;
    showCancel?: boolean;
}

export function AddInvestmentForm({ onSuccess, onCancel, showCancel = true }: AddInvestmentFormProps) {
    const [searchOpen, setSearchOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedStock, setSelectedStock] = useState<StockSearchResult | null>(null);
    const [isFetchingPrice, setIsFetchingPrice] = useState(false);
    const [isManual, setIsManual] = useState(true);
    const [isRecordingPast, setIsRecordingPast] = useState(false);

    const utils = trpc.useUtils();
    const { data: banks } = trpc.bank.getHierarchy.useQuery();

    // Flatten to get all investment accounts with their bank info and currency balances
    const investmentAccounts = useMemo((): InvestmentAccount[] => {
        if (!banks) return [];
        const accounts: InvestmentAccount[] = [];
        for (const bank of banks) {
            for (const account of bank.accounts) {
                if (account.type === 'investment') {
                    accounts.push({
                        id: account.id,
                        name: account.name,
                        icon: account.icon,
                        bankName: bank.name,
                        bankIcon: bank.icon,
                        currencyBalances: account.currencyBalances,
                    });
                }
            }
        }
        return accounts;
    }, [banks]);

    const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<AddInvestmentForm>({
        resolver: zodResolver(addInvestmentSchema),
        defaultValues: {
            currency: 'USD',
            date: new Date().toISOString().split('T')[0],
        }
    });

    const accountId = watch('accountId');
    const currencyBalanceId = watch('currencyBalanceId');
    const ticker = watch('ticker');
    const quantity = watch('quantity');
    const pricePerShare = watch('pricePerShare');

    const selectedAccount = useMemo(() =>
        investmentAccounts.find(a => a.id === accountId),
        [investmentAccounts, accountId]);

    const selectedCurrencyBalance = useMemo(() =>
        selectedAccount?.currencyBalances.find(cb => cb.id === currencyBalanceId),
        [selectedAccount, currencyBalanceId]);

    const total = useMemo(() =>
        (parseFloat(quantity || '0') || 0) * (parseFloat(pricePerShare || '0') || 0),
        [quantity, pricePerShare]);

    const insufficientBalance = useMemo(() => {
        if (isRecordingPast || !selectedCurrencyBalance) return false;
        return total > Number(selectedCurrencyBalance.balance);
    }, [isRecordingPast, selectedCurrencyBalance, total]);

    const addStock = trpc.stock.upsert.useMutation({
        onError: (error: Error) => toast.error(error.message || 'Failed to add stock'),
    });

    const buyStock = trpc.investment.transaction.buy.useMutation({
        onSuccess: () => {
            utils.investment.holdings.invalidate();
            resetForm();
            onSuccess();
            toast.success('Investment recorded successfully');
        },
        onError: (error: Error) => toast.error(error.message || 'Failed to record investment'),
    });

    const searchStocks = trpc.investing.search.useQuery(
        { query: searchQuery, limit: 10 },
        { enabled: searchQuery.length >= 2 }
    );

    const resetForm = () => {
        reset({
            accountId: '',
            currencyBalanceId: '',
            ticker: '',
            name: '',
            exchange: '',
            currency: 'USD',
            date: new Date().toISOString().split('T')[0],
            quantity: '',
            pricePerShare: '',
            notes: '',
        });
        setSelectedStock(null);
        setSearchQuery('');
    };

    const handleSelectStock = (stock: StockSearchResult) => {
        setSelectedStock(stock);
        setValue('ticker', stock.ticker);
        setValue('name', stock.name);
        setValue('exchange', stock.exchange);
        setValue('currency', stock.currency);
        setSearchOpen(false);
        setSearchQuery('');

        // Auto-fetch price
        if (!isManual) {
            fetchPrice(stock.ticker);
        }
    };

    const fetchPrice = async (ticker: string) => {
        setIsFetchingPrice(true);
        try {
            const price = await utils.client.investing.price.query({ ticker });
            if (price) {
                setValue('pricePerShare', price.toString());
            }
        } catch (error) {
            console.error('Failed to fetch price:', error);
        } finally {
            setIsFetchingPrice(false);
        }
    };

    const onSubmit = async (data: AddInvestmentForm) => {
        const qty = parseFloat(data.quantity);
        const price = parseFloat(data.pricePerShare);

        if (qty <= 0 || price <= 0) {
            toast.error('Quantity and price must be greater than 0');
            return;
        }

        if (!isRecordingPast && selectedCurrencyBalance) {
            const totalCost = qty * price;
            if (totalCost > Number(selectedCurrencyBalance.balance)) {
                toast.error(`Insufficient balance. You need ${totalCost.toLocaleString()} ${selectedCurrencyBalance.currencyCode}`);
                return;
            }
        }

        try {
            const stockResult = await addStock.mutateAsync({
                ticker: data.ticker,
                name: data.name,
                currency: data.currency,
                exchange: data.exchange || undefined,
                isManual,
            });

            await buyStock.mutateAsync({
                stockId: stockResult.id,
                date: data.date,
                quantity: qty,
                pricePerShare: price,
                currency: data.currency,
                notes: isRecordingPast ? `[Past purchase] ${data.notes || ''}`.trim() : (data.notes || undefined),
            });
        } catch (error) {
            // Error handling is done in mutation callbacks
        }
    };

    return (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {/* Investment Account Selection */}
            <div className="space-y-2">
                <Label>Investment Account</Label>
                <Select value={accountId} onValueChange={(v) => setValue('accountId', v)}>
                    <SelectTrigger>
                        <SelectValue placeholder="Select investment account" />
                    </SelectTrigger>
                    <SelectContent>
                        {investmentAccounts.length === 0 ? (
                            <div className="py-4 px-2 text-center text-sm text-muted-foreground">
                                No investment accounts found.<br />
                                Create one in Accounts first.
                            </div>
                        ) : investmentAccounts.map((account) => (
                            <SelectItem key={account.id} value={account.id}>
                                <span className="flex items-center gap-2">
                                    <span>{account.icon || '📈'}</span>
                                    <span>{account.name}</span>
                                    <span className="text-muted-foreground">({account.bankName})</span>
                                </span>
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                {errors.accountId && <p className="text-sm text-red-500">{errors.accountId.message}</p>}
            </div>

            {/* Currency Balance Selection */}
            {selectedAccount && !isRecordingPast && (
                <div className="space-y-2">
                    <Label>Pay From Currency</Label>
                    {selectedAccount.currencyBalances.length === 0 ? (
                        <div className="rounded-lg border border-dashed p-3 text-center text-sm text-muted-foreground">
                            No currency balances in this account.<br />
                            Add a currency balance first.
                        </div>
                    ) : (
                        <Select value={currencyBalanceId} onValueChange={(v) => setValue('currencyBalanceId', v)}>
                            <SelectTrigger>
                                <SelectValue placeholder="Select currency to pay from" />
                            </SelectTrigger>
                            <SelectContent>
                                {selectedAccount.currencyBalances.map((cb) => (
                                    <SelectItem key={cb.id} value={cb.id}>
                                        <span className="flex items-center gap-2">
                                            <span className="font-semibold">{cb.currencyCode}</span>
                                            <span className="text-muted-foreground">
                                                Balance: {Number(cb.balance).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                            </span>
                                        </span>
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    )}
                </div>
            )}

            {/* Ticker and Name */}
            <div className="space-y-4 rounded-lg border p-3 bg-muted/50">
                <div className="space-y-2">
                    <Label>Ticker Symbol</Label>
                    <Input placeholder="e.g. AAPL, BTC, GOOGL" {...register('ticker')} />
                    {errors.ticker && <p className="text-sm text-red-500">{errors.ticker.message}</p>}
                </div>
                <div className="space-y-2">
                    <Label>Asset Name</Label>
                    <Input placeholder="e.g. Apple Inc, Bitcoin" {...register('name')} />
                    {errors.name && <p className="text-sm text-red-500">{errors.name.message}</p>}
                </div>
                <div className="space-y-2">
                    <Label>Currency</Label>
                    <Select onValueChange={(v) => setValue('currency', v)} defaultValue="USD">
                        <SelectTrigger>
                            <SelectValue placeholder="Select currency" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="USD">USD</SelectItem>
                            <SelectItem value="EUR">EUR</SelectItem>
                            <SelectItem value="GBP">GBP</SelectItem>
                            <SelectItem value="KZT">KZT</SelectItem>
                            <SelectItem value="RUB">RUB</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>

            {/* Date */}
            <div className="space-y-2">
                <Label>Purchase Date</Label>
                <Input type="date" {...register('date')} />
                {errors.date && <p className="text-sm text-red-500">{errors.date.message}</p>}
            </div>

            {/* Price per Share */}
            <div className="space-y-2">
                <Label>Price per Share</Label>
                <div className="relative">
                    <Input
                        type="number"
                        step="0.0001"
                        placeholder="0.00"
                        {...register('pricePerShare')}
                        disabled={isFetchingPrice}
                    />
                    {isFetchingPrice && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        </div>
                    )}
                </div>
                {errors.pricePerShare && <p className="text-sm text-red-500">{errors.pricePerShare.message}</p>}
            </div>

            {/* Quantity */}
            <div className="space-y-2">
                <Label>Number of Shares</Label>
                <Input type="number" step="0.0001" placeholder="0" {...register('quantity')} />
                {errors.quantity && <p className="text-sm text-red-500">{errors.quantity.message}</p>}
            </div>

            {/* Total */}
            <div className={`rounded-lg border p-3 ${insufficientBalance ? 'border-red-500/50 bg-red-500/10' : isRecordingPast ? 'border-blue-500/30 bg-blue-500/10' : 'bg-muted/50'}`}>
                <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">
                        {isRecordingPast ? 'Cost Basis (for records)' : 'Total Investment'}
                    </span>
                    <span className={`text-lg font-bold ${insufficientBalance ? 'text-red-500' : ''}`}>
                        {total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {watch('currency')}
                    </span>
                </div>
                {isRecordingPast && (
                    <p className="text-xs text-blue-500 mt-2">
                        💡 Recording past purchase - no balance will be deducted
                    </p>
                )}
                {!isRecordingPast && selectedCurrencyBalance && (
                    <div className="flex justify-between items-center mt-2 pt-2 border-t border-border/50">
                        <span className="text-xs text-muted-foreground">Available Balance</span>
                        <span className={`text-sm ${insufficientBalance ? 'text-red-500' : 'text-muted-foreground'}`}>
                            {Number(selectedCurrencyBalance.balance).toLocaleString('en-US', { minimumFractionDigits: 2 })} {selectedCurrencyBalance.currencyCode}
                        </span>
                    </div>
                )}
                {insufficientBalance && (
                    <p className="text-xs text-red-500 mt-2">
                        Insufficient balance to complete this purchase
                    </p>
                )}
            </div>

            {/* Notes */}
            <div className="space-y-2">
                <Label>Notes (optional)</Label>
                <Input placeholder="e.g., DCA purchase, quarterly rebalancing" {...register('notes')} />
            </div>

            <div className="flex gap-3 pt-4">
                {showCancel !== false && (
                    <Button type="button" variant="outline" onClick={onCancel} className="flex-1">
                        Cancel
                    </Button>
                )}
                <Button
                    type="submit"
                    className="flex-1 gap-2"
                    disabled={buyStock.isLoading || (!isRecordingPast && insufficientBalance)}
                >
                    {!buyStock.isLoading && <TrendingUp className="h-4 w-4" />}
                    {buyStock.isLoading ? 'Recording...' : isRecordingPast ? 'Import Holding' : 'Record Investment'}
                </Button>
            </div>
        </form>
    );
}
