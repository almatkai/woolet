import { useState, useMemo } from 'react';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
    SheetFooter,
} from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Wallet, Calendar, AlertCircle, CheckCircle2, CreditCard } from 'lucide-react';

interface Credit {
    id: string;
    name: string;
    accountId: string;
    monthlyPayment: string;
    currency: string;
    startDate: string;
    endDate: string;
    status: string;
    account: {
        id: string;
        name: string;
        currencyBalances: Array<{
            currencyCode: string;
            balance: string;
        }>;
    };
    payments: Array<{
        monthYear: string;
    }>;
}

interface CompoundCreditPaymentSheetProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    credits: Credit[];
}

// Helper to generate all months between two dates
function getMonthsBetween(startDate: string, endDate: string): string[] {
    const months: string[] = [];
    const start = new Date(startDate);
    const end = new Date(endDate);

    let current = new Date(start.getFullYear(), start.getMonth() + 1, 1);
    const endMonth = new Date(end.getFullYear(), end.getMonth(), 1);

    while (current <= endMonth) {
        const year = current.getFullYear();
        const month = String(current.getMonth() + 1).padStart(2, '0');
        months.push(`${year}-${month}`);
        current.setMonth(current.getMonth() + 1);
    }

    return months;
}

// Format month for display
function formatMonth(monthYear: string): string {
    const [year, month] = monthYear.split('-');
    const date = new Date(Number(year), Number(month) - 1, 1);
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

// Get current month in YYYY-MM format
function getCurrentMonth(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

// Check if a month is within a credit's term
function isMonthInCreditTerm(month: string, startDate: string, endDate: string): boolean {
    const [year, monthNum] = month.split('-').map(Number);
    const monthDate = new Date(year, monthNum - 1, 1);
    const start = new Date(startDate);
    const end = new Date(endDate);

    const startMonth = new Date(start.getFullYear(), start.getMonth() + 1, 1);
    const endMonth = new Date(end.getFullYear(), end.getMonth(), 1);

    return monthDate >= startMonth && monthDate <= endMonth;
}

interface MonthData {
    month: string;
    credits: Array<{
        id: string;
        name: string;
        amount: number;
        isPaid: boolean;
        accountId: string;
        currency: string;
    }>;
    totalAmount: number;
    allPaid: boolean;
    currency: string;
}

export function CompoundCreditPaymentSheet({ open, onOpenChange, credits }: CompoundCreditPaymentSheetProps) {
    const [selectedMonths, setSelectedMonths] = useState<string[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [skipPayment, setSkipPayment] = useState(false); // Mark as paid without deducting
    const utils = trpc.useUtils();

    const makePayment = trpc.credit.makeMonthlyPayment.useMutation();
    const markAsPaid = trpc.credit.markAsPaid.useMutation();

    // Get active credits only
    const activeCredits = useMemo(() => {
        return credits.filter(c => c.status === 'active');
    }, [credits]);

    // Build a unified month list with compound amounts
    const monthsData: MonthData[] = useMemo(() => {
        if (activeCredits.length === 0) return [];

        // Find the earliest start and latest end date
        const allStartDates = activeCredits.map(c => new Date(c.startDate));
        const allEndDates = activeCredits.map(c => new Date(c.endDate));
        const earliestStart = new Date(Math.min(...allStartDates.map(d => d.getTime())));
        const latestEnd = new Date(Math.max(...allEndDates.map(d => d.getTime())));

        // Generate all months from earliest start to latest end
        const startStr = earliestStart.toISOString().split('T')[0];
        const endStr = latestEnd.toISOString().split('T')[0];
        const allMonths = getMonthsBetween(startStr, endStr);

        // For each month, calculate which credits apply and amounts
        return allMonths.map(month => {
            const creditsForMonth = activeCredits
                .filter(c => isMonthInCreditTerm(month, c.startDate, c.endDate))
                .map(c => {
                    const isPaid = c.payments.some(p => p.monthYear === month);
                    return {
                        id: c.id,
                        name: c.name,
                        amount: Number(c.monthlyPayment),
                        isPaid,
                        accountId: c.account.id,
                        currency: c.currency
                    };
                });

            const unpaidCredits = creditsForMonth.filter(c => !c.isPaid);
            const totalAmount = unpaidCredits.reduce((sum, c) => sum + c.amount, 0);
            const allPaid = creditsForMonth.length > 0 && creditsForMonth.every(c => c.isPaid);

            // Assume all credits use same currency (KZT in this case)
            const currency = creditsForMonth[0]?.currency || 'KZT';

            return {
                month,
                credits: creditsForMonth,
                totalAmount,
                allPaid,
                currency
            };
        }).filter(m => m.credits.length > 0); // Only show months that have at least one credit
    }, [activeCredits]);

    // Calculate total balance across all linked accounts for the primary currency
    const totalAccountBalance = useMemo(() => {
        const balances = new Map<string, number>();

        activeCredits.forEach(credit => {
            const cb = credit.account.currencyBalances.find(
                b => b.currencyCode === credit.currency
            );
            if (cb) {
                // Use account ID to avoid double counting same account
                balances.set(credit.account.id, Number(cb.balance));
            }
        });

        return Array.from(balances.values()).reduce((sum, b) => sum + b, 0);
    }, [activeCredits]);

    // Calculate total payment for selected months
    const selectedPaymentDetails = useMemo(() => {
        const details: Array<{ creditId: string; month: string; amount: number }> = [];
        let total = 0;

        selectedMonths.forEach(month => {
            const monthData = monthsData.find(m => m.month === month);
            if (monthData) {
                monthData.credits
                    .filter(c => !c.isPaid)
                    .forEach(c => {
                        details.push({ creditId: c.id, month, amount: c.amount });
                        total += c.amount;
                    });
            }
        });

        return { details, total };
    }, [selectedMonths, monthsData]);

    const hasInsufficientBalance = selectedPaymentDetails.total > totalAccountBalance;
    const currentMonth = getCurrentMonth();

    const toggleMonth = (month: string) => {
        const monthData = monthsData.find(m => m.month === month);
        if (monthData?.allPaid) return; // Can't select fully paid months

        setSelectedMonths(prev =>
            prev.includes(month)
                ? prev.filter(m => m !== month)
                : [...prev, month].sort()
        );
    };

    const selectCurrentMonth = () => {
        const currentMonthData = monthsData.find(m => m.month === currentMonth);
        if (currentMonthData && !currentMonthData.allPaid) {
            setSelectedMonths([currentMonth]);
        }
    };

    const selectAllUntilCurrent = () => {
        const monthsToSelect = monthsData
            .filter(m => m.month < currentMonth && !m.allPaid)
            .map(m => m.month);
        setSelectedMonths(monthsToSelect);
    };

    const handleSubmit = async () => {
        if (selectedPaymentDetails.details.length === 0) return;

        setIsProcessing(true);
        try {
            // Group payments by credit
            const paymentsByCredit = new Map<string, string[]>();
            selectedPaymentDetails.details.forEach(d => {
                const existing = paymentsByCredit.get(d.creditId) || [];
                existing.push(d.month);
                paymentsByCredit.set(d.creditId, existing);
            });

            // Make payment for each credit
            const promises = Array.from(paymentsByCredit.entries()).map(([creditId, months]) =>
                skipPayment
                    ? markAsPaid.mutateAsync({ creditId, months })
                    : makePayment.mutateAsync({ creditId, months })
            );

            await Promise.all(promises);

            utils.credit.list.invalidate();
            utils.bank.getHierarchy.invalidate();
            const action = skipPayment ? 'Marked as paid' : 'Payment successful';
            toast.success(`${action}! ${selectedMonths.length} month(s) across ${paymentsByCredit.size} credit(s)`);
            setSelectedMonths([]);
            setSkipPayment(false);
            onOpenChange(false);
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : 'Payment failed';
            toast.error(errorMessage);
        } finally {
            setIsProcessing(false);
        }
    };

    const primaryCurrency = activeCredits[0]?.currency || 'KZT';

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent className="sm:max-w-[550px] flex flex-col">
                <SheetHeader>
                    <SheetTitle className="flex items-center gap-2">
                        <CreditCard className="h-5 w-5" />
                        Pay All Credits
                    </SheetTitle>
                    <SheetDescription>
                        Pay all your credits at once. Monthly totals adjust as credits finish.
                    </SheetDescription>
                </SheetHeader>

                <div className="flex-1 space-y-4 py-4 overflow-hidden flex flex-col">
                    {/* Summary Info */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="p-3 rounded-lg bg-muted/50">
                            <div className="text-xs text-muted-foreground mb-1">Active Credits</div>
                            <div className="font-semibold">{activeCredits.length}</div>
                        </div>
                        <div className="p-3 rounded-lg bg-muted/50">
                            <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                                <Wallet className="h-3 w-3" /> Total Available
                            </div>
                            <div className={`font-semibold ${hasInsufficientBalance && selectedMonths.length > 0 ? 'text-destructive' : ''}`}>
                                {primaryCurrency} {totalAccountBalance.toLocaleString()}
                            </div>
                        </div>
                    </div>

                    {/* Quick Actions */}
                    <div className="space-y-2">
                        {monthsData.find(m => m.month === currentMonth)?.allPaid && (
                            <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 text-green-600 text-sm">
                                <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
                                <span className="font-medium">
                                    Current month ({formatMonth(currentMonth)}) is already paid
                                </span>
                            </div>
                        )}
                        <div className="flex gap-2">
                            {monthsData.find(m => m.month === currentMonth && !m.allPaid) && (
                                <Button
                                    variant="outline"
                                    className="flex-1 justify-start gap-2"
                                    onClick={selectCurrentMonth}
                                >
                                    <Calendar className="h-4 w-4" />
                                    Pay Current
                                </Button>
                            )}
                            {monthsData.some(m => m.month < currentMonth && !m.allPaid) && (
                                <Button
                                    variant="outline"
                                    className="flex-1 justify-start gap-2"
                                    onClick={selectAllUntilCurrent}
                                >
                                    <CheckCircle2 className="h-4 w-4" />
                                    Select all until current
                                </Button>
                            )}
                        </div>
                    </div>

                    {/* Month Selection */}
                    <div className="flex-1 overflow-hidden flex flex-col">
                        <Label className="mb-2">Select Months to Pay</Label>
                        <ScrollArea className="flex-1 border rounded-lg">
                            <div className="p-3 space-y-2">
                                {monthsData.map((monthData) => {
                                    const isSelected = selectedMonths.includes(monthData.month);
                                    const isCurrent = monthData.month === currentMonth;

                                    return (
                                        <div
                                            key={monthData.month}
                                            className={`p-3 rounded-md transition-colors ${monthData.allPaid
                                                ? 'bg-green-500/10'
                                                : isSelected
                                                    ? 'bg-primary/10'
                                                    : 'hover:bg-muted/50'
                                                }`}
                                        >
                                            <div className="flex items-center justify-between mb-2">
                                                <div className="flex items-center gap-3">
                                                    {monthData.allPaid ? (
                                                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                                                    ) : (
                                                        <Checkbox
                                                            checked={isSelected}
                                                            onCheckedChange={() => toggleMonth(monthData.month)}
                                                        />
                                                    )}
                                                    <span className={monthData.allPaid ? 'text-muted-foreground line-through' : 'font-medium'}>
                                                        {formatMonth(monthData.month)}
                                                    </span>
                                                    {isCurrent && !monthData.allPaid && (
                                                        <Badge variant="secondary" className="text-xs">Current</Badge>
                                                    )}
                                                </div>
                                                <div className="text-right">
                                                    {monthData.allPaid ? (
                                                        <Badge variant="secondary" className="bg-green-500/20 text-green-500 text-xs">
                                                            Paid
                                                        </Badge>
                                                    ) : (
                                                        <span className="font-semibold">
                                                            {monthData.currency} {monthData.totalAmount.toLocaleString()}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            {/* Show credit breakdown */}
                                            <div className="ml-7 space-y-1">
                                                {monthData.credits.map(credit => (
                                                    <div
                                                        key={credit.id}
                                                        className={`text-xs flex justify-between ${credit.isPaid ? 'text-muted-foreground line-through' : 'text-muted-foreground'}`}
                                                    >
                                                        <span>{credit.name}</span>
                                                        <span>{credit.currency} {credit.amount.toLocaleString()}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </ScrollArea>
                    </div>

                    {/* Insufficient Balance Warning */}
                    {hasInsufficientBalance && selectedMonths.length > 0 && !skipPayment && (
                        <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                            <AlertCircle className="h-4 w-4 flex-shrink-0" />
                            <span>
                                Insufficient balance. Need {primaryCurrency} {selectedPaymentDetails.total.toLocaleString()}
                                {' '}but only have {primaryCurrency} {totalAccountBalance.toLocaleString()}
                            </span>
                        </div>
                    )}

                    {/* Skip Payment Toggle */}
                    {selectedMonths.length > 0 && (
                        <div className="flex items-center space-x-2 p-3 rounded-lg bg-muted/50">
                            <Checkbox
                                id="skipPayment"
                                checked={skipPayment}
                                onCheckedChange={(checked) => setSkipPayment(!!checked)}
                            />
                            <div className="grid gap-1.5 leading-none">
                                <Label htmlFor="skipPayment" className="font-medium cursor-pointer">
                                    Mark as paid (skip payment)
                                </Label>
                                <p className="text-xs text-muted-foreground">
                                    Mark months as paid without deducting money from accounts
                                </p>
                            </div>
                        </div>
                    )}
                </div>

                <SheetFooter className="border-t pt-4">
                    <div className="w-full space-y-3">
                        {/* Total */}
                        {selectedMonths.length > 0 && (
                            <div className="flex justify-between items-center text-lg font-semibold">
                                <span>Total ({selectedMonths.length} month{selectedMonths.length > 1 ? 's' : ''})</span>
                                <span>{primaryCurrency} {selectedPaymentDetails.total.toLocaleString()}</span>
                            </div>
                        )}

                        <Button
                            className="w-full"
                            disabled={
                                selectedMonths.length === 0 ||
                                (hasInsufficientBalance && !skipPayment) ||
                                isProcessing
                            }
                            onClick={handleSubmit}
                        >
                            {isProcessing
                                ? 'Processing...'
                                : selectedMonths.length === 0
                                    ? 'Select months to pay'
                                    : skipPayment
                                        ? `Mark ${selectedMonths.length} month(s) as paid`
                                        : `Pay ${primaryCurrency} ${selectedPaymentDetails.total.toLocaleString()}`
                            }
                        </Button>
                    </div>
                </SheetFooter>
            </SheetContent>
        </Sheet>
    );
}
