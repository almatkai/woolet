import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, Home, Trash2, Edit, DollarSign, Calendar, Percent, MapPin, Wallet, Check, X } from 'lucide-react';
import { toast } from 'sonner';
import { AddMortgageSheet } from '@/components/AddMortgageSheet';
import { MortgagePaymentSheet } from '@/components/MortgagePaymentSheet';
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

export default function MortgagesPage() {
    const [showAddMortgage, setShowAddMortgage] = useState(false);
    const [editingMortgage, setEditingMortgage] = useState<Mortgage | null>(null);
    const [payingMortgage, setPayingMortgage] = useState<Mortgage | null>(null);
    const [deletingMortgage, setDeletingMortgage] = useState<Mortgage | null>(null);

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

    // Get current month for payment status
    const currentMonth = new Date().toISOString().slice(0, 7);

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'active': return <Badge variant="default">Active</Badge>;
            case 'paid_off': return <Badge variant="secondary" className="bg-green-500/20 text-green-500">Paid Off</Badge>;
            case 'defaulted': return <Badge variant="destructive">Defaulted</Badge>;
            default: return <Badge variant="outline">{status}</Badge>;
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
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold">Mortgages</h1>
                    <p className="text-muted-foreground">Track your property loans</p>
                </div>
                <Button onClick={() => setShowAddMortgage(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Mortgage
                </Button>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>Total Principal</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {totalPrincipal.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>Total Remaining</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-orange-500">
                            {totalRemaining.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>Monthly Payments</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {totalMonthly.toLocaleString('en-US', { minimumFractionDigits: 2 })}
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
                        const isPaidThisMonth = mortgage.payments?.some((p: any) => p.monthYear === currentMonth);
                        return (
                        <Card key={mortgage.id} className="relative overflow-hidden">
                            <div
                                className="absolute bottom-0 left-0 h-1 bg-orange-500 transition-all"
                                style={{ width: `${getPayoffPercentage(mortgage)}%` }}
                            />
                            <CardHeader className="pb-2">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <CardTitle className="text-lg flex items-center gap-2">
                                            <Home className="h-4 w-4" />
                                            {mortgage.propertyName}
                                        </CardTitle>
                                        {mortgage.propertyAddress && (
                                            <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                                                <MapPin className="h-3 w-3" />
                                                {mortgage.propertyAddress}
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Badge variant={isPaidThisMonth ? "default" : "destructive"} className="flex items-center gap-1">
                                            {isPaidThisMonth ? (
                                                <><Check className="h-3 w-3" /> Paid</>
                                            ) : (
                                                <><X className="h-3 w-3" /> Unpaid</>
                                            )}
                                        </Badge>
                                        {getStatusBadge(mortgage.status)}
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => setEditingMortgage(mortgage)}
                                        >
                                            <Edit className="h-4 w-4" />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => setDeletingMortgage(mortgage)}
                                        >
                                            <Trash2 className="h-4 w-4 text-destructive" />
                                        </Button>
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                <div className="grid grid-cols-2 gap-4 text-sm">
                                    <div className="flex items-center gap-2">
                                        <DollarSign className="h-4 w-4 text-muted-foreground" />
                                        <span className="text-muted-foreground">Principal:</span>
                                        <span className="font-medium">
                                            {mortgage.currency} {Number(mortgage.principalAmount).toLocaleString()}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Percent className="h-4 w-4 text-muted-foreground" />
                                        <span className="text-muted-foreground">Rate:</span>
                                        <span className="font-medium">{mortgage.interestRate}%</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Calendar className="h-4 w-4 text-muted-foreground" />
                                        <span className="text-muted-foreground">Monthly:</span>
                                        <span className="font-medium">
                                            {mortgage.currency} {Number(mortgage.monthlyPayment).toLocaleString()}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <DollarSign className="h-4 w-4 text-orange-500" />
                                        <span className="text-muted-foreground">Remaining:</span>
                                        <span className="font-medium text-orange-500">
                                            {mortgage.currency} {Number(mortgage.remainingBalance).toLocaleString()}
                                        </span>
                                    </div>
                                </div>
                                <div className="text-xs text-muted-foreground">
                                    {getPayoffPercentage(mortgage)}% paid off • {mortgage.termYears} year term
                                    {mortgage.paymentDay && ` • Due on day ${mortgage.paymentDay}`}
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
