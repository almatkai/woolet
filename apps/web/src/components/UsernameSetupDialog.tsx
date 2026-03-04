import { useMemo, useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

const USERNAME_PATTERN = /^[a-zA-Z0-9_]+$/;

export function UsernameSetupDialog() {
    const utils = trpc.useUtils();
    const { data: me, isLoading } = trpc.user.me.useQuery();
    const [username, setUsername] = useState('');

    const open = useMemo(() => {
        if (isLoading) return false;
        return !!me && !me.username;
    }, [isLoading, me]);

    const updateUser = trpc.user.update.useMutation({
        onSuccess: async () => {
            toast.success('Username saved');
            await utils.user.me.invalidate();
        },
        onError: (error) => {
            toast.error(error.message || 'Failed to save username');
        },
    });

    const handleSave = () => {
        const normalized = username.trim().toLowerCase();

        if (normalized.length < 4) {
            toast.error('Username must be at least 4 characters');
            return;
        }

        if (!USERNAME_PATTERN.test(normalized)) {
            toast.error('Username can only contain letters, numbers, and underscores');
            return;
        }

        updateUser.mutate({ username: normalized });
    };

    return (
        <Dialog open={open}>
            <DialogContent
                className="sm:max-w-md"
                onEscapeKeyDown={(e) => e.preventDefault()}
                onInteractOutside={(e) => e.preventDefault()}
            >
                <DialogHeader>
                    <DialogTitle>Choose your username</DialogTitle>
                    <DialogDescription>
                        You need a unique username (at least 4 characters) to connect with other people for shared debts, payments, and subscriptions.
                    </DialogDescription>
                </DialogHeader>

                <Input
                    placeholder="e.g. john_woolet"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    maxLength={32}
                    autoFocus
                />

                <DialogFooter>
                    <Button onClick={handleSave} disabled={updateUser.isPending}>
                        {updateUser.isPending ? 'Saving...' : 'Save username'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
