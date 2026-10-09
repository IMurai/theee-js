/**
 * Util dev-only: bandingkan dua PNG dan laporkan jumlah + bounding box piksel
 * yang berbeda. Dipakai untuk memverifikasi efek nyata sebuah komponen render.
 *
 * Pakai: node scripts/imgdiff.mjs <a.png> <b.png> [toleransi]
 */
import { readFileSync } from 'node:fs';
import { access } from 'node:fs/promises';
import puppeteer from 'puppeteer-core';

const [fileA, fileB, tolArg] = process.argv.slice(2);
const tol = Number(tolArg ?? 0);
if (!fileA || !fileB) {
  console.error('Pakai: node scripts/imgdiff.mjs <a.png> <b.png> [toleransi]');
  process.exit(2);
}

const CHROME = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];
let exe = process.env.CHROME_PATH;
for (const c of CHROME) {
  if (exe) break;
  try {
    await access(c);
    exe = c;
  } catch {
    /* lanjut */
  }
}
if (!exe) throw new Error('Chrome/Edge tidak ditemukan.');

const toDataUrl = (f) => `data:image/png;base64,${readFileSync(f).toString('base64')}`;

const browser = await puppeteer.launch({
  executablePath: exe,
  headless: true,
  args: ['--no-sandbox', '--disable-gpu-sandbox'],
});
const page = await browser.newPage();
await page.goto('about:blank');

const result = await page.evaluate(
  async (srcA, srcB, threshold) => {
    const load = (src) =>
      new Promise((res, rej) => {
        const img = new Image();
        img.onload = () => res(img);
        img.onerror = rej;
        img.src = src;
      });
    const [a, b] = await Promise.all([load(srcA), load(srcB)]);
    const draw = (img) => {
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      return ctx.getImageData(0, 0, c.width, c.height);
    };
    const da = draw(a);
    const db = draw(b);
    const n = Math.min(da.data.length, db.data.length);
    let count = 0;
    let maxDelta = 0;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -1;
    let maxY = -1;
    const w = da.width;
    for (let i = 0; i < n; i += 4) {
      const dr = Math.abs(da.data[i] - db.data[i]);
      const dg = Math.abs(da.data[i + 1] - db.data[i + 1]);
      const dbv = Math.abs(da.data[i + 2] - db.data[i + 2]);
      const d = Math.max(dr, dg, dbv);
      if (d > maxDelta) maxDelta = d;
      if (d > threshold) {
        count += 1;
        const p = i / 4;
        const x = p % w;
        const y = Math.floor(p / w);
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    return {
      width: w,
      height: da.height,
      totalPixels: da.data.length / 4,
      count,
      pct: Number(((count / (da.data.length / 4)) * 100).toFixed(3)),
      maxDelta,
      bbox: count ? { minX, minY, maxX, maxY } : null,
    };
  },
  toDataUrl(fileA),
  toDataUrl(fileB),
  tol,
);

console.log(JSON.stringify(result, null, 2));
await browser.close();
