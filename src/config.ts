/**
 * Konstanta seluruh aplikasi.
 * Semua angka punya satuan yang ditulis sebagai komentar.
 */

// --- Model & normalisasi -------------------------------------------------
/** Panjang mobil setelah normalisasi, dalam unit dunia (1 unit = 1 m). */
export const CAR_LENGTH = 4.8;
/** Posisi Y bagian bawah ban setelah normalisasi (m). */
export const CAR_GROUND_Y = 0;

// --- Kamera --------------------------------------------------------------
/** FOV kamera default (derajat) — dipakai pada rasio aspek lebar (>= 1). */
export const CAMERA_FOV = 38;
/**
 * FOV pada layar portrait (rasio aspek < 1).
 * Horizontal FOV menyempit drastis di portrait, jadi FOV vertikal dinaikkan
 * supaya panjang mobil (4,8 m) tetap muat.
 */
export const CAMERA_FOV_PORTRAIT = 50;
/** Rasio aspek di bawah nilai ini dianggap portrait. */
export const PORTRAIT_ASPECT = 1;
/** Pengali jarak kamera pada portrait (lihat CAMERA_FOV_PORTRAIT). */
export const PORTRAIT_DISTANCE_FACTOR = 1.7;

/** Jarak kamera default (m). */
export const CAMERA_DEFAULT_DISTANCE = 7.5;
/** Tinggi kamera default (m). */
export const CAMERA_DEFAULT_HEIGHT = 2.2;
export const CAMERA_MIN_DISTANCE = 3.2;
/**
 * Batas zoom out. Lebih besar dari jarak preset karena pada layar portrait
 * jarak dikalikan PORTRAIT_DISTANCE_FACTOR.
 */
export const CAMERA_MAX_DISTANCE = 26;
/** Batas bawah sudut polar (rad) — mencegah kamera menembus lantai. */
export const CAMERA_MAX_POLAR = Math.PI / 2 - 0.04;
/** Durasi animasi preset kamera (ms). */
export const CAMERA_ANIM_MS = 900;
/** Idle sebelum auto-rotate lanjut (ms). */
export const AUTO_ROTATE_IDLE_MS = 4000;
export const AUTO_ROTATE_SPEED = 0.6; // unit: putaran penuh / menit (dibaca OrbitControls)

// --- Renderer ------------------------------------------------------------
export const MAX_PIXEL_RATIO = 2;
export const MAX_ANISOTROPY = 8;
/** Exposure default tone mapping. */
export const EXPOSURE_STUDIO = 1.2;
export const EXPOSURE_NIGHT = 0.78;
/** Shadow map (px). */
export const SHADOW_MAP_DESKTOP = 2048;
export const SHADOW_MAP_MOBILE = 1024;

// --- Transisi warna cat --------------------------------------------------
/** Durasi lerp warna cat (ms). */
export const PAINT_TRANSITION_MS = 300;

// --- Lantai --------------------------------------------------------------
/**
 * Sisi lantai (m).
 *
 * HARUS lebih besar dari 2 × FOG_FAR, kalau tidak tepi lantai terlihat sebagai
 * garis horizon keras di latar (fog baru penuh pada FOG_FAR). Satu quad saja,
 * jadi menambah ukuran tidak menambah vertex.
 */
export const FLOOR_SIZE = 120;
/** Jarak fog mulai kabut (m). */
export const FOG_NEAR = 18;
/** Jarak fog penuh (m) — lantai harus sudah memudar sempurna sebelum titik ini. */
export const FOG_FAR = 55;

// --- Preset warna --------------------------------------------------------
export interface PaintPreset {
  id: string;
  label: string;
  hex: string;
}

