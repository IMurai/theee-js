import * as THREE from 'three';

/**
 * Screenshot: render ulang lalu `canvas.toBlob` → unduh PNG.
 * `preserveDrawingBuffer` TIDAK diaktifkan permanen (boros); sebagai gantinya
 * kita panggil `render()` tepat sebelum mengambil buffer.
 */
export function saveScreenshot(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  filename = 'bmw-m4-showroom.png',
): void {
  renderer.render(scene, camera);

  const canvas = renderer.domElement;
  const download = (blob: Blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Beri waktu browser memulai unduhan sebelum URL dicabut.
    window.setTimeout(() => URL.revokeObjectURL(url), 4000);
  };

  if (canvas.toBlob) {
    canvas.toBlob((blob) => {
      if (blob) download(blob);
      else fallbackToDataURL(canvas, download);
    }, 'image/png');
  } else {
    fallbackToDataURL(canvas, download);
  }
}

function fallbackToDataURL(
  canvas: HTMLCanvasElement,
  download: (blob: Blob) => void,
): void {
  const dataUrl = canvas.toDataURL('image/png');
  const bin = atob(dataUrl.split(',')[1] ?? '');
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  download(new Blob([bytes], { type: 'image/png' }));
}
