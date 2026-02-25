import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { useIsMobile } from '@/hooks/use-mobile';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CurrencySelect } from './CurrencySelect';
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
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

const subscriptionSchema = z.object({
    name: z.string().min(1, 'Name is required').max(100),
    type: z.enum(['mobile', 'general', 'credit', 'mortgage']),
    amount: z.number().positive('Amount must be positive'),
    currency: z.string().length(3),
    frequency: z.enum(['daily', 'weekly', 'monthly', 'yearly']),
    startDate: z.string(),
    endDate: z.string().optional(),
    icon: z.string(),
    color: z.string(),
    description: z.string().optional(),
});

type SubscriptionFormData = z.infer<typeof subscriptionSchema>;

interface AddSubscriptionSheetProps {
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    editingSubscription?: {
        id: string;
        name: string;
        type: string;
        amount: string;
        currency: string;
        frequency: string;
        billingDay: number | null;
        startDate: string;
        endDate: string | null;
        icon: string;
        color: string;
        description: string | null;
    };
}

const typeIcons: Record<string, { icon: string; color: string }> = {
    mobile: { icon: '📱', color: '#3b82f6' },
    general: { icon: '🔄', color: '#6366f1' },
    credit: { icon: '💳', color: '#ef4444' },
    mortgage: { icon: '🏠', color: '#10b981' },
};

