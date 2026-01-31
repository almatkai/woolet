
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { iconNames } from "@/lib/icons";
import { IconDisplay } from "./IconDisplay";
import { cn } from "@/lib/utils";

interface IconPickerProps {
  value?: string;
  onChange: (value: string) => void;
  className?: string;
}

export function IconPicker({ value, onChange, className }: IconPickerProps) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-full justify-between", className)}
        >
          <div className="flex items-center gap-2">
            <IconDisplay icon={value} className="h-4 w-4" />
            <span className="text-muted-foreground">
              {value ? value : "Select icon..."}
            </span>
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[320px] p-2 dark:bg-black">
        <div className="h-[300px] overflow-y-auto">
          <div className="grid grid-cols-6 gap-2">
            {iconNames.map((iconName) => (
              <Button
                key={iconName}
                variant="ghost"
                className={cn(
                  "h-10 w-10 p-0",
                  value === iconName && "bg-accent text-accent-foreground"
                )}
                onClick={() => {
                  onChange(iconName);
                  setOpen(false);
                }}
              >
                <IconDisplay icon={iconName} className="h-5 w-5" />
              </Button>
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
