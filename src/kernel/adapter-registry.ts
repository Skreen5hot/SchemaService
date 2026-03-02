/**
 * Output Adapter Registry
 *
 * Per BIBSS Spec §11.3.
 * TODO: Implement adapter registry.
 */

import type { OutputAdapter, AdapterRegistry } from "./types.js";

// TODO: Implement createAdapterRegistry()
export function createAdapterRegistry(): AdapterRegistry {
  const adapters = new Map<string, OutputAdapter>();

  return {
    register(name: string, adapter: OutputAdapter): void {
      adapters.set(name, adapter);
    },
    get(name: string): OutputAdapter | undefined {
      return adapters.get(name);
    },
    list(): string[] {
      return [...adapters.keys()];
    },
  };
}