export function AddSubscriptionSheet({ open: controlledOpen, onOpenChange: controlledOnOpenChange, editingSubscription }: AddSubscriptionSheetProps = {}) {
    const isCompactMobile = useIsMobile(470);
    const [internalOpen, setInternalOpen] = useState(false);
    const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
    const setOpen = controlledOnOpenChange || setInternalOpen;
    const isControlled = controlledOpen !== undefined;

    const utils = trpc.useUtils();

    const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<SubscriptionFormData>({
        resolver: zodResolver(subscriptionSchema),
        defaultValues: {
            type: 'general',
            currency: 'USD',
            frequency: 'monthly',
            startDate: new Date().toISOString().split('T')[0],
            icon: '🔄',
            color: '#6366f1',
        }
    });

    const selectedType = watch('type');

    useEffect(() => {
        if (selectedType && typeIcons[selectedType]) {
            setValue('icon', typeIcons[selectedType].icon);
            setValue('color', typeIcons[selectedType].color);
        }
    }, [selectedType, setValue]);

    useEffect(() => {
        if (editingSubscription) {
            reset({
                name: editingSubscription.name,
                type: editingSubscription.type as any,
                amount: Number(editingSubscription.amount),
                currency: editingSubscription.currency,
                frequency: editingSubscription.frequency as any,
                startDate: editingSubscription.startDate,
                endDate: editingSubscription.endDate || undefined,
                icon: editingSubscription.icon,
                color: editingSubscription.color,
                description: editingSubscription.description || undefined,
            });
        }
    }, [editingSubscription, reset]);

    const createSubscription = trpc.subscription.create.useMutation({
        onSuccess: () => {
            utils.subscription.list.invalidate();
            utils.subscription.getUpcoming.invalidate();
            utils.subscription.getCalendarView.invalidate();
            toast.success('Subscription created successfully');
            setOpen(false);
            reset();
        },
        onError: (error: any) => {
            toast.error(error.message || 'Failed to create subscription');
        }
    });

    const updateSubscription = trpc.subscription.update.useMutation({
        onSuccess: () => {
            utils.subscription.list.invalidate();
            utils.subscription.getUpcoming.invalidate();
            utils.subscription.getCalendarView.invalidate();
            toast.success('Subscription updated successfully');
            setOpen(false);
            reset();
        },
        onError: (error: any) => {
            toast.error(error.message || 'Failed to update subscription');
        }
    });

    const onSubmit = (data: SubscriptionFormData) => {
        if (editingSubscription) {
            updateSubscription.mutate({ id: editingSubscription.id, ...data });
        } else {
            createSubscription.mutate(data);
        }
    };

    const handleClose = () => {
        setOpen(false);
        reset();
    };

    return (
        <Sheet open={open} onOpenChange={handleClose}>
            <SheetContent
                side={isCompactMobile ? 'bottom' : 'right'}
                className="overflow-y-auto sm:max-w-[480px] max-[470px]:h-[92dvh] max-[470px]:rounded-t-2xl max-[470px]:pb-[calc(env(safe-area-inset-bottom)+0.5rem)]"
            >
                <SheetHeader>
                    <SheetTitle>{editingSubscription ? 'Edit Subscription' : 'Add Subscription'}</SheetTitle>
                    <SheetDescription>
                        {editingSubscription
                            ? 'Update your subscription details'
                            : 'Add a new recurring payment to track'
                        }
                    </SheetDescription>
                </SheetHeader>

                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-6">
                    {/* Type Selection */}
                    <div className="space-y-2">
                        <Label>Type</Label>
                        <Select
                            value={selectedType}
                            onValueChange={(v) => setValue('type', v as any)}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder="Select type" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="mobile">📱 Mobile / Cellular</SelectItem>
                                <SelectItem value="general">🔄 General Subscription</SelectItem>
                                <SelectItem value="credit">💳 Credit Payment</SelectItem>
                                <SelectItem value="mortgage">🏠 Mortgage Payment</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Name */}
                    <div className="space-y-2">
                        <Label htmlFor="name">Name</Label>
                        <Input
                            id="name"
                            placeholder="e.g., Netflix, Phone Bill, Car Loan"
                            {...register('name')}
                        />
                        {errors.name && <p className="text-sm text-red-500">{errors.name.message}</p>}
                    </div>

                    {/* Amount and Currency */}
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                            <Label htmlFor="amount">Amount</Label>
                            <Input
                                id="amount"
                                type="number"
                                step="0.01"
                                placeholder="0.00"
                                {...register('amount', { valueAsNumber: true })}
                            />
                            {errors.amount && <p className="text-sm text-red-500">{errors.amount.message}</p>}
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="currency">Currency</Label>
                            <CurrencySelect
                                value={watch('currency')}
                                onValueChange={(v) => setValue('currency', v)}
                            />
                        </div>
                    </div>

                    {/* Frequency and Billing Day */}
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                            <Label>Frequency</Label>
                            <Select
                                value={watch('frequency')}
                                onValueChange={(v) => setValue('frequency', v as any)}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="daily">Daily</SelectItem>
                                    <SelectItem value="weekly">Weekly</SelectItem>
                                    <SelectItem value="monthly">Monthly</SelectItem>
                                    <SelectItem value="yearly">Yearly</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    {/* Start Date and End Date */}
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                            <Label htmlFor="startDate">Start Date</Label>
                            <Input
                                id="startDate"
                                type="date"
                                {...register('startDate')}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="endDate">End Date (optional)</Label>
                            <Input
                                id="endDate"
                                type="date"
                                {...register('endDate')}
                            />
                        </div>
                    </div>

                    {/* Description */}
                    <div className="space-y-2">
                        <Label htmlFor="description">Description (optional)</Label>
                        <Input
                            id="description"
                            placeholder="Additional notes..."
                            {...register('description')}
                        />
                    </div>

                    {/* Preview */}
                    <div className="p-3 bg-muted rounded-lg flex items-center gap-3">
                        <div
                            className="w-10 h-10 rounded-lg flex items-center justify-center text-xl"
                            style={{ backgroundColor: `${watch('color')}20` }}
                        >
                            {watch('icon')}
                        </div>
                        <div>
                            <p className="font-medium">{watch('name') || 'Subscription Name'}</p>
                            <p className="text-sm text-muted-foreground">
                                {watch('amount') ? `${watch('currency')} ${watch('amount')}` : 'Amount'} / {watch('frequency')}
                            </p>
                        </div>
                    </div>

                    <SheetFooter className="pt-4">
                        <SheetClose asChild>
                            <Button variant="outline" type="button">Cancel</Button>
                        </SheetClose>
                        <Button
                            type="submit"
                            disabled={createSubscription.isPending || updateSubscription.isPending}
                        >
                            {(createSubscription.isPending || updateSubscription.isPending)
                                ? 'Saving...'
                                : editingSubscription ? 'Update' : 'Create'
                            }
                        </Button>
                    </SheetFooter>
                </form>
            </SheetContent>
        </Sheet>
    );
}
