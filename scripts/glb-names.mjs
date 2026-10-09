/**
 * Util dev-only: daftar nama node & material dari file GLB, tanpa dependensi.
 * GLB = header 12 byte + chunk (chunk pertama = JSON).
 *
 * Pakai: node scripts/glb-names.mjs <file.glb> [token ...]
 *   Tanpa argumen token  → cetak semua nama.
 *   Dengan token         → 0 bila SEMUA token ditemukan, 1 bila ada yang hilang.
 */
import { readFileSync } from 'node:fs';

const file = process.argv[2];
const tokens = process.argv.slice(3);
if (!file) {
  console.error('Pakai: node scripts/glb-names.mjs <file.glb> [token ...]');
  process.exit(2);
}

const buf = readFileSync(file);
const magic = buf.toString('ascii', 0, 4);
if (magic !== 'glTF') {
  console.error(`Bukan file GLB valid (magic="${magic}").`);
  process.exit(2);
}

const jsonLength = buf.readUInt32LE(12);
const jsonChunk = buf.toString('utf8', 20, 20 + jsonLength);
const gltf = JSON.parse(jsonChunk);

const nodeNames = (gltf.nodes ?? []).map((n) => n.name ?? '');
const materialNames = (gltf.materials ?? []).map((m) => m.name ?? '');
const meshNames = (gltf.meshes ?? []).map((m) => m.name ?? '');
const all = [...nodeNames, ...materialNames, ...meshNames];

if (tokens.length === 0) {
  console.log(`nodes: ${nodeNames.length}`);
  for (const n of nodeNames) console.log(`  N ${n}`);
  console.log(`materials: ${materialNames.length}`);
  for (const n of materialNames) console.log(`  M ${n}`);
  console.log(`meshes: ${meshNames.length}`);
  for (const n of meshNames) console.log(`  G ${n}`);
  process.exit(0);
}

let missing = 0;
for (const token of tokens) {
  const found = all.some((n) => n.includes(token));
  if (found) {
    console.log(`   OK   ${token}`);
  } else {
    console.error(`   MISS ${token}`);
    missing += 1;
  }
}
process.exit(missing === 0 ? 0 : 1);
