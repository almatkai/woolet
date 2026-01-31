import { useState, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Users, Trash2, Check, X, MessageCircle, Phone, Mail, Hash, Settings2 } from 'lucide-react';
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
} from '@/components/ui/sheet';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

// ==========================================
// SPLIT PARTICIPANTS MANAGEMENT
// ==========================================

const createParticipantSchema = z.object({
    name: z.string().min(1, "Name is required").max(100),
    contactType: z.enum(['telegram', 'whatsapp', 'phone', 'email', 'other']).optional(),
    contactValue: z.string().optional(),
    color: z.string().optional(),
});

type CreateParticipantValues = z.infer<typeof createParticipantSchema>;

interface ManageParticipantsSheetProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function ManageParticipantsSheet({ open, onOpenChange }: ManageParticipantsSheetProps) {
    const utils = trpc.useUtils();
    const [editingId, setEditingId] = useState<string | null>(null);
    
    const { data: participants, isLoading } = trpc.splitBill.listParticipants.useQuery();

    const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<CreateParticipantValues>({
        resolver: zodResolver(createParticipantSchema),
        defaultValues: {
            name: '',
            contactType: undefined,
            contactValue: '',
            color: '#8b5cf6',
        },
    });

    const createMutation = trpc.splitBill.createParticipant.useMutation({
        onSuccess: () => {
            utils.splitBill.listParticipants.invalidate();
            reset();
            toast.success('Contact added');
        },
        onError: () => toast.error('Failed to add contact'),
    });

    const updateMutation = trpc.splitBill.updateParticipant.useMutation({
        onSuccess: () => {
            utils.splitBill.listParticipants.invalidate();
            setEditingId(null);
            reset();
            toast.success('Contact updated');
        },
        onError: () => toast.error('Failed to update contact'),
    });

    const deleteMutation = trpc.splitBill.deleteParticipant.useMutation({
        onSuccess: () => {
            utils.splitBill.listParticipants.invalidate();
            toast.success('Contact removed');
        },
        onError: () => toast.error('Failed to remove contact'),
    });

    const contactType = watch('contactType');

    const onSubmit = (data: CreateParticipantValues) => {
        if (editingId) {
            updateMutation.mutate({
                id: editingId,
                ...data,
            });
        } else {
            createMutation.mutate(data);
        }
    };

    const startEdit = (participant: any) => {
        setEditingId(participant.id);
        setValue('name', participant.name);
        setValue('contactType', participant.contactType || undefined);
        setValue('contactValue', participant.contactValue || '');
        setValue('color', participant.color);
    };

    const cancelEdit = () => {
        setEditingId(null);
        reset();
    };

    const getContactIcon = (type?: string) => {
        switch (type) {
            case 'telegram': return <MessageCircle className="h-3 w-3" />;
            case 'whatsapp': return <MessageCircle className="h-3 w-3" />;
            case 'phone': return <Phone className="h-3 w-3" />;
            case 'email': return <Mail className="h-3 w-3" />;
            default: return <Hash className="h-3 w-3" />;
        }
    };

    const COLORS = ['#8b5cf6', '#f87171', '#facc15', '#4ade80', '#60a5fa', '#f472b6', '#22d3ee', '#fb923c'];

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent className="flex flex-col">
                <SheetHeader>
                    <SheetTitle className="flex items-center gap-2">
                        <Users className="h-5 w-5" />
                        Manage Contacts
                    </SheetTitle>
                    <SheetDescription>
                        Add people you often split bills with
                    </SheetDescription>
                </SheetHeader>

                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="name">Name</Label>
                        <Input
                            id="name"
                            placeholder="Friend's name"
                            {...register('name')}
                        />
                        {errors.name && (
                            <p className="text-xs text-destructive">{errors.name.message}</p>
                        )}
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Contact Type</Label>
                            <Select
                                value={contactType || ''}
                                onValueChange={(v) => setValue('contactType', v as any)}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Optional" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="telegram">Telegram</SelectItem>
                                    <SelectItem value="whatsapp">WhatsApp</SelectItem>
                                    <SelectItem value="phone">Phone</SelectItem>
                                    <SelectItem value="email">Email</SelectItem>
                                    <SelectItem value="other">Other</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="contactValue">Contact</Label>
                            <Input
                                id="contactValue"
                                placeholder={
                                    contactType === 'telegram' ? '@username' :
                                    contactType === 'phone' || contactType === 'whatsapp' ? '+1234567890' :
                                    contactType === 'email' ? 'email@example.com' : 'Contact info'
                                }
                                {...register('contactValue')}
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label>Color</Label>
                        <div className="flex gap-2 flex-wrap">
                            {COLORS.map((color) => (
                                <button
                                    key={color}
                                    type="button"
                                    className={cn(
                                        "w-8 h-8 rounded-full border-2 transition-all",
                                        watch('color') === color ? "border-foreground scale-110" : "border-transparent"
                                    )}
                                    style={{ backgroundColor: color }}
                                    onClick={() => setValue('color', color)}
                                />
                            ))}
                        </div>
                    </div>

