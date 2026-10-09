/**
 * Probe lantai lanjutan (dev-only): pisahkan sumber kecerahan lantai
 * (environment IBL vs lampu vs specular bebas-albedo).
 *
 * Pakai: node scripts/probe-floor.mjs [url]
 * Keluaran: .shots/probe/<nama-varian>.png
 */
import { mkdir, access } from 'node:fs/promises';
import puppeteer from 'puppeteer-core';

const URL = process.env.SHOWROOM_URL ?? process.argv[2] ?? 'http://localhost:5173/';
const OUT_DIR = '.shots/probe';

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

await page.keyboard.press('1');
await page.waitForFunction(() => !window.__showroom?.rig.debugState().animActive, {
  timeout: 180_000,
});
await page.evaluate(() => window.__showroom.rig.setAutoRotate(false));

await page.evaluate(() => {
  const s = window.__showroom;
  window.__lights = [];
  s.scene.traverse((o) => {
    if (!o.isMesh) return;
    const m = Array.isArray(o.material) ? o.material[0] : o.material;
    if (!m) return;
    if (m.alphaMap) {
      window.__basicCtor = m.constructor;
      o.visible = false;
    }
    if ((m.type === 'MeshStandardMaterial' || m.type === 'MeshPhysicalMaterial') && o.geometry.type === 'PlaneGeometry') {
      window.__floorMesh = o;
    }
  });
  s.scene.traverse((o) => {
    if (o.isLight) window.__lights.push({ light: o, intensity: o.intensity });
  });
});

const capture = async (name) => {
  await page.evaluate(() => {
    const s = window.__showroom;
    s.renderer.render(s.scene, s.camera);
  });
  await new Promise((r) => setTimeout(r, 350));
  await page.screenshot({ path: `${OUT_DIR}/${name}.png`, captureBeyondViewport: false });
  console.log(`→ ${OUT_DIR}/${name}.png`);
};

const run = async (label, fnSource) => {
  await page.evaluate((src) => {
    const apply = eval(`(${src})`);
    apply(window.__floorMesh.material, window.__floorMesh);
  }, fnSource);
  await page.evaluate(() => window.__showroom.renderer.render(
    window.__showroom.scene,
    window.__showroom.camera,
  ));
  await new Promise((r) => setTimeout(r, 350));
  console.log(`· ${label}`);
};

// --- varian ------------------------------------------------------------------
await capture('0-base'); // warna studio, env 0.12

await run('envMapIntensity = 0', `(m) => { m.envMapIntensity = 0; }`);
await capture('1-env0');

await run('envMapIntensity = 10', `(m) => { m.envMapIntensity = 10; }`);
await capture('2-env10');

await run('restore env, matikan semua lampu', `(m) => {
  m.envMapIntensity = 0.12;
  for (const e of window.__lights) e.light.intensity = 0;
}`);
await capture('3-no-lights');

await run('lampu kembali, warna hitam pekat', `(m) => {
  for (const e of window.__lights) e.light.intensity = e.intensity;
  m.color.set('#000000');
  m.envMapIntensity = 0;
}`);
await capture('4-black-albedo');

await run('warna #030406', `(m) => { m.color.set('#030406'); m.envMapIntensity = 0.12; }`);
await capture('5-030406');

await run('ganti ke MeshBasicMaterial #242424', `(m, o) => {
  o.material = new (window.__basicCtor)({ color: '#242424', fog: true });
}`);
await capture('6-basic-242424');

await browser.close();
console.log('Selesai.');
