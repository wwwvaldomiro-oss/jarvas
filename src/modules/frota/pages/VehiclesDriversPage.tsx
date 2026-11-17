import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { DriverFormModal } from '../components/DriverFormModal';
import { VehicleFormModal } from '../components/VehicleFormModal';
import { useFleet } from '../context/FleetContext';
import type { Driver, Vehicle } from '../types/fleet.types';
import {
  evaluateCnhStatus,
  formatBRL,
  formatKm,
  formatNumberBR,
  fuelTypeLabel,
  getFuelUnit,
  vehicleStatusLabel,
} from '../utils/fleet.calculations';

export const VehiclesDriversPage: React.FC = () => {
  const { snapshot, deleteVehicle, deleteDriver } = useFleet();

  const [subTab, setSubTab] = useState<'VEICULOS' | 'MOTORISTAS'>('VEICULOS');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'TODOS' | 'ATIVO' | 'MANUTENCAO' | 'INATIVO'>('TODOS');

  const [vehicleModalOpen, setVehicleModalOpen] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
  const [inspectingVehicle, setInspectingVehicle] = useState<Vehicle | null>(null);

  const [driverModalOpen, setDriverModalOpen] = useState(false);
  const [editingDriver, setEditingDriver] = useState<Driver | null>(null);

  const driverMap = useMemo(
    () => new Map(snapshot.drivers.map((d) => [d.id, d])),
    [snapshot.drivers]
  );

  const vehicleMap = useMemo(
    () => new Map(snapshot.vehicles.map((v) => [v.id, v])),
    [snapshot.vehicles]
  );

  const vehicleStatsMap = useMemo(() => {
    const map = new Map<
      string,
      { totalSpent: number; avgConsumption: number | null; lastAvgUnit: string }
    >();
    for (const v of snapshot.vehicles) {
      const vFuel = snapshot.fuelings.filter((f) => f.vehicleId === v.id);
      const vMaint = snapshot.maintenances.filter((m) => m.vehicleId === v.id);
      const vExp = snapshot.ledger.filter((l) => l.vehicleId === v.id && l.kind === 'DESPESA');

      const totalSpent =
        vFuel.reduce((s, f) => s + f.totalCost, 0) +
        vMaint.reduce((s, m) => s + m.totalCost, 0) +
        vExp.reduce((s, e) => s + e.amount, 0);

      const avgs = vFuel.map((f) => f.calculatedAvg).filter((n): n is number => typeof n === 'number');
      const avgConsumption = avgs.length > 0 ? avgs.reduce((a, b) => a + b, 0) / avgs.length : null;
      map.set(v.id, { totalSpent, avgConsumption, lastAvgUnit: getFuelUnit(v.fuelType) });
    }
    return map;
  }, [snapshot.vehicles, snapshot.fuelings, snapshot.maintenances, snapshot.ledger]);

  const filteredVehicles = useMemo(() => {
    const q = search.trim().toLowerCase();
    return snapshot.vehicles.filter((v) => {
      if (statusFilter !== 'TODOS' && v.status !== statusFilter) return false;
      if (!q) return true;
      return (
        v.plate.toLowerCase().includes(q) ||
        v.brand.toLowerCase().includes(q) ||
        v.model.toLowerCase().includes(q)
      );
    });
  }, [snapshot.vehicles, statusFilter, search]);

  const filteredDrivers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return snapshot.drivers.filter((d) => {
      if (!q) return true;
      return (
        d.name.toLowerCase().includes(q) ||
        d.cnhNumber.toLowerCase().includes(q) ||
        d.cnhCategory.toLowerCase().includes(q)
      );
    });
  }, [snapshot.drivers, search]);

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="inline-flex items-center gap-1 p-1 bg-white border border-[#E7E1D5] rounded-lg self-start">
          <button
            type="button"
            onClick={() => setSubTab('VEICULOS')}
            className={`px-4 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
              subTab === 'VEICULOS'
                ? 'bg-[#173D4A] text-white'
                : 'text-[#5C6B7A] hover:text-[#0C1928]'
            }`}
          >
            Veículos ({snapshot.vehicles.length})
          </button>
          <button
            type="button"
            onClick={() => setSubTab('MOTORISTAS')}
            className={`px-4 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
              subTab === 'MOTORISTAS'
                ? 'bg-[#173D4A] text-white'
                : 'text-[#5C6B7A] hover:text-[#0C1928]'
            }`}
          >
            Motoristas ({snapshot.drivers.length})
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 sm:w-64">
            <Search className="h-4 w-4 text-[#5C6B7A] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={
                subTab === 'VEICULOS'
                  ? 'Buscar placa, marca ou modelo...'
                  : 'Buscar motorista ou CNH...'
              }
              className="w-full h-9 pl-9 pr-3 rounded-lg border border-[#E7E1D5] bg-white text-xs text-[#0C1928] focus:outline-none focus:ring-2 focus:ring-[#173D4A]"
            />
          </div>

          {subTab === 'VEICULOS' && (
            <select
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(e.target.value as 'TODOS' | 'ATIVO' | 'MANUTENCAO' | 'INATIVO')
              }
              className="h-9 rounded-lg border border-[#E7E1D5] bg-white px-3 text-xs text-[#0C1928]"
              aria-label="Filtrar status do veículo"
            >
              <option value="TODOS">Todos os status</option>
              <option value="ATIVO">Em operação</option>
              <option value="MANUTENCAO">Em manutenção</option>
              <option value="INATIVO">Inativo</option>
            </select>
          )}

          <button
            type="button"
            onClick={() => {
              if (subTab === 'VEICULOS') {
                setEditingVehicle(null);
                setVehicleModalOpen(true);
              } else {
                setEditingDriver(null);
                setDriverModalOpen(true);
              }
            }}
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-[#173D4A] hover:bg-[#0C1928] text-white text-xs font-medium transition-colors whitespace-nowrap cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            <span>{subTab === 'VEICULOS' ? 'Cadastrar Veículo' : 'Cadastrar Motorista'}</span>
          </button>
        </div>
      </div>

      {/* Tabela de Veículos */}
      {subTab === 'VEICULOS' && (
        <div className="bg-white border border-[#E7E1D5] rounded-[10px] overflow-hidden">
          {filteredVehicles.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-sm font-medium text-[#0C1928]">Nenhum veículo encontrado</p>
              <p className="text-xs text-[#5C6B7A] mt-1 mb-4">
                Ajuste os filtros ou cadastre um novo veículo na frota.
              </p>
              <button
                type="button"
                onClick={() => {
                  setEditingVehicle(null);
                  setVehicleModalOpen(true);
                }}
                className="h-9 px-4 rounded-lg bg-[#173D4A] text-white text-xs font-medium"
              >
                Cadastrar Veículo
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#E7E1D5] bg-[#F7F8FA] text-[11px] font-semibold text-[#5C6B7A]">
                    <th className="py-3 px-4">Placa</th>
                    <th className="py-3 px-4">Veículo</th>
                    <th className="py-3 px-4">Combustível</th>
                    <th className="py-3 px-4">Motorista titular</th>
                    <th className="py-3 px-4 text-right">Odômetro</th>
                    <th className="py-3 px-4 text-right">Média</th>
                    <th className="py-3 px-4 text-right">Gasto acumulado</th>
                    <th className="py-3 px-4">Situação</th>
                    <th className="py-3 px-4 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E7E1D5] text-sm">
                  {filteredVehicles.map((v) => {
                    const stats = vehicleStatsMap.get(v.id);
                    const driver = v.assignedDriverId ? driverMap.get(v.assignedDriverId) : null;
                    return (
                      <tr
                        key={v.id}
                        onClick={() => setInspectingVehicle(v)}
                        className="hover:bg-[#F7F8FA] transition-colors cursor-pointer"
                      >
                        <td className="py-3 px-4 font-mono-tabular font-semibold text-[#0C1928] whitespace-nowrap">
                          {v.plate}
                        </td>
                        <td className="py-3 px-4">
                          <span className="font-medium text-[#0C1928]">
                            {v.brand} {v.model}
                          </span>
                          <span className="text-xs text-[#5C6B7A] ml-2 font-mono-tabular">
                            {v.year}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-xs text-[#5C6B7A] whitespace-nowrap">
                          {fuelTypeLabel(v.fuelType)}
                        </td>
                        <td className="py-3 px-4 text-xs text-[#0C1928]">
                          {driver ? driver.name : 'Sem vínculo fixo'}
                        </td>
                        <td className="py-3 px-4 text-right font-mono-tabular text-xs text-[#0C1928] whitespace-nowrap">
                          {formatKm(v.currentOdometer)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono-tabular text-xs text-[#173D4A] font-medium whitespace-nowrap">
                          {stats?.avgConsumption
                            ? `${formatNumberBR(stats.avgConsumption, 2)} km/${stats.lastAvgUnit}`
                            : '—'}
                        </td>
                        <td className="py-3 px-4 text-right font-mono-tabular text-xs font-medium text-[#0C1928] whitespace-nowrap">
                          {formatBRL(stats?.totalSpent ?? 0)}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center gap-1.5 text-xs font-medium ${
                              v.status === 'ATIVO'
                                ? 'text-[#2E6F5E]'
                                : v.status === 'MANUTENCAO'
                                ? 'text-[#A66E1E]'
                                : 'text-[#5C6B7A]'
                            }`}
                          >
                            {v.status === 'ATIVO' ? (
                              <CheckCircle2 className="h-3.5 w-3.5" />
                            ) : v.status === 'MANUTENCAO' ? (
                              <Clock className="h-3.5 w-3.5" />
                            ) : (
                              <AlertTriangle className="h-3.5 w-3.5" />
                            )}
                            <span>{vehicleStatusLabel(v.status)}</span>
                          </span>
                        </td>
                        <td
                          className="py-3 px-4 text-right whitespace-nowrap"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingVehicle(v);
                                setVehicleModalOpen(true);
                              }}
                              className="p-1.5 rounded-md text-[#5C6B7A] hover:text-[#173D4A] hover:bg-[#E7E1D5]/40"
                              title="Editar veículo"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteVehicle(v.id)}
                              className="p-1.5 rounded-md text-[#5C6B7A] hover:text-[#9E3B3B] hover:bg-[#9E3B3B]/10"
                              title="Excluir veículo"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tabela de Motoristas */}
      {subTab === 'MOTORISTAS' && (
        <div className="bg-white border border-[#E7E1D5] rounded-[10px] overflow-hidden">
          {filteredDrivers.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-sm font-medium text-[#0C1928]">Nenhum motorista encontrado</p>
              <p className="text-xs text-[#5C6B7A] mt-1 mb-4">
                Cadastre condutores e vincule veículos autorizados.
              </p>
              <button
                type="button"
                onClick={() => {
                  setEditingDriver(null);
                  setDriverModalOpen(true);
                }}
                className="h-9 px-4 rounded-lg bg-[#173D4A] text-white text-xs font-medium"
              >
                Cadastrar Motorista
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#E7E1D5] bg-[#F7F8FA] text-[11px] font-semibold text-[#5C6B7A]">
                    <th className="py-3 px-4">Condutor</th>
                    <th className="py-3 px-4">CNH / Categoria</th>
                    <th className="py-3 px-4">Validade CNH</th>
                    <th className="py-3 px-4">Contato</th>
                    <th className="py-3 px-4">Veículos liberados</th>
                    <th className="py-3 px-4 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E7E1D5] text-sm">
                  {filteredDrivers.map((d) => {
                    const cnh = evaluateCnhStatus(d);
                    const plates = d.allowedVehicleIds
                      .map((id) => vehicleMap.get(id)?.plate)
                      .filter(Boolean)
                      .join(' · ');

                    return (
                      <tr key={d.id} className="hover:bg-[#F7F8FA] transition-colors">
                        <td className="py-3 px-4">
                          <p className="font-medium text-[#0C1928]">{d.name}</p>
                          <p className="text-[11px] text-[#5C6B7A]">
                            {d.active ? 'Habilitado' : 'Inativo'}
                          </p>
                        </td>
                        <td className="py-3 px-4 font-mono-tabular text-xs text-[#0C1928] whitespace-nowrap">
                          {d.cnhNumber} · Cat. {d.cnhCategory}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center gap-1.5 text-xs font-medium ${
                              cnh.status === 'VENCIDO'
                                ? 'text-[#9E3B3B]'
                                : cnh.status === 'ATENCAO'
                                ? 'text-[#A66E1E]'
                                : 'text-[#2E6F5E]'
                            }`}
                          >
                            {cnh.status === 'VENCIDO' ? (
                              <AlertTriangle className="h-3.5 w-3.5" />
                            ) : cnh.status === 'ATENCAO' ? (
                              <Clock className="h-3.5 w-3.5" />
                            ) : (
                              <CheckCircle2 className="h-3.5 w-3.5" />
                            )}
                            <span className="font-mono-tabular">{cnh.label}</span>
                          </span>
                        </td>
                        <td className="py-3 px-4 text-xs text-[#5C6B7A] whitespace-nowrap">
                          {d.phone || '—'}
                        </td>
                        <td className="py-3 px-4 font-mono-tabular text-xs text-[#173D4A]">
                          {plates || 'Nenhum veículo'}
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingDriver(d);
                                setDriverModalOpen(true);
                              }}
                              className="p-1.5 rounded-md text-[#5C6B7A] hover:text-[#173D4A] hover:bg-[#E7E1D5]/40"
                              title="Editar motorista"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteDriver(d.id)}
                              className="p-1.5 rounded-md text-[#5C6B7A] hover:text-[#9E3B3B] hover:bg-[#9E3B3B]/10"
                              title="Excluir motorista"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Drawer de Detalhes do Veículo */}
      {inspectingVehicle && (
        <div className="fixed inset-0 z-50 flex justify-end bg-[#0C1928]/50">
          <div className="w-full max-w-md bg-white h-full border-l border-[#E7E1D5] shadow-2xl flex flex-col">
            <div className="px-6 py-4 border-b border-[#E7E1D5] flex items-center justify-between">
              <div>
                <p className="text-xs font-mono-tabular text-[#173D4A] font-semibold">
                  {inspectingVehicle.plate}
                </p>
                <h3 className="font-display text-lg font-semibold text-[#0C1928]">
                  {inspectingVehicle.brand} {inspectingVehicle.model}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setInspectingVehicle(null)}
                className="p-1.5 rounded-lg text-[#5C6B7A] hover:text-[#0C1928]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-6 space-y-5 overflow-y-auto flex-1">
              <div className="grid grid-cols-2 gap-4 pb-4 border-b border-[#E7E1D5] text-xs">
                <div>
                  <span className="text-[#5C6B7A] block">Odômetro atual</span>
                  <span className="font-mono-tabular font-semibold text-sm text-[#0C1928]">
                    {formatKm(inspectingVehicle.currentOdometer)}
                  </span>
                </div>
                <div>
                  <span className="text-[#5C6B7A] block">Combustível</span>
                  <span className="font-semibold text-sm text-[#0C1928]">
                    {fuelTypeLabel(inspectingVehicle.fuelType)}
                  </span>
                </div>
                <div>
                  <span className="text-[#5C6B7A] block">Ano</span>
                  <span className="font-mono-tabular font-semibold text-sm text-[#0C1928]">
                    {inspectingVehicle.year}
                  </span>
                </div>
                <div>
                  <span className="text-[#5C6B7A] block">RENAVAM</span>
                  <span className="font-mono-tabular font-semibold text-sm text-[#0C1928]">
                    {inspectingVehicle.renavam || 'Não informado'}
                  </span>
                </div>
              </div>

              {inspectingVehicle.notes && (
                <div>
                  <h4 className="text-xs font-semibold text-[#0C1928] mb-1">Observações</h4>
                  <p className="text-xs text-[#5C6B7A] leading-relaxed">
                    {inspectingVehicle.notes}
                  </p>
                </div>
              )}

              <div>
                <h4 className="text-xs font-semibold text-[#0C1928] mb-2">
                  Últimos Abastecimentos
                </h4>
                <div className="divide-y divide-[#E7E1D5] border-t border-b border-[#E7E1D5]">
                  {snapshot.fuelings
                    .filter((f) => f.vehicleId === inspectingVehicle.id)
                    .slice(0, 4)
                    .map((f) => (
                      <div key={f.id} className="py-2.5 flex items-center justify-between text-xs">
                        <div>
                          <span className="font-mono-tabular text-[#0C1928]">
                            {formatKm(f.odometer)}
                          </span>
                          <span className="text-[#5C6B7A] ml-2">
                            {formatNumberBR(f.quantity, 1)} {getFuelUnit(f.fuelType)}
                          </span>
                        </div>
                        <div className="text-right font-mono-tabular">
                          <span className="font-medium text-[#0C1928]">
                            {formatBRL(f.totalCost)}
                          </span>
                          {f.calculatedAvg && (
                            <span className="text-[#173D4A] ml-2">
                              ({formatNumberBR(f.calculatedAvg, 2)} km/{getFuelUnit(f.fuelType)})
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            </div>
            <div className="p-4 border-t border-[#E7E1D5] flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setEditingVehicle(inspectingVehicle);
                  setInspectingVehicle(null);
                  setVehicleModalOpen(true);
                }}
                className="h-9 px-4 rounded-lg bg-[#173D4A] text-white text-xs font-medium"
              >
                Editar Cadastro
              </button>
            </div>
          </div>
        </div>
      )}

      <VehicleFormModal
        open={vehicleModalOpen}
        editingVehicle={editingVehicle}
        onClose={() => setVehicleModalOpen(false)}
      />

      <DriverFormModal
        open={driverModalOpen}
        editingDriver={editingDriver}
        onClose={() => setDriverModalOpen(false)}
      />
    </div>
  );
};
