import { createCanvas, loadImage } from "canvas";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectDir = dirname(scriptDir);
const resourceDir = join(projectDir, "resources");
const svgPath = join(resourceDir, "icon.svg");
const pngPath = join(resourceDir, "icon.png");
const icoPath = join(resourceDir, "icon.ico");
const icoSizes = [16, 24, 32, 48, 64, 128, 256];

mkdirSync(resourceDir, { recursive: true });

const svg = readFileSync(svgPath);

async function renderPng(size) {
  const image = await loadImage(svg);
  const canvas = createCanvas(size, size);
  const context = canvas.getContext("2d");
  context.drawImage(image, 0, 0, size, size);
  return canvas.toBuffer("image/png");
}

function encodeIco(images) {
  const headerSize = 6;
  const entrySize = 16;
  const directorySize = headerSize + images.length * entrySize;
  const totalSize = directorySize + images.reduce((sum, image) => sum + image.buffer.length, 0);
  const ico = Buffer.alloc(totalSize);

  ico.writeUInt16LE(0, 0);
  ico.writeUInt16LE(1, 2);
  ico.writeUInt16LE(images.length, 4);

  let imageOffset = directorySize;
  for (const [index, image] of images.entries()) {
    const entryOffset = headerSize + index * entrySize;
    ico.writeUInt8(image.size >= 256 ? 0 : image.size, entryOffset);
    ico.writeUInt8(image.size >= 256 ? 0 : image.size, entryOffset + 1);
    ico.writeUInt8(0, entryOffset + 2);
    ico.writeUInt8(0, entryOffset + 3);
    ico.writeUInt16LE(1, entryOffset + 4);
    ico.writeUInt16LE(32, entryOffset + 6);
    ico.writeUInt32LE(image.buffer.length, entryOffset + 8);
    ico.writeUInt32LE(imageOffset, entryOffset + 12);
    image.buffer.copy(ico, imageOffset);
    imageOffset += image.buffer.length;
  }

  return ico;
}

const png = await renderPng(512);
writeFileSync(pngPath, png);

const icoImages = [];
for (const size of icoSizes) {
  icoImages.push({ size, buffer: await renderPng(size) });
}
writeFileSync(icoPath, encodeIco(icoImages));

console.log(`Generated ${pngPath}`);
console.log(`Generated ${icoPath}`);
