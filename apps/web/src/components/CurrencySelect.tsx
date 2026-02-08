
import { CurrencySelector } from '@/components/ui/currency-selector';

interface CurrencySelectProps {
    value: string;
    onValueChange: (value: string) => void;
    disabled?: boolean;
}

export function CurrencySelect({ value, onValueChange, disabled }: CurrencySelectProps) {
    return (
        <CurrencySelector 
            value={value} 
            onValueChange={onValueChange} 
            disabled={disabled} 
        />
    );
}
