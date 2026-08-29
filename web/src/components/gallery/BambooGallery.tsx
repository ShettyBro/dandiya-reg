import { BACKGROUND_GALLERY_FILENAMES, galleryImageUrl, splitIntoColumns } from "../../lib/gallery-manifest.js";
import { cn } from "../../lib/cn.js";

const COLUMN_ANIMATIONS = [
  "animate-scroll-up-slow",
  "animate-scroll-down-slower",
  "animate-scroll-up-slower",
  "animate-scroll-down-slow",
  "animate-scroll-up-slow",
  "animate-scroll-down-slower",
  "animate-scroll-up-slower",
  "animate-scroll-down-slow"
];

export function BambooGallery({ className }: { className?: string }) {
  const columns = splitIntoColumns(BACKGROUND_GALLERY_FILENAMES, 8);

  return (
    <div
      className={cn("fixed inset-0 -z-10 overflow-hidden pointer-events-none", className)}
      aria-hidden="true"
    >
      <div className="flex h-[116%] w-[116%] -translate-x-[7%] -translate-y-[7%] -rotate-6 gap-2.5 sm:gap-3">
        {columns.map((column, columnIndex) => {
          if (column.length === 0) {
            return null;
          }
          const loopImages = [...column, ...column];
          return (
            <div
              key={columnIndex}
              className={cn(
                "flex w-1/4 shrink-0 flex-col gap-2.5 sm:w-1/5 sm:gap-3 lg:w-[12.5%]",
                columnIndex >= 3 && "hidden sm:flex",
                COLUMN_ANIMATIONS[columnIndex % COLUMN_ANIMATIONS.length]
              )}
            >
              {loopImages.map((filename, imageIndex) => (
                <img
                  key={`${filename}-${imageIndex}`}
                  src={galleryImageUrl(filename)}
                  alt=""
                  loading="eager"
                  decoding="async"
                  className="aspect-square w-full rounded-2xl object-cover"
                />
              ))}
            </div>
          );
        })}
      </div>
      <div className="absolute inset-0 bg-midnight-950/60" />
    </div>
  );
}
