
import { useState, useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Settings } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { IconPicker } from '@/components/IconPicker';
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

const updateBankSchema = z.object({
    name: z.string().min(1, "Name is required"),
    color: z.string().optional(),
    icon: z.string().optional(),
});

type UpdateBankForm = z.infer<typeof updateBankSchema>;

interface SettingsBankSheetProps {
    bank: {
        id: string;
        name: string;
        icon?: string | null;
        color?: string | null;
    };
    trigger?: React.ReactNode;
}

export function SettingsBankSheet({ bank, trigger }: SettingsBankSheetProps) {
    const [open, setOpen] = useState(false);
    const utils = trpc.useUtils();

    const { register, control, handleSubmit, formState: { errors }, setValue, watch } = useForm<UpdateBankForm>({
        resolver: zodResolver(updateBankSchema),
        defaultValues: {
            name: bank.name,
            color: bank.color || '#000000',
            icon: bank.icon || '🏦',
        }
    });

    // Update form values if bank prop changes
    useEffect(() => {
        if (open) {
            setValue('name', bank.name);
            setValue('color', bank.color || '#000000');
            setValue('icon', bank.icon || '🏦');
        }
    }, [bank, open, setValue]);

    const updateBank = trpc.bank.update.useMutation({
        onSuccess: () => {
            utils.bank.getHierarchy.invalidate();
            setOpen(false);
            toast.success('Bank updated successfully');
        },
        onError: (error: any) => {
            console.error("Failed to update bank:", error);
            toast.error('Failed to update bank');
        }
    });

    const onSubmit = (data: UpdateBankForm) => {
        updateBank.mutate({
            id: bank.id,
            ...data,
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
                    <SheetTitle>Edit Bank</SheetTitle>
                    <SheetDescription>
                        Update details for {bank.name}.
                    </SheetDescription>
                </SheetHeader>
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 pt-6">
                    <div className="space-y-2">
                        <Label htmlFor="name">Bank Name</Label>
                        <Input id="name" placeholder="Bank Name" {...register('name')} />
                        {errors.name && <p className="text-sm text-red-500">{errors.name.message}</p>}
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="icon">Icon</Label>
                        <Controller
                            control={control}
                            name="icon"
                            render={({ field }) => (
                                <IconPicker
                                    value={field.value}
                                    onChange={field.onChange}
                                />
                            )}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="color">Color</Label>
                        <div className="flex gap-2">
                            <div className="relative">
                                <Input
                                    id="color-picker"
                                    type="color"
                                    className="w-12 h-10 p-1 cursor-pointer"
                                    value={watch('color')}
                                    onChange={(e) => setValue('color', e.target.value, { shouldValidate: true })}
                                />
                            </div>
                            <Input
                                id="color-text"
                                placeholder="#000000"
                                className="font-mono uppercase"
                                value={watch('color')}
                                onChange={(e) => setValue('color', e.target.value, { shouldValidate: true })}
                            />
                        </div>
                    </div>

                    <SheetFooter>
                        <SheetClose asChild>
                            <Button variant="outline" type="button">Cancel</Button>
                        </SheetClose>
                        <Button type="submit" disabled={updateBank.isLoading}>
                            {updateBank.isLoading ? 'Saving...' : 'Save Changes'}
                        </Button>
                    </SheetFooter>
                </form>
            </SheetContent>
        </Sheet>
    );
}
