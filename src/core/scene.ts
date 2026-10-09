import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  CONTACT_SHADOW_GRADIENT_RADIUS,
  CONTACT_SHADOW_LENGTH,
  CONTACT_SHADOW_OPACITY_NIGHT,
  CONTACT_SHADOW_OPACITY_STUDIO,
  CONTACT_SHADOW_TEXTURE_PX,
  CONTACT_SHADOW_WIDTH,
  FLOOR_COLOR_NIGHT,
  FLOOR_COLOR_STUDIO,
  FLOOR_ENV_INTENSITY,
  FLOOR_ROUGHNESS,
  FLOOR_SIZE,
  FLOOR_SPECULAR_INTENSITY,
  FOG_FAR,
  FOG_NEAR,
  LIGHT_POOL_COLOR,
  LIGHT_POOL_GRADIENT_RADIUS,
  LIGHT_POOL_LENGTH,
  LIGHT_POOL_OPACITY_NIGHT,
  LIGHT_POOL_OPACITY_STUDIO,
  LIGHT_POOL_TEXTURE_PX,
  LIGHT_POOL_WIDTH,
  MAX_ANISOTROPY,
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

  const anisotropy = Math.min(
    MAX_ANISOTROPY,
    renderer.capabilities.getMaxAnisotropy(),
  );

  // --- Lantai ------------------------------------------------------------
  const floorGeo = new THREE.PlaneGeometry(FLOOR_SIZE, FLOOR_SIZE);
  // MeshPhysicalMaterial (bukan Standard) dipakai HANYA karena floor butuh
  // `specularIntensity` — lihat FLOOR_SPECULAR_INTENSITY di config.ts.
  const floorMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(FLOOR_COLOR_STUDIO),
    roughness: FLOOR_ROUGHNESS,
    metalness: 0,
    specularIntensity: FLOOR_SPECULAR_INTENSITY,
  });
  // WAJIB: envMap eksplisit. Tanpa ini three menimpa envMapIntensity material
  // dengan scene.environmentIntensity, dan lantai ikut menyala abu-abu.
  // Lihat FLOOR_ENV_INTENSITY di config.ts.
  floorMat.envMap = environment;
  floorMat.envMapIntensity = FLOOR_ENV_INTENSITY;
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = FLOOR_Y;
  floor.receiveShadow = true;
  scene.add(floor);

  // --- Contact shadow ----------------------------------------------------
  // Gradasi radial halus. Tekstur ditulis sebagai kanal ABU-ABU karena
  // `alphaMap` three.js membaca kanal .g (bukan alpha) — lihat
  // createRadialMaskTexture().
  const contactTexture = createRadialMaskTexture(
    CONTACT_SHADOW_TEXTURE_PX,
    CONTACT_SHADOW_GRADIENT_RADIUS,
    anisotropy,
  );
  const contactGeo = new THREE.PlaneGeometry(
    CONTACT_SHADOW_WIDTH,
    CONTACT_SHADOW_LENGTH,
  );
  const contactMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color('#000000'),
    alphaMap: contactTexture,
    transparent: true,
    opacity: CONTACT_SHADOW_OPACITY_STUDIO,
    depthWrite: false,
    toneMapped: false,
  });
  const contact = new THREE.Mesh(contactGeo, contactMat);
  contact.rotation.x = -Math.PI / 2;
  contact.position.y = FLOOR_Y + 0.003;
  contact.renderOrder = 2;
  scene.add(contact);

  // --- Pool cahaya -------------------------------------------------------
  // Nada lembut di bawah mobil supaya terlihat "menapak", tanpa batas tegas.
  // Lebih luas dari contact shadow, jadi menyembul sebagai halo di sekeliling
  // bayangan kontak.
  const poolTexture = createRadialMaskTexture(
    LIGHT_POOL_TEXTURE_PX,
    LIGHT_POOL_GRADIENT_RADIUS,
    anisotropy,
  );
  const poolGeo = new THREE.PlaneGeometry(LIGHT_POOL_WIDTH, LIGHT_POOL_LENGTH);
  const poolMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(LIGHT_POOL_COLOR),
    map: poolTexture,
    transparent: true,
    opacity: LIGHT_POOL_OPACITY_STUDIO,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    // Fog diterapkan SETELAH tonemapping; pada material additive itu akan
    // MENAMBAHKAN warna fog dan membuat lantai jauh terang. Pool selalu berada
    // di dekat mobil, jadi fog dimatikan.
    fog: false,
  });
  const pool = new THREE.Mesh(poolGeo, poolMat);
  pool.rotation.x = -Math.PI / 2;
  pool.position.y = FLOOR_Y + 0.002;
  pool.renderOrder = 1;
  scene.add(pool);

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
      // Material lantai memakai envMap eksplisit, jadi ikut diperbarui.
      floorMat.envMap = texture;
      floorMat.needsUpdate = true;
    },
    setNightMode(night) {
      if (night) {
        _tmpColor.set('#07080b');
        scene.environmentIntensity = 0.5;
        keyLight.intensity = 1.3;
        fillLight.intensity = 0.25;
        rimLight.intensity = 1.4;
        ambient.intensity = 0.1;
        floorMat.color.set(FLOOR_COLOR_NIGHT);
        contactMat.opacity = CONTACT_SHADOW_OPACITY_NIGHT;
        poolMat.opacity = LIGHT_POOL_OPACITY_NIGHT;
      } else {
        _tmpColor.copy(baseColor);
        scene.environmentIntensity = 1.15;
        keyLight.intensity = 2.8;
        fillLight.intensity = 0.7;
        rimLight.intensity = 1.0;
        ambient.intensity = 0.24;
        floorMat.color.set(FLOOR_COLOR_STUDIO);
        contactMat.opacity = CONTACT_SHADOW_OPACITY_STUDIO;
        poolMat.opacity = LIGHT_POOL_OPACITY_STUDIO;
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
      poolGeo.dispose();
      poolMat.dispose();
      poolTexture.dispose();
      pmrem.dispose();
      environment.dispose();
    },
  };
}

/**
 * Tekstur mask radial: putih (255) di tengah → hitam (0) di radius
 * `radiusFrac`, dan hitam pekat sampai tepi tekstur.
 *
 * Sengaja ditulis sebagai KANAL ABU-ABU dengan alpha = 1 penuh:
 * `alphaMap` pada three.js mengambil `texture2D(alphaMap, uv).g`, jadi kalau
 * gradasinya ditulis ke channel alpha, kanal hijau jadi biner (255 di dalam,
 * 0 di luar) dan tepinya muncul bergerigi.
 */
function createRadialMaskTexture(
  size: number,
  radiusFrac: number,
  anisotropy: number,
): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, size, size);

    const r = size * radiusFrac;
    const gradient = ctx.createRadialGradient(
      size / 2,
      size / 2,
      0,
      size / 2,
      size / 2,
      r,
    );
    gradient.addColorStop(0, 'rgb(255,255,255)');
    gradient.addColorStop(0.28, 'rgb(196,196,196)');
    gradient.addColorStop(0.5, 'rgb(122,122,122)');
    gradient.addColorStop(0.7, 'rgb(56,56,56)');
    gradient.addColorStop(0.86, 'rgb(18,18,18)');
    gradient.addColorStop(1, 'rgb(0,0,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = anisotropy;
  texture.needsUpdate = true;
  return texture;
}
