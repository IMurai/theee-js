import './styles.css';
import * as THREE from 'three';
import {
  CALIPER_PRESETS,
  CAMERA_FOV,
  CAMERA_FOV_PORTRAIT,
  CAMERA_PRESETS,
  EXPOSURE_NIGHT,
  EXPOSURE_STUDIO,
  PAINT_FINISHES,
  PAINT_FINISH_DEFAULT_ID,
  PAINT_PRESETS,
  PORTRAIT_ASPECT,
  PORTRAIT_DISTANCE_FACTOR,
  WHEEL_PRESETS,
} from './config';
import { createRenderer } from './core/renderer';
import { createScene } from './core/scene';
import { createCameraRig } from './core/camera-rig';
import { createLoop } from './core/loop';
import { observeSize } from './core/resize';
import { loadCar, type LoadedCar } from './car/loader';
import { PaintController } from './car/paint';
import { CarLights } from './car/lights';
import { createWheelAnimator } from './car/wheels';
import {
  createChips,
  createLoaderUi,
  createPanel,
  createSwatches,
} from './ui/overlay';
import { createHotspots } from './ui/hotspots';
import { saveScreenshot } from './ui/screenshot';

const PAINT_KEY = 'bmw-m4.paint';
const ENV_KEY = 'bmw-m4.env';

function readStored(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStored(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* preferensi tidak penting — abaikan */
  }
}

function requireInput(id: string): HTMLInputElement {
  const node = document.getElementById(id);
  if (!(node instanceof HTMLInputElement)) throw new Error(`Input #${id} tidak ditemukan.`);
  return node;
}

function requireDiv(id: string): HTMLElement {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Elemen #${id} tidak ditemukan.`);
  return node;
}

