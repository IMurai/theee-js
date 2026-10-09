# AGENTS.md — BMW M4 Widebody 3D Showroom (three.js)

Dokumen ini adalah instruksi utama untuk agent (opencode). Baca seluruhnya sebelum menulis kode.
Bahasa komunikasi dengan user: **Bahasa Indonesia**. Kode, nama variabel, dan commit message: **Bahasa Inggris**.

---

## 1. Tujuan

Bangun website interaktif **3D car showroom** untuk model BMW M4 Competition widebody menggunakan **three.js**.
Pengunjung bisa memutar, zoom, mengganti warna cat, mengganti sudut kamera, menyalakan lampu, dan mengambil screenshot.
Target: tampil mulus (≥ 60 FPS di laptop menengah, ≥ 30 FPS di HP), loading jelas, dan tampilan terasa "premium" (bukan demo three.js mentah).

## 2. Aset 3D (sumber kebenaran)

Arsip: `bmw-m4-widebody-wwwvecarzcom.zip` (jangan ekstrak seluruhnya ke repo).

| Item | Detail |
|---|---|
| File yang dipakai | `bmw-m4-widebody-wwwvecarzcom/source/bmw_m4_modified_widebody_knitro_builds.glb` (~21 MB) |
| Folder `textures/` | Duplikat tekstur yang sudah **embedded** di GLB. **Jangan dipakai** kecuali GLB gagal dimuat. Pengecualian: `internal_ground_ao_texture.jpeg` — periksa dulu, kalau memang AO alas mobil boleh dipakai sebagai contact shadow |
| Format | glTF 2.0 binary, tanpa animasi, tanpa skin/rig |
| Extension | `KHR_materials_specular`, `KHR_materials_emissive_strength` (keduanya didukung `GLTFLoader` bawaan three.js) |
| Kompleksitas | 113 node, 61 mesh, 29 material, 23 tekstur, ±376 rb vertex, ±534 rb segitiga |
| Ukuran asli (unit model) | lebar (X) ≈ 10.05, tinggi (Y) ≈ 6.68, panjang (Z) ≈ 23.67 |
| Orientasi | Y-up setelah transformasi node akar. **Depan mobil = +Z** (kap mesin di z ≈ +7.8, wing belakang di z ≈ −10.7). Verifikasi secara visual setelah dimuat |
| Lisensi | **CC-BY-4.0**, author `knitro_builds`, sumber https://sketchfab.com/3d-models/bmw-m4-modified-widebody-knitro-builds-6e325ec23a0f41c08366472b34b8f8c8 |

**Wajib:** tampilkan atribusi di footer situs dan di `README.md`:
`"BMW M4 Modified Widebody" by knitro_builds, licensed under CC-BY-4.0 (Sketchfab).`

### Material penting (cari berdasarkan `material.name`, jangan berdasarkan index)

Nama asli sangat panjang, gunakan `name.includes(...)`.

| Fungsi | Cara menemukan | Catatan |
|---|---|---|
| **Cat bodi** | `includes('PaintTNR_Material')` | Dipakai 6 mesh (termasuk `Kit0_Paint`). `doubleSided: true`, metallic ≈ 0.67, roughness 0.2. Ganti warna di sini |
| Caliper rem | `name === 'Material.002'` | Merah. Dipakai untuk pilihan warna caliper |
| Velg | `name` ∈ {`main`, `metalblack`, `disk.001`, `Material.001`, `sidetyre`} | Roda depan = node `Circle.001_43`, roda belakang = `Circle.004_44` |
| Kaca | `glass`, `glasswindshiled` | `alphaMode: BLEND` |
| Lampu merah / kaca merah | `wmit_red`, `red_glass` | `wmit_red` memakai emissive |
| Lampu emissive | `emit` | Memakai `KHR_materials_emissive_strength` |
| Karbon | `includes('Carbon1')` | Kit karbon |
| Grille | `includes('GrilleNoAlpha')` | `alphaMode: BLEND` |
| Interior | `includes('InteriorA')` | `alphaMode: BLEND` |

Peringatan teknis aset:
- Roda depan dan belakang adalah **satu mesh per as (kiri + kanan digabung)**, bukan per roda. Untuk animasi putar, bungkus dalam `Group` pivot di pusat as (y ≈ 1.59, z ≈ +7.4 depan / −6.4 belakang dalam unit asli), lalu putar pada sumbu X. **Verifikasi pivot dengan `Box3` saat runtime**, jangan hardcode angka tanpa dicek.
- Banyak material `BLEND` → risiko masalah transparansi/sorting. Atur `depthWrite=false` pada kaca dan `renderOrder` bila perlu, serta uji dari semua sudut kamera.
- Material cat `doubleSided` dapat menimbulkan shadow acne; atur `shadow.bias`/`normalBias` atau `shadowSide` seperlunya.

## 3. Tech stack (tetap, jangan diganti tanpa alasan kuat)

