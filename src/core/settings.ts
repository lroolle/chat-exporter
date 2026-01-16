/**
 * Extension settings storage with schema versioning
 */

const SCHEMA_VERSION = 1;
const STORAGE_KEY = 'exportSettings';

export interface ExportSettings {
  version: number;
  includeThinking: boolean;
  includeTimestamps: boolean;
  includeMetadata: boolean;
}

export const DEFAULT_SETTINGS: ExportSettings = {
  version: SCHEMA_VERSION,
  includeThinking: true,
  includeTimestamps: true,
  includeMetadata: true,
};

export async function getSettings(): Promise<ExportSettings> {
  try {
    const result = await chrome.storage.sync.get(STORAGE_KEY);
    const stored = result[STORAGE_KEY] as Partial<ExportSettings> | undefined;

    if (!stored || stored.version !== SCHEMA_VERSION) {
      const migrated = migrateSettings(stored);
      await chrome.storage.sync.set({ [STORAGE_KEY]: migrated });
      return migrated;
    }

    return { ...DEFAULT_SETTINGS, ...stored };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(settings: Partial<ExportSettings>): Promise<void> {
  const current = await getSettings();
  await chrome.storage.sync.set({
    [STORAGE_KEY]: { ...current, ...settings, version: SCHEMA_VERSION },
  });
}

function migrateSettings(old: Partial<ExportSettings> | undefined): ExportSettings {
  if (!old) return DEFAULT_SETTINGS;

  // Future migrations go here based on old.version
  // Example: if (old.version === 0) { migrate v0 -> v1 }

  return { ...DEFAULT_SETTINGS, ...old, version: SCHEMA_VERSION };
}
