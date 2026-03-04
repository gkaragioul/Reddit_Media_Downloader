#!/usr/bin/env node
/**
 * Generate icon.png (256x256) and icon.ico from icon.svg
 */
import sharp from 'sharp';
import pngToIco from 'png-to-ico';
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const assetsDir = join(__dirname, '..', 'assets');

const svgPath = join(assetsDir, 'icon.svg');
const pngPath = join(assetsDir, 'icon.png');
const icoPath = join(assetsDir, 'icon.ico');

async function main() {
  const svg = readFileSync(svgPath);

  // Generate 256x256 PNG
  await sharp(svg).resize(256, 256).png().toFile(pngPath);
  console.log('Created icon.png (256x256)');

  // Convert PNG to ICO
  const pngBuf = readFileSync(pngPath);
  const icoBuf = await pngToIco([pngBuf]);
  writeFileSync(icoPath, icoBuf);
  console.log('Created icon.ico');
}

main().catch((err) => {
  console.error('Icon generation failed:', err);
  process.exit(1);
});
