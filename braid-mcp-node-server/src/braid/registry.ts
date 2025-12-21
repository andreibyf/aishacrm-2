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
}
