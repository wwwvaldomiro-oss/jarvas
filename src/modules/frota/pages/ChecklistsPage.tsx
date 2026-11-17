import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Camera, CheckCircle2, ChevronDown, ChevronUp, ShieldAlert, Wrench } from 'lucide-react';
import { useFleet } from '../context/FleetContext';
import type { ChecklistItemResult } from '../types/fleet.types';
import { checkDriverAndVehicleOperationLock, formatDateBR, formatKm } from '../utils/fleet.calculations';

const DEFAULT_CHECKLIST_ITEMS: { id: string; label: string }[] = [
  { id: 'i1', label: 'Calibragem e sulco dos pneus' },
  { id: 'i2', label: 'Faróis, lanternas e luzes de freio' },
  { id: 'i3', label: 'Nível de óleo e fluido de arrefecimento' },
  { id: 'i4', label: 'Sistema de freios e freio de estacionamento' },
  { id: 'i5', label: 'Para-brisa, palhetas e retrovisores' },
  { id: 'i6', label: 'CRLV digital e kit de emergência' },
];

export const ChecklistsPage: React.FC = () => {
  const { snapshot, selectedVehicleFilter, addChecklist } = useFleet();

  const defaultVehId =
    selectedVehicleFilter !== 'TODOS'
      ? selectedVehicleFilter
      : snapshot.vehicles[0]?.id ?? '';
  const [vehicleId, setVehicleId] = useState(defaultVehId);
  const [driverId, setDriverId] = useState(snapshot.drivers[0]?.id ?? '');
  const [date, setDate] = useState('2026-11-17');
  const [odometer, setOdometer] = useState('0');
  const [generalNotes, setGeneralNotes] = useState('');
  const [autoCreateMaintenance, setAutoCreateMaintenance] = useState(true);
  const [setVehicleInMaintenance, setSetVehicleInMaintenance] = useState(false);

  const [items, setItems] = useState<ChecklistItemResult[]>(() =>
    DEFAULT_CHECKLIST_ITEMS.map((item) => ({ ...item, compliant: true }))
  );
  const [expandedChecklistId, setExpandedChecklistId] = useState<string | null>(
    snapshot.checklists[0]?.id ?? null
  );

  useEffect(() => {
    const veh = snapshot.vehicles.find((v) => v.id === vehicleId) ?? snapshot.vehicles[0];
    if (veh) {
      if (!vehicleId) setVehicleId(veh.id);
      setOdometer(String(veh.currentOdometer));
      if (veh.assignedDriverId) setDriverId(veh.assignedDriverId);
    }
  }, [vehicleId, snapshot.vehicles]);

  useEffect(() => {
    if (selectedVehicleFilter !== 'TODOS') {
      setVehicleId(selectedVehicleFilter);
    }
  }, [selectedVehicleFilter]);

  const vehicleMap = useMemo(
    () => new Map(snapshot.vehicles.map((v) => [v.id, v])),
    [snapshot.vehicles]
  );
  const driverMap = useMemo(
    () => new Map(snapshot.drivers.map((d) => [d.id, d])),
    [snapshot.drivers]
  );

  const filteredHistory = useMemo(() => {
    return snapshot.checklists.filter(
      (c) => selectedVehicleFilter === 'TODOS' || c.vehicleId === selectedVehicleFilter
    );
  }, [snapshot.checklists, selectedVehicleFilter]);

  const hasNonCompliantItem = items.some((it) => !it.compliant);

  const operationLock = useMemo(
    () =>
      checkDriverAndVehicleOperationLock(
        vehicleMap.get(vehicleId),
        driverMap.get(driverId),
        snapshot,
        date
      ),
    [vehicleMap, driverMap, vehicleId, driverId, snapshot, date]
  );

  const setItemCompliant = (itemId: string, compliant: boolean) => {
    setItems((prev) =>
      prev.map((it) => (it.id === itemId ? { ...it, compliant } : it))
    );
  };

  const setItemNote = (itemId: string, note: string) => {
    setItems((prev) => prev.map((it) => (it.id === itemId ? { ...it, note } : it)));
  };

  const handlePhotoUpload = (itemId: string, file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setItems((prev) =>
          prev.map((it) => (it.id === itemId ? { ...it, photoUrl: reader.result as string } : it))
        );
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vehicleId || !driverId) return;

    const hasIssues = items.some((it) => !it.compliant);
    await addChecklist(
      {
        vehicleId,
        driverId,
        date,
        odometer: Number(odometer) || 0,
        items,
        hasIssues,
        generalNotes: generalNotes.trim() || undefined,
      },
      {
        autoCreateMaintenance: hasIssues && autoCreateMaintenance,
        setVehicleInMaintenance: hasIssues && setVehicleInMaintenance,
      }
    );

    setItems(DEFAULT_CHECKLIST_ITEMS.map((item) => ({ ...item, compliant: true })));
    setGeneralNotes('');
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Formulário Mobile-Friendly Pré-Viagem */}
      <section className="lg:col-span-7 bg-white border border-[#E7E1D5] rounded-[10px] overflow-hidden">
        <div className="px-6 py-4 border-b border-[#E7E1D5]">
          <h2 className="font-display text-base font-semibold text-[#0C1928]">
            Nova Inspeção Veicular Pré-Viagem
          </h2>
          <p className="text-xs text-[#5C6B7A] mt-0.5">
            Preenchimento rápido com abertura automática de manutenção corretiva em não conformidades
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {operationLock.blocked && (
            <div className="p-3.5 rounded-lg bg-[#9E3B3B]/10 border border-[#9E3B3B]/30 space-y-1">
              <div className="flex items-center gap-2 text-xs font-semibold text-[#9E3B3B]">
                <ShieldAlert className="h-4 w-4 shrink-0" />
                <span>Alerta de Bloqueio Documental / CTB Pré-Viagem</span>
              </div>
              <ul className="list-disc pl-5 text-xs text-[#9E3B3B] space-y-0.5">
                {operationLock.reasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-[#0C1928] mb-1.5">Veículo</label>
              <select
                value={vehicleId}
                onChange={(e) => setVehicleId(e.target.value)}
                className="w-full h-10 rounded-lg border border-[#E7E1D5] px-3 text-sm"
                required
              >
                {snapshot.vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.plate} — {v.model}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-[#0C1928] mb-1.5">
                Motorista responsável
              </label>
              <select
                value={driverId}
                onChange={(e) => setDriverId(e.target.value)}
                className="w-full h-10 rounded-lg border border-[#E7E1D5] px-3 text-sm"
                required
              >
                {snapshot.drivers.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-[#0C1928] mb-1.5">Data</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full h-10 rounded-lg border border-[#E7E1D5] px-3 text-sm font-mono-tabular"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#0C1928] mb-1.5">
                Odômetro na saída (km)
              </label>
              <input
                type="number"
                value={odometer}
                onChange={(e) => setOdometer(e.target.value)}
                className="w-full h-10 rounded-lg border border-[#E7E1D5] px-3 text-sm font-mono-tabular"
                required
              />
            </div>
          </div>

          <div className="divide-y divide-[#E7E1D5] border-t border-b border-[#E7E1D5]">
            {items.map((item) => (
              <div key={item.id} className="py-3.5 space-y-2.5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <span className="text-sm font-medium text-[#0C1928]">{item.label}</span>

                  <div className="inline-flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => setItemCompliant(item.id, true)}
                      className={`h-9 px-3 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap ${
                        item.compliant
                          ? 'bg-[#2E6F5E] border-[#2E6F5E] text-white'
                          : 'bg-white border-[#E7E1D5] text-[#5C6B7A] hover:text-[#0C1928]'
                      }`}
                    >
                      Conforme
                    </button>
                    <button
                      type="button"
                      onClick={() => setItemCompliant(item.id, false)}
                      className={`h-9 px-3 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap ${
                        !item.compliant
                          ? 'bg-[#9E3B3B] border-[#9E3B3B] text-white'
                          : 'bg-white border-[#E7E1D5] text-[#5C6B7A] hover:text-[#0C1928]'
                      }`}
                    >
                      Não Conforme
                    </button>
                  </div>
                </div>

                {!item.compliant && (
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2.5 pt-1">
                    <input
                      type="text"
                      value={item.note ?? ''}
                      onChange={(e) => setItemNote(item.id, e.target.value)}
                      placeholder="Descreva a avaria ou anomalia observada..."
                      className="flex-1 w-full h-9 rounded-lg border border-[#E7E1D5] bg-[#F7F8FA] px-3 text-xs text-[#0C1928]"
                    />
                    <label className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-[#E7E1D5] bg-white hover:bg-[#F7F8FA] text-xs font-medium text-[#173D4A] cursor-pointer whitespace-nowrap shrink-0">
                      <Camera className="h-3.5 w-3.5" />
                      <span>{item.photoUrl ? 'Foto anexada' : 'Anexar foto'}</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="sr-only"
                        onChange={(e) => handlePhotoUpload(item.id, e.target.files?.[0])}
                      />
                    </label>
                  </div>
                )}

                {item.photoUrl && (
                  <img
                    src={item.photoUrl}
                    alt={`Evidência — ${item.label}`}
                    className="h-20 w-28 object-cover rounded-lg border border-[#E7E1D5]"
                  />
                )}
              </div>
            ))}
          </div>

          {hasNonCompliantItem && (
            <div className="p-4 rounded-lg bg-[#F7F8FA] border border-[#E7E1D5] space-y-2.5">
              <div className="flex items-center gap-2 text-xs font-semibold text-[#9E3B3B]">
                <Wrench className="h-3.5 w-3.5" />
                <span>Workflow Automático de Não Conformidade</span>
              </div>
              <label className="flex items-center gap-2.5 text-xs text-[#0C1928] cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoCreateMaintenance}
                  onChange={(e) => setAutoCreateMaintenance(e.target.checked)}
                  className="h-4 w-4 rounded border-[#E7E1D5] text-[#173D4A]"
                />
                <span>Abrir Ordem de Manutenção Corretiva automaticamente em Lançamentos</span>
              </label>
              <label className="flex items-center gap-2.5 text-xs text-[#0C1928] cursor-pointer">
                <input
                  type="checkbox"
                  checked={setVehicleInMaintenance}
                  onChange={(e) => setSetVehicleInMaintenance(e.target.checked)}
                  className="h-4 w-4 rounded border-[#E7E1D5] text-[#173D4A]"
                />
                <span>Alterar status do veículo para Em manutenção (bloqueio preventivo)</span>
              </label>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-[#0C1928] mb-1.5">
              Observações gerais da vistoria
            </label>
            <textarea
              rows={2}
              value={generalNotes}
              onChange={(e) => setGeneralNotes(e.target.value)}
              placeholder="Condições gerais de entrega ou necessidade de encaminhamento à oficina"
              className="w-full rounded-lg border border-[#E7E1D5] px-3 py-2 text-sm"
            />
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              className="h-10 px-5 rounded-lg bg-[#173D4A] hover:bg-[#0C1928] text-white text-sm font-medium transition-colors cursor-pointer"
            >
              Registrar Checklist
            </button>
          </div>
        </form>
      </section>

      {/* Histórico de Checklists */}
      <section className="lg:col-span-5 bg-white border border-[#E7E1D5] rounded-[10px] overflow-hidden">
        <div className="px-6 py-4 border-b border-[#E7E1D5]">
          <h2 className="font-display text-base font-semibold text-[#0C1928]">
            Histórico de Inspeções ({filteredHistory.length})
          </h2>
          <p className="text-xs text-[#5C6B7A] mt-0.5">
            Clique em um registro para conferir os itens verificados
          </p>
        </div>

        {filteredHistory.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-sm font-medium text-[#0C1928]">Nenhuma vistoria registrada</p>
            <p className="text-xs text-[#5C6B7A] mt-1">
              Preencha o formulário ao lado para registrar o primeiro checklist.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[#E7E1D5]">
            {filteredHistory.map((chk) => {
              const veh = vehicleMap.get(chk.vehicleId);
              const drv = driverMap.get(chk.driverId);
              const isExpanded = expandedChecklistId === chk.id;
              const okCount = chk.items.filter((i) => i.compliant).length;

              return (
                <div key={chk.id} className="p-4">
                  <button
                    type="button"
                    onClick={() => setExpandedChecklistId(isExpanded ? null : chk.id)}
                    className="w-full flex items-start justify-between gap-3 text-left"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-[#5C6B7A]">
                        <span className="font-mono-tabular">{formatDateBR(chk.date)}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono-tabular font-semibold text-[#173D4A]">
                          {veh?.plate ?? '—'}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono-tabular">{formatKm(chk.odometer)}</span>
                      </div>
                      <p className="text-sm font-medium text-[#0C1928] mt-1">
                        {drv?.name ?? 'Motorista'}
                      </p>
                      <div className="flex flex-wrap items-center gap-2 mt-1 text-xs">
                        {chk.hasIssues ? (
                          <span className="inline-flex items-center gap-1 font-medium text-[#9E3B3B]">
                            <AlertTriangle className="h-3.5 w-3.5" />
                            <span>
                              Com não conformidade ({okCount}/{chk.items.length} ok)
                            </span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 font-medium text-[#2E6F5E]">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            <span>
                              Aprovado ({okCount}/{chk.items.length} ok)
                            </span>
                          </span>
                        )}
                        {chk.generatedMaintenanceId && (
                          <span className="text-[#173D4A] font-medium">
                            · OS gerada
                          </span>
                        )}
                      </div>
                    </div>
                    {isExpanded ? (
                      <ChevronUp className="h-4 w-4 text-[#5C6B7A] shrink-0 mt-1" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-[#5C6B7A] shrink-0 mt-1" />
                    )}
                  </button>

                  {isExpanded && (
                    <div className="mt-3 pt-3 border-t border-[#E7E1D5] space-y-2 text-xs">
                      {chk.items.map((it) => (
                        <div key={it.id} className="space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[#0C1928]">{it.label}</span>
                            <span
                              className={`font-medium shrink-0 ${
                                it.compliant ? 'text-[#2E6F5E]' : 'text-[#9E3B3B]'
                              }`}
                            >
                              {it.compliant ? 'Conforme' : 'Não conforme'}
                            </span>
                          </div>
                          {it.note && (
                            <p className="text-[#9E3B3B] bg-[#9E3B3B]/5 px-2.5 py-1.5 rounded">
                              {it.note}
                            </p>
                          )}
                          {it.photoUrl && (
                            <img
                              src={it.photoUrl}
                              alt={it.label}
                              className="h-16 w-24 object-cover rounded border border-[#E7E1D5]"
                            />
                          )}
                        </div>
                      ))}
                      {chk.generalNotes && (
                        <p className="pt-2 text-[#5C6B7A] italic">Obs.: {chk.generalNotes}</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};
