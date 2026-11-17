import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Clock,
  Plus,
  Trash2,
} from 'lucide-react';
import type { QuickEntryKind } from '../components/QuickEntryModal';
import { ReminderFormModal } from '../components/ReminderFormModal';
import { useFleet } from '../context/FleetContext';
import {
  computeRouteAudit,
  evaluateReminderStatus,
  formatKm,
  formatNumberBR,
  formatDateBR,
} from '../utils/fleet.calculations';

interface RoutesRemindersPageProps {
  onOpenQuickEntry: (kind: QuickEntryKind) => void;
}

export const RoutesRemindersPage: React.FC<RoutesRemindersPageProps> = ({
  onOpenQuickEntry,
}) => {
  const {
    snapshot,
    selectedVehicleFilter,
    toggleReminderCompleted,
    deleteReminder,
    deleteRouteTrip,
  } = useFleet();

  const [reminderFilter, setReminderFilter] = useState<'PENDENTES' | 'CONCLUIDOS' | 'TODOS'>(
    'PENDENTES'
  );
  const [reminderModalOpen, setReminderModalOpen] = useState(false);

  const vehicleMap = useMemo(
    () => new Map(snapshot.vehicles.map((v) => [v.id, v])),
    [snapshot.vehicles]
  );
  const driverMap = useMemo(
    () => new Map(snapshot.drivers.map((d) => [d.id, d])),
    [snapshot.drivers]
  );

  const matchScope = (vId: string) =>
    selectedVehicleFilter === 'TODOS' || vId === selectedVehicleFilter;

  const filteredReminders = useMemo(() => {
    return snapshot.reminders.filter((rem) => {
      if (!matchScope(rem.vehicleId)) return false;
      if (reminderFilter === 'PENDENTES') return !rem.completed;
      if (reminderFilter === 'CONCLUIDOS') return rem.completed;
      return true;
    });
  }, [snapshot.reminders, selectedVehicleFilter, reminderFilter]);

  const filteredRoutes = useMemo(() => {
    return snapshot.routes.filter((r) => matchScope(r.vehicleId));
  }, [snapshot.routes, selectedVehicleFilter]);

  return (
    <div className="space-y-6">
      {/* Seção de Lembretes Preventivos */}
      <section className="bg-white border border-[#E7E1D5] rounded-[10px] overflow-hidden">
        <div className="px-6 py-4 border-b border-[#E7E1D5] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-semibold text-[#0C1928]">
              Lembretes e Alertas Preventivos
            </h2>
            <p className="text-xs text-[#5C6B7A] mt-0.5">
              Vencimentos automáticos por data calendário ou quilometragem alvo
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="inline-flex items-center gap-1 p-1 bg-[#F7F8FA] border border-[#E7E1D5] rounded-lg">
              {(
                [
                  { id: 'PENDENTES', label: 'Pendentes' },
                  { id: 'CONCLUIDOS', label: 'Concluídos' },
                  { id: 'TODOS', label: 'Todos' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setReminderFilter(tab.id)}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                    reminderFilter === tab.id
                      ? 'bg-[#173D4A] text-white'
                      : 'text-[#5C6B7A] hover:text-[#0C1928]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setReminderModalOpen(true)}
              className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg bg-[#173D4A] hover:bg-[#0C1928] text-white text-xs font-medium whitespace-nowrap cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              <span>Novo Lembrete</span>
            </button>
          </div>
        </div>

        {filteredReminders.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-sm font-medium text-[#0C1928]">Nenhum lembrete nesta visualização</p>
            <p className="text-xs text-[#5C6B7A] mt-1">
              Crie alertas para trocas de óleo, revisões programadas, seguros ou CRLV.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[#E7E1D5]">
            {filteredReminders.map((rem) => {
              const veh = vehicleMap.get(rem.vehicleId);
              const evalStatus = evaluateReminderStatus(rem, veh);

              return (
                <div
                  key={rem.id}
                  className="px-6 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-[#F7F8FA] transition-colors"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <button
                      type="button"
                      onClick={() => toggleReminderCompleted(rem.id)}
                      aria-label={rem.completed ? 'Reabrir lembrete' : 'Concluir lembrete'}
                      className={`mt-0.5 h-5 w-5 rounded border flex items-center justify-center shrink-0 transition-colors ${
                        rem.completed
                          ? 'bg-[#2E6F5E] border-[#2E6F5E] text-white'
                          : 'border-[#E7E1D5] bg-white hover:border-[#173D4A]'
                      }`}
                    >
                      {rem.completed && <Check className="h-3.5 w-3.5" />}
                    </button>

                    <div className="min-w-0">
                      <p
                        className={`text-sm font-medium ${
                          rem.completed ? 'line-through text-[#5C6B7A]' : 'text-[#0C1928]'
                        }`}
                      >
                        {rem.title}
                      </p>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-[#5C6B7A] mt-0.5">
                        <span className="font-mono-tabular font-semibold text-[#173D4A]">
                          {veh?.plate ?? '—'}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{veh?.model ?? ''}</span>
                        {rem.notes && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>{rem.notes}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0">
                    <span
                      className={`inline-flex items-center gap-1.5 text-xs font-medium ${
                        evalStatus.status === 'VENCIDO'
                          ? 'text-[#9E3B3B]'
                          : evalStatus.status === 'ATENCAO'
                          ? 'text-[#A66E1E]'
                          : 'text-[#2E6F5E]'
                      }`}
                    >
                      {evalStatus.status === 'VENCIDO' ? (
                        <AlertTriangle className="h-3.5 w-3.5" />
                      ) : evalStatus.status === 'ATENCAO' ? (
                        <Clock className="h-3.5 w-3.5" />
                      ) : (
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      )}
                      <span className="font-mono-tabular">{evalStatus.reason}</span>
                    </span>

                    <button
                      type="button"
                      onClick={() => deleteReminder(rem.id)}
                      className="p-1.5 rounded-md text-[#5C6B7A] hover:text-[#9E3B3B] hover:bg-[#9E3B3B]/10"
                      title="Excluir lembrete"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Seção de Percursos / Rotas com Auditoria de Distância */}
      <section className="bg-white border border-[#E7E1D5] rounded-[10px] overflow-hidden">
        <div className="px-6 py-4 border-b border-[#E7E1D5] flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-semibold text-[#0C1928]">
              Registro de Percursos e Auditoria de Rota ({filteredRoutes.length})
            </h2>
            <p className="text-xs text-[#5C6B7A] mt-0.5">
              Compara odômetro declarado contra distância estimada da rota (Maps)
            </p>
          </div>
          <button
            type="button"
            onClick={() => onOpenQuickEntry('PERCURSO')}
            className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg border border-[#E7E1D5] bg-white hover:bg-[#F7F8FA] text-xs font-medium text-[#0C1928] whitespace-nowrap cursor-pointer"
          >
            <Plus className="h-4 w-4 text-[#173D4A]" />
            <span>Registrar Percurso</span>
          </button>
        </div>

        {filteredRoutes.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-sm font-medium text-[#0C1928]">Nenhum percurso registrado</p>
            <p className="text-xs text-[#5C6B7A] mt-1">
              Registre deslocamentos para rastrear distância percorrida por motorista.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#E7E1D5] bg-[#F7F8FA] text-[11px] font-semibold text-[#5C6B7A]">
                  <th className="py-3 px-4">Data</th>
                  <th className="py-3 px-4">Veículo / Motorista</th>
                  <th className="py-3 px-4">Trajeto</th>
                  <th className="py-3 px-4 text-right">Odômetro Inicial</th>
                  <th className="py-3 px-4 text-right">Odômetro Final</th>
                  <th className="py-3 px-4 text-right">Distância / Auditoria</th>
                  <th className="py-3 px-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E7E1D5] text-sm">
                {filteredRoutes.map((rt) => {
                  const veh = vehicleMap.get(rt.vehicleId);
                  const drv = driverMap.get(rt.driverId);
                  const audit = computeRouteAudit(rt);

                  return (
                    <tr key={rt.id} className="hover:bg-[#F7F8FA] transition-colors">
                      <td className="py-3 px-4 font-mono-tabular text-xs text-[#0C1928] whitespace-nowrap">
                        {formatDateBR(rt.date)}
                      </td>
                      <td className="py-3 px-4">
                        <p className="font-mono-tabular text-xs font-semibold text-[#173D4A]">
                          {veh?.plate ?? '—'}
                        </p>
                        <p className="text-[11px] text-[#5C6B7A]">{drv?.name ?? '—'}</p>
                      </td>
                      <td className="py-3 px-4">
                        <p className="text-xs font-medium text-[#0C1928]">
                          {rt.origin} → {rt.destination}
                        </p>
                        {rt.purpose && (
                          <p className="text-[11px] text-[#5C6B7A]">{rt.purpose}</p>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right font-mono-tabular text-xs text-[#5C6B7A] whitespace-nowrap">
                        {formatKm(rt.startOdometer)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono-tabular text-xs text-[#0C1928] whitespace-nowrap">
                        {formatKm(rt.endOdometer)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono-tabular text-xs whitespace-nowrap">
                        <span className="font-semibold text-[#173D4A]">
                          {formatNumberBR(rt.distanceKm, 0)} km
                        </span>
                        {audit && (
                          <span
                            className={`block text-[10px] ${
                              audit.flagged ? 'text-[#9E3B3B] font-semibold' : 'text-[#5C6B7A]'
                            }`}
                          >
                            {audit.flagged
                              ? `Desvio +${audit.deltaPercent}% vs Maps (${rt.estimatedKm} km)`
                              : `Est. ${rt.estimatedKm} km (${audit.deltaPercent >= 0 ? '+' : ''}${audit.deltaPercent}%)`}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => deleteRouteTrip(rt.id)}
                          className="p-1.5 rounded-md text-[#5C6B7A] hover:text-[#9E3B3B] hover:bg-[#9E3B3B]/10"
                          title="Excluir percurso"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <ReminderFormModal
        open={reminderModalOpen}
        onClose={() => setReminderModalOpen(false)}
      />
    </div>
  );
};
