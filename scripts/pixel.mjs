/**
 * Util mikro (dev-only): baca piksel tertentu dari PNG screenshot.
 * Pakai: node scripts/pixel.mjs <file.png> x,y [x,y ...]
 */
import { readFileSync } from 'node:fs';
import { access } from 'node:fs/promises';
import puppeteer from 'puppeteer-core';

const file = process.argv[2];
const points = process.argv.slice(3).map((p) => p.split(',').map(Number));
if (!file || points.length === 0) {
  console.error('Pakai: node scripts/pixel.mjs <file.png> x,y [x,y ...]');
  process.exit(1);
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

const browser = await puppeteer.launch({
  executablePath: exe,
  headless: true,
  args: ['--no-sandbox', '--disable-gpu-sandbox'],
});
const page = await browser.newPage();
await page.goto('about:blank');

const dataUrl = `data:image/png;base64,${readFileSync(file).toString('base64')}`;
const out = await page.evaluate(async (src, pts) => {
  const img = new Image();
  await new Promise((res, rej) => {
    img.onload = res;
    img.onerror = rej;
    img.src = src;
  });
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0);
  return pts.map(([x, y]) => {
    const d = ctx.getImageData(x, y, 1, 1).data;
    return {
      xy: `${x},${y}`,
      hex: `#${[d[0], d[1], d[2]].map((v) => v.toString(16).padStart(2, '0')).join('')}`,
      rgb: [d[0], d[1], d[2]],
    };
  });
}, dataUrl, points);

for (const r of out) console.log(`${r.xy}  ${r.hex}  rgb(${r.rgb.join(',')})`);
await browser.close();
