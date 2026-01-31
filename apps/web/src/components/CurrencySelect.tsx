
import { trpc } from '@/lib/trpc';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';

interface CurrencySelectProps {
    value: string;
    onValueChange: (value: string) => void;
    disabled?: boolean;
}

export function CurrencySelect({ value, onValueChange, disabled }: CurrencySelectProps) {
    const { data: currencies } = trpc.currency.list.useQuery();

    return (
        <Select value={value} onValueChange={onValueChange} disabled={disabled}>
            <SelectTrigger>
                <SelectValue placeholder="Select currency" />
            </SelectTrigger>
            <SelectContent>
                {currencies?.map((c: any) => (
                    <SelectItem key={c.code} value={c.code}>
                        {c.code} - {c.name} ({c.symbol})
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}
