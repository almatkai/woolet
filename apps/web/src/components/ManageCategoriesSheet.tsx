
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Pencil, Trash2, Settings2 } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
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
import { DeleteConfirm } from '@/components/DeleteConfirm';
import { ScrollArea } from '@/components/ui/scroll-area';

const categorySchema = z.object({
    name: z.string().min(1, "Name is required").max(50),
    icon: z.string().min(1, "Icon is required"),
    color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Invalid color hex code"),
    type: z.enum(['income', 'expense', 'transfer']),
});

type CategoryFormValues = z.infer<typeof categorySchema>;

interface ManageCategoriesSheetProps {
    trigger?: React.ReactNode;
    defaultType?: 'income' | 'expense' | 'transfer';
}

export function ManageCategoriesSheet({ trigger, defaultType }: ManageCategoriesSheetProps) {
    const [open, setOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [isCreating, setIsCreating] = useState(false);

    const utils = trpc.useUtils();
    const { data: categories, isLoading } = trpc.category.list.useQuery();

    const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<CategoryFormValues>({
        resolver: zodResolver(categorySchema),
        defaultValues: {
            name: '',
            icon: '🏷️',
            color: '#000000',
            type: defaultType || 'expense',
        }
    });

        const createCategory = trpc.category.create.useMutation({
            onMutate: async (newCategory: any) => {
                await utils.category.list.cancel();
                const previousCategories = utils.category.list.getData();

                utils.category.list.setData(undefined, (old: any) => {
                    const optimisticCategory = {
                        id: `temp-${Date.now()}`,
                        ...newCategory,
                        userId: 'me', // Placeholder to enable edit/delete controls
                    };
                    return old ? [...old, optimisticCategory] : [optimisticCategory];
                });

                setIsCreating(false);
                reset();
                toast.success('Category created');

                return { previousCategories };
            },
            onError: (err: any, newCategory: any, context: any) => {
                utils.category.list.setData(undefined, context?.previousCategories);
                toast.error('Failed to create category');
            },
            onSettled: () => {
                utils.category.list.invalidate();
            },
        });

        const updateCategory = trpc.category.update.useMutation({
            onMutate: async (updatedCategory: any) => {
                await utils.category.list.cancel();
                const previousCategories = utils.category.list.getData();

                utils.category.list.setData(undefined, (old: any) => {
                    return old?.map((cat: any) =>
                        cat.id === updatedCategory.id ? { ...cat, ...updatedCategory } : cat
                    );
                });

                setEditingId(null);
                reset();
                toast.success('Category updated');

                return { previousCategories };
            },
            onError: (err: any, newCategory: any, context: any) => {
                utils.category.list.setData(undefined, context?.previousCategories);
                toast.error('Failed to update category');
            },
            onSettled: () => {
                utils.category.list.invalidate();
            },
        });

        const deleteCategory = trpc.category.delete.useMutation({
            onMutate: async ({ id }: any) => {
                await utils.category.list.cancel();
                const previousCategories = utils.category.list.getData();

                utils.category.list.setData(undefined, (old: any) => {
                    return old?.filter((cat: any) => cat.id !== id);
                });

                toast.success('Category deleted');

                return { previousCategories };
            },
            onError: (err: any, newCategory: any, context: any) => {
                utils.category.list.setData(undefined, context?.previousCategories);
                toast.error('Failed to delete category');
            },
            onSettled: () => {
                utils.category.list.invalidate();
            },
        });
    const handleEdit = (cat: any) => {
        setEditingId(cat.id);
        setIsCreating(false);
        setValue('name', cat.name);
        setValue('icon', cat.icon);
        setValue('color', cat.color);
        setValue('type', cat.type || 'expense');
    };

    const handleCancel = () => {
        setEditingId(null);
        setIsCreating(false);
        reset();
    };

    const onSubmit = (data: CategoryFormValues) => {
        if (editingId) {
            updateCategory.mutate({ id: editingId, ...data });
        } else {
            createCategory.mutate(data);
        }
    };

    return (
        <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
                {trigger || (
                    <Button variant="ghost" size="sm" className="w-full justify-start">
                        <Settings2 className="mr-2 h-4 w-4" />
                        Manage Categories
                    </Button>
                )}
            </SheetTrigger>
            <SheetContent className="w-[400px] sm:w-[540px]">
                <SheetHeader>
                    <SheetTitle>Manage Categories</SheetTitle>
                    <SheetDescription>
                        Add custom categories or edit existing ones.
                    </SheetDescription>
                </SheetHeader>

                <div className="mt-6 flex flex-col h-[calc(100vh-120px)]">
                    {/* List or Form */}
                    {(isCreating || editingId) ? (
                        <div className="space-y-4 border rounded-md p-4 bg-muted/30">
                            <h3 className="font-semibold">{editingId ? 'Edit Category' : 'New Category'}</h3>
                            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                                <div className="grid grid-cols-4 gap-4">
                                    <div className="col-span-1 space-y-2">
                                        <Label htmlFor="icon">Icon</Label>
                                        <Input id="icon" {...register('icon')} placeholder="Emoji" />
                                        {errors.icon && <p className="text-xs text-red-500">{errors.icon.message}</p>}
                                    </div>
                                    <div className="col-span-3 space-y-2">
                                        <Label htmlFor="name">Name</Label>
                                        <Input id="name" {...register('name')} placeholder="Category Name" />
                                        {errors.name && <p className="text-xs text-red-500">{errors.name.message}</p>}
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label>Type</Label>
                                    <Select
                                        value={watch('type')}
                                        onValueChange={(value) => setValue('type', value as any)}
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select type" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="expense">Expense</SelectItem>
                                            <SelectItem value="income">Income</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    {errors.type && <p className="text-xs text-red-500">{errors.type.message}</p>}
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="color">Color</Label>
                                    <div className="flex gap-2">
                                        <div className="relative">
                                            <Input
                                                id="color"
                                                type="color"
                                                className="w-12 h-10 p-1 cursor-pointer"
                                                value={watch('color')}
                                                onChange={(e) => setValue('color', e.target.value, { shouldValidate: true })}
                                            />
                                        </div>
                                        <Input
                                            placeholder="#000000"
                                            className="font-mono uppercase"
                                            value={watch('color')}
                                            onChange={(e) => setValue('color', e.target.value, { shouldValidate: true })}
                                        />
                                    </div>
                                    {errors.color && <p className="text-xs text-red-500">{errors.color.message}</p>}
                                </div>
                                <div className="flex justify-end gap-2 pt-2">
                                    <Button type="button" variant="ghost" onClick={handleCancel}>Cancel</Button>
                                    <Button type="submit" disabled={createCategory.isLoading || updateCategory.isLoading}>
                                        {editingId ? 'Save Changes' : 'Create Category'}
                                    </Button>
                                </div>
                            </form>
                        </div>
                    ) : (
                        <Button
                            className="mb-4"
                            variant="outline"
                            onClick={() => { setIsCreating(true); reset(); }}
                        >
                            <Plus className="mr-2 h-4 w-4" />
                            Add Custom Category
                        </Button>
                    )}

                    <ScrollArea className="flex-1 -mx-6 px-6">
                        <div className="space-y-2 pb-6">
                            {isLoading ? (
                                <p className="text-muted-foreground text-center py-4">Loading...</p>
                            ) : categories?.length === 0 ? (
                                <p className="text-muted-foreground text-center py-4">No categories found.</p>
                            ) : (
                                categories?.map((cat: any) => (
                                    <div
                                        key={cat.id}
                                        className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors group"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div
                                                className="flex h-8 w-8 items-center justify-center rounded-md text-lg"
                                                style={{ backgroundColor: `${cat.color}20` }}
                                            >
                                                {cat.icon}
                                            </div>
                                            <div className="font-medium">
                                                {cat.name}
                                                <span className="ml-2 text-[10px] text-muted-foreground bg-secondary px-1.5 py-0.5 rounded capitalize">
                                                    {cat.type}
                                                </span>
                                                {!cat.userId && (
                                                    <span className="ml-2 text-[10px] text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">
                                                        Default
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        {cat.userId && (
                                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <Button
                                                    size="icon"
                                                    variant="ghost"
                                                    className="h-8 w-8"
                                                    onClick={() => handleEdit(cat)}
                                                >
                                                    <Pencil className="h-4 w-4" />
                                                </Button>
                                                <DeleteConfirm
                                                    title="Delete Category?"
                                                    description={`Are you sure you want to delete "${cat.name}"?`}
                                                    onConfirm={() => deleteCategory.mutate({ id: cat.id })}
                                                    trigger={
                                                        <Button
                                                            size="icon"
                                                            variant="ghost"
                                                            className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50"
                                                        >
                                                            <Trash2 className="h-4 w-4" />
                                                        </Button>
                                                    }
                                                />
                                            </div>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>
                    </ScrollArea>
                </div>
            </SheetContent>
        </Sheet>
    );
}
