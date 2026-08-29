import { readdir, mkdir } from "node:fs/promises";
import { join, extname, basename } from "node:path";
import sharp from "sharp";

const SOURCE_DIR = join(process.cwd(), "public", "images");
const OUTPUT_DIR = join(SOURCE_DIR, "gallery");

async function main() {
  await mkdir(OUTPUT_DIR, { recursive: true });
  const entries = await readdir(SOURCE_DIR, { withFileTypes: true });
  const files = entries.filter(
    (entry) => entry.isFile() && [".webp", ".jpg", ".jpeg", ".png"].includes(extname(entry.name).toLowerCase())
  );

  for (const file of files) {
    const inputPath = join(SOURCE_DIR, file.name);
    const outputName = `${basename(file.name, extname(file.name))}.webp`;
    const outputPath = join(OUTPUT_DIR, outputName);

    await sharp(inputPath)
      .resize({ width: 640, height: 640, fit: "cover" })
      .webp({ quality: 68 })
      .toFile(outputPath);

    console.log(`optimized ${file.name} -> gallery/${outputName}`);
  }

  console.log(`Done. ${files.length} images optimized into ${OUTPUT_DIR}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
