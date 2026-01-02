import { BraidAdapter, BraidRegistry } from "./index";

export class InMemoryBraidRegistry implements BraidRegistry {
  private adapters: Map<string, BraidAdapter> = new Map();

  registerAdapter(adapter: BraidAdapter): void {
    if (!adapter.system) {
      throw new Error("Adapter.system must be defined");
    }
    if (this.adapters.has(adapter.system)) {
      throw new Error(`Adapter for system "${adapter.system}" already registered`);
    }
    this.adapters.set(adapter.system, adapter);
  }

  getAdapter(system: string): BraidAdapter | undefined {
    return this.adapters.get(system);
  }

  /**
   * Return the list of registered adapter system names. The returned
   * array is sorted alphabetically to provide a stable order.
   */
  listAdapters(): string[] {
    return Array.from(this.adapters.keys()).sort();
  }
}
