# BMW M4 Widebody — 3D Showroom

Website showroom mobil 3D interaktif untuk **BMW M4 Competition widebody**,
dibangun dengan **three.js** + **Vite** + **TypeScript (strict)**. Tanpa framework UI.

Pengunjung dapat memutar, zoom, mengganti warna cat/velg/kaliper, berpindah sudut
kamera, menyalakan lampu, mengaktifkan putaran roda, beralih mode studio/malam,
dan mengambil screenshot.

> "BMW M4 Modified Widebody" by **knitro_builds**, licensed under
> [**CC-BY-4.0**](https://creativecommons.org/licenses/by/4.0/) (Sketchfab).
> Sumber: <https://sketchfab.com/3d-models/bmw-m4-modified-widebody-knitro-builds-6e325ec23a0f41c08366472b34b8f8c8>

---

## Menjalankan

```bash
npm install
npm run dev        # http://localhost:5173
```

Produksi & pratinjau:

```bash
npm run build      # tsc --noEmit && vite build  → dist/
npm run preview    # sajian produksi
```

Skrip lainnya:

| Perintah | Fungsi |
|---|---|
| `npm run typecheck` | TypeScript strict tanpa kompilasi output |
| `npm run optimize-model` | Kompresi ulang GLB (lihat bagian *Optimisasi*) |
| `npm run verify` | Screenshot otomatis 7 sudut + audit piksel (butuh dev server berjalan) |
| `npm run smoke` | Cek cepat build produksi terhadap `vite preview` (tanpa instrumen dev) |

`npm run verify` membutuhkan Chrome/Edge lokal. Bila terdeteksi otomatis gagal,
tetapkan path manual: `CHROME_PATH="C:\...\chrome.exe" npm run verify`.

---

## Fitur

**Utama**

- Loading screen dengan progress **nyata** (bukan bar buatan) + pesan error ramah.
- Normalisasi model: panjang persis **4,800 unit**, disenteri di X/Z, bagian bawah
  ban tepat di `y = 0`.
- Studio lighting: `RoomEnvironment` (PMREM) + `DirectionalLight` berbayang lembut
  + fill/rim. `ACESFilmicToneMapping`, `outputColorSpace = SRGBColorSpace`.
- Lantai gelap menyatu dengan latar via fog + contact shadow gradasi radial.
- `OrbitControls` ber-damping, pan dimatikan, batas polar mencegah kamera
  menembus lantai, auto-rotate setelah idle 4 dtk (berhenti saat user berinteraksi).
- Menghormati `prefers-reduced-motion`.
- **8 preset warna cat** + color picker bebas, transisi lerp 300 ms,
  `MeshPhysicalMaterial` dengan `clearcoat ≈ 1`.
- **5 preset kamera** (3/4, Depan, Samping, Belakang, Atas) dengan animasi ease,
  hotkey `1`–`5`.
- Responsif: panel jadi **bottom sheet** di layar sempit, `pixelRatio` dibatasi 2.
- Atribusi CC-BY-4.0 di footer.

**Tambahan**

- Warna velg (4) dan kaliper rem (4).
- Toggle lampu depan/belakang (mengatur `emissiveIntensity`, bukan menambah light).
- Toggle putaran roda pelan (showroom mode).
- Mode lingkungan **Studio / Malam** (exposure, warna latar, intensitas environment).
- Tombol **Screenshot** → unduh PNG.
- Hotspot anotasi (Carbon rear wing, Widebody kit, Carbon hood) yang otomatis
  **tersembunyi saat berada di sisi jauh mobil**, sehingga label tidak menembus bodi.
- Indikator FPS **hanya** di mode dev.

---

## Struktur proyek

```
.
├─ AGENTS.md                    # instruksi pengembangan (sumber kebenaran)
├─ README.md
├─ index.html
├─ package.json / tsconfig.json / vite.config.ts
├─ assets-src/                  # arsip asli (gitignored, read-only)
├─ public/
│  └─ models/bmw-m4.glb         # model yang dimuat saat runtime
├─ scripts/
│  ├─ optimize-model.sh         # kompresi GLB via @gltf-transform/cli
│  ├─ glb-names.mjs             # baca nama node/material langsung dari GLB
│  ├─ verify.mjs                # screenshot 7 sudut + audit piksel
│  ├─ probe-hotspots.mjs        # inspeksi status hotspot di browser
│  └─ pixel.mjs                 # baca piksel titik tertentu dari PNG
└─ src/
   ├─ main.ts                   # bootstrap, wiring UI, render on-demand
   ├─ config.ts                 # SEMUA konstanta + preset (satuan di komentar)
   ├─ core/                     # renderer, scene (env/lantai/fog), camera-rig,
   │                             # loop, resize
   ├─ car/                      # loader (progress+normalisasi), registry,
   │                             # paint, lights, wheels
   ├─ ui/                       # overlay (loader/panel/chips), hotspots, screenshot
   └─ styles.css                # tema gelap, variabel CSS, aturan responsif
```

**Pembagian tanggung jawab:** `core/` tidak tahu soal UI; `ui/` hanya bicara ke
`car/` lewat API kecil (mis. `setPaintColor(hex)`). Semua pencarian node/material
dibungkus satu fungsi registry (`buildMaterialRegistry`) agar mudah diperbaiki
bila nama di GLB berubah.

---

## Mengganti model

1. Taruh GLB baru di `public/models/bmw-m4.glb` (nama tanpa spasi).
2. Buka `src/car/registry.ts` dan samakan token pencarian dengan nama material
   model baru. Semua kriteria ada di `AGENTS.md` bagian 2.
3. Periksa nama node/mesh yang dipakai (roda, cat, kaliper, kaca, lampu).
   Alat bantu tanpa dependensi:

   ```bash
   node scripts/glb-names.mjs public/models/bmw-m4.glb            # daftar semua nama
   node scripts/glb-names.mjs public/models/bmw-m4.glb PaintTNR   # cek satu token
   ```

4. Sesuaikan `src/config.ts` bila dimensi/posisi hotspot berbeda. Posisi hotspot
   dinyatakan sebagai **pecahan bounding box (0..1)**, jadi biasanya tidak perlu
   diubah sama sekali.
5. `npm run typecheck && npm run verify`.

## Mengganti warna

Semua preset ada di `src/config.ts` — tidak ada warna hardcode di tempat lain:

- `PAINT_PRESETS` — cat bodi (tambah/hapus baris `id/label/hex`)
- `WHEEL_PRESETS` — velg
- `CALIPER_PRESETS` — kaliper
- `CAMERA_PRESETS` — azimut, polar, jarak tiap preset kamera

Warna kustom lewat color picker disimpan di `localStorage`
(dibungkus `try/catch`, opsional).

---

## Optimisasi & performa

Model asli **21,95 MB / ±534 rb segitiga**. Model aktif kini **3,42 MB**
(setara turun ~85%) hasil `npm run optimize-model`.

```bash
npm run optimize-model
```

Penting — baca dulu komentar di `scripts/optimize-model.sh`. Beberapa opsi
**harus tetap mati** karena akan merusak aplikasi:

| Opsi | Kenapa dimatikan |
|---|---|
| `--palette` | Menggabungkan material **dan membuang namanya** → seluruh fitur ganti warna mati |
| `--flatten` | Menghapus hierarki node → nama node roda hilang, animasi roda berhenti |
| `--join` | Menggabungkan mesh → pemisahan roda/kaliper rusak |
| `--simplify` | Mengubah tepi keras & UV → risiko artefak visual |

Yang dipakai: `--compress meshopt` (decode via `MeshoptDecoder`, sudah terpasang
di `src/car/loader.ts`) dan `--texture-compress webp` (23 tekstur).

Skrip ini **menolak menimpa** file aktif bila nama material/node yang dibutuhkan
registry hilang, sehingga gagal optimisasi tidak pernah merusak build.
Tetap wajib verifikasi visual setelahnya: `npm run dev` + `npm run verify`.

Bila hasilnya rusak, pulihkan dari arsip asli (lihat pesan di akhir skrip).

Teknik performa lain yang sudah diterapkan:

- **Render on demand** — `renderer.shadowMap.autoUpdate = false` + flag
  `needsRender` yang dipicu oleh interaksi (kamera, transisi warna, roda,
  resize, perubahan material/environment). Loop dijeda saat tab tidak terlihat.
- Shadow map **2048** desktop / **1024** mobile, frustum diketatkan ke bounding
  box mobil (`SHADOW_FRUSTUM_SIZE`).
- `renderer.setPixelRatio(Math.min(devicePixelRatio, 2))`.
- `anisotropy` dibatasi `min(maxAnisotropy, 8)`.
- Objek reusable di loop — tidak ada `new Vector3()` per frame.
- Mode portrait menaikkan FOV (38° → 50°) dan mengalikan jarak kamera 1,7×,
  karena horizontal FOV menyempit drastis di rasio aspek kecil.

### Verifikasi otomatis

```bash
npm run dev        # terminal 1
npm run verify     # terminal 2
```

Mengambil screenshot 6 sudut desktop + 1 mobile, lalu **membaca piksel PNG
sebenarnya** (warna badge + piksel pusat kanvas) untuk memastikan frame tidak
stale. Keluar `EXIT=0` berarti semua lolos.

> Catatan: pada headless Chrome tanpa GPU, rendering berjalan lewat SwiftShader
> (software) sehingga FPS di sana **tidak** mewakili performa nyata.

Untuk memastikan build produksi identik dengan dev:

```bash
npm run build && npm run preview   # terminal 1
npm run smoke                      # terminal 2 → "SMOKE OK"
```

`smoke` tidak bergantung pada instrumen dev, jadi ia juga memverifikasi bahwa
tidak ada error console, atribusi lisensi tampil, dan kanvas benar-benar
merender objek pada build produksi.

---

## Decisions

Keputusan desain yang tidak terlihat dari kode:

1. **`RoomEnvironment` sebagai sumber cahaya IBL.** Aset eksternal (HDRI/CDN)
   dilarang di runtime, dan `RoomEnvironment` bawaan three.js cukup untuk
   tampilan studio tanpa menambah file.
2. **Lantai 120 m, fog penuh di 55 m.** Dengan lantai 60 m, tepinya berhenti
   sebelum fog penuh dan muncul sebagai garis horizon keras. Menambah ukuran
   lantai tidak menambah vertex karena hanya satu quad.
3. **Kompresi meshopt dipertahankan, bukan draco.** Meshopt punya decoder ringan
   yang sudah kita pasang, dan `gltf-transform` tidak menyentuh nama material.
4. **`--palette`/`--flatten`/`--join`/`--simplify` dimatikan.** Alih-alih
   mengoptimalkan lebih agresif, kenyamanan registry (berbasis nama) diprioritaskan.
   Guard otomatis di skrip memastikan ini tidak dilanggar diam-diam.
5. **Sembunyi hotspot = heuristik dot product, bukan raycast.** Raycast terhadap
   534 rb segitiga terlalu mahal untuk dijalankan tiap frame. Ambang `-0,8`
   menyembunyikan "Carbon hood" dari belakang dan "Carbon rear wing" dari depan,
   sambil tetap membiarkannya tampil pada sudut 3/4 dan atas di mana keduanya
   memang terlihat.
6. **Render on demand, bukan loop terus-menerus.** Model ini berat; dengan
   auto-rotate hanya berjalan saat idle, kebanyakan frame tidak perlu dirender.
   Ini menurunkan pemakaian baterai di laptop/HP secara signifikan.
7. **`puppeteer-core` sebagai devDependency.** Dibutuhkan `npm run verify`
   (AGENTS bagian 7 meminta pemeriksaan visual). Tidak ikut ke bundle produksi.

---

## Atribusi & lisensi

Model 3D:

> "BMW M4 Modified Widebody" by **knitro_builds**, licensed under
> **CC-BY-4.0** (Sketchfab).
> <https://sketchfab.com/3d-models/bmw-m4-modified-widebody-knitro-builds-6e325ec23a0f41c08366472b34b8f8c8>

Atribusi yang sama juga ditampilkan di footer situs. Kode proyek ini mengikuti
lisensi aset yang dirujuk di atas untuk bagian model; sisanya bebas dipakai
sebagaimana kebutuhan proyek.
#   t h e e e - j s  
 