#!/usr/bin/env bash
#
# Optimisasi model GLB dengan @gltf-transform/cli (dijalankan via npx,
# tanpa dependensi tetap). Lihat AGENTS.md bagian 6.
#
# PENTING:
#   - Hasilnya WAJIB diverifikasi secara visual (npm run dev + npm run verify)
#     terhadap versi asli. Bila material/transparansi/warna rusak,
#     kembalikan ke GLB asli dan catat di README bagian Decisions.
#   - File asli di assets-src/ bersifat read-only — jangan ditimpa.
#
# Pakai:
#   npm run optimize-model
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$ROOT/assets-src/bmw_m4_modified_widebody_knitro_builds.glb"
OUT="$ROOT/public/models/bmw-m4.glb"
TMP="$ROOT/public/models/bmw-m4.optimized.glb"

if [[ ! -f "$SRC" ]]; then
  echo "✖ Sumber tidak ditemukan: $SRC" >&2
  echo "  Ekstrak GLB dari arsip ke assets-src/ dulu." >&2
  echo "  assets-src/ bersifat read-only — jangan menimpa file di dalamnya." >&2
  exit 1
fi

echo "→ Sumber : $SRC ($(du -h "$SRC" | cut -f1))"
echo "→ Target : $OUT"
echo

# Kenapa flag-flag ini penting — jangan dihapus tanpa membaca AGENTS.md §2:
#
#   --palette false       PALETTE menggabungkan material & MEMBUANG NAMA-nya.
#                         Registry kita mencari material lewat nama
#                         ('PaintTNR_Material', 'Material.002', dll.), jadi
#                         paletisasi merusak seluruh fitur ganti warna.
#   --flatten false       FLATTEN menghapus hierarki node → nama node roda
#                         ('Circle.001_43' / 'Circle.004_44') hilang, sehingga
#                         animasi putar roda (wheels.ts) berhenti bekerja.
#   --join false          JOIN menggabungkan mesh → merusak pemisahan roda/kaliper.
#   --instance false      INSTANCE menunjuk ulang mesh → referensi material jadi
#                         tidak eksplisit.
#   --simplify false      PENYEDERHANAAN geometri mengubah tepi keras & uv.
#                         Risiko artefak visual tidak sepadan dengan nilainya;
#                         ukuran besar lebih banyak ditekan oleh meshopt + webp.
#
#   --compress meshopt    : decode di sisi klien via MeshoptDecoder (sudah
#                           dipasang di src/car/loader.ts).
#   --texture-compress webp : mengecilkan 23 tekstur (PNG → WebP).
npx --yes @gltf-transform/cli optimize "$SRC" "$TMP" \
  --compress meshopt \
  --texture-compress webp \
  --texture-size 2048 \
  --palette false \
  --flatten false \
  --join false \
  --instance false \
  --simplify false

echo
echo "→ Perbandingan ukuran:"
ls -lh "$SRC" "$TMP" | awk '{print "   ", $5 "\t" $9}'

# Verifikasi struktur dasar sebelum menimpa file aktif.
echo
echo "→ Validasi hasil:"
npx --yes @gltf-transform/cli validate "$TMP" || {
  echo "✖ Validasi gagal — file hasil TIDAK dipakai." >&2
  rm -f "$TMP"
  exit 1
}

# Pemeriksaan keras: nama material & node yang diandalkan registry (AGENTS §2)
# harus masih ada. Kalau hilang, registry gagal dan semua fitur warna mati.
# (Dibaca langsung dari chunk JSON GLB — `gltf-transform inspect` tidak
#  mencetak nama node, jadi tidak bisa dipakai untuk cek ini.)
echo
echo "→ Cek nama material/node yang dibutuhkan registry:"
MUST_CONTAIN=(
  "PaintTNR_Material"   # cat bodi
  "Material.002"        # kaliper rem
  "Circle.001"          # node roda depan
  "Circle.004"          # node roda belakang
)
if ! node "$ROOT/scripts/glb-names.mjs" "$TMP" "${MUST_CONTAIN[@]}"; then
  echo
  echo "✖ Nama material/node hilang — registry akan rusak. File hasil DITOLAK." >&2
  echo "  (Biasanya penyebabnya --palette / --flatten / --join diaktifkan.)" >&2
  rm -f "$TMP"
  exit 1
fi

mv -f "$TMP" "$OUT"
echo "✔ Berhasil ditulis ke $OUT"
echo
echo "JALANKAN SEKARANG (wajib):"
echo "  npm run dev      # cek visual: material, transparansi, warna, shadow"
echo "  npm run verify   # screenshot 7 sudut + audit piksel"
echo "Bila hasil rusak, pulihkan dari arsip:"
echo "  pwsh -c \"Add-Type -A System.IO.Compression.FileSystem;"
echo "    \$z=[IO.Compression.ZipFile]::OpenRead('<path-ke-zip>');"
echo "    [IO.Compression.ZipFileExtensions]::ExtractToFile("
echo "      (\$z.Entries | ? FullName -eq 'source/bmw_m4_modified_widebody_knitro_builds.glb'),"
echo "      'public/models/bmw-m4.glb', \$true)\""
