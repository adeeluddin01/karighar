// Bakes every app icon from the brand vector.
//
//   node scripts/icons.mjs
//
// public/brand/karighar-logo-3d.svg is the master; the square and maskable
// variants beside it are the same artwork with the tile bled to the edges.
// Re-run this after any change to them.
//
// Why bake PNGs when we have an SVG: the mark's materials are SVG filters
// (feDiffuseLighting / feSpecularLighting / feTurbulence), and filter support
// outside browsers is patchy — favicon pipelines, OS icon caches and
// link-preview scrapers variously ignore them and would render a flat
// silhouette instead.
//
// Everything is rendered at 2x and downsampled. That is not just for edges:
// the velvet pile's fine layer is sub-pixel at icon sizes, so rasterising
// straight to the target turns it into harsh per-pixel noise, which looks
// wrong AND is incompressible. Averaging it down gives a soft pile and a
// third off the file size.
import { chromium } from "playwright";
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

const ROUNDED = read("public/brand/karighar-logo-3d.svg");
const SQUARE = read("public/brand/karighar-logo-square.svg");
const MASKABLE = read("public/brand/karighar-logo-maskable.svg");

const JOBS = [
  // Next.js file conventions. icon.png is the tab/link icon — 256 is ample
  // next to favicon.ico, and keeps a noisy texture out of a 512 download.
  { svg: ROUNDED, size: 256, out: "src/app/icon.png" },
  // iOS masks and ignores alpha, so this one is square and full-bleed.
  { svg: SQUARE, size: 180, out: "src/app/apple-icon.png" },
  // Referenced by src/app/manifest.ts.
  { svg: ROUNDED, size: 192, out: "public/icon-192.png", colours: 180 },
  { svg: ROUNDED, size: 512, out: "public/icon-512.png", colours: 160 },
  { svg: MASKABLE, size: 512, out: "public/icon-maskable-512.png", colours: 160 },
];
const ICO_SIZES = [16, 32, 48];
const SS = 2;

async function render(page, svg, size) {
  const px = size * SS;
  const sized = svg.replace(/width="1024" height="1024"/, `width="${px}" height="${px}"`);
  await page.setViewportSize({ width: px, height: px });
  await page.setContent(`<body style="margin:0;background:transparent">${sized}</body>`, {
    waitUntil: "load",
  });
  await page.waitForTimeout(220); // let the filter chain settle
  const big = await page.screenshot({ omitBackground: true });
  let img = sharp(big).resize(size, size, { kernel: "lanczos3" });
  return img.png({ compressionLevel: 9, effort: 10 }).toBuffer();
}

/** Minimal ICO writer: a short header plus one embedded PNG per size. */
function buildIco(parts) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(parts.length, 4);
  let offset = 6 + parts.length * 16;
  const dir = [];
  for (const { size, buf } of parts) {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0); // 0 means 256
    e.writeUInt8(size >= 256 ? 0 : size, 1);
    e.writeUInt16LE(1, 4); // colour planes
    e.writeUInt16LE(32, 6); // bpp
    e.writeUInt32LE(buf.length, 8);
    e.writeUInt32LE(offset, 12);
    dir.push(e);
    offset += buf.length;
  }
  return Buffer.concat([header, ...dir, ...parts.map((p) => p.buf)]);
}

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
let total = 0;

for (const { svg, size, out, colours } of JOBS) {
  let buf = await render(page, svg, size);
  if (colours) {
    // Velvet noise is incompressible at full depth; a tight palette costs
    // about one value of drift and roughly a third of the bytes.
    const q = await sharp(buf)
      .png({ palette: true, colours, dither: 0, compressionLevel: 9, effort: 10 })
      .toBuffer();
    if (q.length < buf.length) buf = q;
  }
  fs.writeFileSync(path.join(ROOT, out), buf);
  total += buf.length;
  console.log(`  ${out.padEnd(32)} ${String(size).padStart(3)}px  ${(buf.length / 1024).toFixed(1).padStart(6)} KB`);
}

const parts = [];
for (const size of ICO_SIZES) parts.push({ size, buf: await render(page, ROUNDED, size) });
const ico = buildIco(parts);
fs.writeFileSync(path.join(ROOT, "src/app/favicon.ico"), ico);
total += ico.length;
console.log(`  ${"src/app/favicon.ico".padEnd(32)} ${ICO_SIZES.join("/")}  ${(ico.length / 1024).toFixed(1).padStart(6)} KB`);
console.log(`  ${"".padEnd(32)}        ${(total / 1024).toFixed(1).padStart(6)} KB total`);

await browser.close();
