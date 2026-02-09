import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

interface TransactionShortcut {
    id: string;
    name: string;
    icon?: string;
    isFavorite?: boolean;
}

interface ShortcutsWidgetProps {
    shortcuts: TransactionShortcut[];
    onOpenShortcut: (shortcut: any) => void;
    onClose: () => void;
    isVisible: boolean;
}

export function ShortcutsWidget({ shortcuts, onOpenShortcut, onClose, isVisible }: ShortcutsWidgetProps) {
    const favoriteShortcuts = shortcuts.filter(s => s.isFavorite);

    if (!isVisible) return null;

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="w-full h-full pointer-events-none"
        >
            <div className="bg-background/80 backdrop-blur-xl border border-border rounded-2xl shadow-2xl p-3 sm:p-4 w-full h-full pointer-events-auto overflow-hidden flex flex-col">
                <div className="flex items-center justify-between mb-2 px-1">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80">Starred Shortcuts</p>
                    <Button
                        size="icon"
                        variant="ghost"
                        className="h-5 w-5 rounded-full hover:bg-muted/30"
                        onClick={onClose}
                    >
                        <X className="h-3 w-3" />
                    </Button>
                </div>
                {favoriteShortcuts.length === 0 ? (
                    <div className="flex-1 flex items-center justify-center text-center">
                        <p className="text-[10px] text-muted-foreground leading-tight">
                            Star shortcuts to see them here
                        </p>
                    </div>
                ) : (
                    <div className="flex-1 flex flex-row overflow-x-auto pb-1 gap-3 sm:flex-wrap sm:justify-start scrollbar-hide">
                        {favoriteShortcuts.map((shortcut) => (
                            <button
                                key={shortcut.id}
                                onClick={() => onOpenShortcut(shortcut)}
                                className="flex flex-col items-center justify-center shrink-0 group transition-all duration-300 transform active:scale-95"
                            >
                                <div
                                    className={cn(
                                        "h-12 w-12 sm:h-14 sm:w-14 rounded-xl flex items-center justify-center text-xl sm:text-2xl transition-all duration-300 border-2 shadow-sm",
                                        "border-border bg-muted/30 hover:bg-muted/50 hover:border-border/80"
                                    )}
                                >
                                    {shortcut.icon || '💰'}
                                </div>
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </motion.div>
    );
}
