import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatAccountLabel(bankName: string, accountName: string, last4Digits?: string | null) {
  const digits = last4Digits ? ` ${last4Digits}` : '';
  return `[${bankName}${digits}] ${accountName}`;
}
