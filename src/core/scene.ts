import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  FLOOR_SIZE,
  FOG_FAR,
  FOG_NEAR,
  SHADOW_FRUSTUM_SIZE,
} from '../config';

export interface StudioLights {
  scene: THREE.Scene;
  keyLight: THREE.DirectionalLight;
  environment: THREE.Texture | null;
  /** Setelah PMREM selesai dibuat, panggil ini untuk menugaskan environment. */
  assignEnvironment: (texture: THREE.Texture) => void;
  /** Atur background lantai/latar sesuai mode. */
  setNightMode: (night: boolean) => void;
  dispose: () => void;
}

const FLOOR_Y = 0;
const _tmpColor = new THREE.Color();

export function createScene(
  renderer: THREE.WebGLRenderer,
  shadowMapSize = 2048,
): StudioLights {
  const scene = new THREE.Scene();

  // Latar gradien gelap yang menyatu dengan lantai.
  const bg = new THREE.Color('#101216');
  scene.background = bg;
  scene.fog = new THREE.Fog(bg, FOG_NEAR, FOG_FAR);

  // --- Environment (PMREM dari RoomEnvironment, aset lokal three) --------
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  // WAJIB: tanpa ini mobil tidak dapat pantulan/refleksi studio.
  scene.environment = environment;
  scene.environmentIntensity = 1;

  // --- Lantai ------------------------------------------------------------
  const floorGeo = new THREE.PlaneGeometry(FLOOR_SIZE, FLOOR_SIZE);
  const floorMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#0a0c10'),
    roughness: 0.82,
    metalness: 0.0,
  });
  // Redam pantulan IBL di lantai agar tetap gelap (latar menyatu dengan lantai).
  floorMat.envMapIntensity = 0.12;
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = FLOOR_Y;
  floor.receiveShadow = true;
  scene.add(floor);

  // Contact shadow lembut: gradasi radial (bukan lingkaran bertepi keras).
  // Ukuran disetel dekat dimensi mobil (panjang 4,8 m) supaya tidak
  // membentuk elips gelap besar yang melebihi bodi.
  const contactTexture = createRadialAlphaTexture();
  const contactGeo = new THREE.PlaneGeometry(4.6, 8.4);
  const contactMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color('#000000'),
    alphaMap: contactTexture,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
    toneMapped: false,
  });
  const contact = new THREE.Mesh(contactGeo, contactMat);
  contact.rotation.x = -Math.PI / 2;
  contact.position.y = FLOOR_Y + 0.003;
  contact.renderOrder = 1;
  scene.add(contact);

  // --- Lights ------------------------------------------------------------
  const keyLight = new THREE.DirectionalLight(0xffffff, 2.4);
  keyLight.position.set(6, 9, 6);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(shadowMapSize, shadowMapSize);
  keyLight.shadow.camera.near = 0.5;
  keyLight.shadow.camera.far = 40;
  const half = SHADOW_FRUSTUM_SIZE / 2;
  keyLight.shadow.camera.left = -half;
  keyLight.shadow.camera.right = half;
  keyLight.shadow.camera.top = half;
  keyLight.shadow.camera.bottom = -half;
  keyLight.shadow.bias = -0.0004;
  keyLight.shadow.normalBias = 0.02;
  scene.add(keyLight, keyLight.target);

  const fillLight = new THREE.DirectionalLight(0xbfd4ff, 0.55);
  fillLight.position.set(-7, 5, -4);
  scene.add(fillLight);

  const rimLight = new THREE.DirectionalLight(0xffe6c4, 0.9);
  rimLight.position.set(-3, 4.5, 8);
  scene.add(rimLight);

  const ambient = new THREE.AmbientLight(0xffffff, 0.18);
  scene.add(ambient);

  const baseColor = bg.clone();

  return {
    scene,
    keyLight,
    environment,
    assignEnvironment(texture) {
      scene.environment = texture;
      scene.environmentIntensity = 1;
    },
    setNightMode(night) {
      if (night) {
        _tmpColor.set('#07080b');
        scene.environmentIntensity = 0.5;
        keyLight.intensity = 1.3;
        fillLight.intensity = 0.25;
        rimLight.intensity = 1.4;
        ambient.intensity = 0.1;
        floorMat.color.set('#0a0b0e');
        contactMat.opacity = 0.6;
      } else {
        _tmpColor.copy(baseColor);
        scene.environmentIntensity = 1.15;
        keyLight.intensity = 2.8;
        fillLight.intensity = 0.7;
        rimLight.intensity = 1.0;
        ambient.intensity = 0.24;
        floorMat.color.set('#0f1116');
        contactMat.opacity = 0.5;
      }
      scene.background = _tmpColor.clone();
      if (scene.fog instanceof THREE.Fog) {
        scene.fog.color.copy(_tmpColor);
      }
    },
    dispose() {
      floorGeo.dispose();
      floorMat.dispose();
      contactGeo.dispose();
      contactMat.dispose();
      contactTexture.dispose();
      pmrem.dispose();
      environment.dispose();
    },
  };
}

/**
 * Tekstur alpha gradien radial (putih di tengah → hitam di tepi)
 * untuk contact shadow bertepi lembut. Dibuat lokal via canvas.
 */
function createRadialAlphaTexture(): THREE.Texture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const gradient = ctx.createRadialGradient(
      size / 2,
      size / 2,
      0,
      size / 2,
      size / 2,
      size / 2,
    );
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.25, 'rgba(255,255,255,0.82)');
    gradient.addColorStop(0.5, 'rgba(255,255,255,0.38)');
    gradient.addColorStop(0.72, 'rgba(255,255,255,0.1)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  texture.anisotropy = 8;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.needsUpdate = true;
  return texture;
}


