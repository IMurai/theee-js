/**
 * Verifikasi finish cat (dev-only): pastikan Matte/Satin/Gloss benar-benar
 * mengubah tampilan DAN warna cat yang dipilih TIDAK berubah.
 *
 * Pakai: node scripts/probe-finish.mjs [url]
 * Keluaran: .shots/finish/<id>.png
 */
import { mkdir, access } from 'node:fs/promises';
import puppeteer from 'puppeteer-core';

const URL = process.env.SHOWROOM_URL ?? process.argv[2] ?? 'http://localhost:5173/';
const OUT_DIR = '.shots/finish';

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

await mkdir(OUT_DIR, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: exe,
  headless: true,
  args: ['--no-sandbox', '--disable-gpu-sandbox'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
await page.goto(URL, { waitUntil: 'networkidle0', timeout: 180_000 });
await page.waitForFunction(
  () =>
    window.__showroom?.registry &&
    document.getElementById('loader')?.classList.contains('loader--hidden'),
  { timeout: 180_000 },
);

// Pakai warna biru supaya perubahan warna gampang terdeteksi.
await page.click('#paint-swatches .swatch[data-id="blue"]');
await new Promise((r) => setTimeout(r, 1200));

const state = async () =>
  page.evaluate(() => {
    const s = window.__showroom;
    const paint = s.registry.paintMaterials[0];
    return {
      color: `#${paint.color.getHexString()}`,
      roughness: Number(paint.roughness.toFixed(3)),
      clearcoat: Number(paint.clearcoat.toFixed(3)),
      metalness: Number(paint.metalness.toFixed(3)),
      envMapIntensity: Number(paint.envMapIntensity.toFixed(3)),
      hasEnvMap: paint.envMap !== null,
      glassEnv: s.registry.glassMaterials.map((m) => Number(m.envMapIntensity.toFixed(3))),
      wheelEnv: s.registry.wheelMaterials.map((m) => Number(m.envMapIntensity.toFixed(3))),
      caliper: `#${s.registry.caliperMaterial.color.getHexString()}`,
      active: document.querySelector('#paint-finishes .chip--active')?.textContent ?? null,
    };
  });

const results = [];
for (const id of ['matte', 'satin', 'gloss']) {
  await page.click(`#paint-finishes .chip[data-id="${id}"]`);
  await page.evaluate(() => {
    const s = window.__showroom;
    s.renderer.render(s.scene, s.camera);
  });
  await new Promise((r) => setTimeout(r, 500));
  await page.screenshot({ path: `${OUT_DIR}/${id}.png`, captureBeyondViewport: false });
  results.push({ id, ...(await state()) });
  console.log(`→ ${OUT_DIR}/${id}.png`);
}

await browser.close();
console.log(JSON.stringify(results, null, 2));

const colors = new Set(results.map((r) => r.color));
const glass = JSON.stringify(results[0].glassEnv);
const wheels = JSON.stringify(results[0].wheelEnv);
const ok =
  colors.size === 1 &&
  results.every((r) => JSON.stringify(r.glassEnv) === glass) &&
  results.every((r) => JSON.stringify(r.wheelEnv) === wheels) &&
  results.every((r) => r.caliper === results[0].caliper) &&
  results.every((r) => r.hasEnvMap) &&
  results.every((r) => r.active?.toLowerCase() === r.id) &&
  new Set(results.map((r) => `${r.roughness}/${r.clearcoat}`)).size === 3;
console.log(ok ? 'FINISH OK' : 'FINISH GAGAL');
process.exit(ok ? 0 : 1);
