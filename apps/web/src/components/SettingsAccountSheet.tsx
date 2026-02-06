
import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Settings } from 'lucide-react';
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

const updateAccountSchema = z.object({
    name: z.string().min(1, "Name is required"),
    last4Digits: z.string().length(4, "Must be exactly 4 digits").optional().or(z.literal('')),
    icon: z.string().optional(),
});

type UpdateAccountForm = z.infer<typeof updateAccountSchema>;

interface SettingsAccountSheetProps {
    account: {
        id: string;
        name: string;
        last4Digits?: string | null;
        icon?: string | null;
    };
    trigger?: React.ReactNode;
}

export function SettingsAccountSheet({ account, trigger }: SettingsAccountSheetProps) {
    const [open, setOpen] = useState(false);
    const utils = trpc.useUtils();

    const { register, handleSubmit, reset, formState: { errors }, setValue } = useForm<UpdateAccountForm>({
        resolver: zodResolver(updateAccountSchema),
        defaultValues: {
            name: account.name,
            last4Digits: account.last4Digits || '',
            icon: account.icon || '💳',
        }
    });

    // Update form values if account prop changes
    useEffect(() => {
        if (open) {
            setValue('name', account.name);
            setValue('last4Digits', account.last4Digits || '');
            setValue('icon', account.icon || '💳');
        }
    }, [account, open, setValue]);

    const updateAccount = trpc.account.update.useMutation({
        onSuccess: () => {
            utils.bank.getHierarchy.invalidate();
            setOpen(false);
            toast.success('Account updated successfully');
        },
        onError: (error: unknown) => {
            console.error("Failed to update account:", error);
            toast.error('Failed to update account');
        }
    });

    const onSubmit = (data: UpdateAccountForm) => {
        updateAccount.mutate({
            id: account.id,
            ...data,
            last4Digits: data.last4Digits || undefined,
        });
    };

    return (
        <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
                {trigger || (
                    <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-primary">
                        <Settings className="h-4 w-4" />
                    </Button>
                )}
            </SheetTrigger>
            <SheetContent>
                <SheetHeader>
                    <SheetTitle>Edit Account</SheetTitle>
                    <SheetDescription>
                        Update details for {account.name}.
                    </SheetDescription>
                </SheetHeader>
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 pt-6">
                    <div className="space-y-2">
                        <Label htmlFor="name">Account Name</Label>
                        <Input id="name" placeholder="Account Name" {...register('name')} />
                        {errors.name && <p className="text-sm text-red-500">{errors.name.message}</p>}
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="last4Digits">Last 4 Digits (Optional)</Label>
                        <Input id="last4Digits" placeholder="1234" maxLength={4} {...register('last4Digits')} />
                        {errors.last4Digits && <p className="text-sm text-red-500">{errors.last4Digits.message}</p>}
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="icon">Icon (emoji)</Label>
                        <Input id="icon" placeholder="💳" {...register('icon')} />
                    </div>

                    <SheetFooter>
                        <SheetClose asChild>
                            <Button variant="outline" type="button">Cancel</Button>
                        </SheetClose>
                        <Button type="submit" disabled={updateAccount.isLoading}>
                            {updateAccount.isLoading ? 'Saving...' : 'Save Changes'}
                        </Button>
                    </SheetFooter>
                </form>
            </SheetContent>
        </Sheet>
    );
}
