import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";

const OUTPUT_DIR = join(process.cwd(), "public", "icons");

function iconSvg(size, padding) {
  const inner = size - padding * 2;
  const cx = size / 2;
  const cy = size / 2;
  const r = inner * 0.34;

  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${size * 0.22}" fill="#0f1122" />
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#ecc07a" stroke-width="${size * 0.045}" />
  <line x1="${cx - r * 0.9}" y1="${cy - r * 0.9}" x2="${cx + r * 0.9}" y2="${cy + r * 0.9}" stroke="#d63aa8" stroke-width="${size * 0.045}" stroke-linecap="round" />
  <line x1="${cx + r * 0.9}" y1="${cy - r * 0.9}" x2="${cx - r * 0.9}" y2="${cy + r * 0.9}" stroke="#6d6ef4" stroke-width="${size * 0.045}" stroke-linecap="round" />
</svg>`;
}

async function main() {
  await mkdir(OUTPUT_DIR, { recursive: true });

  const targets = [
    { name: "icon-192.png", size: 192, padding: 0 },
    { name: "icon-512.png", size: 512, padding: 0 },
    { name: "maskable-icon-512.png", size: 512, padding: 64 },
    { name: "apple-touch-icon.png", size: 180, padding: 0 }
  ];

  for (const target of targets) {
    const svg = Buffer.from(iconSvg(target.size, target.padding));
    await sharp(svg).png().toFile(join(OUTPUT_DIR, target.name));
    console.log(`generated icons/${target.name}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
