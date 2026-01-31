
import { useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Building2 } from 'lucide-react';
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

const createBankSchema = z.object({
    name: z.string().min(1, "Name is required"),
    color: z.string().optional(),
    icon: z.string().optional(),
});

type CreateBankForm = z.infer<typeof createBankSchema>;

export function AddBankSheet() {
    const [open, setOpen] = useState(false);
    const utils = trpc.useUtils();

    const { register, control, handleSubmit, reset, formState: { errors } } = useForm<CreateBankForm>({
        resolver: zodResolver(createBankSchema),
        defaultValues: {
            color: '#000000',
            icon: 'Landmark',
        }
    });

    const createBank = trpc.bank.create.useMutation({
        onSuccess: () => {
            utils.bank.getHierarchy.invalidate();
            setOpen(false);
            reset();
            toast.success('Institution created successfully');
        },
        onError: (error: any) => {
            console.error("Failed to create institution:", error);
            toast.error('Failed to create institution');
        }
    });

    const onSubmit = (data: CreateBankForm) => {
        createBank.mutate(data);
    };

    return (
        <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
                <Button className="gap-2">
                    <Building2 className="h-4 w-4" />
                    Add Institution
                </Button>
            </SheetTrigger>
            <SheetContent>
                <SheetHeader>
                    <SheetTitle>Add Institution</SheetTitle>
                    <SheetDescription>
                        Add a bank or brokerage (e.g. Freedom Bank, Interactive Brokers, Robinhood).
                    </SheetDescription>
                </SheetHeader>
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 pt-6">
                    <div className="space-y-2">
                        <Label htmlFor="name">Name</Label>
                        <Input id="name" placeholder="Interactive Brokers" {...register('name')} />
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
                        <Input id="color" type="color" {...register('color')} />
                    </div>

                    <SheetFooter>
                        <SheetClose asChild>
                            <Button variant="outline" type="button">Cancel</Button>
                        </SheetClose>
                        <Button type="submit" disabled={createBank.isLoading}>
                            {createBank.isLoading ? 'Creating...' : 'Create'}
                        </Button>
                    </SheetFooter>
                </form>
            </SheetContent>
        </Sheet>
    );
}
