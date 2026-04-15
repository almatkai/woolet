

import { useState } from 'react';
import { cn } from '@/lib/utils';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/components/ui/tooltip';

const CURRENCY_SYMBOLS: Record<string, string> = {
    USD: '$',
    EUR: '€',
    GBP: '£',
    KZT: '₸',
    RUB: '₽',
    JPY: '¥',
    CNY: '¥',
    AED: 'د.إ',
    AUD: 'A$',
    CAD: 'C$',
    CHF: 'CHF',
    INR: '₹',
    KRW: '₩',
    TRY: '₺',
    UAH: '₴',
    BYN: 'Br',
    AZN: '₼',
    GEL: '₾',
    AMD: '֏',
    THB: '฿',
    SGD: 'S$',
    HKD: 'HK$',
    NZD: 'NZ$',
    MXN: '$',
    BRL: 'R$',
    ZAR: 'R$',
};

const getCurrencySymbol = (code?: string): string => {
    if (!code) return '';
    return CURRENCY_SYMBOLS[code] || code;
};

interface CurrencyDisplayProps {
    amount: string | number;
    currency?: string;
    className?: string;
    abbreviate?: boolean;
    showSign?: boolean;
    size?: 'sm' | 'default';
    /** Inline color - use when you need one solid color for the entire amount (avoids CSS cascade/opacity issues) */
    color?: string;
}

export const formatAmountAbbreviated = (amount: string | number, ignoreOpacity: boolean = false): React.ReactNode => {
    const num = Number(amount);
    const absNum = Math.abs(num);
    const sign = num < 0 ? '-' : '';

    if (absNum >= 1_000_000) {
        const formatted = Math.floor(absNum / 1_000_000).toLocaleString('en-US');
        return <>{sign}{formatted}<span className={ignoreOpacity ? "" : "opacity-50"}>m</span></>;
    }
    if (absNum >= 1_000) {
        const formatted = Math.floor(absNum / 1_000).toLocaleString('en-US');
        return <>{sign}{formatted}<span className={ignoreOpacity ? "" : "opacity-50"}>k</span></>;
    }
    
    const isWhole = num % 1 === 0;
    const formatted = num.toLocaleString('en-US', { 
        maximumFractionDigits: isWhole ? 0 : 2,
        minimumFractionDigits: isWhole ? 0 : 2 
    });
    const parts = formatted.split('.');
    if (parts.length > 1) {
         return <>{parts[0]}<span className={ignoreOpacity ? "" : "opacity-50"}>.{parts[1]}</span></>;
    }
    return <>{formatted}</>;
};

export const formatFullAmount = (amount: string | number, currency?: string, ignoreOpacity: boolean = false): React.ReactNode => {
    const num = Number(amount);
    const isWhole = num % 1 === 0;
    
    let formattedStr = '';
    if (!currency) {
        formattedStr = num.toLocaleString('en-US', { 
            maximumFractionDigits: isWhole ? 0 : 2,
            minimumFractionDigits: isWhole ? 0 : 2 
        });
    } else {
        formattedStr = num.toLocaleString('en-US', { 
            maximumFractionDigits: isWhole ? 0 : 2,
            minimumFractionDigits: isWhole ? 0 : 2 
        });
    }

    // Attempt to split by decimal to apply opacity to the decimal part if it exists
    const parts = formattedStr.split('.');
    if (parts.length > 1) {
        return <>{parts[0]}<span className={ignoreOpacity ? "" : "opacity-50"}>.{parts[1]}</span></>;
    }
    return <>{formattedStr}</>;
};

export function CurrencyDisplay({ amount, currency, className, abbreviate = true, showSign = false, size = 'default', color }: CurrencyDisplayProps) {
    const [open, setOpen] = useState(false);
    const num = Number(amount);
    
    // Check if amount is a whole number
    const isWhole = num % 1 === 0;
    
    const fullAmountStr = !currency ? num.toLocaleString('en-US', { 
        maximumFractionDigits: isWhole ? 0 : 2,
        minimumFractionDigits: isWhole ? 0 : 2 
    }) : (() => { 
        try { 
            return num.toLocaleString('en-US', { 
                style: 'currency', 
                currency,
                maximumFractionDigits: isWhole ? 0 : 2,
                minimumFractionDigits: isWhole ? 0 : 2
            }) 
        } catch { 
            return `${currency} ${num.toLocaleString('en-US', { 
                maximumFractionDigits: isWhole ? 0 : 2,
                minimumFractionDigits: isWhole ? 0 : 2
            })}` 
        } 
    })();
    
    const ignoreOpacity = !!color;
    
    const displayAmount = abbreviate ? formatAmountAbbreviated(amount, ignoreOpacity) : formatFullAmount(amount, currency, ignoreOpacity);

    const sign = showSign && num > 0 ? '+' : '';

    const sizeClasses = size === 'sm' ? 'text-xs' : '';

    const isAbbreviated = abbreviate && (Math.abs(num) >= 1000);

    return (
        <TooltipProvider>
            <Tooltip open={open} onOpenChange={setOpen}>
                <TooltipTrigger asChild>
                    <span
                        className={cn("cursor-help select-none inline-flex items-baseline", sizeClasses, className)}
                        style={color ? { color } : undefined}
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setOpen(!open);
                        }}
                    >
                        {currency && (
                            <span className="font-medium leading-none opacity-40 mr-0.5" style={color ? { color } : undefined}>{getCurrencySymbol(currency)}</span>
                        )}
                        <span className={cn("font-medium leading-none tracking-tight", !isAbbreviated && "tracking-tighter")} style={color ? { color } : undefined}>
                            {sign}{displayAmount}
                        </span>
                    </span>
                </TooltipTrigger>
                <TooltipContent>
                    <p>{fullAmountStr}</p>
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    );
}
