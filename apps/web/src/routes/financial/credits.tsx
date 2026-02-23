import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, CreditCard, Trash2, Edit, DollarSign, Calendar, Percent, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/PageHeader';
import { AddCreditSheet } from '@/components/AddCreditSheet';
import { CreditPaymentSheet } from '@/components/CreditPaymentSheet';
import { CompoundCreditPaymentSheet } from '@/components/CompoundCreditPaymentSheet';
import { CurrencyDisplay } from '@/components/CurrencyDisplay';

interface Credit {
    id: string;
    name: string;
    principalAmount: string;
    interestRate: string;
    monthlyPayment: string;
    remainingBalance: string;
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

export default function CreditsPage() {
    const [showAddCredit, setShowAddCredit] = useState(false);
    const [editingCredit, setEditingCredit] = useState<Credit | null>(null);
    const [payingCredit, setPayingCredit] = useState<Credit | null>(null);
    const [showCompoundPayment, setShowCompoundPayment] = useState(false);

    const { data: credits, isLoading } = trpc.credit.list.useQuery();
    const utils = trpc.useUtils();

    const deleteCredit = trpc.credit.delete.useMutation({
        onSuccess: () => {
            utils.credit.list.invalidate();
            toast.success('Credit deleted');
        },
        onError: () => toast.error('Failed to delete credit'),
    });

    const totalPrincipal = credits?.reduce((sum: number, c: Credit) => sum + Number(c.principalAmount), 0) || 0;
    const totalRemaining = credits?.reduce((sum: number, c: Credit) => sum + Number(c.remainingBalance), 0) || 0;
    const totalMonthly = credits?.reduce((sum: number, c: Credit) => sum + Number(c.monthlyPayment), 0) || 0;
    const primaryCurrency = credits?.[0]?.currency || 'KZT';

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'active': return <Badge variant="default">Active</Badge>;
            case 'paid_off': return <Badge variant="secondary" className="bg-green-500/20 text-green-500">Paid Off</Badge>;
            case 'defaulted': return <Badge variant="destructive">Defaulted</Badge>;
            default: return <Badge variant="outline">{status}</Badge>;
        }
    };

    const getPayoffPercentage = (credit: Credit) => {
        const principal = Number(credit.principalAmount);
        const remaining = Number(credit.remainingBalance);
        return Math.round(((principal - remaining) / principal) * 100);
    };

    if (isLoading) {
        return (
            <div className="space-y-6">
                <div className="h-8 w-48 bg-muted animate-pulse rounded" />
                <div className="grid grid-cols-3 gap-2 md:gap-4">
                    <div className="h-24 md:h-28 bg-muted animate-pulse rounded-lg" />
                    <div className="h-24 md:h-28 bg-muted animate-pulse rounded-lg" />
                    <div className="h-24 md:h-28 bg-muted animate-pulse rounded-lg" />
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <PageHeader
                title="Credits"
                subtitle="Manage your credit cards and loans"
                variant="two-with-text"
            >
                {credits && credits.filter((c: Credit) => c.status === 'active').length > 0 && (
                    <Button variant="secondary" onClick={() => setShowCompoundPayment(true)} className="gap-2 flex-1 sm:flex-none">
                        <Wallet className="h-4 w-4" />
                        Pay All Credits
                    </Button>
                )}
                <Button onClick={() => setShowAddCredit(true)} className="gap-2 flex-1 sm:flex-none">
                    <Plus className="h-4 w-4" />
                    Add Credit
                </Button>
            </PageHeader>

            {/* Summary Cards */}
            <div className="grid grid-cols-10 gap-2 md:grid-cols-3 md:gap-4">
                <Card className="col-span-3 md:col-span-1">
                    <CardHeader className="pb-1 px-3 md:px-6 pt-3 md:pt-6">
                        <CardDescription className="text-xs md:text-sm whitespace-nowrap">Total Principal</CardDescription>
                    </CardHeader>
                    <CardContent className="px-3 md:px-6 pb-3 md:pb-6">
                        <div className="text-base md:text-2xl font-bold truncate">
                            <CurrencyDisplay amount={totalPrincipal} currency={primaryCurrency} abbreviate={false} />
                        </div>
                    </CardContent>
                </Card>
                <Card className="col-span-3 md:col-span-1">
                    <CardHeader className="pb-1 px-3 md:px-6 pt-3 md:pt-6">
                        <CardDescription className="text-xs md:text-sm whitespace-nowrap">Total Remaining</CardDescription>
                    </CardHeader>
                    <CardContent className="px-3 md:px-6 pb-3 md:pb-6">
                        <div className="text-base md:text-2xl font-bold text-red-500 truncate">
                            <CurrencyDisplay amount={totalRemaining} currency={primaryCurrency} abbreviate={false} />
                        </div>
                    </CardContent>
                </Card>
                <Card className="col-span-4 md:col-span-1">
                    <CardHeader className="pb-1 px-3 md:px-6 pt-3 md:pt-6">
                        <CardDescription className="text-xs md:text-sm whitespace-nowrap">Monthly Payments</CardDescription>
                    </CardHeader>
                    <CardContent className="px-3 md:px-6 pb-3 md:pb-6">
                        <div className="text-base md:text-2xl font-bold truncate">
                            <CurrencyDisplay amount={totalMonthly} currency={primaryCurrency} abbreviate={false} />
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Credits List */}
            {(!credits || credits.length === 0) ? (
                <Card className="border-dashed">
                    <CardContent className="flex flex-col items-center justify-center py-12">
                        <CreditCard className="h-12 w-12 text-muted-foreground mb-4" />
                        <h3 className="text-lg font-semibold">No credits yet</h3>
                        <p className="text-muted-foreground mb-4">Add your first loan or credit line to track payments</p>
                        <Button onClick={() => setShowAddCredit(true)}>
                            <Plus className="h-4 w-4 mr-2" />
                            Add Credit
                        </Button>
                    </CardContent>
                </Card>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {credits.map((credit: Credit) => (
                        <Card key={credit.id} className="relative overflow-hidden">
                            <div
                                className="absolute bottom-0 left-0 h-1 bg-primary transition-all"
                                style={{ width: `${getPayoffPercentage(credit)}%` }}
                            />
                            <CardHeader className="pb-2">
                                <div className="flex items-center justify-between gap-2">
                                    <CardTitle className="text-lg truncate">{credit.name}</CardTitle>
                                    <div className="flex items-center gap-2 flex-shrink-0">
                                        {getStatusBadge(credit.status)}
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => setEditingCredit(credit)}
                                        >
                                            <Edit className="h-4 w-4" />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => deleteCredit.mutate({ id: credit.id })}
                                        >
                                            <Trash2 className="h-4 w-4 text-destructive" />
                                        </Button>
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4 text-sm">
                                    <div className="flex items-center gap-1 sm:gap-2" title="Principal">
                                        <DollarSign className="h-4 w-4 text-muted-foreground" />
                                        <span className="text-muted-foreground hidden sm:inline">Principal:</span>
                                        <span className="font-medium text-xs sm:text-sm">
                                            {Number(credit.principalAmount).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-1 sm:gap-2" title="Interest Rate">
                                        <Percent className="h-4 w-4 text-muted-foreground" />
                                        <span className="text-muted-foreground hidden sm:inline">Rate:</span>
                                        <span className="font-medium text-xs sm:text-sm">{credit.interestRate}%</span>
                                    </div>
                                    <div className="flex items-center gap-1 sm:gap-2" title="Monthly Payment">
                                        <Calendar className="h-4 w-4 text-muted-foreground" />
                                        <span className="text-muted-foreground hidden sm:inline">Monthly:</span>
                                        <span className="font-medium text-xs sm:text-sm">
                                            {Number(credit.monthlyPayment).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-1 sm:gap-2" title="Remaining">
                                        <DollarSign className="h-4 w-4 text-red-500" />
                                        <span className="text-muted-foreground hidden sm:inline">Remaining:</span>
                                        <span className="font-medium text-xs sm:text-sm text-red-500">
                                            {Number(credit.remainingBalance).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                        </span>
                                    </div>
                                </div>
                                <div className="text-xs text-muted-foreground">
                                    {getPayoffPercentage(credit)}% paid
                                    <span className="hidden sm:inline"> off • Ends: {new Date(credit.endDate).toLocaleDateString()}</span>
                                </div>

                                {/* Make Payment Button */}
                                {credit.status === 'active' && (
                                    <Button
                                        variant="secondary"
                                        className="w-full mt-2"
                                        onClick={() => setPayingCredit(credit)}
                                    >
                                        <Wallet className="h-4 w-4 mr-2" />
                                        Make Payment
                                    </Button>
                                )}
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            <AddCreditSheet
                open={showAddCredit || !!editingCredit}
                onOpenChange={(open) => {
                    if (!open) {
                        setShowAddCredit(false);
                        setEditingCredit(null);
                    }
                }}
                editingCredit={editingCredit}
            />

            <CreditPaymentSheet
                open={!!payingCredit}
                onOpenChange={(open) => {
                    if (!open) {
                        setPayingCredit(null);
                    }
                }}
                credit={payingCredit}
            />

            <CompoundCreditPaymentSheet
                open={showCompoundPayment}
                onOpenChange={setShowCompoundPayment}
                credits={credits || []}
            />
        </div>
    );
}


