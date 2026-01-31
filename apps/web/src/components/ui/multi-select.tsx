import * as React from "react"
import { Check, ChevronsUpDown } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"
import { Checkbox } from "@/components/ui/checkbox"
import { Separator } from "@/components/ui/separator"

export interface Option {
    label: string
    value: string
    icon?: React.ReactNode
}

interface MultiSelectProps {
    options: Option[]
    selected: string[]
    onChange: (selected: string[]) => void
    placeholder?: string
    className?: string
}

export function MultiSelect({
    options,
    selected,
    onChange,
    placeholder = "Select options...",
    className,
}: MultiSelectProps) {
    const [open, setOpen] = React.useState(false)

    const handleUnselect = (item: string) => {
        onChange(selected.filter((i) => i !== item))
    }

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className={cn("w-full justify-between h-9 hover:bg-background transition-colors px-2", className)}
                >
                    <div className="flex items-center gap-1 overflow-hidden min-w-0">
                        {selected.length === 0 ? (
                            <span className="text-muted-foreground font-normal truncate">{placeholder}</span>
                        ) : (
                            <span className="text-foreground truncate font-medium">
                                {selected.length > 2 
                                    ? `${selected.length} Selected` 
                                    : selected.map(id => options.find(o => o.value === id)?.label).join(", ")
                                }
                            </span>
                        )}
                    </div>
                    <ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[var(--radix-popover-trigger-width)] min-w-[200px] p-0" align="end">
                <div className="p-2 border-b">
                    <p className="text-xs font-medium text-muted-foreground px-2">Categories</p>
                </div>
                <div className="max-h-64 overflow-auto p-1">
                    {/* Select All Option (Implicitly if empty, but explicit is nice) */}
                    <div
                        className="flex items-center space-x-2 p-2 rounded-sm hover:bg-accent cursor-pointer"
                        onClick={() => {
                            if (selected.length === options.length) {
                                onChange([])
                            } else {
                                onChange(options.map(o => o.value))
                            }
                        }}
                    >
                        <Checkbox
                            checked={selected.length === options.length && options.length > 0}
                            onCheckedChange={() => { }} // Controlled by div click
                        />
                        <span className="text-sm font-medium">Select All</span>
                    </div>
                    <Separator className="my-1" />
                    {options.map((option) => (
                        <div
                            key={option.value}
                            className="flex items-center space-x-2 p-2 rounded-sm hover:bg-accent cursor-pointer"
                            onClick={() => {
                                if (selected.includes(option.value)) {
                                    onChange(selected.filter((item) => item !== option.value))
                                } else {
                                    onChange([...selected, option.value])
                                }
                            }}
                        >
                            <Checkbox
                                checked={selected.includes(option.value)}
                                onCheckedChange={() => { }} // Controlled by div click
                                id={option.value}
                            />
                            <div className="flex items-center gap-2 text-sm">
                                {option.icon}
                                {option.label}
                            </div>
                        </div>
                    ))}
                    {options.length === 0 && (
                        <p className="text-sm text-muted-foreground p-2 text-center">No categories found.</p>
                    )}
                </div>
            </PopoverContent>
        </Popover>
    )
}
