export const GALLERY_IMAGE_FILENAMES = [
  "IMG_0813.webp",
  "IMG_0814.webp",
  "IMG_0823.webp",
  "IMG_0858.webp",
  "IMG_0863.webp",
  "IMG_0896.webp",
  "IMG_0899.webp",
  "IMG_1071.webp",
  "IMG_1078.webp",
  "IMG_1095.webp",
  "IMG_1101.webp",
  "IMG20241010201923.webp",
  "IMG20241010205844.webp",
  "IMG20241010205858.webp",
  "IMG20241010220611.webp",
  "IMG20241010220614.webp",
  "IMG20241010220738.webp",
  "PXL_20241010_133407886.NIGHT.webp",
  "PXL_20241010_134325281.NIGHT.webp",
  "PXL_20241010_141638031.NIGHT.webp",
  "PXL_20241010_142112537.NIGHT.webp",
  "PXL_20241010_142212565.NIGHT.webp",
  "PXL_20241010_142757667.NIGHT.webp",
  "PXL_20241010_142823915.NIGHT.webp",
  "PXL_20241010_163319387.NIGHT.webp"
];

const BANNER_HEAVY_FILENAMES = new Set([
  "IMG_0813.webp",
  "IMG_0814.webp",
  "PXL_20241010_142212565.NIGHT.webp"
]);

export const BACKGROUND_GALLERY_FILENAMES = GALLERY_IMAGE_FILENAMES.filter(
  (filename) => !BANNER_HEAVY_FILENAMES.has(filename)
);

export function galleryImageUrl(filename: string): string {
  return `/images/gallery/${filename}`;
}

export function splitIntoColumns<T>(items: T[], columnCount: number): T[][] {
  const columns: T[][] = Array.from({ length: columnCount }, () => []);
  items.forEach((item, index) => {
    columns[index % columnCount]?.push(item);
  });
  return columns;
}
