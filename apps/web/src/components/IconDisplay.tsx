
import { iconMap } from "@/lib/icons";
import { cn } from "@/lib/utils";

interface IconDisplayProps {
  icon?: string | null;
  className?: string;
  fallback?: string;
}

export function IconDisplay({ icon, className, fallback = "🏦" }: IconDisplayProps) {
  if (!icon) {
    return <span className={cn("flex items-center justify-center", className)}>{fallback}</span>;
  }

  // Check if it's a known Lucide icon
  const IconComponent = iconMap[icon];

  if (IconComponent) {
    return <IconComponent className={cn("h-4 w-4", className)} />;
  }

  // Fallback to text (emoji)
  return <span className={cn("text-lg leading-none flex items-center justify-center", className)}>{icon}</span>;
}
