import type { MaterialRegistry } from './registry';

/**
 * Toggle lampu depan/belakang dengan mengatur emissiveIntensity.
 * Tidak menambah ratusan light — hanya material.
 */
export class CarLights {
  #registry: MaterialRegistry;
  #on = false;

  /** Intensitas saat lampu mati. */
  static readonly OFF = 0.15;
  /** Intensitas saat lampu menyala. */
  static readonly ON = 3.2;
  /** Intensitas lampu belakang. */
  static readonly TAIL_ON = 2.4;

  constructor(registry: MaterialRegistry) {
    this.#registry = registry;
    this.set(false);
  }

  get isOn(): boolean {
    return this.#on;
  }

  set(on: boolean): void {
    this.#on = on;

    for (const mat of this.#registry.headlampMaterials) {
      mat.emissiveIntensity = on ? CarLights.ON : CarLights.OFF;
      mat.needsUpdate = true;
    }
    for (const mat of this.#registry.tailMaterials) {
      mat.emissiveIntensity = on ? CarLights.TAIL_ON : 0.6;
      mat.needsUpdate = true;
    }
  }

  toggle(): void {
    this.set(!this.#on);
  }
}
