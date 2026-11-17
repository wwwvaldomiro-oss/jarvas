import { supabase } from '@/integrations/supabase/client';
import type { FleetRepositoryAdapter, FleetStateSnapshot } from '../types/fleet.types';
import { recalculateFuelingAverages } from '../utils/fleet.calculations';

import { emptyFleet } from './fleet.empty';
export { emptyFleet } from './fleet.empty';

/** Private, user-owned Storage object; never falls back to demonstration records. */
export class JarvasFleetAdapter implements FleetRepositoryAdapter {
  private async path() {
    const {data, error} = await supabase.auth.getUser();
    if (error || !data.user) throw new Error('Entre na sua conta para acessar os veículos.');
    return `${data.user.id}/fleet/snapshot.json`;
  }
  async loadSnapshot(): Promise<FleetStateSnapshot> {
    const path = await this.path();
    const {data, error} = await supabase.storage.from('cloud-docs').download(path);
    if (error) {
      if (String((error as {statusCode?:string}).statusCode) === '404' || error.message === 'Object not found') return emptyFleet();
      throw new Error('Não foi possível carregar a frota no servidor. Verifique o acesso ao armazenamento.');
    }
    const parsed = JSON.parse(await data.text());
    const snapshot = {...emptyFleet(), ...parsed};
    for (const key of Object.keys(emptyFleet())) if (!Array.isArray(snapshot[key])) throw new Error('Arquivo da frota inválido.');
    snapshot.fuelings = recalculateFuelingAverages(snapshot.fuelings);
    return snapshot;
  }
  async saveSnapshot(snapshot: FleetStateSnapshot): Promise<void> {
    const path = await this.path();
    const {error} = await supabase.storage.from('cloud-docs').upload(path, new Blob([JSON.stringify(snapshot)], {type:'application/json'}), {upsert:true, contentType:'application/json'});
    if (error) throw new Error('Não foi possível salvar a frota no servidor.');
  }
}