/** 6 preset wajib + beberapa tambahan khas M. */
export const PAINT_PRESETS: readonly PaintPreset[] = [
  { id: 'black', label: 'Alpine Black', hex: '#0e0e10' },
  { id: 'white', label: 'Alpine White', hex: '#f2f3f4' },
  { id: 'grey', label: 'Brooklyn Grey', hex: '#6e737a' },
  { id: 'blue', label: 'Portimao Blue', hex: '#1f5fbf' },
  { id: 'red', label: 'Toronto Red', hex: '#b3141c' },
  { id: 'green', label: 'Isle of Man Green', hex: '#1f6b4a' },
  { id: 'yellow', label: 'Sao Paulo Yellow', hex: '#e8c400' },
  { id: 'orange', label: 'Fire Orange', hex: '#e05a10' },
] as const;

export interface WheelPreset {
  id: string;
  label: string;
  hex: string;
}

export const WHEEL_PRESETS: readonly WheelPreset[] = [
  { id: 'stock', label: 'Bi-color', hex: '#8d9298' },
  { id: 'black', label: 'Jet Black', hex: '#141416' },
  { id: 'bronze', label: 'Bronze', hex: '#8a6032' },
  { id: 'gold', label: 'Gold', hex: '#c2a04a' },
] as const;

export interface CaliperPreset {
  id: string;
  label: string;
  hex: string;
}

export const CALIPER_PRESETS: readonly CaliperPreset[] = [
  { id: 'red', label: 'Merah', hex: '#c0141c' },
  { id: 'blue', label: 'Biru', hex: '#1a4fd0' },
  { id: 'yellow', label: 'Kuning', hex: '#e6c400' },
  { id: 'black', label: 'Hitam', hex: '#17171a' },
] as const;

// --- Preset kamera -------------------------------------------------------
export type CameraPresetId = 'three-quarter' | 'front' | 'side' | 'rear' | 'top';

export interface CameraPreset {
  id: CameraPresetId;
  label: string;
  hotkey: string;
  /** Azimut derajat relatif sumbu +Z (depan mobil). */
  azimuthDeg: number;
  /** Polar derajat dari sumbu +Y (0 = atas). */
  polarDeg: number;
  /** Jarak kamera ke pusat (m). */
  distance: number;
}

export const CAMERA_PRESETS: readonly CameraPreset[] = [
  { id: 'three-quarter', label: '3/4', hotkey: '1', azimuthDeg: 38, polarDeg: 72, distance: 7.4 },
  { id: 'front', label: 'Depan', hotkey: '2', azimuthDeg: 0, polarDeg: 80, distance: 6.6 },
  { id: 'side', label: 'Samping', hotkey: '3', azimuthDeg: 90, polarDeg: 82, distance: 7.2 },
  { id: 'rear', label: 'Belakang', hotkey: '4', azimuthDeg: 180, polarDeg: 78, distance: 6.8 },
  { id: 'top', label: 'Atas', hotkey: '5', azimuthDeg: 25, polarDeg: 28, distance: 9.5 },
] as const;

// --- Hotspot -------------------------------------------------------------
/**
 * Posisi hotspot dinyatakan sebagai PECAHAN bounding box mobil (0..1),
 * bukan angka meter hardcode — supaya tetap benar walau model diganti.
 * Sumbu Z: 0 = belakang (wing), 1 = depan (kap mesin).
 * Sumbu X: 0 = kiri, 1 = kanan. Sumbu Y: 0 = lantai, 1 = atap.
 */
export interface HotspotDef {
  id: string;
  label: string;
  /** [x, y, z] dalam satuan pecahan bounding box. */
  frac: [number, number, number];
}

export const HOTSPOTS: readonly HotspotDef[] = [
  { id: 'wing', label: 'Carbon rear wing', frac: [0.5, 0.93, 0.02] },
  { id: 'kit', label: 'Widebody kit', frac: [1.0, 0.42, 0.52] },
  // Kap mesin lebih rendah dari atap — 0,86 terlalu tinggi (menempel kaca).
  { id: 'hood', label: 'Carbon hood', frac: [0.5, 0.74, 0.9] },
] as const;

// --- Performa ------------------------------------------------------------
/** Shadow frustum (m) — diketatkan mengikuti bounding box mobil. */
export const SHADOW_FRUSTUM_SIZE = 7;
