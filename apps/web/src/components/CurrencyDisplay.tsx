
import { useState } from 'react';
import { cn } from '@/lib/utils';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/components/ui/tooltip';

interface CurrencyDisplayProps {
    amount: string | number;
    currency?: string;
    className?: string;
    abbreviate?: boolean;
    showSign?: boolean;
}

export const formatAmountAbbreviated = (amount: string | number): string => {
    const num = Number(amount);
    const absNum = Math.abs(num);
    const sign = num < 0 ? '-' : '';

    if (absNum >= 1_000_000) {
        return sign + (absNum / 1_000_000).toLocaleString('en-US', { maximumFractionDigits: 1 }) + 'm';
    }
    if (absNum >= 1_000) {
        return sign + (absNum / 1_000).toLocaleString('en-US', { maximumFractionDigits: 1 }) + 'k';
    }
    return num.toLocaleString('en-US', { maximumFractionDigits: 2 });
};

export const formatFullAmount = (amount: string | number, currency?: string) => {
    const num = Number(amount);
    if (!currency) return num.toLocaleString('en-US', { maximumFractionDigits: 2 });
    try {
        return num.toLocaleString('en-US', { style: 'currency', currency });
    } catch {
        return `${currency} ${num.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
    }
};

export function CurrencyDisplay({ amount, currency, className, abbreviate = true, showSign = false }: CurrencyDisplayProps) {
    const [open, setOpen] = useState(false);
    const num = Number(amount);
    const fullAmount = formatFullAmount(amount, currency);
    // Always use plain number format for display (currency prefix is rendered separately)
    const displayAmount = abbreviate ? formatAmountAbbreviated(amount) : formatFullAmount(amount);

    const sign = showSign && num > 0 ? '+' : '';

    return (
        <TooltipProvider>
            <Tooltip open={open} onOpenChange={setOpen}>
                <TooltipTrigger asChild>
                    <span
                        className={cn("cursor-help select-none inline-flex items-baseline gap-1", className)}
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setOpen(!open);
                        }}
                    >
                        {currency && (
                            <span className="font-medium leading-none">{currency}</span>
                        )}
                        <span className="font-medium leading-none">
                            {sign}{displayAmount}
                        </span>
                    </span>
                </TooltipTrigger>
                <TooltipContent>
                    <p>{fullAmount}</p>
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    );
}
