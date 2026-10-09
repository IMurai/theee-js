/**
 * Animation loop dengan pause saat tab tidak terlihat (visibilitychange)
 * dan indikator FPS hanya di mode dev.
 */

export interface LoopHandle {
  start: () => void;
  stop: () => void;
  dispose: () => void;
}

interface LoopOptions {
  /** Dipanggil tiap frame dengan delta detik. */
  onFrame: (deltaSec: number, elapsedSec: number) => void;
}

export function createLoop(options: LoopOptions): LoopHandle {
  let rafId = 0;
  let running = false;
  let last = 0;
  let elapsed = 0;

  const tick = (now: number) => {
    if (!running) return;
    rafId = requestAnimationFrame(tick);

    const deltaSec = last === 0 ? 0 : Math.min((now - last) / 1000, 0.1);
    last = now;
    elapsed += deltaSec;

    // Catatan: onFrame SELALU dipanggil agar damping OrbitControls & transisi
    // warna terus berjalan. Peng-gate render on-demand dilakukan di main.ts
    // (lihat needsRender), bukan di sini — agar damping tidak macet.
    options.onFrame(deltaSec, elapsed);
  };

  const onVisibility = () => {
    if (document.hidden) {
      stop();
    } else {
      start();
    }
  };

  const start = () => {
    if (running) return;
    running = true;
    last = 0;
    rafId = requestAnimationFrame(tick);
  };

  const stop = () => {
    running = false;
    cancelAnimationFrame(rafId);
    rafId = 0;
  };

  document.addEventListener('visibilitychange', onVisibility);

  return {
    start,
    stop,
    dispose() {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    },
  };
}
