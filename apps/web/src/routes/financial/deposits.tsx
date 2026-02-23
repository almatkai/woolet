import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, PiggyBank, Trash2, Edit, DollarSign, Calendar, Percent, TrendingUp, Building } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/PageHeader';
import { AddDepositSheet } from '@/components/AddDepositSheet';
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

interface Deposit {
    id: string;
    bankName: string;
    depositName: string;
    principalAmount: string;
    currentBalance: string;
    interestRate: string;
    compoundingFrequency: string;
    currency: string;
    startDate: string;
    maturityDate: string | null;
    isFlexible: boolean;
    status: string;
}

export default function DepositsPage() {
    const [showAddDeposit, setShowAddDeposit] = useState(false);
    const [editingDeposit, setEditingDeposit] = useState<Deposit | null>(null);
    const [deletingDeposit, setDeletingDeposit] = useState<Deposit | null>(null);

    const { data: deposits, isLoading } = trpc.deposit.list.useQuery();
    const utils = trpc.useUtils();

    const deleteDeposit = trpc.deposit.delete.useMutation({
        onSuccess: () => {
            utils.deposit.list.invalidate();
            toast.success('Deposit deleted');
            setDeletingDeposit(null);
        },
        onError: () => toast.error('Failed to delete deposit'),
    });

    const totalPrincipal = deposits?.reduce((sum: number, d: any) => sum + Number(d.principalAmount), 0) || 0;
    const totalCurrent = deposits?.reduce((sum: number, d: any) => sum + Number(d.currentBalance), 0) || 0;
    const totalInterestEarned = totalCurrent - totalPrincipal;

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'active': return <Badge variant="default" className="bg-green-500/20 text-green-500">Active</Badge>;
            case 'matured': return <Badge variant="secondary">Matured</Badge>;
            case 'withdrawn': return <Badge variant="outline">Withdrawn</Badge>;
            default: return <Badge variant="outline">{status}</Badge>;
        }
    };

    const getCompoundingLabel = (freq: string) => {
        const labels: Record<string, string> = {
            'daily': 'Daily',
            'monthly': 'Monthly',
            'quarterly': 'Quarterly',
            'annually': 'Annually',
        };
        return labels[freq] || freq;
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
                title="Deposits"
                subtitle="Manage your savings and deposits"
                variant="one"
            >
                <Button onClick={() => setShowAddDeposit(true)} className="gap-2">
                    <Plus className="h-4 w-4" />
                    Add Deposit
                </Button>
            </PageHeader>

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
                        <CardDescription>Current Balance</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-green-500">
                            {totalCurrent.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>Interest Earned</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-blue-500">
                            +{totalInterestEarned.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Deposits List */}
            {(!deposits || deposits.length === 0) ? (
                <Card className="border-dashed">
                    <CardContent className="flex flex-col items-center justify-center py-12">
                        <PiggyBank className="h-12 w-12 text-muted-foreground mb-4" />
                        <h3 className="text-lg font-semibold">No deposits yet</h3>
                        <p className="text-muted-foreground mb-4">Add your first deposit to track interest growth</p>
                        <Button onClick={() => setShowAddDeposit(true)}>
                            <Plus className="h-4 w-4 mr-2" />
                            Add Deposit
                        </Button>
                    </CardContent>
                </Card>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {deposits.map((deposit: Deposit) => {
                        const interestEarned = Number(deposit.currentBalance) - Number(deposit.principalAmount);
                        return (
                            <Card key={deposit.id}>
                                <CardHeader className="pb-2">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <CardTitle className="text-lg flex items-center gap-2">
                                                <PiggyBank className="h-4 w-4" />
                                                {deposit.depositName}
                                            </CardTitle>
                                            <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                                                <Building className="h-3 w-3" />
                                                {deposit.bankName}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {getStatusBadge(deposit.status)}
                                            {deposit.isFlexible && (
                                                <Badge variant="outline" className="text-xs">Flexible</Badge>
                                            )}
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => setEditingDeposit(deposit)}
                                            >
                                                <Edit className="h-4 w-4" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => setDeletingDeposit(deposit)}
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
                                                {deposit.currency} {Number(deposit.principalAmount).toLocaleString()}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Percent className="h-4 w-4 text-muted-foreground" />
                                            <span className="text-muted-foreground">Rate:</span>
                                            <span className="font-medium">{deposit.interestRate}%</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <DollarSign className="h-4 w-4 text-green-500" />
                                            <span className="text-muted-foreground">Current:</span>
                                            <span className="font-medium text-green-500">
                                                {deposit.currency} {Number(deposit.currentBalance).toLocaleString()}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <TrendingUp className="h-4 w-4 text-blue-500" />
                                            <span className="text-muted-foreground">Earned:</span>
                                            <span className="font-medium text-blue-500">
                                                +{deposit.currency} {interestEarned.toLocaleString()}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                        {getCompoundingLabel(deposit.compoundingFrequency)} compounding
                                        {deposit.maturityDate && ` • Matures: ${new Date(deposit.maturityDate).toLocaleDateString()}`}
                                    </div>
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
            )}

            <AddDepositSheet
                open={showAddDeposit || !!editingDeposit}
                onOpenChange={(open) => {
                    if (!open) {
                        setShowAddDeposit(false);
                        setEditingDeposit(null);
                    }
                }}
                editingDeposit={editingDeposit}
            />

            {/* Delete Confirmation Dialog */}
            <AlertDialog open={!!deletingDeposit} onOpenChange={(open) => !open && setDeletingDeposit(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Deposit</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to delete "{deletingDeposit?.depositName}"? This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => setDeletingDeposit(null)}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => deletingDeposit && deleteDeposit.mutate({ id: deletingDeposit.id })}
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
