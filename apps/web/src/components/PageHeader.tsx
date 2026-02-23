import { cn } from '@/lib/utils';

export type PageHeaderVariant =
    | 'two-with-text'   // Accounts style: 2 buttons both with text, horizontal layout
    | 'one'             // Subscriptions style: 1 button with or without text
    | 'two-mixed';      // Spending style: 2 buttons, one icon-only and one with text

interface PageHeaderProps {
    title: string;
    subtitle?: string;
    variant: PageHeaderVariant;
    children: React.ReactNode;
    className?: string;
}

/**
 * Unified page header with consistent button layouts across the app.
 * - two-with-text: Use for 2 buttons both with text (e.g. Accounts: Transfer + Bank)
 * - one: Use for single button (e.g. Subscriptions: Add)
 * - two-mixed: Use for 2 buttons where one is icon-only (e.g. Spending: Shortcuts + Add)
 */
export function PageHeader({ title, subtitle, variant, children, className }: PageHeaderProps) {
    const subtitleClass = 'hidden sm:block text-sm md:text-base text-muted-foreground';

    if (variant === 'two-with-text') {
        return (
            <div className={cn('flex flex-col sm:flex-row sm:items-center justify-between gap-4', className)}>
                <div>
                    <h1 className="text-2xl font-bold">{title}</h1>
                    {subtitle && <p className={subtitleClass}>{subtitle}</p>}
                </div>
                <div className="flex gap-2 w-full sm:w-auto">
                    {children}
                </div>
            </div>
        );
    }

    if (variant === 'two-mixed') {
        return (
            <div className={cn('flex items-center justify-between', className)}>
                <div>
                    <h1 className="text-2xl font-bold">{title}</h1>
                    {subtitle && <p className={subtitleClass}>{subtitle}</p>}
                </div>
                <div className="flex items-center gap-2 md:gap-3">
                    {children}
                </div>
            </div>
        );
    }

    // variant === 'one'
    return (
        <div className={cn('flex items-center justify-between', className)}>
            <div>
                <h1 className="text-2xl font-bold">{title}</h1>
                {subtitle && <p className={subtitleClass}>{subtitle}</p>}
            </div>
            {children}
        </div>
    );
}
