import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  AUTO_ROTATE_IDLE_MS,
  AUTO_ROTATE_SPEED,
  CAMERA_ANIM_MS,
  CAMERA_MAX_DISTANCE,
  CAMERA_MAX_POLAR,
  CAMERA_MIN_DISTANCE,
  type CameraPreset,
} from '../config';

/** Objek vektor reusable — dilarang `new Vector3` di dalam loop. */
const _sph = new THREE.Spherical();
const _vec = new THREE.Vector3();
const _dir = new THREE.Vector3();

export type EasingFn = (t: number) => number;

export const easeInOutCubic: EasingFn = (t) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

export interface CameraRig {
  controls: OrbitControls;
  /** Terapkan preset dengan animasi ease. */
  applyPreset: (preset: CameraPreset) => void;
  /**
   * Pengali jarak preset. Dipakai pada layar portrait agar mobil tetap muat
   * (horizontal FOV menyempit di rasio aspek kecil).
   */
  setDistanceFactor: (factor: number) => void;
  /** Jadwalkan ulang auto-rotate setelah idle. */
  noteInteraction: () => void;
  /** Update yang dipanggil tiap frame. */
  update: (deltaSec: number) => void;
  setAutoRotate: (enabled: boolean) => void;
  /** Status internal — hanya untuk verifikasi dev (scripts/verify.mjs). */
  debugState: () => {
    animActive: boolean;
    animProgress: number | null;
    lastAnimT: number;
    updateAgeMs: number | null;
    updateCount: number;
    autoRotate: boolean;
    azimuthDeg: number;
    polarDeg: number;
    distance: number;
  };
  dispose: () => void;
}

interface AnimState {
  from: THREE.Spherical;
  to: THREE.Spherical;
  startedAt: number;
}

export function createCameraRig(
  camera: THREE.PerspectiveCamera,
  domElement: HTMLElement,
  prefersReducedMotion: boolean,
): CameraRig {
  const controls = new OrbitControls(camera, domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.enablePan = false;
  controls.minDistance = CAMERA_MIN_DISTANCE;
  controls.maxDistance = CAMERA_MAX_DISTANCE;
  controls.maxPolarAngle = CAMERA_MAX_POLAR;
  controls.rotateSpeed = 0.85;
  controls.zoomSpeed = 0.8;
  controls.autoRotateSpeed = AUTO_ROTATE_SPEED; // satuan OrbitControls = putaran/menit
  controls.autoRotate = !prefersReducedMotion;

  let autoRotateEnabled = !prefersReducedMotion;
  let idleTimer: number | null = null;
  let anim: AnimState | null = null;
  /** Pengali jarak preset (portrait). */
  let distanceFactor = 1;

  // Debug counter (dev only) — memverifikasi loop benar-benar memanggil update().
  let updateCount = 0;
  let lastUpdateAt = 0;
  let lastAnimT = -1;

  const clearIdle = () => {
    if (idleTimer !== null) {
      window.clearTimeout(idleTimer);
      idleTimer = null;
    }
  };

  const scheduleResume = () => {
    clearIdle();
    if (!autoRotateEnabled) return;
    idleTimer = window.setTimeout(() => {
      controls.autoRotate = true;
      idleTimer = null;
    }, AUTO_ROTATE_IDLE_MS);
  };

  const onInteract = () => {
    controls.autoRotate = false;
    anim = null; // user mengambil alih kontrol kamera
    scheduleResume();
  };

  controls.addEventListener('start', onInteract);

  return {
    controls,
    applyPreset(preset) {
      clearIdle();
      controls.autoRotate = false;

      const target = controls.target;
      _dir.copy(camera.position).sub(target);
      const fromRadius = _dir.length() || CAMERA_MIN_DISTANCE;
      const from = new THREE.Spherical().setFromVector3(_dir);
      const toRadius = preset.distance * distanceFactor;

      _sph.set(
        toRadius,
        THREE.MathUtils.degToRad(preset.polarDeg),
        THREE.MathUtils.degToRad(preset.azimuthDeg),
      );

      if (prefersReducedMotion) {
        _vec.setFromSpherical(_sph).add(target);
        camera.position.copy(_vec);
        controls.update();
        scheduleResume();
        return;
      }

      // Pastikan arah azimut mengambil jalur pendek.
      let delta = _sph.theta - from.theta;
      delta = Math.atan2(Math.sin(delta), Math.cos(delta));

      anim = {
        from: new THREE.Spherical(fromRadius, from.phi, from.theta),
        to: new THREE.Spherical(toRadius, _sph.phi, from.theta + delta),
        startedAt: performance.now(),
      };
      void target;
    },
    setDistanceFactor(factor) {
      const next = Math.max(1, factor);
      if (Math.abs(next - distanceFactor) < 0.001) return;

      // Skala jarak saat ini secara proporsional terhadap faktor lama → baru.
      // Jika kamera berada di jarak preset × faktor lama, hasilnya tepat
      // preset × faktor baru (kamera tak pernah "nyangkut" di faktor lama).
      _dir.copy(camera.position).sub(controls.target);
      const from = new THREE.Spherical().setFromVector3(_dir);
      const fromRadius = from.radius || CAMERA_MIN_DISTANCE;
      const ratio = next / distanceFactor;
      distanceFactor = next;

      const toRadius = THREE.MathUtils.clamp(
        fromRadius * ratio,
        controls.minDistance,
        controls.maxDistance,
      );

      anim = {
        from: new THREE.Spherical(fromRadius, from.phi, from.theta),
        to: new THREE.Spherical(toRadius, from.phi, from.theta),
        startedAt: performance.now(),
      };
      controls.autoRotate = false;
      clearIdle();
    },
    noteInteraction() {
      onInteract();
    },
    update(deltaSec) {
      updateCount += 1;
      lastUpdateAt = performance.now();
      if (anim) {
        const t = Math.min(1, (performance.now() - anim.startedAt) / CAMERA_ANIM_MS);
        lastAnimT = t;
        const e = easeInOutCubic(t);
        _sph.set(
          THREE.MathUtils.lerp(anim.from.radius, anim.to.radius, e),
          THREE.MathUtils.lerp(anim.from.phi, anim.to.phi, e),
          THREE.MathUtils.lerp(anim.from.theta, anim.to.theta, e),
        );
        _vec.setFromSpherical(_sph).add(controls.target);
        camera.position.copy(_vec);
        if (t >= 1) {
          anim = null;
          scheduleResume();
        }
      }
      controls.update(deltaSec);
    },
    setAutoRotate(enabled) {
      autoRotateEnabled = enabled;
      if (!enabled) {
        controls.autoRotate = false;
        clearIdle();
      } else {
        controls.autoRotate = true;
      }
    },
    debugState() {
      const now = performance.now();
      return {
        animActive: anim !== null,
        animProgress:
          anim === null
            ? null
            : Math.min(1, (now - anim.startedAt) / CAMERA_ANIM_MS),
        lastAnimT,
        updateAgeMs: updateCount === 0 ? null : Math.round(now - lastUpdateAt),
        updateCount,
        autoRotate: controls.autoRotate,
        azimuthDeg: THREE.MathUtils.radToDeg(controls.getAzimuthalAngle()),
        polarDeg: THREE.MathUtils.radToDeg(controls.getPolarAngle()),
        distance: controls.getDistance(),
      };
    },
    dispose() {
      clearIdle();
      controls.removeEventListener('start', onInteract);
      controls.dispose();
    },
  };
}
