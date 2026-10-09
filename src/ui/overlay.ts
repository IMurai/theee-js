import type { PaintPreset, WheelPreset, CaliperPreset } from '../config';

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

export interface LoaderApi {
  setProgress: (ratio: number | null, label?: string) => void;
  setDone: () => void;
  setError: (message?: string) => void;
  onRetry: (cb: () => void) => void;
}

export function createLoaderUi(): LoaderApi {
  const root = document.getElementById('loader');
  const bar = document.getElementById('loader-bar');
  const label = document.getElementById('loader-label');
  const error = document.getElementById('loader-error');
  const retry = document.getElementById('loader-retry');

  if (!root || !bar || !label || !error || !retry) {
    throw new Error('Elemen loading screen tidak ditemukan di index.html.');
  }

  let retryCb: (() => void) | null = null;
  retry.addEventListener('click', () => retryCb?.());

  return {
    setProgress(ratio, text) {
      error.hidden = true;
      retry.hidden = true;
      if (ratio === null) {
        bar.style.width = '100%';
        bar.classList.add('loader__bar--indeterminate');
        label.textContent = text ?? 'Mengunduh model…';
        return;
      }
      bar.classList.remove('loader__bar--indeterminate');
      const pct = Math.round(Math.min(1, Math.max(0, ratio)) * 100);
      bar.style.width = `${pct}%`;
      label.textContent = text ?? `Memuat model… ${pct}%`;
    },
    setDone() {
      bar.style.width = '100%';
      bar.classList.remove('loader__bar--indeterminate');
      label.textContent = 'Siap';
      root.classList.add('loader--hidden');
      window.setTimeout(() => {
        root.hidden = true;
      }, 650);
    },
    setError(message) {
      if (message) label.textContent = 'Terjadi kesalahan';
      error.hidden = false;
      retry.hidden = false;
      bar.classList.add('loader__bar--error');
    },
    onRetry(cb) {
      retryCb = cb;
    },
  };
}

// --- Swatches -------------------------------------------------------------

export interface SwatchApi {
  select: (id: string) => void;
}

export function createSwatches<T extends { id: string; label: string; hex: string }>(
  container: HTMLElement,
  items: readonly T[],
  initialId: string,
  onPick: (item: T) => void,
): SwatchApi {
  container.replaceChildren();
  const buttons = new Map<string, HTMLButtonElement>();

  for (const item of items) {
    const btn = el('button', 'swatch');
    btn.type = 'button';
    btn.style.setProperty('--swatch', item.hex);
    btn.setAttribute('role', 'radio');
    btn.setAttribute('aria-label', item.label);
    btn.title = item.label;
    btn.dataset.id = item.id;

    const dot = el('span', 'swatch__dot');
    const name = el('span', 'swatch__name');
    name.textContent = item.label;
    btn.append(dot, name);

    btn.addEventListener('click', () => {
      onPick(item);
    });

    container.appendChild(btn);
    buttons.set(item.id, btn);
  }

  const select = (id: string) => {
    for (const [key, btn] of buttons) {
      const active = key === id;
      btn.classList.toggle('swatch--active', active);
      btn.setAttribute('aria-checked', String(active));
      btn.tabIndex = active ? 0 : -1;
    }
  };

  select(initialId);
  return { select };
}

// --- Chips (preset kamera, finish cat, dsb) --------------------------------

export interface ChipOptions<T> {
  /** Label untuk pembaca layar (default: `item.label`). */
  aria?: (item: T) => string;
  /** Tooltip (default: nilai `aria`). */
  title?: (item: T) => string;
}

export function createChips<T extends { id: string; label: string }>(
  container: HTMLElement,
  items: readonly T[],
  onPick: (item: T) => void,
  options: ChipOptions<T> = {},
): { select: (id: string) => void } {
  container.replaceChildren();
  const buttons = new Map<string, HTMLButtonElement>();

  for (const item of items) {
    const aria = options.aria?.(item) ?? item.label;
    const title = options.title?.(item) ?? aria;
    const btn = el('button', 'chip');
    btn.type = 'button';
    btn.textContent = item.label;
    btn.setAttribute('aria-label', aria);
    btn.title = title;
    btn.dataset.id = item.id;

    btn.addEventListener('click', () => onPick(item));
    container.appendChild(btn);
    buttons.set(item.id, btn);
  }

  const select = (id: string) => {
    for (const [key, btn] of buttons) {
      const active = key === id;
      btn.classList.toggle('chip--active', active);
      btn.setAttribute('aria-pressed', String(active));
    }
  };

  return { select };
}

// --- Panel (desktop sidebar / mobile bottom sheet) ------------------------

export function createPanel(): { toggle: () => void; isOpen: () => boolean } {
  const panel = document.getElementById('panel');
  const trigger = document.getElementById('btn-panel');
  if (!panel || !trigger) throw new Error('Elemen panel tidak ditemukan.');

  const setOpen = (open: boolean) => {
    panel.classList.toggle('panel--open', open);
    trigger.setAttribute('aria-expanded', String(open));
  };

  // Default: terbuka di desktop, tertutup di mobile.
  const isMobile = matchMedia('(max-width: 820px)').matches;
  setOpen(!isMobile);

  trigger.addEventListener('click', () => {
    setOpen(!panel.classList.contains('panel--open'));
  });

  // Tutup panel saat klik di luar (mobile).
  document.addEventListener('pointerdown', (e) => {
    if (!matchMedia('(max-width: 820px)').matches) return;
    if (!panel.classList.contains('panel--open')) return;
    const target = e.target as Node;
    if (panel.contains(target) || trigger.contains(target)) return;
    setOpen(false);
  });

  return {
    toggle() {
      setOpen(!panel.classList.contains('panel--open'));
    },
    isOpen() {
      return panel.classList.contains('panel--open');
    },
  };
}

export type { PaintPreset, WheelPreset, CaliperPreset };
