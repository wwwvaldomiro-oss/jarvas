import React from 'react';
import { act, render, waitFor, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FleetProvider, useFleet } from '../context/FleetContext';
import { emptyFleet } from '../services/jarvas.adapter';
vi.mock('@/integrations/supabase/client', () => ({supabase:{}}));
vi.mock('sonner', () => ({toast:{success:vi.fn(),error:vi.fn()}}));
afterEach(cleanup);
let fleet: ReturnType<typeof useFleet>;
function Probe() {fleet = useFleet();return <span>{fleet.snapshot.vehicles.length}</span>;}
const vehicle = {plate:'ABC1D23',brand:'Fiat',model:'Uno',year:2020,fuelType:'FLEX' as const,currentOdometer:100,status:'ATIVO' as const};
describe('Gravação da frota', () => {
 it('confirma somente depois de salvar e conserva duas operações consecutivas',async () => {
  const snapshots: number[] = [];
  const adapter = {loadSnapshot:async()=>emptyFleet(),saveSnapshot:vi.fn(async (s: import('../types/fleet.types').FleetStateSnapshot)=>{snapshots.push(s.vehicles.length);})};
  render(<FleetProvider adapter={adapter}><Probe /></FleetProvider>);
  await waitFor(()=>expect(fleet).toBeDefined());
  await act(async()=>{await Promise.all([fleet.upsertVehicle(vehicle),fleet.upsertVehicle({...vehicle,plate:'DEF4G56'})]);});
  expect(snapshots).toEqual([1,2]);
  expect(fleet.snapshot.vehicles).toHaveLength(2);
 });
 it('preserva os dados anteriores e informa falha ao formulário',async()=>{
  const adapter = {loadSnapshot:async()=>emptyFleet(),saveSnapshot:vi.fn(async()=>{throw new Error('Offline');})};
  fleet = undefined as unknown as typeof fleet;
  render(<FleetProvider adapter={adapter}><Probe /></FleetProvider>);
  await waitFor(()=>expect(fleet).toBeDefined());
  await act(async()=>{await expect(fleet.upsertVehicle(vehicle)).rejects.toThrow('Offline');});
  expect(fleet.snapshot.vehicles).toHaveLength(0);
 });
 it('bloqueia a edição quando o carregamento falha',async()=>{
  const adapter = {loadSnapshot:async()=>{throw new Error('Indisponível');},saveSnapshot:vi.fn()};
  const view = render(<FleetProvider adapter={adapter}><Probe /></FleetProvider>);
  await waitFor(()=>expect(view.getByRole('alert')).toBeDefined());
  expect(adapter.saveSnapshot).not.toHaveBeenCalled();
 });
});
