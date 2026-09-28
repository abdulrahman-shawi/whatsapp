import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

// دمج أصناف Tailwind بشكل آمن
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
