/**
 * Util verifikasi visual (dev-only).
 *
 * Menjalankan Chrome headless terhadap dev server, menangkap console log
 * (untuk memvalidasi scene dump AGENTS.md bagian 2), lalu mengambil screenshot
 * dari ≥ 3 sudut kamera.
 *
 * Pakai:
 *   npm run dev            # terminal 1
 *   npm run verify         # terminal 2
 *
 * Hasil: .shots/*.png
 */
import puppeteer from 'puppeteer-core';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SHOTS = path.join(ROOT, '.shots');
const URL = process.env.SHOWROOM_URL ?? 'http://localhost:5173/';

const CHROME_CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];

/** Sesi: [nama file, hotkey preset kamera]. */
const VIEWS = [
  ['01-three-quarter', '1'],
  ['02-front', '2'],
  ['03-side', '3'],
  ['04-rear', '4'],
  ['05-top', '5'],
];

async function findChrome() {
  const { access } = await import('node:fs/promises');
  for (const p of CHROME_CANDIDATES) {
    try {
      await access(p);
      return p;
    } catch {
      /* lanjut */
    }
  }
  throw new Error('Chrome/Edge tidak ditemukan. Set CHROME_PATH secara manual.');
}

const logs = [];

async function main() {
  await mkdir(SHOTS, { recursive: true });
  const executablePath = process.env.CHROME_PATH ?? (await findChrome());

  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-gpu-sandbox',
      '--enable-unsafe-swiftshader',
      '--use-angle=swiftshader',
      '--hide-scrollbars',
      '--window-size=1440,900',
    ],
    defaultViewport: { width: 1440, height: 900, deviceScaleFactor: 1 },
  });

  const page = await browser.newPage();

  page.on('console', (msg) => {
    const text = msg.text();
    logs.push(`[${msg.type()}] ${text}`);
    if (msg.type() === 'error') console.error('  console.error:', text);
  });
  page.on('pageerror', (err) => logs.push(`[pageerror] ${err.message}`));
  page.on('requestfailed', (req) =>
    logs.push(`[requestfailed] ${req.url()} — ${req.failure()?.errorText}`),
  );
  page.on('response', (res) => {
    if (res.status() >= 400) logs.push(`[http ${res.status()}] ${res.url()}`);
  });

  console.log(`→ Membuka ${URL}`);
  await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60_000 });

  // Tunggu loading screen selesai (model 21 MB).
  await page
    .waitForFunction(() => {
      const el = document.getElementById('loader');
      return !el || el.hidden || el.classList.contains('loader--hidden');
    }, { timeout: 90_000 })
    .catch(() => console.warn('  ! Loader tidak selesai dalam 90s'));

  // Beri waktu transisi & beberapa frame render.
  await new Promise((r) => setTimeout(r, 2500));

  // --- Badge verifikasi: tertulis langsung di screenshot agar tidak ambigu ---
  // Warna badge unik per langkah — dipakai untuk memverifikasi isi file
  // screenshot lewat piksel (tanpa membaca gambar secara visual).
  const BADGE_COLORS = {
    paint: 'rgb(200, 60, 180)',
    v1: 'rgb(34, 197, 94)',
    v2: 'rgb(234, 179, 8)',
    v3: 'rgb(168, 85, 247)',
    v4: 'rgb(239, 68, 68)',
    v5: 'rgb(6, 182, 212)',
    v6: 'rgb(249, 115, 22)',
  };

  await page.evaluate(() => {
    const badge = document.createElement('div');
    badge.id = 'verify-badge';
    badge.style.cssText = [
      'position:fixed',
      'left:16px',
      'top:64px',
      'z-index:9999',
      'padding:8px 14px',
      'font:700 16px/1.4 ui-monospace,Consolas,monospace',
      'color:#fff',
      'background:#000',
      'border-radius:6px',
      'letter-spacing:.05em',
      'pointer-events:none',
    ].join(';');
    document.body.appendChild(badge);
  });

  const audits = [];

  const setBadge = async (text, rgb) => {
    const css = Array.isArray(rgb)
      ? `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`
      : rgb;
    // Dibuat lazily: setViewport(isMobile) bisa mereset DOM → badge harus
    // dibuat ulang bila hilang.
    return page.evaluate(
      (t, c) => {
        let el = document.getElementById('verify-badge');
        if (!el) {
          el = document.createElement('div');
          el.id = 'verify-badge';
          el.style.cssText = [
            'position:fixed',
            'left:16px',
            'top:64px',
            'z-index:9999',
            'padding:8px 14px',
            'font:700 16px/1.4 ui-monospace,Consolas,monospace',
            'color:#fff',
            'background:#000',
            'border-radius:6px',
            'letter-spacing:.05em',
            'pointer-events:none',
          ].join(';');
          document.body.appendChild(el);
        }
        el.textContent = t;
        el.style.background = c;
        const r = el.getBoundingClientRect();
        return `${getComputedStyle(el).backgroundColor} rect=${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.width)}x${Math.round(r.height)}`;
      },
      text,
      css,
    );
  };

  /**
   * Verifikasi isi file screenshot SEBENARNYA: buka PNG hasil `page.screenshot`
   * di halaman terpisah, gambar ke canvas, lalu baca piksel badge dan piksel
   * tengah mobil.
   *
   * PENTING: audit sengaja DIJADWALKAN belakangan (lihat runAudits), karena
   * membuka tab baru membuat halaman utama hidden → render loop kita pause
   * (visibilitychange) → screenshot berikutnya jadi stale.
   */
  const scheduleAudit = (name, expectedRgb) => {
    audits.push({ name, expectedRgb });
  };

  const runAudits = async () => {
    const { readFileSync } = await import('node:fs');
    const probe = await browser.newPage();
    await probe.goto('about:blank');

    let failed = 0;
    for (const { name, expectedRgb } of audits) {
      const file = path.join(SHOTS, `${name}.png`);
      const dataUrl = `data:image/png;base64,${readFileSync(file).toString('base64')}`;

      const result = await probe.evaluate(async (src, badge) => {
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

        // Piksel badge: di padding kiri (x=25, antara tepi 16 dan teks 30),
        // tegak di tengah tinggi badge — hindari sudut membulat & teks.
        const b = ctx.getImageData(25, 80, 1, 1).data;
        // Piksel tengah viewport (area mobil).
        const m = ctx.getImageData(c.width >> 1, c.height >> 1, 1, 1).data;
        const hex = (d) =>
          `#${[d[0], d[1], d[2]]
            .map((v) => v.toString(16).padStart(2, '0'))
            .join('')}`;
        return {
          size: `${c.width}x${c.height}`,
          badgePx: hex(b),
          centerPx: hex(m),
          badgeOk:
            Math.abs(b[0] - badge[0]) <= 8 &&
            Math.abs(b[1] - badge[1]) <= 8 &&
            Math.abs(b[2] - badge[2]) <= 8,
        };
      }, dataUrl, expectedRgb);

      if (!result.badgeOk) failed += 1;
      console.log(
        `  [${result.badgeOk ? 'OK  ' : 'GAGAL'}] ${name} | ${result.size} | badge=${result.badgePx} (harap ${expectedRgb.join(',')}) | pusat=${result.centerPx}`,
      );
    }
    await probe.close();
    return failed;
  };

  /**
   * Screenshot yang andal: paksa beberapa frame baru dulu, lalu pakai
   * captureBeyondViewport:false — solusi untuk frame stale pada headless
   * yang halaman-nya terus dirender ulang.
   */
  const shoot = async (name) => {
    // Pastikan halaman utama tampak/aktif — kalau tidak, Chrome tidak
    // mem-paint frame baru dan screenshot jadi stale.
    await page.bringToFront();
    await page.evaluate(
      () =>
        new Promise((r) => {
          let n = 0;
          const step = () => (++n >= 4 ? r() : requestAnimationFrame(step));
          requestAnimationFrame(step);
        }),
    );
    await page.screenshot({
      path: path.join(SHOTS, `${name}.png`),
      captureBeyondViewport: false,
    });
    console.log(`→ Screenshot: ${name}.png`);
  };

  const readState = () =>
    page.evaluate(() => {
      const api = window.__showroom;
      if (!api) return null;
      const paint = api.registry?.paintMaterial;
      return {
        bootId: api.bootId,
        preset: api.activePreset(),
        paint: paint ? `#${paint.color.getHexString()}` : null,
        centerPx: api.sampleCenter(),
        ...api.rig.debugState(),
      };
    });

  // --- Uji ganti warna cat ----------------------------------------------
  const waitForPaint = (expectedHex) =>
    page.waitForFunction(
      (hex) => {
        const api = window.__showroom;
        const m = api?.registry?.paintMaterial;
        return m && `#${m.color.getHexString()}` === hex;
      },
      { timeout: 30_000, polling: 200 },
      expectedHex,
    );

  const blueSwatch = await page.$('#paint-swatches .swatch[data-id="blue"]');
  if (blueSwatch) {
    await blueSwatch.click();
    await waitForPaint('#1f5fbf').catch(() =>
      console.warn('  ! Transisi warna biru tidak selesai'),
    );
    const st = await readState();
    await setBadge(`PAINT-BLUE | paint=${st?.paint}`, BADGE_COLORS.paint);
    await shoot('00-paint-blue');
    console.log('→ 00-paint-blue:', JSON.stringify(st));
    scheduleAudit('00-paint-blue', [200, 60, 180]);

    // Kembalikan ke hitam.
    const black = await page.$('#paint-swatches .swatch[data-id="black"]');
    await black?.click();
    await waitForPaint('#0e0e10').catch(() =>
      console.warn('  ! Transisi warna hitam tidak selesai'),
    );
  }

  // Matikan auto-rotate selama verifikasi agar screenshot tidak bergeser.
  await page.evaluate(() => {
    const box = document.getElementById('toggle-rotate');
    if (box instanceof HTMLInputElement && box.checked) box.click();
  });
  await new Promise((r) => setTimeout(r, 400));

  // --- Screenshot tiap sudut --------------------------------------------
  const BADGE_RGB = {
    '01-three-quarter': [34, 197, 94],
    '02-front': [234, 179, 8],
    '03-side': [168, 85, 247],
    '04-rear': [239, 68, 68],
    '05-top': [6, 182, 212],
  };
  // Headless memakai SwiftShader (render software) → FPS rendah.
  // Karena itu kita TUNGGU animasi benar-benar selesai, bukan fixed delay.
  for (const [name, hotkey] of VIEWS) {
    await page.keyboard.press(hotkey);

    await page
      .waitForFunction(
        () => {
          const api = window.__showroom;
          if (!api) return false;
          const s = api.rig.debugState();
          return !s.animActive && s.updateAgeMs !== null && s.updateAgeMs < 500;
        },
        { timeout: 30_000, polling: 200 },
      )
      .catch(() => console.warn(`  ! Animasi preset ${name} tidak selesai`));

    await new Promise((r) => setTimeout(r, 500));

    const info = await readState();
    const applied = await setBadge(
      `${name.toUpperCase()} | preset=${info?.preset} az=${info?.azimuthDeg?.toFixed(1)}`,
      BADGE_RGB[name],
    );
    console.log(`  hotkey ${hotkey} →`, JSON.stringify(info), '| badge→', applied);

    await shoot(name);
    scheduleAudit(name, BADGE_RGB[name]);
  }

  // --- Screenshot mobile ---------------------------------------------------
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await new Promise((r) => setTimeout(r, 2500));
  await setBadge('MOBILE | bottom sheet', BADGE_COLORS.v6);
  await shoot('06-mobile');
  scheduleAudit('06-mobile', [249, 115, 22]);

  // --- Audit isi file screenshot (setelah semua screenshot selesai) ----------
  console.log('\n=== Audit screenshot (baca piksel PNG) ===');
  const failedAudits = await runAudits();
  if (failedAudits > 0) {
    console.log(`\n! ${failedAudits} screenshot tidak cocok (frame stale).`);
    process.exitCode = 1;
  }

  // --- Cetak log debug -----------------------------------------------------
  const dump = logs.filter(
    (l) =>
      l.includes('[showroom]') ||
      l.includes('error') ||
      l.includes('pageerror') ||
      l.includes('requestfailed') ||
      l.includes('http 4'),
  );
  if (dump.length > 0) {
    console.log('\n=== Console (filter) ===');
    for (const line of dump) console.log(line);
  } else {
    console.log('\n=== Console bersih (tidak ada error/showroom) ===');
  }

  await browser.close();
}

main().catch((err) => {
  console.error('Verifikasi gagal:', err);
  process.exitCode = 1;
});
