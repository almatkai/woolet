
import * as React from "react"
import { Check, ChevronsUpDown } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command"
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"
import { trpc } from "@/lib/trpc"

interface CurrencySelectorProps {
    value?: string
    onValueChange: (value: string) => void
    disabled?: boolean
}

export function CurrencySelector({ value, onValueChange, disabled }: CurrencySelectorProps) {
    const [open, setOpen] = React.useState(false)
    const [search, setSearch] = React.useState("")
    const { data: currencies, isLoading } = trpc.currency.list.useQuery();

    const selectedCurrency = currencies?.find((c: { code: string; name: string; symbol: string }) => c.code === value)

    // Filtered currencies for performance (client-side filtering is fast enough for <200 items)
    // Command component handles filtering automatically via keywords, but let's just pass all data
    // Sort currencies: selected first, then alphabetical
    const sortedCurrencies = React.useMemo(() => {
        if (!currencies) return []
        return [...currencies].sort((a, b) => {
            if (a.code === value) return -1
            if (b.code === value) return 1
            return a.code.localeCompare(b.code)
        })
    }, [currencies, value])

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className="w-[240px] justify-between"
                    disabled={disabled || isLoading}
                >
                    {value
                        ? selectedCurrency
                            ? (
                                <span className="flex items-center gap-2 truncate">
                                    <span className="font-mono">{selectedCurrency.symbol}</span>
                                    <span>{selectedCurrency.code}</span>
                                    <span className="text-muted-foreground truncate hidden sm:inline-block">
                                        - {selectedCurrency.name}
                                    </span>
                                </span>
                            )
                            : value
                        : "Select currency..."}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[280px] p-0" align="start">
                <Command>
                    <CommandInput placeholder="Search currency..." value={search} onValueChange={setSearch} />
                    <CommandList>
                        <CommandEmpty>No currency found.</CommandEmpty>
                        <CommandGroup>
                            {sortedCurrencies.map((currency) => (
                                <CommandItem
                                    key={currency.code}
                                    value={currency.code}
                                    onSelect={(currentValue) => {
                                        // cmdk lowercases the value, so we use the original code from currency object
                                        // but onSelect gives the value prop. If we pass currency.code as value, it should be fine?
                                        // cmdk checks filtering against value.
                                        // We need to pass the real code back.
                                        onValueChange(currency.code)
                                        setOpen(false)
                                    }}
                                    keywords={[currency.code, currency.name, currency.symbol]}
                                >
                                    <Check
                                        className={cn(
                                            "mr-2 h-4 w-4",
                                            value === currency.code ? "opacity-100" : "opacity-0"
                                        )}
                                    />
                                    <div className="flex items-center gap-2 flex-1 overflow-hidden">
                                        <span className="font-mono w-8 text-center bg-muted/50 rounded text-xs py-0.5">{currency.symbol}</span>
                                        <span className="font-bold">{currency.code}</span>
                                        <span className="text-muted-foreground truncate text-xs">{currency.name}</span>
                                    </div>
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    )
}
