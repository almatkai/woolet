import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CurrencySelect } from './CurrencySelect';
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

interface AddSubscriptionFormProps {
    onSuccess: () => void;
    onCancel: () => void;
}

const typeIcons: Record<string, { icon: string; color: string }> = {
    mobile: { icon: '📱', color: '#3b82f6' },
    general: { icon: '🔄', color: '#6366f1' },
    credit: { icon: '💳', color: '#ef4444' },
    mortgage: { icon: '🏠', color: '#10b981' },
};

export function AddSubscriptionForm({ onSuccess, onCancel }: AddSubscriptionFormProps) {
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

    const createSubscription = trpc.subscription.create.useMutation({
        onSuccess: () => {
            utils.subscription.list.invalidate();
            utils.subscription.getUpcoming.invalidate();
            utils.subscription.getCalendarView.invalidate();
            toast.success('Subscription created successfully');
            reset();
            onSuccess();
        },
        onError: (error: any) => {
            toast.error(error.message || 'Failed to create subscription');
        }
    });

    const onSubmit = (data: SubscriptionFormData) => {
        createSubscription.mutate(data);
    };

    return (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
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
            <div className="grid grid-cols-2 gap-4">
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

            {/* Frequency */}
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

            {/* Start Date and End Date */}
            <div className="grid grid-cols-2 gap-4">
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

            <div className="flex gap-3 pt-4">
                <Button type="button" variant="outline" onClick={onCancel} className="flex-1">
                    Cancel
                </Button>
                <Button
                    type="submit"
                    disabled={createSubscription.isPending}
                    className="flex-1 gap-2"
                >
                    {!createSubscription.isPending && <Plus className="h-4 w-4" />}
                    {createSubscription.isPending ? 'Saving...' : 'Create Subscription'}
                </Button>
            </div>
        </form>
    );
}