- **Vite** + **TypeScript** (strict mode), tanpa framework UI. Vanilla DOM + CSS cukup.
- **three** (versi stabil terbaru via `npm i three`) + `@types/three`.
- Gunakan modul dari `three/addons/...` (OrbitControls, GLTFLoader, RoomEnvironment, MeshoptDecoder, DRACOLoader bila diperlukan).
- Package manager: `npm`. Jangan menambah dependensi besar tanpa justifikasi tertulis di README.
- Aset runtime hanya dari lokal (`public/`). **Jangan memuat dari CDN/HDRI eksternal** saat runtime. Gunakan `RoomEnvironment` + `PMREMGenerator`, atau HDR lokal kecil di `public/hdr/` bila user menyediakannya.

## 4. Struktur proyek

```
.
├─ AGENTS.md
├─ README.md
├─ index.html
├─ package.json / tsconfig.json / vite.config.ts
├─ assets-src/                  # arsip asli, tidak ikut build (tambahkan ke .gitignore bila besar)
├─ public/
│  └─ models/bmw-m4.glb         # GLB (asli atau hasil optimasi), nama tanpa spasi
├─ scripts/
│  └─ optimize-model.sh         # opsional, lihat bagian 6
└─ src/
   ├─ main.ts                   # bootstrap
   ├─ core/                     # renderer, scene, camera, controls, resize, loop
   ├─ car/                      # loader, material registry, paint, wheels, lights
   ├─ ui/                       # overlay HTML/CSS: loader, panel warna, preset kamera
   ├─ config.ts                 # konstanta (warna preset, posisi kamera, skala)
   └─ styles.css
```

## 5. Spesifikasi fitur

### 5.1 Wajib (MVP)
1. **Loading screen** dengan progress bar nyata (`LoadingManager`/`onProgress`), fade-out setelah model + environment siap. Tampilkan pesan error ramah bila gagal.
2. **Normalisasi model**: hitung `Box3`, skala sehingga panjang ≈ 4.8 unit (anggap 1 unit = 1 m), pusatkan pada sumbu X/Z, letakkan bagian bawah ban tepat di `y = 0`.
3. **Pencahayaan studio**: `RoomEnvironment` (PMREM) sebagai environment, 1 `DirectionalLight` utama (bayangan lembut) + fill/rim light halus. `ACESFilmicToneMapping`, `outputColorSpace = SRGBColorSpace`, exposure bisa diatur.
4. **Lantai & bayangan**: lantai gelap dengan contact shadow/`ShadowMaterial`, latar gradien gelap menyatu dengan lantai (fog atau background gradient). Mobil harus terlihat "menapak".
5. **Kontrol kamera**: `OrbitControls` dengan damping, batas `minDistance`/`maxDistance`, `maxPolarAngle` agar tidak menembus lantai, pan dimatikan. Auto-rotate saat idle (berhenti saat user berinteraksi, lanjut setelah ±4 detik diam). Hormati `prefers-reduced-motion`.
6. **Pilihan warna cat**: minimal 6 preset (hitam, putih, abu Brooklyn, biru Portimao, merah Toronto, hijau/kuning khas M) + color picker bebas. Ubah hanya material cat bodi. Upgrade material cat ke `MeshPhysicalMaterial` dengan `clearcoat ≈ 1` dan `clearcoatRoughness` rendah agar terlihat seperti cat mobil, pertahankan metallic/roughness asli sebagai titik awal. Transisi warna halus (lerp ±300 ms).
7. **Preset kamera** dengan animasi halus (ease): Depan, Samping, Belakang, Atas, 3/4 (default). Tombol/hotkey `1–5`.
8. **Responsif**: desktop dan mobile (touch). `renderer.setPixelRatio(Math.min(devicePixelRatio, 2))`. Panel UI berubah menjadi bottom sheet di layar sempit.
9. **Footer atribusi lisensi** (lihat bagian 2).

### 5.2 Nilai tambah (kerjakan setelah MVP stabil)
- Warna caliper dan velg yang bisa diganti.
- Toggle lampu depan/belakang (atur `emissiveIntensity` pada material `emit` / `wmit_red`; jangan tambah ratusan light).
- Roda berputar pelan di mode "showroom" (lihat catatan pivot di bagian 2).
- Mode lingkungan: *Studio* / *Malam* (ubah exposure, warna background, intensitas environment).
- Tombol **Screenshot** (render ke canvas, `toBlob`, unduh PNG; gunakan `preserveDrawingBuffer` hanya saat capture atau panggil `render()` sebelum `toDataURL`).
- Hotspot/anotasi (mis. "Widebody kit", "Carbon wing") berupa label HTML yang mengikuti titik 3D.
- Kamera interior (opsional; waspadai material `BLEND` pada interior).

## 6. Optimasi & performa (penting: model 21 MB, 534 rb segitiga)

- Mulai dari GLB asli supaya semuanya jalan. Setelah MVP berfungsi, buat `scripts/optimize-model.sh` yang memakai `@gltf-transform/cli` (jalankan via `npx`, tidak perlu dependensi tetap):
  ```bash
  npx @gltf-transform/cli optimize assets-src/model.glb public/models/bmw-m4.glb \
    --compress meshopt --texture-compress webp
  ```
  Jika memakai meshopt, pasang `MeshoptDecoder` di `GLTFLoader`. Bandingkan ukuran dan **verifikasi visual** (material, transparansi, warna) terhadap versi asli. Bila hasil rusak, pakai GLB asli dan catat di README.
