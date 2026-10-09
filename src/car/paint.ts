import * as THREE from 'three';
import { PAINT_TRANSITION_MS } from '../config';
import type { MaterialRegistry } from './registry';

type ColorLike = THREE.Color | string | number;

const _from = new THREE.Color();
const _to = new THREE.Color();
const _current = new THREE.Color();

interface Transition {
  startedAt: number;
}

/**
 * Pengelola warna cat bodi dengan transisi lerp ±PAINT_TRANSITION_MS.
 *
 * Hanya menyentuh material cat (registry.paintMaterials) — bukan kaca,
 * velg, atau lampu. Model ini memakai 6 mesh cat, bisa lebih dari satu
 * instance material, jadi semua instance ikut diperbarui.
 */
export class PaintController {
  #materials: THREE.MeshPhysicalMaterial[];
  #transition: Transition | null = null;

  constructor(registry: MaterialRegistry) {
    this.#materials = [...registry.paintMaterials];
    if (this.#materials[0]) {
      _current.copy(this.#materials[0].color);
    }
  }

  get enabled(): boolean {
    return this.#materials.length > 0;
  }

  /** True bila transisi warna sedang berjalan (perlu render terus-menerus). */
  get isTransitioning(): boolean {
    return this.#transition !== null;
  }

  /** Warna aktif (dari material pertama), atau null bila tidak ada material. */
  get color(): THREE.Color | null {
    return this.#materials[0]?.color ?? null;
  }

  /** Set warna instan (tanpa animasi) — dipakai saat load/persist. */
  setInstant(color: ColorLike): void {
    if (this.#materials.length === 0) return;
    for (const m of this.#materials) {
      m.color.set(color);
      m.needsUpdate = true;
    }
    _current.copy(this.#materials[0].color);
    this.#transition = null;
  }

  /** Set warna dengan transisi halus. */
  set(color: ColorLike): void {
    if (this.#materials.length === 0) return;
    _from.copy(this.#materials[0].color);
    _to.set(color as THREE.ColorRepresentation);
    this.#transition = { startedAt: performance.now() };
  }

  /** Dipanggil tiap frame. */
  update(now: number): void {
    const t = this.#transition;
    if (!t || this.#materials.length === 0) return;

    const k = Math.min(1, (now - t.startedAt) / PAINT_TRANSITION_MS);
    // ease-out cubic
    const e = 1 - Math.pow(1 - k, 3);
    _current.copy(_from).lerp(_to, e);

    for (const m of this.#materials) m.color.copy(_current);

    if (k >= 1) this.#transition = null;
  }

  dispose(): void {
    this.#materials = [];
    this.#transition = null;
  }
}
