
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
    SheetFooter,
    SheetClose
} from '@/components/ui/sheet';
import { DeleteConfirm } from './DeleteConfirm';

const transactionSchema = z.object({
    date: z.string(),
    quantity: z.number().positive('Quantity must be positive'),
    pricePerShare: z.number().positive('Price must be positive'),
    notes: z.string().optional(),
});

type TransactionFormData = z.infer<typeof transactionSchema>;

interface EditInvestmentTransactionSheetProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    transaction: any; // Using any for now, ideally strictly typed but simpler for this specific edit
}

export function EditInvestmentTransactionSheet({ open, onOpenChange, transaction }: EditInvestmentTransactionSheetProps) {
    const utils = trpc.useUtils();

    const { register, handleSubmit, reset, setValue, formState: { errors } } = useForm<TransactionFormData>({
        resolver: zodResolver(transactionSchema),
    });

    useEffect(() => {
        if (transaction) {
            reset({
                date: transaction.date,
                quantity: Number(transaction.quantity),
                pricePerShare: Number(transaction.pricePerShare),
                notes: transaction.notes || '',
            });
        }
    }, [transaction, reset]);

    const updateTransaction = trpc.investing.updateTransaction.useMutation({
        onSuccess: () => {
            utils.investing.getTransactions.invalidate();
            utils.investing.getPortfolioSummary.invalidate();
            utils.investing.listStocks.invalidate();
            toast.success('Transaction updated successfully');
            onOpenChange(false);
        },
        onError: (error: any) => {
            toast.error(error.message || 'Failed to update transaction');
        }
    });

    const deleteTransaction = trpc.investing.deleteTransaction.useMutation({
        onSuccess: () => {
            utils.investing.getTransactions.invalidate();
            utils.investing.getPortfolioSummary.invalidate();
            utils.investing.listStocks.invalidate();
            toast.success('Transaction deleted');
            onOpenChange(false);
        },
        onError: (error: any) => {
            toast.error(error.message || 'Failed to delete transaction');
        }
    });

    const onSubmit = (data: TransactionFormData) => {
        if (!transaction) return;
        updateTransaction.mutate({
            id: transaction.id,
            ...data
        });
    };

    if (!transaction) return null;

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent className="sm:max-w-[480px]">
                <SheetHeader>
                    <SheetTitle>Edit Transaction</SheetTitle>
                    <SheetDescription>
                        Update details for this {transaction.type} transaction.
                    </SheetDescription>
                </SheetHeader>

                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-6">
                    {/* Stock Info (Read only) */}
                    <div className="p-3 bg-muted rounded-lg space-y-1">
                        <div className="flex justify-between">
                            <span className="font-semibold text-sm">Asset</span>
                            <span className="text-sm">{transaction.stock.ticker}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="font-semibold text-sm">Type</span>
                            <span className={`text-sm uppercase font-bold ${transaction.type === 'buy' ? 'text-green-500' : 'text-red-500'}`}>
                                {transaction.type}
                            </span>
                        </div>
                    </div>

                    {/* Date */}
                    <div className="space-y-2">
                        <Label htmlFor="date">Date</Label>
                        <Input
                            id="date"
                            type="date"
                            {...register('date')}
                        />
                        {errors.date && <p className="text-sm text-red-500">{errors.date.message}</p>}
                    </div>

                    {/* Quantity */}
                    <div className="space-y-2">
                        <Label htmlFor="quantity">Quantity</Label>
                        <Input
                            id="quantity"
                            type="number"
                            step="0.0001"
                            {...register('quantity', { valueAsNumber: true })}
                        />
                        {errors.quantity && <p className="text-sm text-red-500">{errors.quantity.message}</p>}
                    </div>

                    {/* Price */}
                    <div className="space-y-2">
                        <Label htmlFor="pricePerShare">Price per Share</Label>
                        <Input
                            id="pricePerShare"
                            type="number"
                            step="0.0001"
                            {...register('pricePerShare', { valueAsNumber: true })}
                        />
                        {errors.pricePerShare && <p className="text-sm text-red-500">{errors.pricePerShare.message}</p>}
                    </div>

                    {/* Notes */}
                    <div className="space-y-2">
                        <Label htmlFor="notes">Notes</Label>
                        <Input
                            id="notes"
                            placeholder="Optional notes..."
                            {...register('notes')}
                        />
                    </div>

                    <SheetFooter className="gap-2 pt-4 sm:space-x-0 flex-col sm:flex-row">
                        <div className="flex-1">
                            <DeleteConfirm
                                title="Delete Transaction?"
                                description="This will remove this transaction and recalculate your portfolio holdings. This cannot be undone."
                                onConfirm={() => deleteTransaction.mutate({ id: transaction.id })}
                                trigger={
                                    <Button
                                        variant="destructive"
                                        type="button"
                                        disabled={deleteTransaction.isPending}
                                    >
                                        Delete
                                    </Button>
                                }
                            />
                        </div>
                        <div className="flex gap-2">
                            <SheetClose asChild>
                                <Button variant="outline" type="button">Cancel</Button>
                            </SheetClose>
                            <Button
                                type="submit"
                                disabled={updateTransaction.isPending}
                            >
                                {updateTransaction.isPending ? 'Saving...' : 'Save Changes'}
                            </Button>
                        </div>
                    </SheetFooter>
                </form>
            </SheetContent>
        </Sheet>
    );
}
