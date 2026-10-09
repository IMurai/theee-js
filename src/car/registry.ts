/**
 * Registry material & node penting.
 * Pencarian berbasis `material.name` (bukan index) sesuai AGENTS.md bagian 2.
 * Bila nama aset berubah, perbaiki cukup di file ini.
 */

import * as THREE from 'three';

export type PaintMesh = THREE.Mesh<THREE.BufferGeometry, THREE.MeshPhysicalMaterial>;

export interface MaterialRegistry {
  /** Mesh material cat bodi (6 mesh termasuk Kit0_Paint). */
  paintMeshes: PaintMesh[];
  /** Semua instance material cat unik (bisa lebih dari satu instance). */
  paintMaterials: THREE.MeshPhysicalMaterial[];
  /** Instance material cat pertama — untuk akses cepat. */
  paintMaterial: THREE.MeshPhysicalMaterial | null;
  /** Kaliper rem (merah, `Material.002`). */
  caliperMaterial: THREE.MeshStandardMaterial | null;
  /** Semua material velg. */
  wheelMaterials: THREE.MeshStandardMaterial[];
  /** Material lampu depan (emissive). */
  headlampMaterials: THREE.MeshStandardMaterial[];
  /** Material lampu belakang / kaca merah. */
  tailMaterials: THREE.MeshStandardMaterial[];
  /** Material kaca. */
  glassMaterials: THREE.MeshStandardMaterial[];
  /** Semua material unik yang ditemukan (untuk debug). */
  all: Map<string, THREE.Material>;
  /** Info debug: nama node + jumlah vertex per mesh. */
  sceneDump: SceneDumpEntry[];
}

export interface SceneDumpEntry {
  type: string;
  name: string;
  mesh?: string;
  material?: string;
  vertices?: number;
}

const PAINT_HINT = 'PaintTNR_Material';
const CALIPER_NAME = 'Material.002';
const WHEEL_NAMES = new Set(['main', 'metalblack', 'disk.001', 'Material.001', 'sidetyre']);
const GLASS_NAMES = new Set(['glass', 'glasswindshiled']);
const TAIL_NAMES = new Set(['wmit_red', 'red_glass']);

function isMesh(obj: THREE.Object3D): obj is THREE.Mesh {
  return obj.type === 'Mesh' || obj.type === 'SkinnedMesh';
}

/**
 * Bangun registry dari scene GLTF. Satu-satunya tempat pencarian nama material.
 */
export function buildMaterialRegistry(root: THREE.Object3D): MaterialRegistry {
  const registry: MaterialRegistry = {
    paintMeshes: [],
    paintMaterials: [],
    paintMaterial: null,
    caliperMaterial: null,
    wheelMaterials: [],
    headlampMaterials: [],
    tailMaterials: [],
    glassMaterials: [],
    all: new Map(),
    sceneDump: [],
  };

  const seenMaterials = new Set<THREE.Material>();
  // Cache konversi material → physical, supaya material yang dipakai bersama
  // oleh beberapa mesh tidak dikonversi berulang kali.
  const physicalCache = new Map<THREE.Material, THREE.MeshPhysicalMaterial>();

  root.traverse((obj) => {
    const entry: SceneDumpEntry = { type: obj.type, name: obj.name };

    if (!isMesh(obj)) {
      registry.sceneDump.push(entry);
      return;
    }

    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    const geo = obj.geometry;
    const positions = geo.getAttribute('position');
    entry.mesh = obj.name;
    entry.vertices = positions ? positions.count : 0;

    for (const mat of mats) {
      if (!mat) continue;
      entry.material = entry.material ? `${entry.material}, ${mat.name}` : mat.name;

      if (!seenMaterials.has(mat)) {
        seenMaterials.add(mat);
        registry.all.set(mat.name || `#${seenMaterials.size}`, mat);
      }

      const name = mat.name ?? '';

      // --- Cat bodi -----------------------------------------------------
      if (name.includes(PAINT_HINT)) {
        if (mat instanceof THREE.MeshPhysicalMaterial || mat instanceof THREE.MeshStandardMaterial) {
          let physical = physicalCache.get(mat);
          if (!physical) {
            physical = toPhysical(mat);
            physicalCache.set(mat, physical);
          }
          // Ganti referensi material pada mesh agar bisa di-set clearcoat.
          replaceMaterial(obj, mat, physical);
          registry.paintMeshes.push(obj as PaintMesh);
          if (!registry.paintMaterials.includes(physical)) {
            registry.paintMaterials.push(physical);
          }
          registry.paintMaterial ??= physical;
        }
      }

      // --- Kaliper ------------------------------------------------------
      if (name === CALIPER_NAME && mat instanceof THREE.MeshStandardMaterial) {
        registry.caliperMaterial ??= mat;
      }

      // --- Velg ---------------------------------------------------------
      if (WHEEL_NAMES.has(name) && mat instanceof THREE.MeshStandardMaterial) {
        if (!registry.wheelMaterials.includes(mat)) registry.wheelMaterials.push(mat);
      }

      // --- Kaca ---------------------------------------------------------
      if (GLASS_NAMES.has(name) && mat instanceof THREE.MeshStandardMaterial) {
        if (!registry.glassMaterials.includes(mat)) registry.glassMaterials.push(mat);
      }

      // --- Lampu belakang ----------------------------------------------
      if (TAIL_NAMES.has(name) && mat instanceof THREE.MeshStandardMaterial) {
        if (!registry.tailMaterials.includes(mat)) registry.tailMaterials.push(mat);
      }

      // --- Lampu depan (emissive) --------------------------------------
      if (
        (name === 'emit' || name.includes('emit')) &&
        mat instanceof THREE.MeshStandardMaterial
      ) {
        if (!registry.headlampMaterials.includes(mat)) registry.headlampMaterials.push(mat);
      }
    }

    registry.sceneDump.push(entry);
  });

  return registry;
}

/** Naikkan material standar ke MeshPhysicalMaterial agar clearcoat bisa diatur. */
function toPhysical(
  mat: THREE.MeshPhysicalMaterial | THREE.MeshStandardMaterial,
): THREE.MeshPhysicalMaterial {
  if (mat instanceof THREE.MeshPhysicalMaterial) return mat;

  const physical = new THREE.MeshPhysicalMaterial();
  physical.name = mat.name;
  physical.copy(mat);
  // Sifat finish (clearcoat, roughness, metalness) TIDAK di-set di sini.
  // Semuanya ditentukan oleh PAINT_FINISHES di config.ts dan diterapkan
  // oleh PaintController.setFinish() — lihat src/car/paint.ts.
  physical.clearcoat = 0;
  physical.needsUpdate = true;
  mat.dispose();
  return physical;
}

function replaceMaterial(
  mesh: THREE.Mesh,
  from: THREE.Material,
  to: THREE.Material,
): void {
  if (Array.isArray(mesh.material)) {
    mesh.material = mesh.material.map((m) => (m === from ? to : m));
  } else if (mesh.material === from) {
    mesh.material = to;
  }
}