- Jangan mematikan material/mesh tanpa verifikasi visual. Dilarang menghapus mesh hanya demi FPS.
- Render **on demand** bila memungkinkan; minimal pause loop ketika tab tidak terlihat (`visibilitychange`).
- Shadow map: 2048 untuk desktop, 1024 untuk mobile. Frustum shadow dibuat ketat mengikuti bounding box mobil.
- Hindari alokasi objek (`new Vector3`) di dalam loop `animate`. Reuse objek.
- Dispose benar bila ada reload/hot-reload (geometry, material, texture, renderer).
- Cap `anisotropy` tekstur ke `renderer.capabilities.getMaxAnisotropy()` (maks 8).
- Tambahkan indikator FPS **hanya** di mode dev (`import.meta.env.DEV`).

## 7. Cara kerja agent (urutan wajib)

1. **Inspeksi dulu, kode kemudian.** Ekstrak hanya GLB ke `public/models/bmw-m4.glb`. Buat util dev sementara yang me-log scene graph (nama node, nama material, jumlah vertex) ke console untuk memvalidasi tabel di bagian 2. Jika ada perbedaan, **ikuti hasil inspeksi** dan perbarui AGENTS.md.
2. **Fase 1 — Scaffold:** Vite + TS strict, renderer, scene, resize, loop. Kubus uji boleh dipakai sementara lalu dihapus.
3. **Fase 2 — Model:** loader + progress, normalisasi, lantai, cahaya, environment. Cek orientasi depan/belakang secara visual.
4. **Fase 3 — Interaksi:** OrbitControls, auto-rotate, preset kamera.
5. **Fase 4 — UI & material:** panel warna cat (clearcoat), footer atribusi, responsif.
6. **Fase 5 — Polish & nilai tambah** sesuai bagian 5.2, lalu optimasi bagian 6.
7. Setiap fase diakhiri dengan: `npm run build` sukses, `npx tsc --noEmit` bersih, dan pemeriksaan visual di `npm run dev`. Jika tool browser/screenshot tersedia (mis. Playwright), ambil screenshot dari ≥ 3 sudut dan periksa artefak (transparansi, shadow acne, z-fighting).
8. Commit kecil per fase dengan pesan jelas (`feat:`, `fix:`, `perf:`, `chore:`).

## 8. Standar kode

- TypeScript strict, tanpa `any` kecuali dengan komentar alasan.
- Pisahkan tanggung jawab: `core/` tidak tahu tentang UI; `ui/` hanya berbicara ke `car/` lewat API kecil yang jelas (mis. `car.setPaintColor(hex)`).
- Konstanta/magic number ditaruh di `config.ts` dengan komentar satuan.
- Pencarian material/node dibungkus satu fungsi *registry* (`buildMaterialRegistry(gltf.scene)`) agar mudah diperbaiki bila nama berubah.
- Jangan memakai `localStorage` untuk hal penting; boleh untuk mengingat preferensi warna (bungkus `try/catch`).
- CSS: variabel CSS untuk warna/spacing, tema gelap, font sistem atau font lokal. UI harus minimalis dan tidak menutupi mobil.
- Aksesibilitas: tombol punya `aria-label`, fokus terlihat, kontras teks cukup, hotkey tidak bentrok dengan input.

## 9. Definisi selesai (Definition of Done)

- [ ] `npm install && npm run dev` berjalan tanpa error/warning console yang berarti.
- [ ] `npm run build` sukses; `npm run preview` menampilkan situs identik dengan dev.
- [ ] Model termuat dengan progress nyata; orientasi benar; mobil menapak di lantai; tidak ada bagian hilang/berkedip.
- [ ] Ganti warna cat hanya mengubah cat bodi (bukan kaca, velg, atau lampu).
- [ ] Preset kamera, auto-rotate, dan batas zoom bekerja di desktop dan touch.
- [ ] FPS stabil sesuai target pada perangkat uji yang tersedia; tidak ada memory leak jelas.
- [ ] Atribusi CC-BY-4.0 tampil di footer dan README.
- [ ] `README.md` berisi: cara menjalankan, struktur proyek, cara mengganti model/warna, catatan optimasi, dan kredit.

## 10. Larangan

- Jangan memuat aset/HDRI/skrip dari URL eksternal saat runtime.
- Jangan menghapus atribusi lisensi.
- Jangan mengubah file di `assets-src/` (arsip asli bersifat read-only).
- Jangan menambah framework besar (React/Vue/dll.) atau engine fisika tanpa diminta.
- Jangan mengklaim "sudah selesai" tanpa menjalankan build dan memeriksa tampilan.
- Bila ada keputusan ambigu (mis. gaya visual), pilih default yang masuk akal, catat di README bagian *Decisions*, dan lanjutkan; jangan berhenti untuk bertanya hal sepele.
