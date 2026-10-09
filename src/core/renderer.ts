import * as THREE from 'three';
import {
  EXPOSURE_STUDIO,
  MAX_ANISOTROPY,
  MAX_PIXEL_RATIO,
  SHADOW_MAP_DESKTOP,
  SHADOW_MAP_MOBILE,
} from '../config';

export interface CoreRenderer {
  renderer: THREE.WebGLRenderer;
  /** Kapasitas anisotropy yang sudah dibatasi. */
  anisotropy: number;
  /** Ukuran shadow map (px) sesuai perangkat. */
  shadowMapSize: number;
  /** Minta shadow map dirender ulang pada frame berikutnya. */
  invalidateShadows: () => void;
  /** Ubah ukuran canvas mengikuti container. */
  resize: (width: number, height: number) => void;
  dispose: () => void;
}

export function createRenderer(canvas: HTMLCanvasElement): CoreRenderer {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
  });

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = EXPOSURE_STUDIO;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  // Render on-demand: shadow map hanya di-render ulang bila diminta.
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;

  // 1024 di mobile (pointer coarse), 2048 di desktop.
  const isMobile = matchMedia('(pointer: coarse)').matches;
  const shadowMapSize = isMobile ? SHADOW_MAP_MOBILE : SHADOW_MAP_DESKTOP;

  const anisotropy = Math.min(
    renderer.capabilities.getMaxAnisotropy(),
    MAX_ANISOTROPY,
  );

  return {
    renderer,
    anisotropy,
    shadowMapSize,
    invalidateShadows() {
      renderer.shadowMap.needsUpdate = true;
    },
    resize(width, height) {
      renderer.setSize(width, height, false);
      renderer.shadowMap.needsUpdate = true;
    },
    dispose() {
      renderer.dispose();
    },
  };
}
