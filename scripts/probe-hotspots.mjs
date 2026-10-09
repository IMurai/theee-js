/**
 * Util dev-only: inspeksi status hotspot di browser (sisi jauh / opacity).
 * Pakai: node scripts/probe-hotspots.mjs [hotkey]
 */
import puppeteer from 'puppeteer-core';

const key = process.argv[2] ?? '4';
const URL = process.env.SHOWROOM_URL ?? 'http://localhost:5173/';

const CHROME = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];
const { access } = await import('node:fs/promises');
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
await page.setViewport({ width: 1440, height: 900 });
await page.goto(URL, { waitUntil: 'networkidle0', timeout: 180_000 });

await page.waitForFunction(() => window.__showroom, { timeout: 180_000 });
// Tunggu model siap + layer hotspot sudah dibuat.
await page.waitForFunction(
  () => window.__showroom?.registry && document.querySelectorAll('.hotspot').length > 0,
  { timeout: 180_000 },
);

await page.keyboard.press(key);
await new Promise((r) => setTimeout(r, 9000));

const out = await page.evaluate(() => {
  const s = window.__showroom;
  return {
    hotspot: s.activePreset?.() ?? null,
    cameraPos: s.camera.position.toArray().map((v) => Number(v.toFixed(2))),
    hotspots: s.hotspots ? s.hotspots() : 'tidak ada',
    dom: [...document.querySelectorAll('.hotspot')].map((e) => ({
      id: e.dataset.id,
      computed: getComputedStyle(e).opacity,
      inline: e.style.opacity,
    })),
  };
});

console.log(JSON.stringify(out, null, 2));
await browser.close();
