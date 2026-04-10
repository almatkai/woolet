import React from 'react';
import { cn } from '@/lib/utils';

interface WidgetFooterProps {
    children: React.ReactNode;
    className?: string;
    /** When false, omits flex layout (for single-line content). Default: true */
    flex?: boolean;
}

export function WidgetFooter({ children, className, flex = true }: WidgetFooterProps) {
    return (
        <div
            className={cn(
                'dashboard-widget__footer px-6 py-1.5 border-t border-border/50 bg-muted/20',
                flex && 'flex items-center justify-between',
                className
            )}
        >
            {children}
        </div>
    );
}
