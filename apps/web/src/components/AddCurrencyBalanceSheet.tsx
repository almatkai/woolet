
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus } from 'lucide-react';
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
    SheetTrigger,
    SheetFooter,
    SheetClose
} from '@/components/ui/sheet';
import { CurrencySelect } from './CurrencySelect';

const addCurrencySchema = z.object({
    currencyCode: z.string().length(3),
    initialBalance: z.number(),
});

type AddCurrencyForm = z.infer<typeof addCurrencySchema>;

interface AddCurrencyBalanceSheetProps {
    accountId: string;
    accountName: string;
}

export function AddCurrencyBalanceSheet({ accountId, accountName }: AddCurrencyBalanceSheetProps) {
    const [open, setOpen] = useState(false);
    const utils = trpc.useUtils();

    const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<AddCurrencyForm>({
        resolver: zodResolver(addCurrencySchema),
        defaultValues: {
            currencyCode: 'USD',
            initialBalance: 0
        }
    });

    const addCurrency = trpc.account.addCurrency.useMutation({
        onSuccess: () => {
            utils.bank.getHierarchy.invalidate();
            setOpen(false);
            reset();
            toast.success('Currency balance added');
        },
        onError: (error: unknown) => {
            console.error("Failed to add currency:", error);
            toast.error('Failed to add currency');
        }
    });

    const onSubmit = (data: AddCurrencyForm) => {
        addCurrency.mutate({
            accountId,
            ...data
        });
    };

    return (
        <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="h-6 w-6">
                    <Plus className="h-3 w-3" />
                </Button>
            </SheetTrigger>
            <SheetContent>
                <SheetHeader>
                    <SheetTitle>Add Currency to {accountName}</SheetTitle>
                    <SheetDescription>
                        Track a new currency in this account.
                    </SheetDescription>
                </SheetHeader>
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 pt-6">
                    <div className="space-y-2">
                        <Label htmlFor="currency">Currency</Label>
                        <CurrencySelect
                            value={watch('currencyCode')}
                            onValueChange={(val) => setValue('currencyCode', val)}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="initialBalance">Initial Balance</Label>
                        <Input
                            id="initialBalance"
                            type="number"
                            step="0.01"
                            {...register('initialBalance', { valueAsNumber: true })}
                        />
                    </div>

                    <SheetFooter>
                        <SheetClose asChild>
                            <Button variant="outline" type="button">Cancel</Button>
                        </SheetClose>
                        <Button type="submit" disabled={addCurrency.isLoading}>
                            {addCurrency.isLoading ? 'Adding...' : 'Add Currency'}
                        </Button>
                    </SheetFooter>
                </form>
            </SheetContent>
        </Sheet>
    );
}
