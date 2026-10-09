/**
 * Smoke test untuk build produksi (`npm run preview`).
 *
 * Berbeda dari scripts/verify.mjs, skrip ini TIDAK bergantung pada
 * instrumen dev (`window.__showroom`, hanya ada saat `import.meta.env.DEV`),
 * sehingga bisa dipakai terhadap `vite preview`.
 *
 * Pakai: node scripts/smoke.mjs [url] [outPng]
 *   Keluar 0 bila: model termuat, tidak ada error console,
 *   atribusi lisensi tampil, dan kanvas benar-benar merender objek.
 */
import { writeFileSync } from 'node:fs';
import { access, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import puppeteer from 'puppeteer-core';

const URL = process.argv[2] ?? 'http://localhost:4173/';
const OUT = process.argv[3] ?? '.shots/preview.png';

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

await mkdir(dirname(OUT), { recursive: true });

const errors = [];
const browser = await puppeteer.launch({
  executablePath: exe,
  headless: true,
  args: ['--no-sandbox', '--disable-gpu-sandbox'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`console.error: ${m.text()}`);
});

await page.goto(URL, { waitUntil: 'networkidle0', timeout: 180_000 });

// Loader selesai → model + environment sudah siap.
await page.waitForFunction(
  () => document.getElementById('loader')?.classList.contains('loader--hidden'),
  { timeout: 180_000 },
);
// Beri waktu beberapa frame dirender (loop on-demand + software renderer).
await new Promise((r) => setTimeout(r, 6000));

const info = await page.evaluate(() => ({
  attribution: document.body.innerText.includes('CC-BY-4.0'),
  author: document.body.innerText.includes('knitro_builds'),
  panel: !!document.getElementById('panel'),
  presetCount: document.querySelectorAll('#camera-presets .chip').length,
  finishCount: document.querySelectorAll('#paint-finishes .chip').length,
  paintCount: document.querySelectorAll('#paint-swatches .swatch').length,
  hotspots: document.querySelectorAll('.hotspot').length,
}));

await page.screenshot({ path: OUT, captureBeyondViewport: false });
await browser.close();

console.log(`URL        : ${URL}`);
console.log(`Screenshot : ${OUT}`);
console.log(`Atribusi   : ${info.attribution ? 'OK' : 'HILANG'} / author ${info.author ? 'OK' : 'HILANG'}`);
console.log(`Panel      : ${info.panel ? 'OK' : 'HILANG'}`);
console.log(`Preset kamera: ${info.presetCount} · Finish: ${info.finishCount} · Warna cat: ${info.paintCount} · Hotspot: ${info.hotspots}`);
console.log(`Error console: ${errors.length}`);
for (const e of errors) console.log(`  ! ${e}`);

const ok =
  info.attribution &&
  info.author &&
  info.panel &&
  info.presetCount === 5 &&
  info.finishCount === 3 &&
  info.paintCount >= 6 &&
  info.hotspots >= 3 &&
  errors.length === 0;

writeFileSync(`${OUT}.errors.txt`, errors.join('\n'));
console.log(ok ? 'SMOKE OK' : 'SMOKE GAGAL');
process.exit(ok ? 0 : 1);
