import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  Download,
  FileDown,
  Landmark,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import type { QuickEntryKind } from '../components/QuickEntryModal';
import { useFleet } from '../context/FleetContext';
import type { FineStatus, MaintenanceStatus } from '../types/fleet.types';
import {
  detectConsumptionAnomalies,
  evaluateFineNicAlert,
  exportRowsToCsv,
  formatBRL,
  formatDateBR,
  formatKm,
  formatNumberBR,
  fuelTypeLabel,
  getEffectiveFineAmount,
  getFuelUnit,
} from '../utils/fleet.calculations';
import { downloadFiciPdf } from '../utils/fleet.pdf';

interface LedgerPageProps {
  onOpenQuickEntry: (kind: QuickEntryKind) => void;
}

interface BankFeedCandidate {
  id: string;
  date: string;
  merchant: string;
  amount: number;
  suggestedCategory: string;
  suggestedVehicleId: string;
}

const SAMPLE_OPEN_FINANCE_FEED: BankFeedCandidate[] = [];

export const LedgerPage: React.FC<LedgerPageProps> = ({ onOpenQuickEntry }) => {
  const {
    snapshot,
    selectedVehicleFilter,
    deleteFueling,
    updateMaintenanceStatus,
    deleteMaintenance,
    addLedgerEntry,
    deleteLedgerEntry,
    updateFineStatus,
    deleteFine,
  } = useFleet();

  const [subTab, setSubTab] = useState<'ABASTECIMENTOS' | 'MANUTENCOES' | 'FINANCEIRO' | 'MULTAS'>(
    'ABASTECIMENTOS'
  );
  const [search, setSearch] = useState('');
  const [reconcileOpen, setReconcileOpen] = useState(false);
  const [reconciledIds, setReconciledIds] = useState<string[]>(() =>
    snapshot.ledger.map((l) => l.bankReferenceId).filter((x): x is string => Boolean(x))
  );

  const vehicleMap = useMemo(
    () => new Map(snapshot.vehicles.map((v) => [v.id, v])),
    [snapshot.vehicles]
  );
  const driverMap = useMemo(
    () => new Map(snapshot.drivers.map((d) => [d.id, d])),
    [snapshot.drivers]
  );

  const anomalyIds = useMemo(() => {
    const list = detectConsumptionAnomalies(snapshot.fuelings, selectedVehicleFilter);
    return new Map(list.map((a) => [a.fuelingId, a]));
  }, [snapshot.fuelings, selectedVehicleFilter]);

  const matchScope = (vId: string) =>
    selectedVehicleFilter === 'TODOS' || vId === selectedVehicleFilter;

  const filteredFuelings = useMemo(() => {
    const q = search.trim().toLowerCase();
    return snapshot.fuelings.filter((f) => {
      if (!matchScope(f.vehicleId)) return false;
      if (!q) return true;
      const veh = vehicleMap.get(f.vehicleId);
      return (
        (f.stationName ?? '').toLowerCase().includes(q) ||
        (veh?.plate ?? '').toLowerCase().includes(q) ||
        (veh?.model ?? '').toLowerCase().includes(q)
      );
    });
  }, [snapshot.fuelings, selectedVehicleFilter, search, vehicleMap]);

  const filteredMaintenances = useMemo(() => {
    const q = search.trim().toLowerCase();
    return snapshot.maintenances.filter((m) => {
      if (!matchScope(m.vehicleId)) return false;
      if (!q) return true;
      const veh = vehicleMap.get(m.vehicleId);
      return (
        m.category.toLowerCase().includes(q) ||
        (m.providerName ?? '').toLowerCase().includes(q) ||
        (veh?.plate ?? '').toLowerCase().includes(q)
      );
    });
  }, [snapshot.maintenances, selectedVehicleFilter, search, vehicleMap]);

  const filteredLedger = useMemo(() => {
    const q = search.trim().toLowerCase();
    return snapshot.ledger.filter((l) => {
      if (!matchScope(l.vehicleId)) return false;
      if (!q) return true;
      const veh = vehicleMap.get(l.vehicleId);
      return (
        l.category.toLowerCase().includes(q) ||
        (l.description ?? '').toLowerCase().includes(q) ||
        (veh?.plate ?? '').toLowerCase().includes(q)
      );
    });
  }, [snapshot.ledger, selectedVehicleFilter, search, vehicleMap]);

  const filteredFines = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (snapshot.fines ?? []).filter((fn) => {
      if (!matchScope(fn.vehicleId)) return false;
      if (!q) return true;
      const veh = vehicleMap.get(fn.vehicleId);
      return (
        fn.infractionCode.toLowerCase().includes(q) ||
        fn.description.toLowerCase().includes(q) ||
        (veh?.plate ?? '').toLowerCase().includes(q)
      );
    });
  }, [snapshot.fines, selectedVehicleFilter, search, vehicleMap]);

  const handleReconcileTransaction = async (tx: BankFeedCandidate, vehicleId: string) => {
    await addLedgerEntry({
      vehicleId,
      kind: 'DESPESA',
      category: tx.suggestedCategory,
      date: tx.date,
      amount: tx.amount,
      description: `Conciliado Open Finance: ${tx.merchant}`,
      bankReferenceId: tx.id,
    });
    setReconciledIds((prev) => [...prev, tx.id]);
    toast.success('Transação bancária conciliada à frota.');
  };

  const handleExportCsv = () => {
    if (subTab === 'ABASTECIMENTOS') {
      exportRowsToCsv(
        'frota-abastecimentos.csv',
        [
          'Data',
          'Placa',
          'Veículo',
          'Motorista',
          'Odômetro',
          'Combustível',
          'Volume',
          'Preço Unitário',
          'Total (R$)',
          'Tanque Cheio',
          'Média Calculada',
          'Posto',
        ],
        filteredFuelings.map((f) => {
          const v = vehicleMap.get(f.vehicleId);
          const d = driverMap.get(f.driverId);
          return [
            formatDateBR(f.date),
            v?.plate ?? '',
            v?.model ?? '',
            d?.name ?? '',
            f.odometer,
            fuelTypeLabel(f.fuelType),
            f.quantity,
            f.unitPrice,
            f.totalCost,
            f.fullTank ? 'Sim' : 'Não',
            f.calculatedAvg ?? '',
            f.stationName ?? '',
          ];
        })
      );
    } else if (subTab === 'MANUTENCOES') {
      exportRowsToCsv(
        'frota-manutencoes.csv',
        ['Data', 'Placa', 'Tipo', 'Status', 'Serviço', 'Oficina', 'Odômetro', 'Peças', 'Mão de Obra', 'Total'],
        filteredMaintenances.map((m) => {
          const v = vehicleMap.get(m.vehicleId);
          return [
            formatDateBR(m.date),
            v?.plate ?? '',
            m.type,
            m.status ?? 'CONCLUIDA',
            m.category,
            m.providerName ?? '',
            m.odometer,
            m.partsCost,
            m.laborCost,
            m.totalCost,
          ];
        })
      );
    } else if (subTab === 'FINANCEIRO') {
      exportRowsToCsv(
        'frota-financeiro.csv',
        ['Data', 'Placa', 'Natureza', 'Categoria', 'Descrição', 'Valor (R$)'],
        filteredLedger.map((l) => {
          const v = vehicleMap.get(l.vehicleId);
          return [
            formatDateBR(l.date),
            v?.plate ?? '',
            l.kind,
            l.category,
            l.description ?? '',
            l.amount,
          ];
        })
      );
    } else {
      exportRowsToCsv(
        'frota-multas.csv',
        ['Data', 'Placa', 'Código', 'Descrição', 'Pontos', 'Valor Efetivo', 'Prazo Indicação', 'Status'],
        filteredFines.map((fn) => {
          const v = vehicleMap.get(fn.vehicleId);
          return [
            formatDateBR(fn.date),
            v?.plate ?? '',
            fn.infractionCode,
            fn.description,
            fn.points,
            getEffectiveFineAmount(fn),
            fn.driverIndicationDeadline ? formatDateBR(fn.driverIndicationDeadline) : '',
            fn.status,
          ];
        })
      );
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div className="inline-flex items-center gap-1 p-1 bg-white border border-[#E7E1D5] rounded-lg self-start overflow-x-auto max-w-full">
          <button
            type="button"
            onClick={() => setSubTab('ABASTECIMENTOS')}
            className={`px-3.5 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
              subTab === 'ABASTECIMENTOS'
                ? 'bg-[#173D4A] text-white'
                : 'text-[#5C6B7A] hover:text-[#0C1928]'
            }`}
          >
            Abastecimentos ({filteredFuelings.length})
          </button>
          <button
            type="button"
            onClick={() => setSubTab('MANUTENCOES')}
            className={`px-3.5 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
              subTab === 'MANUTENCOES'
                ? 'bg-[#173D4A] text-white'
                : 'text-[#5C6B7A] hover:text-[#0C1928]'
            }`}
          >
            Manutenções ({filteredMaintenances.length})
          </button>
          <button
            type="button"
            onClick={() => setSubTab('FINANCEIRO')}
            className={`px-3.5 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
              subTab === 'FINANCEIRO'
                ? 'bg-[#173D4A] text-white'
                : 'text-[#5C6B7A] hover:text-[#0C1928]'
            }`}
          >
            Despesas e Receitas ({filteredLedger.length})
          </button>
          <button
            type="button"
            onClick={() => setSubTab('MULTAS')}
            className={`px-3.5 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
              subTab === 'MULTAS'
                ? 'bg-[#173D4A] text-white'
                : 'text-[#5C6B7A] hover:text-[#0C1928]'
            }`}
          >
            Multas ({filteredFines.length})
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative flex-1 sm:w-52">
            <Search className="h-4 w-4 text-[#5C6B7A] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filtrar placa, posto ou item..."
              className="w-full h-9 pl-9 pr-3 rounded-lg border border-[#E7E1D5] bg-white text-xs text-[#0C1928] focus:outline-none focus:ring-2 focus:ring-[#173D4A]"
            />
          </div>

          <button
            type="button"
            onClick={() => setReconcileOpen(true)}
            className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg border border-[#E7E1D5] bg-white hover:bg-[#F7F8FA] text-xs font-medium text-[#173D4A] whitespace-nowrap cursor-pointer"
          >
            <Landmark className="h-3.5 w-3.5" />
            <span>Conciliar Extrato</span>
          </button>

          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg border border-[#E7E1D5] bg-white hover:bg-[#F7F8FA] text-xs font-medium text-[#0C1928] whitespace-nowrap"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Exportar CSV</span>
          </button>

          <button
            type="button"
            onClick={() =>
              onOpenQuickEntry(
                subTab === 'ABASTECIMENTOS'
                  ? 'ABASTECIMENTO'
                  : subTab === 'MANUTENCOES'
                  ? 'MANUTENCAO'
                  : subTab === 'MULTAS'
                  ? 'MULTA'
                  : 'FINANCEIRO'
              )
            }
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-[#173D4A] hover:bg-[#0C1928] text-white text-xs font-medium whitespace-nowrap cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            <span>
              {subTab === 'ABASTECIMENTOS'
                ? 'Novo Abastecimento'
                : subTab === 'MANUTENCOES'
                ? 'Nova Manutenção'
                : subTab === 'MULTAS'
                ? 'Nova Multa'
                : 'Novo Lançamento'}
            </span>
          </button>
        </div>
      </div>

      {/* Abastecimentos */}
      {subTab === 'ABASTECIMENTOS' && (
        <div className="bg-white border border-[#E7E1D5] rounded-[10px] overflow-hidden">
          {filteredFuelings.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-sm font-medium text-[#0C1928]">
                Nenhum abastecimento registrado
              </p>
              <p className="text-xs text-[#5C6B7A] mt-1 mb-4">
                Lance os abastecimentos com tanque cheio para acompanhar o consumo real em km/L.
              </p>
              <button
                type="button"
                onClick={() => onOpenQuickEntry('ABASTECIMENTO')}
                className="h-9 px-4 rounded-lg bg-[#173D4A] text-white text-xs font-medium"
              >
                Registrar Abastecimento
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#E7E1D5] bg-[#F7F8FA] text-[11px] font-semibold text-[#5C6B7A]">
                    <th className="py-3 px-4">Data</th>
                    <th className="py-3 px-4">Veículo</th>
                    <th className="py-3 px-4">Posto / Motorista</th>
                    <th className="py-3 px-4 text-right">Odômetro</th>
                    <th className="py-3 px-4 text-right">Volume</th>
                    <th className="py-3 px-4 text-right">Unitário</th>
                    <th className="py-3 px-4 text-right">Total</th>
                    <th className="py-3 px-4 text-right">Autonomia</th>
                    <th className="py-3 px-4 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E7E1D5] text-sm">
                  {filteredFuelings.map((f) => {
                    const v = vehicleMap.get(f.vehicleId);
                    const d = driverMap.get(f.driverId);
                    const unit = getFuelUnit(f.fuelType);
                    const anomaly = anomalyIds.get(f.id);

                    return (
                      <tr key={f.id} className="hover:bg-[#F7F8FA] transition-colors">
                        <td className="py-3 px-4 font-mono-tabular text-xs text-[#0C1928] whitespace-nowrap">
                          {formatDateBR(f.date)}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span className="font-mono-tabular font-semibold text-xs text-[#173D4A]">
                            {v?.plate ?? '—'}
                          </span>
                          <span className="text-xs text-[#5C6B7A] ml-2">{v?.model}</span>
                        </td>
                        <td className="py-3 px-4">
                          <p className="text-xs font-medium text-[#0C1928]">
                            {f.stationName || fuelTypeLabel(f.fuelType)}
                          </p>
                          <p className="text-[11px] text-[#5C6B7A]">
                            {d?.name ?? '—'} · {f.fullTank ? 'Tanque cheio' : 'Parcial'}
                            {f.nfceKey ? ' · NFC-e' : ''}
                          </p>
                        </td>
                        <td className="py-3 px-4 text-right font-mono-tabular text-xs text-[#0C1928] whitespace-nowrap">
                          {formatKm(f.odometer)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono-tabular text-xs text-[#0C1928] whitespace-nowrap">
                          {formatNumberBR(f.quantity, 1)} {unit}
                        </td>
                        <td className="py-3 px-4 text-right font-mono-tabular text-xs text-[#5C6B7A] whitespace-nowrap">
                          {formatBRL(f.unitPrice)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono-tabular text-xs font-semibold text-[#0C1928] whitespace-nowrap">
                          {formatBRL(f.totalCost)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono-tabular text-xs font-semibold whitespace-nowrap">
                          {f.calculatedAvg ? (
                            <span
                              className={`inline-flex items-center gap-1 ${
                                anomaly ? 'text-[#9E3B3B]' : 'text-[#173D4A]'
                              }`}
                              title={
                                anomaly
                                  ? `Queda de ${anomaly.dropPercent}% vs média ${anomaly.baselineAvg}`
                                  : undefined
                              }
                            >
                              {anomaly && <AlertTriangle className="h-3.5 w-3.5" />}
                              <span>
                                {formatNumberBR(f.calculatedAvg, 2)} km/{unit}
                              </span>
                            </span>
                          ) : (
                            <span className="text-[#5C6B7A]">—</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => deleteFueling(f.id)}
                            className="p-1.5 rounded-md text-[#5C6B7A] hover:text-[#9E3B3B] hover:bg-[#9E3B3B]/10"
                            title="Excluir abastecimento"
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
        </div>
      )}

      {/* Manutenções */}
      {subTab === 'MANUTENCOES' && (
        <div className="bg-white border border-[#E7E1D5] rounded-[10px] overflow-hidden">
          {filteredMaintenances.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-sm font-medium text-[#0C1928]">Nenhuma manutenção registrada</p>
              <p className="text-xs text-[#5C6B7A] mt-1 mb-4">
                Controle serviços preventivos e corretivos com histórico de peças e mão de obra.
              </p>
              <button
                type="button"
                onClick={() => onOpenQuickEntry('MANUTENCAO')}
                className="h-9 px-4 rounded-lg bg-[#173D4A] text-white text-xs font-medium"
              >
                Lançar Manutenção
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#E7E1D5] bg-[#F7F8FA] text-[11px] font-semibold text-[#5C6B7A]">
                    <th className="py-3 px-4">Data</th>
                    <th className="py-3 px-4">Veículo</th>
                    <th className="py-3 px-4">Serviço / Oficina</th>
                    <th className="py-3 px-4">Etapa da OS</th>
                    <th className="py-3 px-4 text-right">Odômetro</th>
                    <th className="py-3 px-4 text-right">Total</th>
                    <th className="py-3 px-4 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E7E1D5] text-sm">
                  {filteredMaintenances.map((m) => {
                    const v = vehicleMap.get(m.vehicleId);
                    const status = m.status ?? 'CONCLUIDA';
                    return (
                      <tr key={m.id} className="hover:bg-[#F7F8FA] transition-colors">
                        <td className="py-3 px-4 font-mono-tabular text-xs text-[#0C1928] whitespace-nowrap">
                          {formatDateBR(m.date)}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span className="font-mono-tabular font-semibold text-xs text-[#173D4A]">
                            {v?.plate ?? '—'}
                          </span>
                          <span className="text-xs text-[#5C6B7A] ml-2">{v?.model}</span>
                        </td>
                        <td className="py-3 px-4">
                          <p className="text-xs font-medium text-[#0C1928]">
                            {m.category}
                            <span
                              className={`ml-2 font-normal ${
                                m.type === 'PREVENTIVA' ? 'text-[#173D4A]' : 'text-[#A66E1E]'
                              }`}
                            >
                              · {m.type === 'PREVENTIVA' ? 'Preventiva' : 'Corretiva'}
                            </span>
                          </p>
                          <p className="text-[11px] text-[#5C6B7A]">
                            {m.providerName || 'Oficina interna'}
                            {m.originChecklistId ? ' · Origem: Checklist' : ''}
                            {m.notes ? ` · ${m.notes}` : ''}
                          </p>
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <select
                            value={status}
                            onChange={(e) =>
                              updateMaintenanceStatus(m.id, e.target.value as MaintenanceStatus)
                            }
                            className="h-8 rounded-md border border-[#E7E1D5] bg-white px-2 text-xs font-medium text-[#0C1928]"
                          >
                            <option value="ABERTA">Aberta</option>
                            <option value="EM_EXECUCAO">Em execução</option>
                            <option value="CONCLUIDA">Concluída</option>
                          </select>
                        </td>
                        <td className="py-3 px-4 text-right font-mono-tabular text-xs text-[#0C1928] whitespace-nowrap">
                          {formatKm(m.odometer)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono-tabular text-xs font-semibold text-[#0C1928] whitespace-nowrap">
                          {formatBRL(m.totalCost)}
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => deleteMaintenance(m.id)}
                            className="p-1.5 rounded-md text-[#5C6B7A] hover:text-[#9E3B3B] hover:bg-[#9E3B3B]/10"
                            title="Excluir manutenção"
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
        </div>
      )}

      {/* Despesas e Receitas */}
      {subTab === 'FINANCEIRO' && (
        <div className="bg-white border border-[#E7E1D5] rounded-[10px] overflow-hidden">
          {filteredLedger.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-sm font-medium text-[#0C1928]">
                Nenhuma despesa ou receita registrada
              </p>
              <p className="text-xs text-[#5C6B7A] mt-1 mb-4">
                Lance pedágios, seguros, multas ou receitas de fretes e reembolsos.
              </p>
              <button
                type="button"
                onClick={() => onOpenQuickEntry('FINANCEIRO')}
                className="h-9 px-4 rounded-lg bg-[#173D4A] text-white text-xs font-medium"
              >
                Novo Lançamento
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#E7E1D5] bg-[#F7F8FA] text-[11px] font-semibold text-[#5C6B7A]">
                    <th className="py-3 px-4">Data</th>
                    <th className="py-3 px-4">Veículo</th>
                    <th className="py-3 px-4">Natureza</th>
                    <th className="py-3 px-4">Categoria e Histórico</th>
                    <th className="py-3 px-4 text-right">Valor</th>
                    <th className="py-3 px-4 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E7E1D5] text-sm">
                  {filteredLedger.map((l) => {
                    const v = vehicleMap.get(l.vehicleId);
                    return (
                      <tr key={l.id} className="hover:bg-[#F7F8FA] transition-colors">
                        <td className="py-3 px-4 font-mono-tabular text-xs text-[#0C1928] whitespace-nowrap">
                          {formatDateBR(l.date)}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span className="font-mono-tabular font-semibold text-xs text-[#173D4A]">
                            {v?.plate ?? '—'}
                          </span>
                          <span className="text-xs text-[#5C6B7A] ml-2">{v?.model}</span>
                        </td>
                        <td className="py-3 px-4 text-xs font-semibold whitespace-nowrap">
                          <span
                            className={
                              l.kind === 'RECEITA' ? 'text-[#2E6F5E]' : 'text-[#9E3B3B]'
                            }
                          >
                            {l.kind === 'RECEITA' ? 'Receita' : 'Despesa'}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <p className="text-xs font-medium text-[#0C1928]">{l.category}</p>
                          {l.description && (
                            <p className="text-[11px] text-[#5C6B7A]">{l.description}</p>
                          )}
                        </td>
                        <td
                          className={`py-3 px-4 text-right font-mono-tabular text-xs font-semibold whitespace-nowrap ${
                            l.kind === 'RECEITA' ? 'text-[#2E6F5E]' : 'text-[#0C1928]'
                          }`}
                        >
                          {l.kind === 'RECEITA'
                            ? `+ ${formatBRL(l.amount)}`
                            : `- ${formatBRL(l.amount)}`}
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => deleteLedgerEntry(l.id)}
                            className="p-1.5 rounded-md text-[#5C6B7A] hover:text-[#9E3B3B] hover:bg-[#9E3B3B]/10"
                            title="Excluir lançamento"
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
        </div>
      )}

      {/* Multas e Infrações */}
      {subTab === 'MULTAS' && (
        <div className="bg-white border border-[#E7E1D5] rounded-[10px] overflow-hidden">
          {filteredFines.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-sm font-medium text-[#0C1928]">Nenhuma multa registrada</p>
              <p className="text-xs text-[#5C6B7A] mt-1 mb-4">
                Controle autos de infração, prazos de indicação de condutor e desconto SNE de 40%.
              </p>
              <button
                type="button"
                onClick={() => onOpenQuickEntry('MULTA')}
                className="h-9 px-4 rounded-lg bg-[#173D4A] text-white text-xs font-medium"
              >
                Registrar Multa
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#E7E1D5] bg-[#F7F8FA] text-[11px] font-semibold text-[#5C6B7A]">
                    <th className="py-3 px-4">Data</th>
                    <th className="py-3 px-4">Veículo / Condutor</th>
                    <th className="py-3 px-4">Infração</th>
                    <th className="py-3 px-4 text-right">Pts</th>
                    <th className="py-3 px-4 text-right">Valor</th>
                    <th className="py-3 px-4">Prazo Indicação</th>
                    <th className="py-3 px-4">Situação</th>
                    <th className="py-3 px-4 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E7E1D5] text-sm">
                  {filteredFines.map((fn) => {
                    const v = vehicleMap.get(fn.vehicleId);
                    const d = fn.driverId ? driverMap.get(fn.driverId) : undefined;
                    const effective = getEffectiveFineAmount(fn);
                    const nic = evaluateFineNicAlert(fn);

                    return (
                      <tr key={fn.id} className="hover:bg-[#F7F8FA] transition-colors">
                        <td className="py-3 px-4 font-mono-tabular text-xs text-[#0C1928] whitespace-nowrap">
                          {formatDateBR(fn.date)}
                          {fn.time ? <span className="text-[#5C6B7A] ml-1">{fn.time}</span> : null}
                        </td>
                        <td className="py-3 px-4">
                          <p className="font-mono-tabular text-xs font-semibold text-[#173D4A]">
                            {v?.plate ?? '—'}
                          </p>
                          <p className="text-[11px] text-[#5C6B7A]">
                            {d?.name ?? 'Condutor não identificado'}
                          </p>
                        </td>
                        <td className="py-3 px-4">
                          <p className="text-xs font-medium text-[#0C1928]">
                            {fn.infractionCode} · {fn.description}
                          </p>
                          {fn.location && (
                            <p className="text-[11px] text-[#5C6B7A]">{fn.location}</p>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right font-mono-tabular text-xs text-[#0C1928]">
                          {fn.points}
                        </td>
                        <td className="py-3 px-4 text-right font-mono-tabular text-xs whitespace-nowrap">
                          <span className="font-semibold text-[#0C1928]">
                            {formatBRL(effective)}
                          </span>
                          {fn.sneDiscountApplied && (
                            <span className="block text-[10px] text-[#2E6F5E]">SNE -40%</span>
                          )}
                        </td>
                        <td className="py-3 px-4 font-mono-tabular text-xs whitespace-nowrap">
                          <span
                            className={
                              nic.tier === 'VENCIDO' || nic.tier === 'D-2'
                                ? 'font-semibold text-[#9E3B3B]'
                                : nic.tier === 'D-5' || nic.tier === 'D-10'
                                ? 'font-semibold text-[#A66E1E]'
                                : 'text-[#5C6B7A]'
                            }
                          >
                            {fn.driverIndicationDeadline
                              ? formatDateBR(fn.driverIndicationDeadline)
                              : '—'}
                          </span>
                          {nic.tier !== 'NONE' && nic.tier !== 'NO_PRAZO' && (
                            <span className="block text-[10px] text-[#9E3B3B]">{nic.tier}</span>
                          )}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <select
                            value={fn.status}
                            onChange={(e) => updateFineStatus(fn.id, e.target.value as FineStatus)}
                            className="h-8 rounded-md border border-[#E7E1D5] bg-white px-2 text-xs font-medium text-[#0C1928]"
                          >
                            <option value="PENDENTE">Pendente</option>
                            <option value="INDICADO">Condutor indicado</option>
                            <option value="PAGA">Paga</option>
                            <option value="RECORRIDA">Em recurso</option>
                          </select>
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => void downloadFiciPdf(fn, v, d)}
                              className="inline-flex items-center gap-1 h-7 px-2 rounded border border-[#E7E1D5] text-[11px] font-medium text-[#173D4A] hover:bg-[#F7F8FA]"
                              title="Baixar FICI em PDF"
                            >
                              <FileDown className="h-3 w-3" />
                              <span>FICI</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteFine(fn.id)}
                              className="p-1.5 rounded-md text-[#5C6B7A] hover:text-[#9E3B3B] hover:bg-[#9E3B3B]/10"
                              title="Excluir multa"
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

      {/* Drawer de Conciliação Open Finance (Pluggy) */}
      {reconcileOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-[#0C1928]/60 backdrop-blur-[1px]">
          <div className="w-full max-w-lg bg-white h-full border-l border-[#E7E1D5] shadow-2xl flex flex-col">
            <div className="px-6 py-4 border-b border-[#E7E1D5] flex items-center justify-between">
              <div>
                <h2 className="font-display text-lg font-semibold text-[#0C1928]">
                  Conciliação Open Finance (Pluggy)
                </h2>
                <p className="text-xs text-[#5C6B7A] mt-0.5">
                  Vincule débitos bancários de postos, tags e oficinas aos veículos da frota
                </p>
              </div>
              <button
                type="button"
                onClick={() => setReconcileOpen(false)}
                className="p-1.5 rounded-lg text-[#5C6B7A] hover:text-[#0C1928]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto flex-1">
              {SAMPLE_OPEN_FINANCE_FEED.map((tx) => {
                const isDone = reconciledIds.includes(tx.id);
                const defaultVeh =
                  snapshot.vehicles.find((v) => v.id === tx.suggestedVehicleId) ??
                  snapshot.vehicles[0];
                return (
                  <div
                    key={tx.id}
                    className="p-4 rounded-[10px] border border-[#E7E1D5] bg-[#F7F8FA] space-y-2.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-xs font-mono-tabular text-[#5C6B7A]">
                          {formatDateBR(tx.date)} · {tx.suggestedCategory}
                        </p>
                        <p className="text-sm font-semibold text-[#0C1928] mt-0.5">
                          {tx.merchant}
                        </p>
                      </div>
                      <span className="text-sm font-bold font-mono-tabular text-[#0C1928]">
                        {formatBRL(tx.amount)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-2 border-t border-[#E7E1D5]">
                      <span className="text-xs text-[#5C6B7A]">
                        Sugestão:{' '}
                        <strong className="font-mono-tabular text-[#173D4A]">
                          {defaultVeh?.plate ?? '—'}
                        </strong>
                      </span>

                      {isDone ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#2E6F5E]">
                          <Check className="h-3.5 w-3.5" />
                          <span>Conciliado</span>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() =>
                            defaultVeh && handleReconcileTransaction(tx, defaultVeh.id)
                          }
                          className="h-8 px-3 rounded-lg bg-[#173D4A] hover:bg-[#0C1928] text-white text-xs font-medium cursor-pointer"
                        >
                          Conciliar Despesa
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
