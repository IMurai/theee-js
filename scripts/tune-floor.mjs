/**
 * Tuning lantai (dev-only): sembunyikan contact shadow + pool cahaya, lalu
 * ukur warna lantai murni untuk beberapa kombinasi warna & envMapIntensity.
 *
 * Pakai: node scripts/tune-floor.mjs [url]
 * Keluaran: .shots/tune/<nama-varian>.png
 */
import { mkdir, access } from 'node:fs/promises';
import puppeteer from 'puppeteer-core';

const URL = process.env.SHOWROOM_URL ?? process.argv[2] ?? 'http://localhost:5173/';
const OUT_DIR = '.shots/tune';

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

// Simpan referensi material lantai, konstruktor MeshPhysicalMaterial (dari
// material cat mobil), dan sembunyikan contact shadow + pool cahaya.
await page.evaluate(() => {
  const s = window.__showroom;
  window.__physicalCtor = null;
  s.scene.traverse((o) => {
    if (!o.isMesh) return;
    const m = Array.isArray(o.material) ? o.material[0] : o.material;
    if (!m) return;
    if (m.type === 'MeshPhysicalMaterial' && !window.__physicalCtor) {
      window.__physicalCtor = m.constructor;
    }
    if (m.type === 'MeshBasicMaterial') o.visible = false;
    if ((m.type === 'MeshStandardMaterial' || m.type === 'MeshPhysicalMaterial') && o.geometry.type === 'PlaneGeometry') {
      window.__floorMesh = o;
    }
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
  console.log(`· ${label}`);
};

const VARIANTS = [
  [
    'k-phys-spec015',
    `(m, o) => {
       const P = window.__physicalCtor;
       const nm = new P({ color: '#07080b', roughness: 0.98, metalness: 0, specularIntensity: 0.15 });
       nm.envMap = m.envMap;
       nm.envMapIntensity = 0.05;
       nm.needsUpdate = true;
       o.material = nm;
     }`,
  ],
  [
    'l-phys-spec035',
    `(m) => { m.specularIntensity = 0.35; m.needsUpdate = true; }`,
  ],
  [
    'm-phys-spec015-color0d',
    `(m) => {
       m.specularIntensity = 0.15;
       m.color.set('#0d0f16');
       m.needsUpdate = true;
     }`,
  ],
  [
    'n-phys-spec015-color0d-e002',
    `(m) => { m.envMapIntensity = 0.02; }`,
  ],
];

for (const [name, src] of VARIANTS) {
  await run(name, src);
  await capture(name);
}

await browser.close();
console.log('Selesai.');