async function boot(): Promise<void> {
  const canvas = document.getElementById('scene');
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error('Canvas #scene tidak ditemukan.');
  }

  const loaderUi = createLoaderUi();
  const panel = createPanel();
  const prefersReducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  loaderUi.setProgress(0.02, 'Menyiapkan studio…');

  // --- Core -------------------------------------------------------------
  const core = createRenderer(canvas);
  const { renderer, anisotropy } = core;
  const studio = createScene(renderer, core.shadowMapSize);
  const scene = studio.scene;

  const camera = new THREE.PerspectiveCamera(CAMERA_FOV, 1, 0.1, 200);
  camera.position.set(5.4, 2.4, 5.6);

  const rig = createCameraRig(camera, canvas, prefersReducedMotion);
  rig.controls.target.set(0, 0.6, 0);
  rig.controls.update();

  // --- Render on-demand ------------------------------------------------------
  // Frame dirender HANYA bila ada yang berubah (kamera, transisi warna,
  // roda berputar, resize, ganti material, dsb). Ini diminta AGENTS.md §6.
  let needsRender = true;
  const requestRender = (shadow = false) => {
    needsRender = true;
    if (shadow) core.invalidateShadows();
  };

  // OrbitControls memberi tahu lewat event 'change' saat kamera bergerak
  // (termasuk damping & auto-rotate), jadi semua kasus kamera tercakup.
  rig.controls.addEventListener('change', () => requestRender());

  // --- Muat model --------------------------------------------------------
  let car: LoadedCar | null = null;
  try {
    car = await loadCar((p) => loaderUi.setProgress(p.ratio));
  } catch (err) {
    console.error('[showroom] Gagal memuat GLB:', err);
    loaderUi.setError();
    loaderUi.onRetry(() => window.location.reload());
    // Lanjut tanpa mobil agar UI tetap bisa dipakai.
  }

  if (car) {
    applyAnisotropy(car.root, anisotropy);
    scene.add(car.root);
    loaderUi.setProgress(0.98, 'Menyiapkan pencahayaan…');
  }

  // --- State tampilan -----------------------------------------------------
  let night = readStored(ENV_KEY) === 'night';

  const applyEnv = () => {
    renderer.toneMappingExposure = night ? EXPOSURE_NIGHT : EXPOSURE_STUDIO;
    studio.setNightMode(night);
    const btn = document.getElementById('btn-env');
    btn?.classList.toggle('btn--active', night);
    btn?.setAttribute('aria-pressed', String(night));
    requestRender(true);
  };

  // --- Kontrolan mobil ----------------------------------------------------
  const paint = car ? new PaintController(car.registry) : null;
  // WAJIB: tanpa envMap eksplisit, envMapIntensity per-finish diabaikan
  // three.js (lihat catatan di src/car/paint.ts → setEnvironment).
  paint?.setEnvironment(studio.environment);
  const lights = car ? new CarLights(car.registry) : null;
  const wheels = car ? createWheelAnimator(car.root) : null;
  const hotspots = car
    ? createHotspots(requireDiv('hotspots'), car.root)
    : null;

  // --- Preset kamera ------------------------------------------------------
  const chips = createChips(
    requireDiv('camera-presets'),
    CAMERA_PRESETS,
    (preset) => {
      rig.applyPreset(preset);
      chips.select(preset.id);
    },
    {
      aria: (preset) => `Kamera ${preset.label}, hotkey ${preset.hotkey}`,
      title: (preset) => `${preset.label} (${preset.hotkey})`,
    },
  );
  chips.select('three-quarter');

  const applyPresetByKey = (key: string) => {
    const preset = CAMERA_PRESETS.find((p) => p.hotkey === key || p.id === key);
    if (!preset) return;
    rig.applyPreset(preset);
    chips.select(preset.id);
  };

  // --- Swatches warna -----------------------------------------------------
  const storedPaint = readStored(PAINT_KEY);
  const initialPaint =
    PAINT_PRESETS.find((p) => p.hex.toLowerCase() === storedPaint?.toLowerCase()) ??
    PAINT_PRESETS[0];

  const paintSwatches = createSwatches(
    requireDiv('paint-swatches'),
    PAINT_PRESETS,
    initialPaint.id,
    (item) => {
      paint?.set(item.hex);
      paintSwatches.select(item.id);
      writeStored(PAINT_KEY, item.hex);
      requestRender();
    },
  );

  // --- Finish cat (matte / satin / gloss) ---------------------------------
  // Semua nilai ada di PAINT_FINISHES (config.ts). Warna cat tidak disentuh,
  // jadi warna yang dipilih tetap sama saat finish berganti.
  const finishChips = createChips(
    requireDiv('paint-finishes'),
    PAINT_FINISHES,
    (finish) => {
      paint?.setFinish(finish);
      finishChips.select(finish.id);
      requestRender();
    },
  );
  finishChips.select(PAINT_FINISH_DEFAULT_ID);

  const wheelSwatches = createSwatches(
    requireDiv('wheel-swatches'),
    WHEEL_PRESETS,
    WHEEL_PRESETS[0].id,
    (item) => {
      if (car) {
        for (const m of car.registry.wheelMaterials) {
          // Jangan ubah 'sidetyre' (dinding ban) — hanya permukaan velg.
          if (m.name === 'sidetyre') continue;
          m.color.set(item.hex);
          m.needsUpdate = true;
        }
      }
      wheelSwatches.select(item.id);
      requestRender(true);
    },
  );

  const caliperSwatches = createSwatches(
    requireDiv('caliper-swatches'),
    CALIPER_PRESETS,
    CALIPER_PRESETS[0].id,
    (item) => {
      const mat = car?.registry.caliperMaterial;
      if (mat) {
        mat.color.set(item.hex);
        mat.needsUpdate = true;
      }
      caliperSwatches.select(item.id);
      requestRender(true);
    },
  );

  // --- Preset warna: terapkan warna awal ke material -----------------------
  // Tanpa ini, swatch terlihat aktif tapi warna GLB asli masih dipakai.
  if (paint) {
    paint.setInstant(storedPaint ?? initialPaint.hex);
  }

  // Color picker bebas.
  const customPicker = requireInput('paint-custom');
  customPicker.value = storedPaint ?? initialPaint.hex;
  customPicker.addEventListener('input', () => {
    paint?.set(customPicker.value);
    paintSwatches.select('__custom__');
    writeStored(PAINT_KEY, customPicker.value);
    requestRender();
  });

  // --- Toggles ------------------------------------------------------------
  const toggleLights = requireInput('toggle-lights');
  const toggleWheels = requireInput('toggle-wheels');
  const toggleRotate = requireInput('toggle-rotate');

  toggleLights.addEventListener('change', () => {
    lights?.set(toggleLights.checked);
    requestRender(true);
  });
  toggleWheels.addEventListener('change', () => {
    wheels?.setEnabled(toggleWheels.checked);
    requestRender(true);
  });

  toggleRotate.checked = !prefersReducedMotion;
  rig.setAutoRotate(toggleRotate.checked);
  toggleRotate.addEventListener('change', () => rig.setAutoRotate(toggleRotate.checked));

  // --- Tombol atas ---------------------------------------------------------
  document.getElementById('btn-env')?.addEventListener('click', () => {
    night = !night;
    applyEnv();
    writeStored(ENV_KEY, night ? 'night' : 'studio');
  });

  const shoot = () => saveScreenshot(renderer, scene, camera);
  document.getElementById('btn-screenshot')?.addEventListener('click', shoot);

  // --- Hotkey ---------------------------------------------------------------
  const isTyping = (target: EventTarget | null): boolean => {
    const node = target as HTMLElement | null;
    if (!node) return false;
    return (
      node.tagName === 'INPUT' ||
      node.tagName === 'TEXTAREA' ||
      node.isContentEditable
    );
  };

  window.addEventListener('keydown', (e) => {
    if (isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;

    const preset = CAMERA_PRESETS.find((p) => p.hotkey === e.key);
    if (preset) {
      applyPresetByKey(e.key);
      return;
    }

    switch (e.key.toLowerCase()) {
      case 's':
        shoot();
        break;
      case 'e':
        night = !night;
        applyEnv();
        writeStored(ENV_KEY, night ? 'night' : 'studio');
        break;
      case 'p':
        panel.toggle();
        break;
      default:
        break;
    }
  });

  applyEnv();

  // --- Resize ---------------------------------------------------------------
  // FOV & jarak kamera menyesuaikan rasio aspek: di layar portrait horizontal
  // FOV menyempit drastis, jadi FOV vertikal dinaikkan + jarak ditambah.
  const applyFraming = (w: number, h: number) => {
    const aspect = w / h;
    camera.aspect = aspect;
    camera.fov =
      aspect < PORTRAIT_ASPECT ? CAMERA_FOV_PORTRAIT : CAMERA_FOV;
    camera.updateProjectionMatrix();

    const portrait = aspect < PORTRAIT_ASPECT;
    rig.setDistanceFactor(portrait ? PORTRAIT_DISTANCE_FACTOR : 1);
  };

  const stopObserve = observeSize(canvas.parentElement ?? canvas, (w, h) => {
    applyFraming(w, h);
    core.resize(w, h);
    requestRender(true);
  });

  // Terapkan preset default SETELAH framing (FOV/faktor jarak) diketahui,
  // supaya jarak awal sudah memperhitungkan layar sempit.
  rig.applyPreset(CAMERA_PRESETS[0]);
  requestRender();

  // --- Loop ------------------------------------------------------------------
  const fpsEl = document.getElementById('fps');
  let frames = 0;
  let fpsClock = 0;
  let renderedFrames = 0;
  const size = new THREE.Vector2();

  const loop = createLoop({
    onFrame(deltaSec) {
      rig.update(deltaSec);

      const hadPaintTransition = paint?.isTransitioning ?? false;
      paint?.update(performance.now());

      const wheelsActive = wheels?.isEnabled() ?? false;
      if (wheelsActive) {
        wheels?.update(deltaSec);
        // Roda bergerak → bayangannya juga harus ikut diperbarui.
        requestRender(true);
      }

      // Transisi warna butuh frame terus-menerus sampai selesai.
      if (hadPaintTransition || paint?.isTransitioning) requestRender();

      if (!needsRender) return;
      needsRender = false;

      renderer.render(scene, camera);
      renderedFrames += 1;

      renderer.getSize(size);
      hotspots?.update(camera, size.x, size.y);

      if (import.meta.env.DEV && fpsEl) {
        frames += 1;
        fpsClock += deltaSec;
        if (fpsClock >= 0.5) {
          fpsEl.hidden = false;
          fpsEl.textContent = `FPS ${Math.round(frames / fpsClock)} · frame dirender ${renderedFrames}`;
          frames = 0;
          fpsClock = 0;
        }
      }
    },
  });

  if (car) loaderUi.setDone();
  loop.start();

  // --- Instrumentasi dev: dipakai scripts/verify.mjs untuk memverifikasi ----
  if (import.meta.env.DEV) {
    const w = window as unknown as Record<string, unknown>;
    w.__bootCount = ((w.__bootCount as number | undefined) ?? 0) + 1;
    (window as unknown as Record<string, unknown>).__showroom = {
      bootId: w.__bootCount,
      camera,
      rig,
      renderer,
      scene,
      registry: car?.registry ?? null,
      /** Status hotspot — dipakai untuk memverifikasi penyembunyian sisi jauh. */
      hotspots: () => hotspots?.debugState() ?? null,
      /** Preset kamera yang sedang aktif (berdasarkan chip UI). */
      activePreset: () =>
        document.querySelector('#camera-presets .chip--active')?.textContent ?? null,
      /**
       * Render ulang lalu baca piksel tengah canvas WebGL.
       * Verifikasi andal untuk memastikan output renderer benar-benar berubah
       * (tidak bergantung pada screenshot kompositor yang bisa stale).
       */
      sampleCenter: () => {
        renderer.render(scene, camera);
        const gl = renderer.getContext();
        const w = renderer.domElement.width;
        const h = renderer.domElement.height;
        const px = new Uint8Array(4);
        gl.readPixels(w >> 1, h >> 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
        return `#${[px[0], px[1], px[2]]
          .map((v) => v.toString(16).padStart(2, '0'))
          .join('')}`;
      },
    };
  }

  // --- Debug (hanya dev): validasi tabel AGENTS.md bagian 2 -----------------
  if (import.meta.env.DEV && car) {
    console.group('[showroom] Scene dump');
    console.table(car.registry.sceneDump);
    console.log('[showroom] Material ditemukan:', [...car.registry.all.keys()]);
    console.log('[showroom] Panjang mobil setelah normalisasi:', car.length.toFixed(3));
    console.log('[showroom] Jumlah mesh cat:', car.registry.paintMeshes.length);
    console.log('[showroom] Material velg:', car.registry.wheelMaterials.map((m) => m.name));
    console.log('[showroom] Kaliper:', car.registry.caliperMaterial?.name ?? 'tidak ada');
    console.log('[showroom] Lampu depan:', car.registry.headlampMaterials.map((m) => m.name));
    console.log('[showroom] Lampu belakang:', car.registry.tailMaterials.map((m) => m.name));
    console.log('[showroom] Kaca:', car.registry.glassMaterials.map((m) => m.name));
    console.groupEnd();
  }

  // --- Cleanup (hot-reload) ---------------------------------------------------
  if (import.meta.hot) {
    import.meta.hot.dispose(() => {
      loop.stop();
      stopObserve();
      rig.dispose();
      hotspots?.dispose();
      wheels?.dispose();
      paint?.dispose();
      car?.dispose();
      studio.dispose();
      core.dispose();
    });
  }
}

function applyAnisotropy(root: THREE.Object3D, maxAniso: number): void {
  const seen = new Set<THREE.Texture>();
  const keys = [
    'map',
    'normalMap',
    'roughnessMap',
    'metalnessMap',
    'aoMap',
    'emissiveMap',
    'alphaMap',
    'bumpMap',
    'displacementMap',
  ] as const;

  root.traverse((obj) => {
    if (obj.type !== 'Mesh' && obj.type !== 'SkinnedMesh') return;
    const mesh = obj as THREE.Mesh;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) {
      if (!m) continue;
      for (const key of keys) {
        const tex = (m as unknown as Record<string, THREE.Texture | null>)[key];
        if (tex && !seen.has(tex)) {
          seen.add(tex);
          tex.anisotropy = Math.min(tex.anisotropy || 1, maxAniso);
          tex.needsUpdate = true;
        }
      }
    }
  });
}

boot().catch((err) => {
  console.error('[showroom] Bootstrap gagal:', err);
  try {
    const loader = createLoaderUi();
    loader.setError();
    loader.onRetry(() => window.location.reload());
  } catch {
    /* loader UI sendiri gagal — biarkan error di console */
  }
});
