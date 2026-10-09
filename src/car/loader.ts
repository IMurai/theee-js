import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { CAR_GROUND_Y, CAR_LENGTH } from '../config';
import { buildMaterialRegistry, type MaterialRegistry } from './registry';

export interface LoadedCar {
  root: THREE.Group;
  registry: MaterialRegistry;
  /** Panjang mobil setelah normalisasi. */
  length: number;
  dispose: () => void;
}

export interface LoadProgress {
  /** 0..1 bila diketahui, null bila indeterminate. */
  ratio: number | null;
  loadedBytes: number;
  totalBytes: number;
}

const MODEL_URL = '/models/bmw-m4.glb';

/**
 * Muat GLB, normalisasi skala (panjang = CAR_LENGTH), pusatkan X/Z,
 * dan tempatkan bagian bawah ban tepat di CAR_GROUND_Y.
 */
export function loadCar(
  onProgress: (p: LoadProgress) => void,
): Promise<LoadedCar> {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);

  return new Promise((resolve, reject) => {
    loader.load(
      MODEL_URL,
      (gltf) => {
        try {
          resolve(normalize(gltf.scene));
        } catch (err) {
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      },
      (event) => {
        const total = event.total ?? 0;
        onProgress({
          ratio: total > 0 ? event.loaded / total : null,
          loadedBytes: event.loaded,
          totalBytes: total,
        });
      },
      (error) => {
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

function normalize(scene: THREE.Object3D): LoadedCar {
  const root = new THREE.Group();
  root.name = 'CarRoot';
  root.add(scene);

  // Hitung bounding box dalam satuan asli.
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());

  if (size.z <= 0 || !Number.isFinite(size.z)) {
    throw new Error('Bounding box model tidak valid.');
  }

  const scale = CAR_LENGTH / size.z;
  root.scale.setScalar(scale);

  // Pusatkan X/Z, letakkan bagian bawah tepat di y = 0.
  root.position.set(
    -center.x * scale,
    CAR_GROUND_Y - box.min.y * scale,
    -center.z * scale,
  );

  scene.updateMatrixWorld(true);
  root.updateMatrixWorld(true);

  // Setelah transformasi, terapkan registry material.
  const registry = buildMaterialRegistry(root);

  // Set semua mesh cast/receive shadow.
  root.traverse((obj) => {
    if (obj.type === 'Mesh' || obj.type === 'SkinnedMesh') {
      const mesh = obj as THREE.Mesh;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.geometry.computeBoundingSphere();
    }
  });

  const finalBox = new THREE.Box3().setFromObject(root);
  const finalSize = finalBox.getSize(new THREE.Vector3());

  return {
    root,
    registry,
    length: finalSize.z,
    dispose() {
      root.traverse((obj) => {
        if (obj.type === 'Mesh' || obj.type === 'SkinnedMesh') {
          const mesh = obj as THREE.Mesh;
          mesh.geometry.dispose();
          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          for (const m of mats) disposeMaterial(m);
        }
      });
      root.clear();
    },
  };
}

function disposeMaterial(mat: THREE.Material | null): void {
  if (!mat) return;
  type Textured = { map?: THREE.Texture | null; normalMap?: THREE.Texture | null };
  const t = mat as Textured;
  t.map?.dispose();
  t.normalMap?.dispose();
  mat.dispose();
}
