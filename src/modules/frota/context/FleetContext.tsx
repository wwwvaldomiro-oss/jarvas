import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { LocalStorageFleetAdapter } from '../services/fleet.adapter';
import type {
  Driver,
  ExpenseOrRevenue,
  FineRecord,
  FineStatus,
  FleetModuleUser,
  FleetReminder,
  FleetRepositoryAdapter,
  FleetStateSnapshot,
  FuelingRecord,
  MaintenanceRecord,
  MaintenanceStatus,
  RouteTrip,
  Vehicle,
  VehicleChecklist,
  VehicleDocumentRecord,
} from '../types/fleet.types';
import {
  documentTypeLabel,
  getLicensePlateDueInfo,
  recalculateFuelingAverages,
} from '../utils/fleet.calculations';

interface FleetContextValue {
  snapshot: FleetStateSnapshot;
  isLoading: boolean;
  currentUser: FleetModuleUser;
  selectedVehicleFilter: string;
  setSelectedVehicleFilter: (vehicleId: string) => void;
  // CRUD Veículos
  upsertVehicle: (vehicle: Omit<Vehicle, 'id' | 'createdAt'> & { id?: string | undefined }) => Promise<void>;
  deleteVehicle: (vehicleId: string) => Promise<void>;
  // CRUD Motoristas
  upsertDriver: (driver: Omit<Driver, 'id' | 'userId'> & { id?: string | undefined; userId?: string | undefined }) => Promise<void>;
  deleteDriver: (driverId: string) => Promise<void>;
  // Lançamentos
  addFueling: (record: Omit<FuelingRecord, 'id' | 'calculatedAvg'>) => Promise<void>;
  deleteFueling: (id: string) => Promise<void>;
  addMaintenance: (record: Omit<MaintenanceRecord, 'id'>) => Promise<void>;
  updateMaintenanceStatus: (id: string, status: MaintenanceStatus) => Promise<void>;
  deleteMaintenance: (id: string) => Promise<void>;
  addLedgerEntry: (entry: Omit<ExpenseOrRevenue, 'id'>) => Promise<void>;
  deleteLedgerEntry: (id: string) => Promise<void>;
  // Multas
  addFine: (fine: Omit<FineRecord, 'id'>) => Promise<void>;
  updateFineStatus: (id: string, status: FineStatus) => Promise<void>;
  deleteFine: (id: string) => Promise<void>;
  // Documentos e Obrigações Fiscais (CRLV, IPVA, Seguro)
  addDocumentObligation: (doc: Omit<VehicleDocumentRecord, 'id'>) => Promise<void>;
  markDocumentPaid: (id: string, recordLedgerExpense?: boolean) => Promise<void>;
  deleteDocumentObligation: (id: string) => Promise<void>;
  generateCalendarForVehicles: (exerciseYear?: number) => Promise<number>;
  // Checklists (com fluxo automático para Manutenção)
  addChecklist: (
    checklist: Omit<VehicleChecklist, 'id'>,
    options?: { autoCreateMaintenance?: boolean | undefined; setVehicleInMaintenance?: boolean }
  ) => Promise<void>;
  // Percursos & Lembretes
  addRouteTrip: (route: Omit<RouteTrip, 'id' | 'distanceKm'>) => Promise<void>;
  deleteRouteTrip: (id: string) => Promise<void>;
  addReminder: (reminder: Omit<FleetReminder, 'id' | 'completed'>) => Promise<void>;
  toggleReminderCompleted: (id: string) => Promise<void>;
  deleteReminder: (id: string) => Promise<void>;
  // Utilitários de integração
  resetDemoData: () => Promise<void>;
  importSnapshotJson: (data: FleetStateSnapshot) => Promise<void>;
}

const EMPTY_SNAPSHOT: FleetStateSnapshot = {
  vehicles: [],
  drivers: [],
  fuelings: [],
  maintenances: [],
  ledger: [],
  fines: [],
  documents: [],
  checklists: [],
  routes: [],
  reminders: [],
};

const DEFAULT_USER: FleetModuleUser = {
  id: 'usr-orion-gestor',
  name: 'Valdemiro Silva',
  email: 'valdemiro1988@gmail.com',
  role: 'GESTOR',
};

const FleetContext = createContext<FleetContextValue | null>(null);

