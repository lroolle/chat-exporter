/**
 * Registry for platform adapters and exporters
 */

import type { PlatformAdapter, Exporter } from './types';

class Registry {
  private platforms: Map<string, PlatformAdapter> = new Map();
  private exporters: Map<string, Exporter> = new Map();

  registerPlatform(adapter: PlatformAdapter) {
    this.platforms.set(adapter.id, adapter);
  }

  registerExporter(exporter: Exporter) {
    this.exporters.set(exporter.id, exporter);
  }

  getPlatformFor(url: string): PlatformAdapter | null {
    for (const platform of this.platforms.values()) {
      if (platform.matches(url)) {
        return platform;
      }
    }
    return null;
  }

  getExporter(id: string): Exporter | null {
    return this.exporters.get(id) || null;
  }

  listPlatforms(): string[] {
    return Array.from(this.platforms.keys());
  }

  listExporters(): string[] {
    return Array.from(this.exporters.keys());
  }
}

export const registry = new Registry();
