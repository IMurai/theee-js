import * as THREE from 'three';
import { HOTSPOTS } from '../config';

export interface HotspotState {
  id: string;
  opacity: string;
  /** dot(outward, arah kamera) terakhir — negatif besar = sisi jauh mobil. */
  lastDot: number;
}

export interface HotspotLayer {
  update: (camera: THREE.Camera, width: number, height: number) => void;
  setVisible: (visible: boolean) => void;
  /** Status internal — hanya untuk verifikasi dev (scripts/verify.mjs). */
  debugState: () => HotspotState[];
  dispose: () => void;
}

const _box = new THREE.Box3();
const _size = new THREE.Vector3();
const _world = new THREE.Vector3();
const _proj = new THREE.Vector3();
const _camDir = new THREE.Vector3();

/**
 * Sembunyikan hotspot bila arahnya hampir berkebalikan dengan arah kamera
 * (dot < ambang). Ini menandai hotspot ada di sisi jauh mobil, sehingga
 * labelnya tidak menembus bodi — mis. "Carbon hood" saat melihat dari belakang.
 *
 * Heuristik murah: tanpa raycast (534 rb segitiga per berkas terlalu mahal
 * untuk dicek tiap frame). Ambang dipilih longgar supaya sayap belakang tetap
 * tampil pada preset 3/4 (terlihat di atas atap) tetapi tersembunyi dari depan.
 */
const FAR_SIDE_THRESHOLD = -0.8;

interface HotspotNode {
  el: HTMLDivElement;
  position: THREE.Vector3;
  /** Arah keluar dari pusat mobil ke titik ini (normalisasi, ruang dunia). */
  outward: THREE.Vector3;
  /** dot() terakhir — disimpan hanya untuk debugState(). */
  lastDot: number;
}

/**
 * Label HTML yang mengikuti titik 3D (proyeksi posisi → layar).
 *
 * Posisi dihitung dari PECAHAN bounding box mobil (lihat config.HOTSPOTS),
 * sehingga tidak hardcode angka meter dan tetap benar bila model diganti.
 */
export function createHotspots(
  container: HTMLElement,
  root: THREE.Object3D,
): HotspotLayer {
  root.updateWorldMatrix(true, true);
  _box.setFromObject(root);
  _box.getSize(_size);

  // Pusat mobil (ruang dunia) — dasar hitung arah "keluar" tiap hotspot.
  const center = _box.getCenter(new THREE.Vector3());

  const nodes: HotspotNode[] = [];

  for (const def of HOTSPOTS) {
    const el = document.createElement('div');
    el.className = 'hotspot';
    el.dataset.id = def.id;

    const dot = document.createElement('span');
    dot.className = 'hotspot__dot';

    const label = document.createElement('span');
    label.className = 'hotspot__label';
    label.textContent = def.label;

    el.append(dot, label);
    container.appendChild(el);

    // Box3.setFromObject sudah menghasilkan koordinat DUNIA.
    // Konversi balik ke space lokal root, karena saat update kita
    // mengalikan dengan root.matrixWorld (sekali saja, tanpa dobel).
    const world = new THREE.Vector3(
      _box.min.x + _size.x * def.frac[0],
      _box.min.y + _size.y * def.frac[1],
      _box.min.z + _size.z * def.frac[2],
    );
    const local = root.worldToLocal(world.clone());
    const outward = world.clone().sub(center).normalize();

    nodes.push({ el, position: local, outward, lastDot: Number.NaN });
  }

  return {
    update(camera, width, height) {
      if (container.classList.contains('hotspots--hidden')) return;

      root.updateWorldMatrix(true, false);
      for (const node of nodes) {
        _world.copy(node.position).applyMatrix4(root.matrixWorld);
        _proj.copy(_world).project(camera);

        // Di belakang kamera / di luar layar → sembunyikan.
        const x = (_proj.x * 0.5 + 0.5) * width;
        const y = (-_proj.y * 0.5 + 0.5) * height;
        const offscreen =
          _proj.z > 1 || x < -40 || x > width + 40 || y < -40 || y > height + 40;

        if (offscreen) {
          node.el.style.opacity = '0';
          node.el.style.pointerEvents = 'none';
          continue;
        }

        // Sisi jauh → jangan tampilkan label yang menembus bodi.
        _camDir.copy(camera.position).sub(center);
        if (_camDir.lengthSq() > 1e-8) {
          _camDir.normalize();
          const dot = node.outward.dot(_camDir);
          node.lastDot = dot;
          if (dot < FAR_SIDE_THRESHOLD) {
            node.el.style.opacity = '0';
            node.el.style.pointerEvents = 'none';
            continue;
          }
        }

        node.el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
        node.el.style.opacity = '1';
        node.el.style.pointerEvents = 'auto';
      }
    },
    setVisible(visible) {
      container.classList.toggle('hotspots--hidden', !visible);
    },
    debugState() {
      return nodes.map((node) => ({
        id: node.el.dataset.id ?? '?',
        opacity: node.el.style.opacity || '(default)',
        lastDot: Number.isNaN(node.lastDot)
          ? Number.NaN
          : Number(node.lastDot.toFixed(4)),
      }));
    },
    dispose() {
      container.replaceChildren();
      nodes.length = 0;
    },
  };
}
