import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, Home, Trash2, Edit, DollarSign, Percent, MapPin, Wallet, CheckCircle2, Circle, Calendar } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { PageHeader } from '@/components/PageHeader';
import { ActionButton } from '@/components/ui/action-button';
import { AddMortgageSheet } from '@/components/AddMortgageSheet';
import { MortgagePaymentSheet } from '@/components/MortgagePaymentSheet';
import { CurrencyDisplay } from '@/components/CurrencyDisplay';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface Mortgage {
    id: string;
    accountId: string;
    propertyName: string;
    propertyAddress: string | null;
    principalAmount: string;
    interestRate: string;
    monthlyPayment: string;
    remainingBalance: string;
    currency: string;
    startDate: string;
    endDate: string | null;
    termYears: number;
    paymentDay: number | null;
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

import { getPaymentStatusOptions, getTargetMonthStr, isPaidForTargetMonth } from "@/lib/payment-status";

export default function MortgagesPage() {
    const [showAddMortgage, setShowAddMortgage] = useState(false);
    const [editingMortgage, setEditingMortgage] = useState<Mortgage | null>(null);
    const [payingMortgage, setPayingMortgage] = useState<Mortgage | null>(null);
    const [deletingMortgage, setDeletingMortgage] = useState<Mortgage | null>(null);

    const { data: settings } = trpc.settings.getUserSettings.useQuery();
    const { data: mortgages, isLoading } = trpc.mortgage.list.useQuery();
    const utils = trpc.useUtils();

    const deleteMortgage = trpc.mortgage.delete.useMutation({
        onSuccess: () => {
            utils.mortgage.list.invalidate();
            toast.success('Mortgage deleted');
            setDeletingMortgage(null);
        },
        onError: () => toast.error('Failed to delete mortgage'),
    });

    const totalPrincipal = mortgages?.reduce((sum: number, m: any) => sum + Number(m.principalAmount), 0) || 0;
    const totalRemaining = mortgages?.reduce((sum: number, m: any) => sum + Number(m.remainingBalance), 0) || 0;
    const totalMonthly = mortgages?.reduce((sum: number, m: any) => sum + Number(m.monthlyPayment), 0) || 0;

    const primaryCurrency = mortgages?.[0]?.currency || 'KZT';

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'active': return <Badge variant="default" className="h-5 text-[9px] uppercase tracking-wider font-bold">Active</Badge>;
            case 'paid_off': return <Badge variant="secondary" className="h-5 text-[9px] uppercase tracking-wider font-bold bg-green-500/20 text-green-500">Paid Off</Badge>;
            case 'defaulted': return <Badge variant="destructive" className="h-5 text-[9px] uppercase tracking-wider font-bold">Defaulted</Badge>;
            default: return <Badge variant="outline" className="h-5 text-[9px] uppercase tracking-wider font-bold">{status}</Badge>;
        }
    };

    const getPayoffPercentage = (mortgage: Mortgage) => {
        const principal = Number(mortgage.principalAmount);
        const remaining = Number(mortgage.remainingBalance);
        return Math.round(((principal - remaining) / principal) * 100);
    };

    if (isLoading) {
        return (
            <div className="space-y-6">
                <div className="h-8 w-48 bg-muted animate-pulse rounded" />
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {[1, 2, 3].map(i => <div key={i} className="h-32 bg-muted animate-pulse rounded-lg" />)}
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <PageHeader
                title="Mortgages"
                subtitle="Manage your properties and loans"
                variant="one"
            >
                <ActionButton onClick={() => setShowAddMortgage(true)} className="sm:flex-none">
                    <Plus className="h-4 w-4" />
                    Add
                </ActionButton>
            </PageHeader>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card>
                    <CardHeader className="pb-1 px-4 pt-4">
                        <CardDescription className="text-xs">Total Principal</CardDescription>
                    </CardHeader>
                    <CardContent className="px-4 pb-4">
                        <div className="text-xl font-bold">
                            <CurrencyDisplay amount={totalPrincipal} currency={primaryCurrency} abbreviate={false} />
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-1 px-4 pt-4">
                        <CardDescription className="text-xs">Total Remaining</CardDescription>
                    </CardHeader>
                    <CardContent className="px-4 pb-4">
                        <div className="text-xl font-bold text-orange-500">
                            <CurrencyDisplay amount={totalRemaining} currency={primaryCurrency} abbreviate={false} />
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-1 px-4 pt-4">
                        <CardDescription className="text-xs">Monthly Payments</CardDescription>
                    </CardHeader>
                    <CardContent className="px-4 pb-4">
                        <div className="text-xl font-bold">
                            <CurrencyDisplay amount={totalMonthly} currency={primaryCurrency} abbreviate={false} />
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Mortgages List */}
            {(!mortgages || mortgages.length === 0) ? (
                <Card className="border-dashed">
                    <CardContent className="flex flex-col items-center justify-center py-12">
                        <Home className="h-12 w-12 text-muted-foreground mb-4" />
                        <h3 className="text-lg font-semibold">No mortgages yet</h3>
                        <p className="text-muted-foreground mb-4">Add your first mortgage to track payments</p>
                        <Button onClick={() => setShowAddMortgage(true)}>
                            <Plus className="h-4 w-4 mr-2" />
                            Add Mortgage
                        </Button>
                    </CardContent>
                </Card>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {mortgages.map((mortgage: Mortgage) => {
                        const { logic, period } = getPaymentStatusOptions(settings, 'mortgage');
                        
                        const targetMonthStr = getTargetMonthStr(mortgage.paymentDay, { logic, period });
                        const isPaidThisMonth = isPaidForTargetMonth(mortgage.payments, targetMonthStr, true);
                        
                        return (
                        <Card key={mortgage.id} className="relative overflow-hidden">
                            <div
                                className="absolute bottom-0 left-0 h-1 bg-orange-500 transition-all"
                                style={{ width: `${getPayoffPercentage(mortgage)}%` }}
                            />
                            <CardHeader className="pb-2 px-4 pt-4">
                                    <div className="flex flex-row sm:flex-row items-start justify-between gap-3 overflow-hidden">
                                        <div className="min-w-0 flex-1">
                                            <CardTitle className="text-sm font-bold flex items-start gap-2 whitespace-normal break-words leading-tight">
                                                <Home className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                                                {mortgage.propertyName}
                                            </CardTitle>
                                            {mortgage.propertyAddress && (
                                                <div className="flex items-start gap-1 text-[10px] text-muted-foreground mt-0.5 whitespace-normal break-words leading-tight">
                                                    <MapPin className="h-2.5 w-2.5 mt-0.5 flex-shrink-0" />
                                                    {mortgage.propertyAddress}
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex flex-col gap-1.5 flex-shrink-0 items-end">
                                            {/* Row 1: Status & Edit */}
                                            <div className="flex items-center gap-1.5">
                                                {getStatusBadge(mortgage.status)}
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-7 w-7 hover:bg-muted"
                                                    onClick={() => setEditingMortgage(mortgage)}
                                                >
                                                    <Edit className="h-3.5 w-3.5" />
                                                </Button>
                                            </div>
                                            {/* Row 2: Paid/Unpaid & Trash */}
                                            <div className="flex items-center gap-1.5">
                                                <Badge 
                                                    variant={isPaidThisMonth ? "secondary" : "destructive"} 
                                                    className={cn(
                                                        "h-5 px-1.5 text-[9px] uppercase tracking-wider font-bold flex items-center gap-0.5",
                                                        isPaidThisMonth ? "bg-green-500/10 text-green-500 border-green-500/20" : ""
                                                    )}
                                                >
                                                    {isPaidThisMonth ? (
                                                        <><CheckCircle2 className="h-2.5 w-2.5" /> Paid</>
                                                    ) : (
                                                        <><Circle className="h-2.5 w-2.5" /> Unpaid</>
                                                    )}
                                                </Badge>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-7 w-7 hover:bg-destructive/10"
                                                    onClick={() => setDeletingMortgage(mortgage)}
                                                >
                                                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                            </CardHeader>
                            <CardContent className="space-y-3 px-4 pb-4">
                                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                                    <div className="flex items-center gap-2">
                                        <DollarSign className="h-3 w-3 text-muted-foreground" />
                                        <span className="text-muted-foreground">Principal:</span>
                                        <span className="font-medium">
                                            <CurrencyDisplay amount={mortgage.principalAmount} currency={mortgage.currency} abbreviate={false} />
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Percent className="h-3 w-3 text-muted-foreground" />
                                        <span className="text-muted-foreground">Rate:</span>
                                        <span className="font-medium">{mortgage.interestRate}%</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Calendar className="h-3 w-3 text-muted-foreground" />
                                        <span className="text-muted-foreground">Monthly:</span>
                                        <span className="font-medium">
                                            <CurrencyDisplay amount={mortgage.monthlyPayment} currency={mortgage.currency} abbreviate={false} />
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <DollarSign className="h-3 w-3 text-orange-500" />
                                        <span className="text-muted-foreground">Rem:</span>
                                        <span className="font-medium text-orange-500">
                                            <CurrencyDisplay amount={mortgage.remainingBalance} currency={mortgage.currency} abbreviate={false} />
                                        </span>
                                    </div>
                                </div>
                                <div className="text-[10px] text-muted-foreground pt-1 border-t border-dashed">
                                    {getPayoffPercentage(mortgage)}% paid • {mortgage.termYears}y term
                                    {mortgage.paymentDay && ` • Day ${mortgage.paymentDay}`}
                                </div>

                                {/* Make Payment Button */}
                                {mortgage.status === 'active' && (
                                    <Button
                                        variant="secondary"
                                        className="w-full mt-2"
                                        onClick={() => setPayingMortgage(mortgage)}
                                    >
                                        <Wallet className="h-4 w-4 mr-2" />
                                        Make Payment
                                    </Button>
                                )}
                            </CardContent>
                        </Card>
                    )})}
                </div>
            )}

            <AddMortgageSheet
                open={showAddMortgage || !!editingMortgage}
                onOpenChange={(open) => {
                    if (!open) {
                        setShowAddMortgage(false);
                        setEditingMortgage(null);
                    }
                }}
                editingMortgage={editingMortgage}
            />

            <MortgagePaymentSheet
                open={!!payingMortgage}
                onOpenChange={(open) => {
                    if (!open) {
                        setPayingMortgage(null);
                    }
                }}
                mortgage={payingMortgage}
            />

            {/* Delete Confirmation Dialog */}
            <AlertDialog open={!!deletingMortgage} onOpenChange={(open) => !open && setDeletingMortgage(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Mortgage</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to delete "{deletingMortgage?.propertyName}"? This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => setDeletingMortgage(null)}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => deletingMortgage && deleteMortgage.mutate({ id: deletingMortgage.id })}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