                    <div className="flex gap-2">
                        <Button
                            type="submit"
                            className="flex-1"
                            disabled={createMutation.isPending || updateMutation.isPending}
                        >
                            {editingId ? 'Update' : 'Add'} Contact
                        </Button>
                        {editingId && (
                            <Button type="button" variant="outline" onClick={cancelEdit}>
                                Cancel
                            </Button>
                        )}
                    </div>
                </form>

                <ScrollArea className="flex-1">
                    <div className="space-y-2">
                        {participants?.map((p: any) => (
                            <div
                                key={p.id}
                                className={cn(
                                    "flex items-center gap-3 p-3 rounded-lg border",
                                    editingId === p.id && "border-primary bg-muted"
                                )}
                            >
                                <div
                                    className="w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold"
                                    style={{ backgroundColor: p.color }}
                                >
                                    {p.name.charAt(0).toUpperCase()}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="font-medium truncate">{p.name}</div>
                                    {p.contactValue && (
                                        <div className="text-xs text-muted-foreground flex items-center gap-1">
                                            {getContactIcon(p.contactType)}
                                            {p.contactValue}
                                        </div>
                                    )}
                                </div>
                                <div className="flex gap-1">
                                    <Button
                                        size="icon"
                                        variant="ghost"
                                        onClick={() => startEdit(p)}
                                    >
                                        <Settings2 className="h-4 w-4" />
                                    </Button>
                                    <Button
                                        size="icon"
                                        variant="ghost"
                                        className="text-destructive hover:text-destructive"
                                        onClick={() => deleteMutation.mutate({ id: p.id })}
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                        ))}
                        {(!participants || participants.length === 0) && (
                            <div className="text-center text-muted-foreground py-8">
                                No contacts yet. Add someone to start splitting bills!
                            </div>
                        )}
                    </div>
                </ScrollArea>
            </SheetContent>
        </Sheet>
    );
}

// ==========================================
// SPLIT SELECTOR FOR TRANSACTIONS
// ==========================================

interface SplitSelectorProps {
    selectedParticipants: string[];
    onSelectionChange: (ids: string[]) => void;
    equalSplit: boolean;
    onEqualSplitChange: (equal: boolean) => void;
    customAmounts: { participantId: string; amount: number }[];
    onCustomAmountsChange: (amounts: { participantId: string; amount: number }[]) => void;
    transactionAmount: number;
    includeSelf: boolean;
    onIncludeSelfChange: (include: boolean) => void;
}