function generateId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export const FleetProvider: React.FC<{
  adapter?: FleetRepositoryAdapter | undefined;
  currentUser?: FleetModuleUser | undefined;
  children: React.ReactNode;
}> = ({ adapter, currentUser = DEFAULT_USER, children }) => {
  const activeAdapter = useMemo(() => adapter ?? new LocalStorageFleetAdapter(), [adapter]);
  const [snapshot, setSnapshot] = useState<FleetStateSnapshot>(EMPTY_SNAPSHOT);
  const snapshotRef = useRef<FleetStateSnapshot>(EMPTY_SNAPSHOT);
  const ready = useRef(false);
  const [loadError, setLoadError] = useState(false);
  const writes = useRef<Promise<unknown>>(Promise.resolve());
  const [isLoading, setIsLoading] = useState(true);
  const [selectedVehicleFilter, setSelectedVehicleFilter] = useState<string>('TODOS');

  useEffect(() => {
    let mounted = true;
    setIsLoading(true);
    ready.current = false;
    setLoadError(false);
    activeAdapter
      .loadSnapshot()
      .then((loaded) => {
        if (mounted) {
          snapshotRef.current = {
            ...loaded,
            fines: loaded.fines ?? [],
            documents: loaded.documents ?? [],
            fuelings: recalculateFuelingAverages(loaded.fuelings ?? []),
          };
          setSnapshot(snapshotRef.current);
          ready.current = true;
        }
      })
      .catch((err) => {
        console.error(err);
        if (mounted) setLoadError(true);
        toast.error('Não foi possível carregar os dados da frota.');
      })
      .finally(() => {
        if (mounted) setIsLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [activeAdapter]);

  const commitSnapshot = useCallback(
    async (updater: (prev: FleetStateSnapshot) => FleetStateSnapshot) => {
      if (!ready.current) throw new Error('Aguarde o carregamento da frota antes de salvar.');
      const operation = writes.current.catch(() => undefined).then(async () => {
        const nextState = updater(snapshotRef.current);
        try {
          await activeAdapter.saveSnapshot(nextState);
          snapshotRef.current = nextState;
          setSnapshot(nextState);
        } catch (err) {
          toast.error('Não foi possível salvar. Os dados anteriores foram preservados.');
          throw err;
        }
      });
      writes.current = operation;
      await operation;
    },
    [activeAdapter]
  );

  const upsertVehicle = useCallback(
    async (input: Omit<Vehicle, 'id' | 'createdAt'> & { id?: string | undefined }) => {
      const normalizedPlate = input.plate.toUpperCase().replace(/[^A-Z0-9-]/g, '');
      await commitSnapshot((prev) => {
        const exists = input.id ? prev.vehicles.some((v) => v.id === input.id) : false;
        const vehicles = exists
          ? prev.vehicles.map((v) =>
              v.id === input.id ? { ...v, ...input, id: v.id, plate: normalizedPlate } : v
            )
          : [
              {
                ...input,
                id: generateId('veh'),
                plate: normalizedPlate,
                createdAt: new Date().toISOString().slice(0, 10),
              },
              ...prev.vehicles,
            ];
        return { ...prev, vehicles };
      });
      toast.success(input.id ? 'Veículo atualizado.' : 'Veículo cadastrado na frota.');
    },
    [commitSnapshot]
  );

  const deleteVehicle = useCallback(
    async (vehicleId: string) => {
      await commitSnapshot((prev) => ({
        ...prev,
        vehicles: prev.vehicles.filter((v) => v.id !== vehicleId),
        fuelings: prev.fuelings.filter((f) => f.vehicleId !== vehicleId),
        maintenances: prev.maintenances.filter((m) => m.vehicleId !== vehicleId),
        ledger: prev.ledger.filter((l) => l.vehicleId !== vehicleId),
        fines: prev.fines.filter((fn) => fn.vehicleId !== vehicleId),
        checklists: prev.checklists.filter((c) => c.vehicleId !== vehicleId),
        routes: prev.routes.filter((r) => r.vehicleId !== vehicleId),
        reminders: prev.reminders.filter((rem) => rem.vehicleId !== vehicleId),
      }));
      if (selectedVehicleFilter === vehicleId) {
        setSelectedVehicleFilter('TODOS');
      }
      toast.success('Veículo e histórico vinculados removidos.');
    },
    [commitSnapshot, selectedVehicleFilter]
  );

  const upsertDriver = useCallback(
    async (input: Omit<Driver, 'id' | 'userId'> & { id?: string | undefined; userId?: string | undefined }) => {
      await commitSnapshot((prev) => {
        const exists = input.id ? prev.drivers.some((d) => d.id === input.id) : false;
        const drivers = exists
          ? prev.drivers.map((d) => (d.id === input.id ? { ...d, ...input, id: d.id, userId: input.userId ?? d.userId } : d))
          : [
              {
                ...input,
                id: generateId('drv'),
                userId: input.userId ?? generateId('usr-orion'),
              },
              ...prev.drivers,
            ];
        return { ...prev, drivers };
      });
      toast.success(input.id ? 'Motorista atualizado.' : 'Motorista cadastrado.');
    },
    [commitSnapshot]
  );

  const deleteDriver = useCallback(
    async (driverId: string) => {
      await commitSnapshot((prev) => ({
        ...prev,
        drivers: prev.drivers.filter((d) => d.id !== driverId),
        vehicles: prev.vehicles.map((v) =>
          v.assignedDriverId === driverId ? { ...v, assignedDriverId: undefined } : v
        ),
      }));
      toast.success('Motorista removido.');
    },
    [commitSnapshot]
  );

  const addFueling = useCallback(
    async (record: Omit<FuelingRecord, 'id' | 'calculatedAvg'>) => {
      await commitSnapshot((prev) => {
        const nextFuelings = recalculateFuelingAverages([
          { ...record, id: generateId('fuel') },
          ...prev.fuelings,
        ]);
        const vehicles = prev.vehicles.map((v) =>
          v.id === record.vehicleId && record.odometer > v.currentOdometer
            ? { ...v, currentOdometer: record.odometer }
            : v
        );
        return { ...prev, fuelings: nextFuelings, vehicles };
      });
      toast.success('Abastecimento registrado e autonomia recalculada.');
    },
    [commitSnapshot]
  );

  const deleteFueling = useCallback(
    async (id: string) => {
      await commitSnapshot((prev) => ({
        ...prev,
        fuelings: recalculateFuelingAverages(prev.fuelings.filter((f) => f.id !== id)),
      }));
      toast.success('Abastecimento excluído.');
    },
    [commitSnapshot]
  );

  const addMaintenance = useCallback(
    async (record: Omit<MaintenanceRecord, 'id'>) => {
      await commitSnapshot((prev) => {
        const vehicles = prev.vehicles.map((v) =>
          v.id === record.vehicleId && record.odometer > v.currentOdometer
            ? { ...v, currentOdometer: record.odometer }
            : v
        );
        return {
          ...prev,
          maintenances: [
            { ...record, status: record.status ?? 'CONCLUIDA', id: generateId('mnt') },
            ...prev.maintenances,
          ].sort((a, b) => b.date.localeCompare(a.date)),
          vehicles,
        };
      });
      toast.success('Manutenção lançada.');
    },
    [commitSnapshot]
  );

  const updateMaintenanceStatus = useCallback(
    async (id: string, status: MaintenanceStatus) => {
      await commitSnapshot((prev) => {
        const target = prev.maintenances.find((m) => m.id === id);
        const maintenances = prev.maintenances.map((m) =>
          m.id === id ? { ...m, status } : m
        );
        const vehicles =
              status === 'CONCLUIDA' && target
            ? prev.vehicles.map((v) =>
                v.id === target.vehicleId && v.status === 'MANUTENCAO'
                  ? { ...v, status: 'ATIVO' as const }
                  : v
              )
            : prev.vehicles;
        return { ...prev, maintenances, vehicles };
      });
      toast.success(
        status === 'CONCLUIDA'
          ? 'Ordem de manutenção concluída e veículo liberado.'
          : 'Status da manutenção atualizado.'
      );
    },
    [commitSnapshot]
  );

  const deleteMaintenance = useCallback(
    async (id: string) => {
      await commitSnapshot((prev) => ({
        ...prev,
        maintenances: prev.maintenances.filter((m) => m.id !== id),
      }));
      toast.success('Registro de manutenção excluído.');
    },
    [commitSnapshot]
  );

  const addLedgerEntry = useCallback(
    async (entry: Omit<ExpenseOrRevenue, 'id'>) => {
      await commitSnapshot((prev) => ({
        ...prev,
        ledger: [{ ...entry, id: generateId('led') }, ...prev.ledger].sort((a, b) =>
          b.date.localeCompare(a.date)
        ),
      }));
      toast.success(
        entry.kind === 'RECEITA' ? 'Receita registrada.' : 'Despesa lançada no controle.'
      );
    },
    [commitSnapshot]
  );

  const deleteLedgerEntry = useCallback(
    async (id: string) => {
      await commitSnapshot((prev) => ({
        ...prev,
        ledger: prev.ledger.filter((l) => l.id !== id),
      }));
      toast.success('Lançamento financeiro removido.');
    },
    [commitSnapshot]
  );

  const addFine = useCallback(
    async (fine: Omit<FineRecord, 'id'>) => {
      await commitSnapshot((prev) => ({
        ...prev,
        fines: [{ ...fine, id: generateId('fin') }, ...prev.fines].sort((a, b) =>
          b.date.localeCompare(a.date)
        ),
      }));
      toast.success('Auto de infração registrado.');
    },
    [commitSnapshot]
  );

  const updateFineStatus = useCallback(
    async (id: string, status: FineStatus) => {
      await commitSnapshot((prev) => ({
        ...prev,
        fines: prev.fines.map((fn) => (fn.id === id ? { ...fn, status } : fn)),
      }));
      toast.success('Situação da multa atualizada.');
    },
    [commitSnapshot]
  );

  const deleteFine = useCallback(
    async (id: string) => {
      await commitSnapshot((prev) => ({
        ...prev,
        fines: prev.fines.filter((fn) => fn.id !== id),
      }));
      toast.success('Multa removida.');
    },
    [commitSnapshot]
  );

  const addChecklist = useCallback(
    async (
      checklist: Omit<VehicleChecklist, 'id'>,
      options?: { autoCreateMaintenance?: boolean | undefined; setVehicleInMaintenance?: boolean }
    ) => {
      const checklistId = generateId('chk');
      let generatedMaintenanceId: string | undefined;

      await commitSnapshot((prev) => {
        let nextMaintenances = prev.maintenances;
        let nextVehicles = prev.vehicles.map((v) =>
          v.id === checklist.vehicleId && checklist.odometer > v.currentOdometer
            ? { ...v, currentOdometer: checklist.odometer }
            : v
        );

        if (checklist.hasIssues && options?.autoCreateMaintenance) {
          generatedMaintenanceId = generateId('mnt');
          const failedItems = checklist.items
            .filter((i) => !i.compliant)
            .map((i) => (i.note ? `${i.label} (${i.note})` : i.label))
            .join('; ');

          const autoMaint: MaintenanceRecord = {
            id: generatedMaintenanceId,
            vehicleId: checklist.vehicleId,
            driverId: checklist.driverId,
            type: 'CORRETIVA',
            status: 'ABERTA',
            originChecklistId: checklistId,
            date: checklist.date,
            odometer: checklist.odometer,
            category: 'Corretiva originada de Checklist',
            providerName: 'A definir / Oficina credenciada',
            partsCost: 0,
            laborCost: 0,
            totalCost: 0,
            notes: failedItems || checklist.generalNotes,
          };
          nextMaintenances = [autoMaint, ...prev.maintenances];
        }

        if (checklist.hasIssues && options?.setVehicleInMaintenance) {
          nextVehicles = nextVehicles.map((v) =>
            v.id === checklist.vehicleId ? { ...v, status: 'MANUTENCAO' as const } : v
          );
        }

        return {
          ...prev,
          checklists: [
            { ...checklist, id: checklistId, generatedMaintenanceId },
            ...prev.checklists,
          ],
          maintenances: nextMaintenances,
          vehicles: nextVehicles,
        };
      });

      if (checklist.hasIssues && options?.autoCreateMaintenance) {
        toast.warning('Checklist salvo e Ordem de Manutenção Corretiva aberta automaticamente.');
      } else {
        toast.success(
          checklist.hasIssues
            ? 'Checklist salvo com apontamento de não conformidade.'
            : 'Checklist pré-viagem aprovado e registrado.'
        );
      }
    },
    [commitSnapshot]
  );

  const addRouteTrip = useCallback(
    async (route: Omit<RouteTrip, 'id' | 'distanceKm'>) => {
      const distanceKm = Math.max(0, route.endOdometer - route.startOdometer);
      await commitSnapshot((prev) => {
        const vehicles = prev.vehicles.map((v) =>
          v.id === route.vehicleId && route.endOdometer > v.currentOdometer
            ? { ...v, currentOdometer: route.endOdometer }
            : v
        );
        return {
          ...prev,
          routes: [{ ...route, id: generateId('rt'), distanceKm }, ...prev.routes].sort((a, b) =>
            b.date.localeCompare(a.date)
          ),
          vehicles,
        };
      });
      toast.success('Percurso registrado e odômetro atualizado.');
    },
    [commitSnapshot]
  );

  const deleteRouteTrip = useCallback(
    async (id: string) => {
      await commitSnapshot((prev) => ({
        ...prev,
        routes: prev.routes.filter((r) => r.id !== id),
      }));
      toast.success('Percurso removido.');
    },
    [commitSnapshot]
  );

  const addReminder = useCallback(
    async (reminder: Omit<FleetReminder, 'id' | 'completed'>) => {
      await commitSnapshot((prev) => ({
        ...prev,
        reminders: [{ ...reminder, id: generateId('rem'), completed: false }, ...prev.reminders],
      }));
      toast.success('Lembrete preventivo adicionado.');
    },
    [commitSnapshot]
  );

  const toggleReminderCompleted = useCallback(
    async (id: string) => {
      await commitSnapshot((prev) => ({
        ...prev,
        reminders: prev.reminders.map((rem) =>
          rem.id === id
            ? {
                ...rem,
                completed: !rem.completed,
                completedAt: !rem.completed ? new Date().toISOString().slice(0, 10) : undefined,
              }
            : rem
        ),
      }));
    },
    [commitSnapshot]
  );

  const deleteReminder = useCallback(
    async (id: string) => {
      await commitSnapshot((prev) => ({
        ...prev,
        reminders: prev.reminders.filter((rem) => rem.id !== id),
      }));
      toast.success('Lembrete excluído.');
    },
    [commitSnapshot]
  );

  const addDocumentObligation = useCallback(
    async (doc: Omit<VehicleDocumentRecord, 'id'>) => {
      await commitSnapshot((prev) => ({
        ...prev,
        documents: [
          { ...doc, id: generateId('doc') },
          ...(prev.documents ?? []),
        ].sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
      }));
      toast.success('Obrigação documental registrada.');
    },
    [commitSnapshot]
  );

  const markDocumentPaid = useCallback(
    async (id: string, recordLedgerExpense = true) => {
      await commitSnapshot((prev) => {
        const docs = prev.documents ?? [];
        const target = docs.find((d) => d.id === id);
        const updatedDocs = docs.map((d) =>
          d.id === id
            ? { ...d, status: 'PAGO' as const, paidAt: new Date().toISOString().slice(0, 10) }
            : d
        );
        let nextLedger = prev.ledger;
        if (recordLedgerExpense && target && target.status !== 'PAGO' && target.amount > 0) {
          nextLedger = [
            {
              id: generateId('led'),
              vehicleId: target.vehicleId,
              kind: 'DESPESA' as const,
              category: documentTypeLabel(target.docType),
              date: new Date().toISOString().slice(0, 10),
              amount: target.amount,
              description: `${documentTypeLabel(target.docType)} ${target.referenceYear} (${target.providerOrAuthority ?? target.stateUf ?? 'Frota'})`,
            },
            ...prev.ledger,
          ];
        }
        return { ...prev, documents: updatedDocs, ledger: nextLedger };
      });
      toast.success('Obrigação marcada como quitada.');
    },
    [commitSnapshot]
  );

  const deleteDocumentObligation = useCallback(
    async (id: string) => {
      await commitSnapshot((prev) => ({
        ...prev,
        documents: (prev.documents ?? []).filter((d) => d.id !== id),
      }));
      toast.success('Documento removido.');
    },
    [commitSnapshot]
  );

  const generateCalendarForVehicles = useCallback(
    async (exerciseYear = new Date().getFullYear()): Promise<number> => {
      let createdCount = 0;
      await commitSnapshot((prev) => {
        const existing = prev.documents ?? [];
        const additions: VehicleDocumentRecord[] = [];

        for (const veh of prev.vehicles) {
          const uf = veh.stateUf ?? 'SP';
          const cal = getLicensePlateDueInfo(veh.plate, uf, exerciseYear);

          const hasCrlv = existing.some(
            (d) =>
              d.vehicleId === veh.id &&
              d.docType === 'CRLV' &&
              d.referenceYear === exerciseYear
          );
          if (!hasCrlv) {
            additions.push({
              id: generateId('doc'),
              vehicleId: veh.id,
              docType: 'CRLV',
              referenceYear: exerciseYear,
              dueDate: cal.crlvDueDate,
              amount: 0,
              stateUf: uf,
              providerOrAuthority: `Detran-${uf}`,
              policyOrCode: `Final de placa ${cal.finalDigit} (${cal.crlvMonthLabel})`,
              status: 'PENDENTE',
              autoGenerated: true,
            });
          }

          const hasIpva = existing.some(
            (d) =>
              d.vehicleId === veh.id &&
              d.docType === 'IPVA' &&
              d.referenceYear === exerciseYear
          );
          if (!hasIpva) {
            const estimatedIpva = veh.fipeValue ? Number((veh.fipeValue * 0.04).toFixed(2)) : 0;
            additions.push({
              id: generateId('doc'),
              vehicleId: veh.id,
              docType: 'IPVA',
              referenceYear: exerciseYear,
              dueDate: cal.ipvaDueDate,
              amount: 0,
              stateUf: uf,
              providerOrAuthority: `Sefaz-${uf}`,
              policyOrCode: `Valor a confirmar na guia · Final ${cal.finalDigit}`,
              status: 'PENDENTE',
              autoGenerated: true,
            });
          }
        }

        createdCount = additions.length;
        return {
          ...prev,
          documents: [...existing, ...additions].sort((a, b) =>
            a.dueDate.localeCompare(b.dueDate)
          ),
        };
      });
      if (createdCount > 0) {
        toast.success(
          `${createdCount} obrigação(ões) gerada(s) automaticamente pelo final de placa (${exerciseYear}).`
        );
      } else {
        toast.info(`Calendário ${exerciseYear} já está completo para todos os veículos.`);
      }
      return createdCount;
    },
    [commitSnapshot]
  );

  const resetDemoData = useCallback(async () => {
    if (activeAdapter.resetToSeed) {
      const fresh = await activeAdapter.resetToSeed();
      snapshotRef.current = fresh;
      setSnapshot(fresh);
      setSelectedVehicleFilter('TODOS');
      toast.success('Base de demonstração restaurada.');
    }
  }, [activeAdapter]);

  const importSnapshotJson = useCallback(
    async (data: FleetStateSnapshot) => {
      const normalized: FleetStateSnapshot = {
        vehicles: data.vehicles ?? [],
        drivers: data.drivers ?? [],
        fuelings: recalculateFuelingAverages(data.fuelings ?? []),
        maintenances: data.maintenances ?? [],
        ledger: data.ledger ?? [],
        fines: data.fines ?? [],
        documents: data.documents ?? [],
        checklists: data.checklists ?? [],
        routes: data.routes ?? [],
        reminders: data.reminders ?? [],
      };
      await commitSnapshot(() => normalized);
      toast.success('Snapshot da frota importado com sucesso.');
    },
    [commitSnapshot]
  );

  const value: FleetContextValue = {
    snapshot,
    isLoading,
    currentUser,
    selectedVehicleFilter,
    setSelectedVehicleFilter,
    upsertVehicle,
    deleteVehicle,
    upsertDriver,
    deleteDriver,
    addFueling,
    deleteFueling,
    addMaintenance,
    updateMaintenanceStatus,
    deleteMaintenance,
    addLedgerEntry,
    deleteLedgerEntry,
    addFine,
    updateFineStatus,
    deleteFine,
    addDocumentObligation,
    markDocumentPaid,
    deleteDocumentObligation,
    generateCalendarForVehicles,
    addChecklist,
    addRouteTrip,
    deleteRouteTrip,
    addReminder,
    toggleReminderCompleted,
    deleteReminder,
    resetDemoData,
    importSnapshotJson,
  };

  if (loadError) return <div role="alert" className="p-6">Não foi possível carregar os veículos. Nenhum dado foi alterado. <button type="button" onClick={() => window.location.reload()}>Tentar novamente</button></div>;
  if (isLoading) return <div role="status" className="p-6">Carregando veículos…</div>;
  return <FleetContext.Provider value={value}>{children}</FleetContext.Provider>;
};

export function useFleet(): FleetContextValue {
  const ctx = useContext(FleetContext);
  if (!ctx) {
    throw new Error('useFleet deve ser utilizado dentro de FleetProvider.');
  }
  return ctx;
}
