import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  FileCheck2,
  FileText,
  Fuel,
  Gauge,
  Route as RouteIcon,
  Wrench,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { toast } from 'sonner';
import type { QuickEntryKind } from '../components/QuickEntryModal';
import { useFleet } from '../context/FleetContext';
import type { FleetTab } from '../types/fleet.types';
import {
  type PeriodFilter,
  buildMonthlyCostSeries,
  buildUnifiedTimeline,
  computeFleetKpis,
  computeVehicleTcoSummary,
  detectConsumptionAnomalies,
  documentTypeLabel,
  evaluateCnhStatus,
  evaluateDocumentStatus,
  evaluateDriverCtbPoints,
  evaluateFineNicAlert,
  evaluateReminderStatus,
  formatBRL,
  formatDateBR,
  formatKm,
  formatNumberBR,
  fuelTypeLabel,
  getEffectiveFineAmount,
  getFuelUnit,
} from '../utils/fleet.calculations';
import { downloadFleetReportPdf } from '../utils/fleet.pdf';

interface DashboardPageProps {
  onNavigateTab: (tab: FleetTab) => void;
  onOpenQuickEntry: (kind?: QuickEntryKind) => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  onNavigateTab,
  onOpenQuickEntry,
}) => {
  const { snapshot, selectedVehicleFilter, isLoading } = useFleet();
  const [period, setPeriod] = useState<PeriodFilter>('90D');
  const [exportingPdf, setExportingPdf] = useState(false);

  // Calculadora Flex Inteligente (preço na bomba vs rendimento real da frota)
  const [gasPriceInput, setGasPriceInput] = useState('6.04');
  const [ethPriceInput, setEthPriceInput] = useState('3.98');

  const kpis = useMemo(
    () => computeFleetKpis(snapshot, selectedVehicleFilter, period),
    [snapshot, selectedVehicleFilter, period]
  );

  const chartData = useMemo(
    () => buildMonthlyCostSeries(snapshot, selectedVehicleFilter),
    [snapshot, selectedVehicleFilter]
  );

  const tcoRows = useMemo(
    () => computeVehicleTcoSummary(snapshot, selectedVehicleFilter),
    [snapshot, selectedVehicleFilter]
  );

  const anomalies = useMemo(
    () => detectConsumptionAnomalies(snapshot.fuelings, selectedVehicleFilter),
    [snapshot.fuelings, selectedVehicleFilter]
  );

  const timeline = useMemo(
    () => buildUnifiedTimeline(snapshot, selectedVehicleFilter).slice(0, 8),
    [snapshot, selectedVehicleFilter]
  );

  const vehicleMap = useMemo(
    () => new Map(snapshot.vehicles.map((v) => [v.id, v])),
    [snapshot.vehicles]
  );

  const flexStats = useMemo(() => {
    const gasAvgs = snapshot.fuelings
      .filter((f) => f.fuelType === 'GASOLINA' && f.calculatedAvg)
      .map((f) => f.calculatedAvg as number);
    const ethAvgs = snapshot.fuelings
      .filter((f) => f.fuelType === 'ETANOL' && f.calculatedAvg)
      .map((f) => f.calculatedAvg as number);

    const avgGasKmL =
      gasAvgs.length > 0 ? gasAvgs.reduce((a, b) => a + b, 0) / gasAvgs.length : 12.2;
    const avgEthKmL =
      ethAvgs.length > 0 ? ethAvgs.reduce((a, b) => a + b, 0) / ethAvgs.length : 8.8;

    const gPrice = parseFloat(gasPriceInput) || 6.04;
    const ePrice = parseFloat(ethPriceInput) || 3.98;
    const costPerKmGas = avgGasKmL > 0 ? gPrice / avgGasKmL : 0;
    const costPerKmEth = avgEthKmL > 0 ? ePrice / avgEthKmL : 0;
    const realRatio = avgGasKmL > 0 ? (avgEthKmL / avgGasKmL) * 100 : 70;

    return {
      avgGasKmL,
      avgEthKmL,
      costPerKmGas,
      costPerKmEth,
      realRatio,
      winner: costPerKmEth < costPerKmGas ? ('ETANOL' as const) : ('GASOLINA' as const),
    };
  }, [snapshot.fuelings, gasPriceInput, ethPriceInput]);

  const activeAlerts = useMemo(() => {
    const items: {
      id: string;
      severity: 'VENCIDO' | 'ATENCAO';
      title: string;
      context: string;
      targetTab: FleetTab;
    }[] = [];

    anomalies.forEach((anom) => {
      const veh = vehicleMap.get(anom.vehicleId);
      const unit = getFuelUnit(anom.fuelType);
      items.push({
        id: `anom-${anom.fuelingId}`,
        severity: 'VENCIDO',
        title: `Queda de rendimento (-${formatNumberBR(anom.dropPercent, 1)}%)`,
        context: `${veh?.plate ?? ''} · ${formatNumberBR(anom.actualAvg, 2)} vs média ${formatNumberBR(anom.baselineAvg, 2)} km/${unit}`,
        targetTab: 'lancamentos',
      });
    });

    snapshot.reminders
      .filter((r) => !r.completed && (selectedVehicleFilter === 'TODOS' || r.vehicleId === selectedVehicleFilter))
      .forEach((rem) => {
        const veh = vehicleMap.get(rem.vehicleId);
        const evalRes = evaluateReminderStatus(rem, veh);
        if (evalRes.status === 'VENCIDO' || evalRes.status === 'ATENCAO') {
          items.push({
            id: rem.id,
            severity: evalRes.status,
            title: rem.title,
            context: `${veh?.plate ?? 'Veículo'} · ${evalRes.reason}`,
            targetTab: 'percursos',
          });
        }
      });

    (snapshot.documents ?? [])
      .filter((doc) => selectedVehicleFilter === 'TODOS' || doc.vehicleId === selectedVehicleFilter)
      .forEach((doc) => {
        const ev = evaluateDocumentStatus(doc);
        if (ev.status === 'VENCIDO' || ev.status === 'ATENCAO') {
          const veh = vehicleMap.get(doc.vehicleId);
          items.push({
            id: `doc-${doc.id}`,
            severity: ev.status,
            title: `${documentTypeLabel(doc.docType)} — ${veh?.plate ?? ''}`,
            context: `${ev.label}${doc.amount > 0 ? ` · ${formatBRL(doc.amount)}` : ''}`,
            targetTab: 'documentos',
          });
        }
      });

    snapshot.drivers.forEach((drv) => {
      const cnh = evaluateCnhStatus(drv);
      if (cnh.status === 'VENCIDO' || cnh.status === 'ATENCAO') {
        items.push({
          id: `cnh-${drv.id}`,
          severity: cnh.status,
          title: `CNH — ${drv.name}`,
          context: `Categoria ${drv.cnhCategory} · ${cnh.label}`,
          targetTab: 'documentos',
        });
      }
      const ctb = evaluateDriverCtbPoints(drv, snapshot.fines ?? []);
      if (ctb.riskLevel !== 'OK') {
        items.push({
          id: `ctb-${drv.id}`,
          severity: ctb.riskLevel === 'SUSPENSAO' ? 'VENCIDO' : 'ATENCAO',
          title: `Pontuação CTB (${ctb.points12m}/${ctb.maxAllowedPoints} pts) — ${drv.name}`,
          context: `${ctb.gravissimaCount} gravíssima(s) nos últimos 12 meses`,
          targetTab: 'documentos',
        });
      }
    });

    (snapshot.fines ?? [])
      .filter((fn) => fn.status === 'PENDENTE' && (selectedVehicleFilter === 'TODOS' || fn.vehicleId === selectedVehicleFilter))
      .forEach((fn) => {
        const veh = vehicleMap.get(fn.vehicleId);
        const nic = evaluateFineNicAlert(fn);
        items.push({
          id: `fine-${fn.id}`,
          severity: nic.tier === 'VENCIDO' || nic.tier === 'D-2' ? 'VENCIDO' : 'ATENCAO',
          title: `Multa ${fn.infractionCode} · ${nic.label}`,
          context: `${veh?.plate ?? ''} · SNE ${formatBRL(getEffectiveFineAmount(fn))}`,
          targetTab: 'documentos',
        });
      });

    snapshot.checklists
      .filter((c) => c.hasIssues && (selectedVehicleFilter === 'TODOS' || c.vehicleId === selectedVehicleFilter))
      .slice(0, 2)
      .forEach((chk) => {
        const veh = vehicleMap.get(chk.vehicleId);
        const failedCount = chk.items.filter((i) => !i.compliant).length;
        items.push({
          id: `chk-${chk.id}`,
          severity: 'ATENCAO',
          title: `Checklist com ${failedCount} apontamento(s)`,
          context: `${veh?.plate ?? ''} · ${formatDateBR(chk.date)}`,
          targetTab: 'checklists',
        });
      });

    return items.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'VENCIDO' ? -1 : 1));
  }, [anomalies, snapshot.reminders, snapshot.documents, snapshot.drivers, snapshot.fines, snapshot.checklists, selectedVehicleFilter, vehicleMap]);

  const docComplianceSummary = useMemo(() => {
    const docs = (snapshot.documents ?? []).filter(
      (d) => selectedVehicleFilter === 'TODOS' || d.vehicleId === selectedVehicleFilter
    );
    const pendingDocs = docs.filter((d) => d.status === 'PENDENTE');
    const overdueCount =
      pendingDocs.filter((d) => evaluateDocumentStatus(d).status === 'VENCIDO').length +
      snapshot.drivers.filter((drv) => evaluateCnhStatus(drv).status === 'VENCIDO').length;
    const dueSoonCount =
      pendingDocs.filter((d) => evaluateDocumentStatus(d).status === 'ATENCAO').length +
      snapshot.drivers.filter((drv) => evaluateCnhStatus(drv).status === 'ATENCAO').length;
    const pendingFines = (snapshot.fines ?? []).filter(
      (f) => f.status === 'PENDENTE' && (selectedVehicleFilter === 'TODOS' || f.vehicleId === selectedVehicleFilter)
    );
    const totalPendingAmount =
      pendingDocs.reduce((s, d) => s + d.amount, 0) +
      pendingFines.reduce((s, f) => s + getEffectiveFineAmount(f), 0);

    return { overdueCount, dueSoonCount, pendingFinesCount: pendingFines.length, totalPendingAmount };
  }, [snapshot.documents, snapshot.drivers, snapshot.fines, selectedVehicleFilter]);

  const handleExportPdf = async () => {
    setExportingPdf(true);
    try {
      await downloadFleetReportPdf(snapshot, selectedVehicleFilter, period);
      toast.success('Relatório gerencial em PDF gerado.');
    } catch (err) {
      console.error(err);
      toast.error('Erro ao gerar o PDF.');
    } finally {
      setExportingPdf(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((n) => (
            <div
              key={n}
              className="h-32 bg-white border border-[#E7E1D5] rounded-[10px] animate-pulse"
            />
          ))}
        </div>
        <div className="h-80 bg-white border border-[#E7E1D5] rounded-[10px] animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Barra de Período, Resumo da Frota e Exportação PDF */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-xs text-[#5C6B7A]">
          <span className="font-medium text-[#0C1928]">
            {kpis.activeVehiclesCount} em operação
          </span>
          <span aria-hidden="true">·</span>
          <span>{kpis.maintenanceVehiclesCount} em manutenção</span>
          <span aria-hidden="true">·</span>
          <span>{snapshot.drivers.filter((d) => d.active).length} motoristas ativos</span>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="inline-flex items-center gap-1 p-1 bg-white border border-[#E7E1D5] rounded-lg">
            {(
              [
                { id: '30D', label: '30 dias' },
                { id: '90D', label: '90 dias' },
                { id: 'ANO', label: `Ano ${new Date().getFullYear()}` },
                { id: 'TODOS', label: 'Tudo' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setPeriod(opt.id)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                  period === opt.id
                    ? 'bg-[#173D4A] text-white'
                    : 'text-[#5C6B7A] hover:text-[#0C1928]'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={handleExportPdf}
            disabled={exportingPdf}
            className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg border border-[#E7E1D5] bg-white hover:bg-[#F7F8FA] text-xs font-medium text-[#0C1928] transition-colors whitespace-nowrap cursor-pointer disabled:opacity-60"
          >
            <FileText className="h-3.5 w-3.5 text-[#173D4A]" />
            <span>{exportingPdf ? 'Gerando PDF...' : 'Exportar PDF'}</span>
          </button>
        </div>
      </div>

      {/* 4 KPIs Principais */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-[#E7E1D5] rounded-[10px] p-5 flex flex-col justify-between gap-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#5C6B7A]">Custo Operacional</span>
            <Fuel className="h-4 w-4 text-[#173D4A]" />
          </div>
          <div>
            <p className="font-display text-2xl font-bold text-[#0C1928] font-mono-tabular">
              {formatBRL(kpis.totalCost)}
            </p>
            <p className="mt-1.5 text-xs text-[#5C6B7A] font-mono-tabular">
              Comb. {formatBRL(kpis.fuelCost)} · Manut. {formatBRL(kpis.maintenanceCost)}
            </p>
          </div>
        </div>

        <div className="bg-white border border-[#E7E1D5] rounded-[10px] p-5 flex flex-col justify-between gap-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#5C6B7A]">Custo por Quilômetro</span>
            <RouteIcon className="h-4 w-4 text-[#B99555]" />
          </div>
          <div>
            <p className="font-display text-2xl font-bold text-[#0C1928] font-mono-tabular">
              {kpis.costPerKm > 0 ? `${formatBRL(kpis.costPerKm)}/km` : '—'}
            </p>
            <p className="mt-1.5 text-xs text-[#5C6B7A] font-mono-tabular">
              Distância apurada: {formatKm(kpis.totalDistanceKm)}
            </p>
          </div>
        </div>

        <div className="bg-white border border-[#E7E1D5] rounded-[10px] p-5 flex flex-col justify-between gap-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#5C6B7A]">Média de Consumo</span>
            <Gauge className="h-4 w-4 text-[#173D4A]" />
          </div>
          <div>
            <p className="font-display text-2xl font-bold text-[#0C1928] font-mono-tabular">
              {kpis.avgConsumption > 0 ? `${formatNumberBR(kpis.avgConsumption, 2)} km/unid` : '—'}
            </p>
            <p className="mt-1.5 text-xs text-[#5C6B7A]">
              Calculado entre tanques cheios
            </p>
          </div>
        </div>

        <div className="bg-white border border-[#E7E1D5] rounded-[10px] p-5 flex flex-col justify-between gap-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#5C6B7A]">Saldo Operacional</span>
            {kpis.netBalance >= 0 ? (
              <ArrowUpRight className="h-4 w-4 text-[#2E6F5E]" />
            ) : (
              <ArrowDownRight className="h-4 w-4 text-[#9E3B3B]" />
            )}
          </div>
          <div>
            <p
              className={`font-display text-2xl font-bold font-mono-tabular ${
                kpis.netBalance >= 0 ? 'text-[#2E6F5E]' : 'text-[#9E3B3B]'
              }`}
            >
              {formatBRL(kpis.netBalance)}
            </p>
            <p className="mt-1.5 text-xs text-[#5C6B7A] font-mono-tabular">
              Receitas: {formatBRL(kpis.totalRevenue)}
            </p>
          </div>
        </div>
      </section>

      {/* Monitor Resumido de Documentação, CNH, IPVA, Seguro e Multas Anti-NIC */}
      <section className="bg-white border border-[#E7E1D5] rounded-[10px] px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <FileCheck2 className="h-5 w-5 text-[#173D4A] shrink-0 mt-0.5" />
          <div>
            <h2 className="font-display text-sm font-semibold text-[#0C1928]">
              Monitor de Documentação, Débitos & Anti-NIC (CNH, CRLV, IPVA, Seguros)
            </h2>
            <p className="text-xs text-[#5C6B7A] mt-0.5 font-mono-tabular">
              <strong className={docComplianceSummary.overdueCount > 0 ? 'text-[#9E3B3B]' : 'text-[#0C1928]'}>
                {docComplianceSummary.overdueCount} vencido(s)
              </strong>{' '}
              · {docComplianceSummary.dueSoonCount} a vencer em 30d · {docComplianceSummary.pendingFinesCount} multa(s) FICI · Total em aberto:{' '}
              <strong className="text-[#173D4A]">{formatBRL(docComplianceSummary.totalPendingAmount)}</strong>
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onNavigateTab('documentos')}
          className="h-9 px-4 rounded-lg border border-[#E7E1D5] bg-[#F7F8FA] hover:bg-[#E7E1D5]/40 text-xs font-medium text-[#173D4A] whitespace-nowrap shrink-0 cursor-pointer"
        >
          Abrir Painel Documentos & Débitos
        </button>
      </section>

      {/* Gráfico + Alertas (incluindo Anomalias de Consumo e Multas) */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <div className="lg:col-span-7 bg-white border border-[#E7E1D5] rounded-[10px] p-6 flex flex-col">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-5">
            <div>
              <h2 className="font-display text-base font-semibold text-[#0C1928]">
                Evolução Mensal de Custos e Receitas
              </h2>
              <p className="text-xs text-[#5C6B7A] mt-0.5">
                Distribuição entre abastecimento, manutenção, outras despesas/multas e fretes
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigateTab('lancamentos')}
              className="text-xs font-medium text-[#173D4A] hover:underline whitespace-nowrap"
            >
              Ver lançamentos
            </button>
          </div>

          <div className="flex-1 min-h-[280px] w-full">
            {chartData.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center py-12">
                <p className="text-sm font-medium text-[#0C1928]">
                  Nenhum lançamento financeiro no período
                </p>
                <p className="text-xs text-[#5C6B7A] mt-1 mb-4">
                  Registre abastecimentos ou manutenções para visualizar o comparativo mensal.
                </p>
                <button
                  type="button"
                  onClick={() => onOpenQuickEntry('ABASTECIMENTO')}
                  className="h-9 px-4 rounded-lg bg-[#173D4A] text-white text-xs font-medium"
                >
                  Registrar Primeiro Abastecimento
                </button>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={290}>
                <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E7E1D5" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fill: '#5C6B7A', fontSize: 12 }}
                    axisLine={{ stroke: '#E7E1D5' }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: '#5C6B7A', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(val) => `R$ ${val >= 1000 ? `${(val / 1000).toFixed(1)}k` : val}`}
                  />
                  <Tooltip
                    formatter={(value: unknown, name: unknown) => [
                      formatBRL(Number(value ?? 0)),
                      String(name),
                    ]}
                    contentStyle={{
                      backgroundColor: '#FFFFFF',
                      borderColor: '#E7E1D5',
                      borderRadius: '8px',
                      fontSize: '12px',
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '12px' }} />
                  <Bar
                    dataKey="abastecimento"
                    name="Abastecimento"
                    stackId="custos"
                    fill="#173D4A"
                  />
                  <Bar
                    dataKey="manutencao"
                    name="Manutenção"
                    stackId="custos"
                    fill="#B99555"
                  />
                  <Bar
                    dataKey="despesas"
                    name="Despesas e multas"
                    stackId="custos"
                    fill="#0C1928"
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar
                    dataKey="receitas"
                    name="Receitas"
                    fill="#2E6F5E"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="lg:col-span-5 bg-white border border-[#E7E1D5] rounded-[10px] p-6 flex flex-col">
          <div className="flex items-center justify-between gap-2 mb-4">
            <div>
              <h2 className="font-display text-base font-semibold text-[#0C1928]">
                Atenção Preventiva e Anomalias
              </h2>
              <p className="text-xs text-[#5C6B7A] mt-0.5">
                Quedas de km/L, revisões, CNH, multas e checklists
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigateTab('percursos')}
              className="text-xs font-medium text-[#173D4A] hover:underline whitespace-nowrap"
            >
              Gerenciar
            </button>
          </div>

          {activeAlerts.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center py-8">
              <CheckCircle2 className="h-8 w-8 text-[#2E6F5E] mb-2" />
              <p className="text-sm font-medium text-[#0C1928]">Frota 100% em conformidade</p>
              <p className="text-xs text-[#5C6B7A] mt-1">
                Nenhum vencimento próximo ou anomalia de consumo detectada.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-[#E7E1D5] flex-1">
              {activeAlerts.slice(0, 6).map((alert) => (
                <button
                  key={alert.id}
                  type="button"
                  onClick={() => onNavigateTab(alert.targetTab)}
                  className="w-full py-3 first:pt-1 last:pb-1 flex items-start justify-between gap-3 text-left hover:bg-[#F7F8FA] -mx-2 px-2 rounded-lg transition-colors"
                >
                  <div className="flex items-start gap-2.5 min-w-0">
                    {alert.severity === 'VENCIDO' ? (
                      <AlertTriangle className="h-4 w-4 text-[#9E3B3B] shrink-0 mt-0.5" />
                    ) : (
                      <Clock className="h-4 w-4 text-[#B99555] shrink-0 mt-0.5" />
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[#0C1928] truncate">{alert.title}</p>
                      <p className="text-xs text-[#5C6B7A] mt-0.5 truncate">{alert.context}</p>
                    </div>
                  </div>
                  <span
                    className={`text-xs font-semibold whitespace-nowrap shrink-0 ${
                      alert.severity === 'VENCIDO' ? 'text-[#9E3B3B]' : 'text-[#A66E1E]'
                    }`}
                  >
                    {alert.severity === 'VENCIDO' ? 'Crítico' : 'Atenção'}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Inteligência de Frota: TCO por Veículo + Calculadora Flex Real */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <div className="lg:col-span-8 bg-white border border-[#E7E1D5] rounded-[10px] overflow-hidden flex flex-col">
          <div className="px-6 py-4 border-b border-[#E7E1D5] flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-base font-semibold text-[#0C1928]">
                Custo Total de Propriedade (TCO) e Eficiência por Veículo
              </h2>
              <p className="text-xs text-[#5C6B7A] mt-0.5">
                Soma custos variáveis, custo fixo mensal e depreciação estimada pela Tabela FIPE
              </p>
            </div>
          </div>

          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#E7E1D5] bg-[#F7F8FA] text-[11px] font-semibold text-[#5C6B7A]">
                  <th className="py-2.5 px-4">Veículo</th>
                  <th className="py-2.5 px-4 text-right">Média</th>
                  <th className="py-2.5 px-4 text-right">Comb. / km</th>
                  <th className="py-2.5 px-4 text-right">Variáveis</th>
                  <th className="py-2.5 px-4 text-right">Fixo + Deprec.</th>
                  <th className="py-2.5 px-4 text-right">TCO Total / km</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E7E1D5] text-xs">
                {tcoRows.map((row) => {
                  const unit = getFuelUnit(row.fuelType);
                  return (
                    <tr key={row.vehicleId} className="hover:bg-[#F7F8FA] transition-colors">
                      <td className="py-3 px-4">
                        <span className="font-mono-tabular font-semibold text-[#173D4A]">
                          {row.plate}
                        </span>
                        <span className="text-[#0C1928] ml-2 font-medium">{row.model}</span>
                        <span className="text-[#5C6B7A] ml-2">
                          · {fuelTypeLabel(row.fuelType)}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-mono-tabular text-[#0C1928] whitespace-nowrap">
                        {row.avgConsumption
                          ? `${formatNumberBR(row.avgConsumption, 2)} km/${unit}`
                          : '—'}
                      </td>
                      <td className="py-3 px-4 text-right font-mono-tabular text-[#5C6B7A] whitespace-nowrap">
                        {row.fuelCostPerKm ? `${formatBRL(row.fuelCostPerKm)}` : '—'}
                      </td>
                      <td className="py-3 px-4 text-right font-mono-tabular text-[#0C1928] whitespace-nowrap">
                        {formatBRL(row.totalOperationalCost)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono-tabular text-[#5C6B7A] whitespace-nowrap">
                        {formatBRL(row.fixedAndDepreciationMonthly)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono-tabular font-semibold text-[#173D4A] whitespace-nowrap">
                        {row.tcoPerKm ? `${formatBRL(row.tcoPerKm)}/km` : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Calculadora Flex Real */}
        <div className="lg:col-span-4 bg-white border border-[#E7E1D5] rounded-[10px] p-6 flex flex-col justify-between gap-4">
          <div>
            <h2 className="font-display text-base font-semibold text-[#0C1928]">
              Comparativo Flex Real (Etanol × Gasolina)
            </h2>
            <p className="text-xs text-[#5C6B7A] mt-0.5">
              Baseado no rendimento histórico apurado na frota ({formatNumberBR(flexStats.avgEthKmL, 1)} vs{' '}
              {formatNumberBR(flexStats.avgGasKmL, 1)} km/L)
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-[#5C6B7A] mb-1">
                Gasolina (R$/L)
              </label>
              <input
                type="number"
                step="0.01"
                value={gasPriceInput}
                onChange={(e) => setGasPriceInput(e.target.value)}
                className="w-full h-9 rounded-lg border border-[#E7E1D5] px-2.5 text-sm font-mono-tabular"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-[#5C6B7A] mb-1">
                Etanol (R$/L)
              </label>
              <input
                type="number"
                step="0.01"
                value={ethPriceInput}
                onChange={(e) => setEthPriceInput(e.target.value)}
                className="w-full h-9 rounded-lg border border-[#E7E1D5] px-2.5 text-sm font-mono-tabular"
              />
            </div>
          </div>

          <div className="p-3.5 rounded-lg bg-[#F7F8FA] border border-[#E7E1D5] space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-[#5C6B7A]">Custo por km (Gasolina)</span>
              <span className="font-mono-tabular font-medium text-[#0C1928]">
                {formatBRL(flexStats.costPerKmGas)}/km
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[#5C6B7A]">Custo por km (Etanol)</span>
              <span className="font-mono-tabular font-medium text-[#0C1928]">
                {formatBRL(flexStats.costPerKmEth)}/km
              </span>
            </div>
            <div className="pt-2 border-t border-[#E7E1D5] flex items-center justify-between">
              <span className="text-[#0C1928] font-semibold">
                Melhor opção: {flexStats.winner === 'ETANOL' ? 'Etanol' : 'Gasolina'}
              </span>
              <span className="text-[11px] font-mono-tabular text-[#173D4A]">
                Paridade real: {formatNumberBR(flexStats.realRatio, 0)}%
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Linha do Tempo Unificada */}
      <section className="bg-white border border-[#E7E1D5] rounded-[10px] overflow-hidden">
        <div className="px-6 py-4 border-b border-[#E7E1D5] flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-semibold text-[#0C1928]">
              Linha do Tempo da Frota
            </h2>
            <p className="text-xs text-[#5C6B7A] mt-0.5">
              Movimentações recentes consolidadas em ordem cronológica
            </p>
          </div>
          <button
            type="button"
            onClick={() => onOpenQuickEntry('MANUTENCAO')}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-[#173D4A] hover:underline whitespace-nowrap"
          >
            <Wrench className="h-3.5 w-3.5" />
            <span>Lançar manutenção</span>
          </button>
        </div>

        {timeline.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-sm font-medium text-[#0C1928]">Nenhuma movimentação registrada</p>
            <p className="text-xs text-[#5C6B7A] mt-1">
              Use o botão Novo Registro no topo para iniciar o histórico.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[#E7E1D5]">
            {timeline.map((item) => {
              const veh = vehicleMap.get(item.vehicleId);
              return (
                <div
                  key={item.id}
                  className="px-6 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-[#F7F8FA] transition-colors"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-[#5C6B7A]">
                      <span className="font-mono-tabular">{formatDateBR(item.date)}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono-tabular font-semibold text-[#173D4A]">
                        {veh?.plate ?? 'Frota'}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{veh?.model ?? ''}</span>
                      {item.odometer ? (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono-tabular">{formatKm(item.odometer)}</span>
                        </>
                      ) : null}
                    </div>
                    <p className="text-sm font-medium text-[#0C1928] mt-0.5">{item.title}</p>
                    <p className="text-xs text-[#5C6B7A]">{item.subtitle}</p>
                  </div>

                  {typeof item.amount === 'number' && (
                    <div className="sm:text-right shrink-0">
                      <span
                        className={`text-sm font-semibold font-mono-tabular ${
                          item.isPositive ? 'text-[#2E6F5E]' : 'text-[#0C1928]'
                        }`}
                      >
                        {item.isPositive ? `+ ${formatBRL(item.amount)}` : `- ${formatBRL(item.amount)}`}
                      </span>
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
