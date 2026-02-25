import { useState, useMemo, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { TrendingUp, Search, Loader2, History } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { formatAccountLabel } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
    SheetFooter,
    SheetClose
} from '@/components/ui/sheet';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { CurrencySelect } from './CurrencySelect';

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
    last4Digits?: string | null;
    currencyBalances: CurrencyBalance[];
}

const addInvestmentSchema = z.object({
    accountId: z.string().min(1, "Account is required"),
    currencyBalanceId: z.string().optional(), // Optional when recording past purchases
    ticker: z.string().min(1, "Stock is required"),
    name: z.string().min(1, "Stock name is required"),
    exchange: z.string().optional(),
    currency: z.string().min(1, "Currency is required"),
    date: z.string().min(1, "Date is required"),
    quantity: z.string().min(1, "Quantity is required"),
    pricePerShare: z.string().min(1, "Price is required"),
    notes: z.string().optional(),
});

type AddInvestmentForm = z.infer<typeof addInvestmentSchema>;

interface AddInvestmentSheetProps {
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    trigger?: React.ReactNode;
}

export function AddInvestmentSheet({ open: controlledOpen, onOpenChange: controlledOnOpenChange, trigger }: AddInvestmentSheetProps = {}) {
    const isCompactMobile = useIsMobile(470);
    const [internalOpen, setInternalOpen] = useState(false);
    const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
    const setOpen = controlledOnOpenChange || setInternalOpen;

    const [searchOpen, setSearchOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedStock, setSelectedStock] = useState<StockSearchResult | null>(null);
    const [isFetchingPrice, setIsFetchingPrice] = useState(false);
    const [isRecordingPast, setIsRecordingPast] = useState(false); // For importing existing holdings
    const [isManual, setIsManual] = useState(false); // For manual stock entry

    const utils = trpc.useUtils();

    // Fetch banks and extract investment accounts
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
                        last4Digits: account.last4Digits,
                        currencyBalances: account.currencyBalances || [],
                    });
                }
            }
        }
        return accounts;
    }, [banks]);

    // Search stocks
    const trimmedSearch = searchQuery.trim();
    const { data: searchResults, isFetching: isSearching } = trpc.investing.searchStocks.useQuery(
        { query: trimmedSearch },
        { enabled: trimmedSearch.length > 1 }
    );

    const { register, handleSubmit, reset, watch, setValue, formState: { errors } } = useForm<AddInvestmentForm>({
        resolver: zodResolver(addInvestmentSchema),
        defaultValues: {
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
        }
    });

    const accountId = watch('accountId');
    const currencyBalanceId = watch('currencyBalanceId');
    const date = watch('date');
    const quantity = watch('quantity');
    const pricePerShare = watch('pricePerShare');

    // Get the selected account and its currency balances
    const selectedAccount = useMemo(() => {
        return investmentAccounts.find(a => a.id === accountId);
    }, [investmentAccounts, accountId]);

    // Get selected currency balance
    const selectedCurrencyBalance = useMemo(() => {
        if (!selectedAccount) return null;
        return selectedAccount.currencyBalances.find(cb => cb.id === currencyBalanceId);
    }, [selectedAccount, currencyBalanceId]);

    // Calculate total
    const total = useMemo(() => {
        const qty = parseFloat(quantity) || 0;
        const price = parseFloat(pricePerShare) || 0;
        return qty * price;
    }, [quantity, pricePerShare]);

    // Check if stock currency matches selected currency balance
    const currencyMismatch = useMemo(() => {
        if (!selectedStock || !selectedCurrencyBalance) return false;
        return selectedStock.currency !== selectedCurrencyBalance.currencyCode;
    }, [selectedStock, selectedCurrencyBalance]);

    // Check if user has enough balance (skip when recording past purchases)
    const insufficientBalance = useMemo(() => {
        if (isRecordingPast) return false; // Skip balance check for past purchases
        if (!selectedCurrencyBalance || !total) return false;
        return total > Number(selectedCurrencyBalance.balance);
    }, [selectedCurrencyBalance, total, isRecordingPast]);

    // Add stock mutation (first adds to tracked stocks list)
    const addStock = trpc.investing.addStock.useMutation();

    // Buy stock mutation
    const buyStock = trpc.investing.buyStock.useMutation({
        onSuccess: () => {
            utils.investing.getPortfolioSummary.invalidate();
            utils.investing.listStocks.invalidate();
            utils.investing.getTransactions.invalidate();
            toast.success('Investment recorded successfully');
            resetForm();
            setOpen(false);
        },
        onError: (error: any) => {
            toast.error(error.message || 'Failed to record investment');
        }
    });

    const resetForm = () => {
        reset();
        setSelectedStock(null);
        setSearchQuery('');
        setIsRecordingPast(false);
    };

    // When account changes, reset currency balance selection
    useEffect(() => {
        setValue('currencyBalanceId', '');
    }, [accountId, setValue]);

    // When stock is selected and we have a matching currency balance, auto-select it
    useEffect(() => {
        if (selectedStock && selectedAccount) {
            const matchingBalance = selectedAccount.currencyBalances.find(
                cb => cb.currencyCode === selectedStock.currency
            );
            if (matchingBalance) {
                setValue('currencyBalanceId', matchingBalance.id);
            }
        }
    }, [selectedStock, selectedAccount, setValue]);

    // Fetch price for the selected stock and date
    const fetchPriceForDate = async (ticker: string, targetDate: string) => {
        setIsFetchingPrice(true);
        try {
            const result = await utils.investing.getPriceForDate.fetch({ ticker, date: targetDate });
            if (result && result.price) {
                setValue('pricePerShare', result.price.toFixed(2));
            }
        } catch (error) {
            console.error('Failed to fetch price:', error);
            // Don't show error - user can enter price manually
        } finally {
            setIsFetchingPrice(false);
        }
    };

    // When stock is selected, fetch current price and update form values
    const handleSelectStock = async (stock: StockSearchResult) => {
        setSelectedStock(stock);
        setValue('ticker', stock.ticker);
        setValue('name', stock.name);
        setValue('exchange', stock.exchange);
        setValue('currency', stock.currency);
        setSearchOpen(false);
        setSearchQuery('');

        // Fetch price for the current date
        const currentDate = watch('date');
        await fetchPriceForDate(stock.ticker, currentDate);
    };

    // When date changes, re-fetch price
    useEffect(() => {
        if (selectedStock && date) {
            fetchPriceForDate(selectedStock.ticker, date);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [date, selectedStock?.ticker]);

    const onSubmit = async (data: AddInvestmentForm) => {
        if (!selectedStock && !isManual) {
            toast.error('Please select a stock or enable Manual Entry');
            return;
        }

        const currency = isManual ? data.currency : selectedStock!.currency;
        const ticker = isManual ? data.ticker : selectedStock!.ticker;

        // Only validate currency balance when NOT recording past purchases
        if (!isRecordingPast) {
            if (!selectedCurrencyBalance) {
                toast.error('Please select a currency to pay from');
                return;
            }

            // Check currency match
            if (currency !== selectedCurrencyBalance.currencyCode) {
                toast.error(`Cannot buy ${ticker} with ${selectedCurrencyBalance.currencyCode}. This stock trades in ${currency}.`);
                return;
            }
        }

        const qty = parseFloat(data.quantity);
        const price = parseFloat(data.pricePerShare);

        if (qty <= 0 || price <= 0) {
            toast.error('Quantity and price must be greater than 0');
            return;
        }

        // Only check balance when NOT recording past purchases
        if (!isRecordingPast && selectedCurrencyBalance) {
            const totalCost = qty * price;
            if (totalCost > Number(selectedCurrencyBalance.balance)) {
                toast.error(`Insufficient balance. You have ${Number(selectedCurrencyBalance.balance).toLocaleString()} ${selectedCurrencyBalance.currencyCode} but need ${totalCost.toLocaleString()} ${selectedCurrencyBalance.currencyCode}`);
                return;
            }
        }

        try {
            // First, add the stock to our tracked list (will be ignored if already exists)
            const stockResult = await addStock.mutateAsync({
                ticker: data.ticker,
                name: data.name,
                currency: data.currency,
                exchange: data.exchange,
                isManual,
            });

            // Then record the buy transaction
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

    const isControlled = controlledOpen !== undefined;

    return (
        <Sheet open={open} onOpenChange={(isOpen) => {
            setOpen(isOpen);
            if (!isOpen) resetForm();
        }}>
            {!isControlled && (
                <SheetTrigger asChild>
                    {trigger ?? (
                        <Button className="gap-2 flex-1 sm:flex-none">
                            <TrendingUp className="h-4 w-4" />
                            Add Investment
                        </Button>
                    )}
                </SheetTrigger>
            )}
            <SheetContent
                side={isCompactMobile ? 'bottom' : 'right'}
                className="overflow-y-auto max-[470px]:h-[92dvh] max-[470px]:rounded-t-2xl max-[470px]:pb-[calc(env(safe-area-inset-bottom)+0.5rem)]"
            >
                <SheetHeader>
                    <SheetTitle>Add Investment</SheetTitle>
                    <SheetDescription>
                        Record a new stock/ETF purchase
                    </SheetDescription>
                </SheetHeader>

                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-6">
                    {/* Record Past Purchase Toggle */}
                    <div className="flex items-center justify-between rounded-lg border p-3 bg-muted/30">
                        <div className="flex items-center gap-2">
                            <History className="h-4 w-4 text-muted-foreground" />
                            <div>
                                <Label htmlFor="record-past" className="text-sm font-medium cursor-pointer">
                                    Record past purchase
                                </Label>
                                <p className="text-xs text-muted-foreground">
                                    Import existing holdings without deducting balance
                                </p>
                            </div>
                        </div>
                        <Switch
                            id="record-past"
                            checked={isRecordingPast}
                            onCheckedChange={setIsRecordingPast}
                        />
                    </div>

                    {/* Manual Entry Toggle */}
                    <div className="flex items-center justify-between rounded-lg border p-3 bg-muted/30">
                        <div className="flex items-center gap-2">
                            <TrendingUp className="h-4 w-4 text-muted-foreground" />
                            <div>
                                <Label htmlFor="manual-entry" className="text-sm font-medium cursor-pointer">
                                    Manual Entry
                                </Label>
                                <p className="text-xs text-muted-foreground">
                                    Add asset manually (no API search)
                                </p>
                            </div>
                        </div>
                        <Switch
                            id="manual-entry"
                            checked={isManual}
                            onCheckedChange={(checked) => {
                                setIsManual(checked);
                                if (checked) {
                                    setSelectedStock(null);
                                    setValue('ticker', '');
                                    setValue('name', '');
                                    setValue('currency', 'USD');
                                } else {
                                    setSearchQuery('');
                                }
                            }}
                        />
                    </div>

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
                                            <span>{account.name}{account.last4Digits ? ` ${account.last4Digits}` : ''}</span>
                                            <span className="text-muted-foreground">({account.bankName})</span>
                                        </span>
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {errors.accountId && <p className="text-sm text-red-500">{errors.accountId.message}</p>}
                    </div>

                    {/* Currency Balance Selection - Hidden when recording past purchases */}
                    {selectedAccount && !isRecordingPast && (
                        <div className="space-y-2">
                            <Label>Pay From Currency</Label>
                            {selectedAccount.currencyBalances.length === 0 ? (
                                <div className="rounded-lg border border-dashed p-3 text-center text-sm text-muted-foreground">
                                    No currency balances in this account.<br />
                                    Add a currency balance first.
                                </div>
                            ) : (
                                <>
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
                                    {errors.currencyBalanceId && <p className="text-sm text-red-500">{errors.currencyBalanceId.message}</p>}

                                    {/* Currency mismatch warning */}
                                    {currencyMismatch && selectedStock && selectedCurrencyBalance && (
                                        <div className="rounded-lg border border-red-500/50 bg-red-500/10 p-3 text-sm text-red-500">
                                            <strong>Currency mismatch!</strong> {selectedStock.ticker} trades in <strong>{selectedStock.currency}</strong>,
                                            but you selected <strong>{selectedCurrencyBalance.currencyCode}</strong>.
                                            {selectedAccount.currencyBalances.some(cb => cb.currencyCode === selectedStock.currency) ? (
                                                <> Select the {selectedStock.currency} balance instead.</>
                                            ) : (
                                                <> Add a {selectedStock.currency} balance to this account first.</>
                                            )}
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    )}

                    {/* Stock Selection */}
                    {isManual ? (
                        <div className="space-y-4 rounded-lg border p-3 bg-muted/50">
                            <div className="space-y-2">
                                <Label>Ticker Symbol</Label>
                                <Input placeholder="e.g. BTC-COLD, PRIVATE-EQ" {...register('ticker')} />
                                {errors.ticker && <p className="text-sm text-red-500">{errors.ticker.message}</p>}
                            </div>
                            <div className="space-y-2">
                                <Label>Asset Name</Label>
                                <Input placeholder="e.g. Cold Storage Bitcoin" {...register('name')} />
                                {errors.name && <p className="text-sm text-red-500">{errors.name.message}</p>}
                            </div>
                            <div className="space-y-2">
                                <Label>Currency</Label>
                                <CurrencySelect
                                    value={watch('currency')}
                                    onValueChange={(v) => setValue('currency', v)}
                                />
                            </div>
                        </div>
                    ) : (
                        <>
                            {/* Stock Search */}
                            <div className="space-y-2">
                                <Label>Search Stock / ETF</Label>
                                <Popover open={searchOpen} onOpenChange={setSearchOpen}>
                                    <PopoverTrigger asChild>
                                        <Button
                                            variant="outline"
                                            role="combobox"
                                            aria-expanded={searchOpen}
                                            className="w-full justify-between font-normal"
                                        >
                                            {selectedStock ? (
                                                <span>{selectedStock.ticker} - {selectedStock.name}</span>
                                            ) : (
                                                <span className="text-muted-foreground">Search by ticker or name...</span>
                                            )}
                                            <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-[400px] p-0" align="start">
                                        <Command shouldFilter={false}>
                                            <CommandInput
                                                placeholder="Search AAPL, Microsoft..."
                                                value={searchQuery}
                                                onValueChange={setSearchQuery}
                                            />
                                            <CommandList>
                                                {trimmedSearch.length <= 1 ? (
                                                    <CommandEmpty>Type at least 2 characters to search</CommandEmpty>
                                                ) : isSearching ? (
                                                    <div className="flex items-center justify-center py-6">
                                                        <Loader2 className="h-4 w-4 animate-spin" />
                                                        <span className="ml-2 text-sm">Searching...</span>
                                                    </div>
                                                ) : searchResults && searchResults.length > 0 ? (
                                                    <CommandGroup heading="Results">
                                                        {searchResults.map((stock: StockSearchResult) => (
                                                            <CommandItem
                                                                key={`${stock.ticker}-${stock.exchange}`}
                                                                value={stock.ticker}
                                                                onSelect={() => handleSelectStock(stock)}
                                                                className="cursor-pointer"
                                                            >
                                                                <div className="flex flex-col">
                                                                    <div className="flex items-center gap-2">
                                                                        <span className="font-semibold">{stock.ticker}</span>
                                                                        <span className="text-xs text-muted-foreground">{stock.exchange}</span>
                                                                    </div>
                                                                    <span className="text-sm text-muted-foreground">{stock.name}</span>
                                                                </div>
                                                            </CommandItem>
                                                        ))}
                                                    </CommandGroup>
                                                ) : (
                                                    <CommandEmpty>No stocks found</CommandEmpty>
                                                )}
                                            </CommandList>
                                        </Command>
                                    </PopoverContent>
                                </Popover>
                                {errors.ticker && <p className="text-sm text-red-500">{errors.ticker.message}</p>}
                            </div>

                            {/* Selected Stock Info */}
                            {selectedStock && (
                                <div className="rounded-lg border p-3 bg-muted/50">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <div className="font-semibold">{selectedStock.ticker}</div>
                                            <div className="text-sm text-muted-foreground">{selectedStock.name}</div>
                                        </div>
                                        <div className="text-right text-sm">
                                            <div className="text-muted-foreground">{selectedStock.exchange}</div>
                                            <div>{selectedStock.currency}</div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </>
                    )}

                    {/* Date */}
                    <div className="space-y-2">
                        <Label>Purchase Date</Label>
                        <Input
                            type="date"
                            {...register('date')}
                        />
                        {errors.date && <p className="text-sm text-red-500">{errors.date.message}</p>}
                    </div>

                    {/* Price per Share */}
                    <div className="space-y-2">
                        <Label>Price per Share {selectedStock && `(${selectedStock.currency})`}</Label>
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
                        <p className="text-xs text-muted-foreground">
                            {isFetchingPrice ? 'Fetching price...' : 'Price auto-filled from market data. Edit if needed.'}
                        </p>
                        {errors.pricePerShare && <p className="text-sm text-red-500">{errors.pricePerShare.message}</p>}
                    </div>

                    {/* Quantity */}
                    <div className="space-y-2">
                        <Label>Number of Shares</Label>
                        <Input
                            type="number"
                            step="0.0001"
                            placeholder="0"
                            {...register('quantity')}
                        />
                        {errors.quantity && <p className="text-sm text-red-500">{errors.quantity.message}</p>}
                    </div>

                    {/* Total */}
                    <div className={`rounded-lg border p-3 ${insufficientBalance ? 'border-red-500/50 bg-red-500/10' : isRecordingPast ? 'border-blue-500/30 bg-blue-500/10' : 'bg-muted/50'}`}>
                        <div className="flex justify-between items-center">
                            <span className="text-sm text-muted-foreground">
                                {isRecordingPast ? 'Cost Basis (for records)' : 'Total Investment'}
                            </span>
                            <span className={`text-lg font-bold ${insufficientBalance ? 'text-red-500' : ''}`}>
                                {total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {selectedStock?.currency || 'USD'}
                            </span>
                        </div>
                        {isRecordingPast ? (
                            <p className="text-xs text-blue-500 mt-2">
                                💡 Recording past purchase - no balance will be deducted
                            </p>
                        ) : (
                            <>
                                {selectedCurrencyBalance && (
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
                            </>
                        )}
                    </div>

                    {/* Notes */}
                    <div className="space-y-2">
                        <Label>Notes (optional)</Label>
                        <Input
                            placeholder="e.g., DCA purchase, quarterly rebalancing"
                            {...register('notes')}
                        />
                    </div>

                    <SheetFooter className="pt-4">
                        <SheetClose asChild>
                            <Button variant="outline" type="button">Cancel</Button>
                        </SheetClose>
                        <Button
                            type="submit"
                            disabled={addStock.isLoading || buyStock.isLoading || (!isRecordingPast && (currencyMismatch || insufficientBalance))}
                        >
                            {(addStock.isLoading || buyStock.isLoading) ? 'Recording...' : isRecordingPast ? 'Import Holding' : 'Record Investment'}
                        </Button>
                    </SheetFooter>
                </form>
            </SheetContent>
        </Sheet>
    );
}