export function SplitSelector({
    selectedParticipants,
    onSelectionChange,
    equalSplit,
    onEqualSplitChange,
    customAmounts,
    onCustomAmountsChange,
    transactionAmount,
    includeSelf,
    onIncludeSelfChange,
}: SplitSelectorProps) {
    const [showManager, setShowManager] = useState(false);
    const { data: participants } = trpc.splitBill.listParticipants.useQuery();

    const toggleParticipant = (id: string) => {
        if (selectedParticipants.includes(id)) {
            onSelectionChange(selectedParticipants.filter(p => p !== id));
            onCustomAmountsChange(customAmounts.filter(a => a.participantId !== id));
        } else {
            onSelectionChange([...selectedParticipants, id]);
        }
    };

    const updateCustomAmount = (participantId: string, amount: number) => {
        const existing = customAmounts.find(a => a.participantId === participantId);
        if (existing) {
            onCustomAmountsChange(customAmounts.map(a =>
                a.participantId === participantId ? { ...a, amount } : a
            ));
        } else {
            onCustomAmountsChange([...customAmounts, { participantId, amount }]);
        }
    };

    const perPersonAmount = useMemo(() => {
        if (!equalSplit || selectedParticipants.length === 0) return 0;
        const totalPeople = includeSelf ? selectedParticipants.length + 1 : selectedParticipants.length;
        return Math.round((transactionAmount / totalPeople) * 100) / 100;
    }, [equalSplit, selectedParticipants.length, transactionAmount, includeSelf]);

    const totalOwed = useMemo(() => {
        if (equalSplit) {
            return perPersonAmount * selectedParticipants.length;
        }
        return customAmounts.reduce((sum, a) => sum + a.amount, 0);
    }, [equalSplit, perPersonAmount, selectedParticipants.length, customAmounts]);

    const yourShare = transactionAmount - totalOwed;

    if (!participants || participants.length === 0) {
        return (
            <div className="space-y-3">
                <div className="flex items-center justify-between">
                    <Label className="flex items-center gap-2">
                        <Users className="h-4 w-4" />
                        Split Bill
                    </Label>
                </div>
                <div className="text-center py-4 bg-muted rounded-lg">
                    <p className="text-sm text-muted-foreground mb-2">No contacts yet</p>
                    <Button size="sm" variant="outline" onClick={() => setShowManager(true)}>
                        <Plus className="h-4 w-4 mr-1" /> Add Contacts
                    </Button>
                </div>
                <ManageParticipantsSheet open={showManager} onOpenChange={setShowManager} />
            </div>
        );
    }

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <Label className="flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Split Bill
                </Label>
                <Button size="sm" variant="ghost" onClick={() => setShowManager(true)}>
                    <Plus className="h-4 w-4 mr-1" /> Manage
                </Button>
            </div>

            {/* Participant Selection */}
            <div className="flex flex-wrap gap-2">
                {participants.map((p: any) => (
                    <Badge
                        key={p.id}
                        variant={selectedParticipants.includes(p.id) ? "default" : "outline"}
                        className="cursor-pointer py-1.5 px-3"
                        style={{
                            backgroundColor: selectedParticipants.includes(p.id) ? p.color : undefined,
                            borderColor: p.color,
                        }}
                        onClick={() => toggleParticipant(p.id)}
                    >
                        {selectedParticipants.includes(p.id) && <Check className="h-3 w-3 mr-1" />}
                        {p.name}
                    </Badge>
                ))}
            </div>

            {selectedParticipants.length > 0 && (
                <>
                    {/* Split Options */}
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Switch
                                checked={equalSplit}
                                onCheckedChange={onEqualSplitChange}
                            />
                            <Label className="text-sm">Split equally</Label>
                        </div>
                        <div className="flex items-center gap-2">
                            <Checkbox
                                checked={includeSelf}
                                onCheckedChange={(c) => onIncludeSelfChange(c === true)}
                            />
                            <Label className="text-sm">Include myself</Label>
                        </div>
                    </div>

                    {/* Split Details */}
                    <div className="bg-muted rounded-lg p-3 space-y-2">
                        {selectedParticipants.map(id => {
                            const participant = participants.find((p: any) => p.id === id);
                            if (!participant) return null;
                            const customAmount = customAmounts.find(a => a.participantId === id)?.amount;
                            const displayAmount = equalSplit ? perPersonAmount : (customAmount || 0);

                            return (
                                <div key={id} className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <div
                                            className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs"
                                            style={{ backgroundColor: participant.color }}
                                        >
                                            {participant.name.charAt(0)}
                                        </div>
                                        <span className="text-sm">{participant.name}</span>
                                    </div>
                                    {equalSplit ? (
                                        <span className="font-medium">{displayAmount.toFixed(2)}</span>
                                    ) : (
                                        <Input
                                            type="number"
                                            className="w-24 h-8 text-right"
                                            value={customAmount || ''}
                                            onChange={(e) => updateCustomAmount(id, Number(e.target.value) || 0)}
                                            placeholder="0.00"
                                        />
                                    )}
                                </div>
                            );
                        })}

                        <div className="border-t pt-2 mt-2 flex justify-between text-sm">
                            <span className="text-muted-foreground">Total owed by others:</span>
                            <span className="font-semibold">{totalOwed.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Your actual spend:</span>
                            <span className="font-semibold text-primary">{yourShare.toFixed(2)}</span>
                        </div>
                    </div>
                </>
            )}

            <ManageParticipantsSheet open={showManager} onOpenChange={setShowManager} />
        </div>
    );
}
