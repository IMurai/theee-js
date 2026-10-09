import * as THREE from 'three';

/**
 * Roda berputar pelan.
 *
 * CATATAN ASET: roda depan dan belakang adalah SATU MESH PER AS
 * (kiri + kanan digabung). Untuk animasi putar, mesh as dibungkus Group
 * pivot di pusat as lalu diputar pada sumbu X.
 *
 * Pivot dihitung runtime dengan Box3 — TIDAK di-hardcode.
 */

export interface WheelAnimator {
  /** Rad/s putaran roda saat aktif. */
  speed: number;
  setEnabled: (on: boolean) => void;
  isEnabled: () => boolean;
  update: (deltaSec: number) => void;
  dispose: () => void;
}

interface AxlePivot {
  pivot: THREE.Group;
  mesh: THREE.Mesh;
  basePosition: THREE.Vector3;
}

/** Cari mesh roda berdasarkan nama node (depan/belakang). */
function findWheelMeshes(root: THREE.Object3D): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  root.traverse((obj) => {
    if (obj.type !== 'Mesh') return;
    const mesh = obj as THREE.Mesh;
    const n = mesh.name.toLowerCase();
    if (
      n.includes('circle.001') ||
      n.includes('circle.004') ||
      n.includes('wheel') ||
      n.includes('tyre') ||
      n.includes('tire')
    ) {
      out.push(mesh);
    }
  });
  return out;
}

export function createWheelAnimator(root: THREE.Object3D): WheelAnimator {
  const meshes = findWheelMeshes(root);
  const axles: AxlePivot[] = [];
  const _box = new THREE.Box3();
  const _size = new THREE.Vector3();
  const _center = new THREE.Vector3();

  for (const mesh of meshes) {
    mesh.updateWorldMatrix(true, false);
    _box.setFromObject(mesh);
    if (_box.isEmpty()) continue;
    _box.getSize(_size);
    _box.getCenter(_center);

    // Hanya bungkus mesh yang lebar (sumbu X dominan) → as roda.
    if (_size.x < _size.z * 0.5) continue;

    const pivot = new THREE.Group();
    pivot.name = `WheelPivot_${mesh.name}`;
    // Posisi pivot = pusat as dalam space parent.
    const parent = mesh.parent;
    if (!parent) continue;

    parent.add(pivot);
    pivot.position.copy(_center);

    const base = mesh.position.clone();
    // Pindahkan mesh ke pivot dengan offset relatif.
    parent.remove(mesh);
    pivot.add(mesh);
    mesh.position.copy(base).sub(_center);

    axles.push({ pivot, mesh, basePosition: base });
  }

  let enabled = false;
  let speed = 1.6; // rad/s (± 15 rpm, halus untuk showroom)

  return {
    get speed() {
      return speed;
    },
    set speed(v: number) {
      speed = v;
    },
    setEnabled(on) {
      enabled = on;
      if (!on) {
        // Kembalikan ke posisi semula agar tidak meninggalkan sisa rotasi.
        for (const a of axles) a.pivot.rotation.set(0, 0, 0);
      }
    },
    isEnabled() {
      return enabled;
    },
    update(deltaSec) {
      if (!enabled || deltaSec <= 0) return;
      const delta = speed * deltaSec;
      for (const a of axles) a.pivot.rotation.x += delta;
    },
    dispose() {
      for (const a of axles) {
        const parent = a.pivot.parent;
        if (!parent) continue;
        a.pivot.remove(a.mesh);
        a.mesh.position.copy(a.basePosition);
        parent.add(a.mesh);
        parent.remove(a.pivot);
      }
      axles.length = 0;
    },
  };
}
