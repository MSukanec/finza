import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function parseLocalDate(dateStr: string | Date): Date {
  if (!dateStr) return new Date();
  if (typeof dateStr !== 'string') return dateStr;
  
  if (dateStr.length === 10 && dateStr.includes('-')) {
     // Force midday local time to avoid GMT-3 shifting to yesterday
     return new Date(dateStr + 'T12:00:00');
  }
  return new Date(dateStr);
}
