import React from 'react';
import { cn } from '@/lib/utils';
import { Link } from '@tanstack/react-router';

interface WidgetFooterProps {
    children: React.ReactNode;
    className?: string;
    /** When false, omits flex layout (for single-line content). Default: true */
    flex?: boolean;
    /** Optional link to navigate to when the footer is clicked */
    to?: string;
}

export function WidgetFooter({ children, className, flex = true, to }: WidgetFooterProps) {
    const content = (
        <div
            className={cn(
                'px-6 py-1.5 border-t border-border/50 bg-muted/20 transition-colors',
                flex && 'flex items-center justify-between',
                to && 'hover:bg-muted/40 cursor-pointer',
                className
            )}
        >
            {children}
        </div>
    );

    if (to) {
        return (
            <Link to={to} className="block">
                {content}
            </Link>
        );
    }

    return content;
}
