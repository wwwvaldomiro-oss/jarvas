/**
 * Portable personal-data archive format for Órion.
 * This module handles format validation only. It deliberately does not query
 * arbitrary database tables or restore data without module-specific adapters.
 */
export const PORTABLE_BACKUP_FORMAT = "orion-personal-data";
export const PORTABLE_BACKUP_VERSION = 1;

export type PortableRecord = {
  id: string;
  data: Record<string, unknown>;
};

export type PortableCollection = {
  module: string;
  records: PortableRecord[];
};

export type PortableBackup = {
  format: typeof PORTABLE_BACKUP_FORMAT;
  version: typeof PORTABLE_BACKUP_VERSION;
  exportedAt: string;
  sourceApp: string;
  collections: PortableCollection[];
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export function validatePortableBackup(value: unknown): PortableBackup {
  if (!isObject(value) || value.format !== PORTABLE_BACKUP_FORMAT || value.version !== PORTABLE_BACKUP_VERSION ||
      typeof value.exportedAt !== "string" || !Number.isFinite(Date.parse(value.exportedAt)) ||
      typeof value.sourceApp !== "string" || !Array.isArray(value.collections)) {
    throw new Error("Arquivo de backup inválido ou versão incompatível.");
  }
  const seenModules = new Set<string>();
  for (const collection of value.collections) {
    if (!isObject(collection) || typeof collection.module !== "string" || !collection.module ||
        seenModules.has(collection.module) || !Array.isArray(collection.records)) {
      throw new Error("Coleção de backup inválida ou duplicada.");
    }
    seenModules.add(collection.module);
    const seenIds = new Set<string>();
    for (const record of collection.records) {
      if (!isObject(record) || typeof record.id !== "string" || !record.id ||
          seenIds.has(record.id) || !isObject(record.data)) {
        throw new Error("Registro inválido ou duplicado no backup.");
      }
      seenIds.add(record.id);
    }
  }
  return value as PortableBackup;
}

export function buildPortableBackup(sourceApp: string, collections: PortableCollection[]): PortableBackup {
  return validatePortableBackup({
    format: PORTABLE_BACKUP_FORMAT,
    version: PORTABLE_BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    sourceApp,
    collections,
  });
}

export function serializePortableBackup(backup: PortableBackup): string {
  return JSON.stringify(validatePortableBackup(backup), null, 2);
}

export function parsePortableBackup(text: string): PortableBackup {
  try {
    return validatePortableBackup(JSON.parse(text) as unknown);
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error("O arquivo não contém JSON válido.");
    throw error;
  }
}
