import type { FleetStateSnapshot } from '../types/fleet.types';
export const emptyFleet = (): FleetStateSnapshot => ({documents: [], vehicles: [], drivers: [], fuelings: [], maintenances: [], ledger: [], fines: [], checklists: [], routes: [], reminders: []});
