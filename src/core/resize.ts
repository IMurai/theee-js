/**
 * Util untuk menentukan ukuran area render (mengikuti container, bukan window).
 */
export function observeSize(
  element: HTMLElement,
  onResize: (width: number, height: number) => void,
): () => void {
  const emit = () => {
    const { width, height } = element.getBoundingClientRect();
    if (width > 0 && height > 0) onResize(width, height);
  };

  emit();

  const ro = new ResizeObserver(emit);
  ro.observe(element);
  window.addEventListener('orientationchange', emit);

  return () => {
    ro.disconnect();
    window.removeEventListener('orientationchange', emit);
  };
}
