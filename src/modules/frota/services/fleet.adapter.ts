import type { FleetRepositoryAdapter, FleetStateSnapshot } from '../types/fleet.types';
import { recalculateFuelingAverages } from '../utils/fleet.calculations';
import { createSeedSnapshot } from './fleet.seed';

const STORAGE_KEY = 'orion_conecta_modulo_frota_v3';

function normalizeSnapshot(parsed: Partial<FleetStateSnapshot>): FleetStateSnapshot {
  return {
    vehicles: parsed.vehicles ?? [],
    drivers: parsed.drivers ?? [],
    fuelings: recalculateFuelingAverages(parsed.fuelings ?? []),
    maintenances: parsed.maintenances ?? [],
    ledger: parsed.ledger ?? [],
    fines: parsed.fines ?? [],
    documents: parsed.documents ?? [],
    checklists: parsed.checklists ?? [],
    routes: parsed.routes ?? [],
    reminders: parsed.reminders ?? [],
  };
}

/**
 * Adaptador LocalStorage para uso imediato no protótipo/preview e modo offline.
 */
export class LocalStorageFleetAdapter implements FleetRepositoryAdapter {
  private readonly storageKey: string;

  constructor(storageKey = STORAGE_KEY) {
    this.storageKey = storageKey;
  }

  async loadSnapshot(): Promise<FleetStateSnapshot> {
    if (typeof window === 'undefined') {
      return createSeedSnapshot();
    }

    try {
      const raw = window.localStorage.getItem(this.storageKey);
      if (!raw) {
        const seed = createSeedSnapshot();
        window.localStorage.setItem(this.storageKey, JSON.stringify(seed));
        return seed;
      }

      const parsed = JSON.parse(raw) as Partial<FleetStateSnapshot>;
      return normalizeSnapshot(parsed);
    } catch {
      return createSeedSnapshot();
    }
  }

  async saveSnapshot(snapshot: FleetStateSnapshot): Promise<void> {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(this.storageKey, JSON.stringify(snapshot));
  }

  async resetToSeed(): Promise<FleetStateSnapshot> {
    const seed = createSeedSnapshot();
    await this.saveSnapshot(seed);
    return seed;
  }
}

/**
 * Adaptador HTTP/REST desacoplado para conectar o módulo ao backend
 * do aplicativo principal (Órion / Conecta — TanStack Start / Server Functions).
 */
export class RemoteApiFleetAdapter implements FleetRepositoryAdapter {
  private readonly baseUrl: string;
  private readonly getToken: () => Promise<string | null> | string | null;

  constructor(options: { baseUrl: string; getToken: () => Promise<string | null> | string | null }) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.getToken = options.getToken;
  }

  private async headers(): Promise<HeadersInit> {
    const token = await this.getToken();
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }

  async loadSnapshot(): Promise<FleetStateSnapshot> {
    const res = await fetch(`${this.baseUrl}/fleet/snapshot`, {
      method: 'GET',
      headers: await this.headers(),
    });
    if (!res.ok) {
      throw new Error(`Erro ao carregar dados da frota (${res.status})`);
    }
    const data = (await res.json()) as Partial<FleetStateSnapshot>;
    return normalizeSnapshot(data);
  }

  async saveSnapshot(snapshot: FleetStateSnapshot): Promise<void> {
    const res = await fetch(`${this.baseUrl}/fleet/snapshot`, {
      method: 'PUT',
      headers: await this.headers(),
      body: JSON.stringify(snapshot),
    });
    if (!res.ok) {
      throw new Error(`Erro ao salvar dados da frota (${res.status})`);
    }
  }
}
