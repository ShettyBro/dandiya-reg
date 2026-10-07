import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// Tailwind-merge only knows how to dedupe its own built-in scale out of the box — without telling
// it that `max-w-page` (our custom 1400px value from tailwind.config.ts) belongs to the same
// `max-w` conflict group as `max-w-md` etc., both classes ship to the DOM together and whichever
// Tailwind happens to generate later in the stylesheet wins, regardless of prop override order.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "max-w": ["max-w-page"]
    }
  }
});

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
