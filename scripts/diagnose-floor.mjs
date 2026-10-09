/**
 * Diagnostik lantai (dev-only): matikan satu per satu sumber bayangan untuk
 * menemukan mana yang menghasilkan tepi elips bergerigi.
 *
 * Pakai: node scripts/diagnose-floor.mjs [url]
 * Keluaran: .shots/diag/{baseline,no-contact,no-shadow,no-fog}.png
 */
import { mkdir } from 'node:fs/promises';
import { access } from 'node:fs/promises';
import puppeteer from 'puppeteer-core';

const URL = process.env.SHOWROOM_URL ?? process.argv[2] ?? 'http://localhost:5173/';
const OUT_DIR = '.shots/diag';

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

// Kunci kamera di preset 3/4 agar semua varian memakai sudut yang sama.
await page.keyboard.press('1');
await page.waitForFunction(
  () => {
    const s = window.__showroom;
    return s && !s.rig.debugState().animActive;
  },
  { timeout: 180_000 },
);
await page.evaluate(() => {
  const s = window.__showroom;
  s.rig.setAutoRotate(false);
});

const found = await page.evaluate(() => {
  const s = window.__showroom;
  const scene = s.scene;
  const contact = [];
  const floor = [];
  const lights = [];
  scene.traverse((o) => {
    if (o.isLight && o.isDirectionalLight) lights.push(o);
    if (!o.isMesh) return;
    const m = Array.isArray(o.material) ? o.material[0] : o.material;
    if (!m) return;
    if (m.alphaMap) contact.push(o);
    if ((m.type === 'MeshStandardMaterial' || m.type === 'MeshPhysicalMaterial') && o.geometry.type === 'PlaneGeometry') floor.push(o);
  });
  return {
    contact: contact.length,
    floor: floor.length,
    lights: lights.length,
    shadowLights: lights.filter((l) => l.castShadow).length,
    hasFog: !!scene.fog,
  };
});
console.log('Scene:', JSON.stringify(found));

const capture = async (name) => {
  await page.evaluate(() => {
    const s = window.__showroom;
    s.renderer.render(s.scene, s.camera);
  });
  await new Promise((r) => setTimeout(r, 400));
  await page.screenshot({
    path: `${OUT_DIR}/${name}.png`,
    captureBeyondViewport: false,
  });
  console.log(`→ ${OUT_DIR}/${name}.png`);
};

// --- (0) baseline -----------------------------------------------------------
await capture('0-baseline');

// --- (a) matikan contact shadow radial --------------------------------------
await page.evaluate(() => {
  const s = window.__showroom;
  s.scene.traverse((o) => {
    if (!o.isMesh) return;
    const m = Array.isArray(o.material) ? o.material[0] : o.material;
    if (m?.alphaMap) o.visible = false;
  });
});
await capture('1-no-contact');

// --- (b) matikan bayangan directional light ---------------------------------
await page.evaluate(() => {
  const s = window.__showroom;
  s.scene.traverse((o) => {
    if (o.isDirectionalLight) o.castShadow = false;
  });
  s.renderer.shadowMap.needsUpdate = true;
});
await capture('2-no-shadow');

// --- (c) matikan fog ---------------------------------------------------------
await page.evaluate(() => {
  const s = window.__showroom;
  s.scene.fog = null;
});
await capture('3-no-fog');

await browser.close();
console.log('Selesai.');
