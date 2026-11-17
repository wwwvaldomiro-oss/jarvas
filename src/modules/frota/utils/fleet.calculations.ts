import type {
  DocumentType,
  Driver,
  FineRecord,
  FleetReminder,
  FleetStateSnapshot,
  FuelType,
  FuelingRecord,
  RouteTrip,
  Vehicle,
  VehicleDocumentRecord,
  VehicleStatus,
} from '../types/fleet.types';

export function formatBRL(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatNumberBR(value: number, decimals = 1): string {
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

export function formatKm(odometer: number): string {
  return `${new Intl.NumberFormat('pt-BR').format(Math.round(odometer))} km`;
}

export function formatDateBR(isoDate: string): string {
  if (!isoDate) return '—';
  const [y, m, d] = isoDate.split('-');
  if (!y || !m || !d) return isoDate;
  return `${d}/${m}/${y}`;
}

export function getFuelUnit(fuelType: FuelType): 'L' | 'kWh' | 'm³' {
  if (fuelType === 'ELETRICO') return 'kWh';
  if (fuelType === 'GNV') return 'm³';
  return 'L';
}

export function fuelTypeLabel(fuelType: FuelType): string {
  const labels: Record<FuelType, string> = {
    GASOLINA: 'Gasolina',
    ETANOL: 'Etanol',
    DIESEL: 'Diesel S10',
    GNV: 'GNV',
    ELETRICO: 'Elétrico',
    FLEX: 'Flex',
  };
  return labels[fuelType];
}

export function vehicleStatusLabel(status: VehicleStatus): string {
  const labels: Record<VehicleStatus, string> = {
    ATIVO: 'Em operação',
    MANUTENCAO: 'Em manutenção',
    INATIVO: 'Inativo',
  };
  return labels[status];
}

/**
 * Calcula autonomia real (km/L ou km/kWh) estilo Drivvo:
 * considera intervalos entre abastecimentos de tanque cheio ("fullTank = true"),
 * somando eventuais abastecimentos parciais intermediários.
 */
export function recalculateFuelingAverages(fuelings: FuelingRecord[]): FuelingRecord[] {
  const byVehicle = new Map<string, FuelingRecord[]>();

  for (const record of fuelings) {
    const list = byVehicle.get(record.vehicleId) ?? [];
    list.push({ ...record, calculatedAvg: undefined });
    byVehicle.set(record.vehicleId, list);
  }

  const result: FuelingRecord[] = [];

  for (const [, records] of byVehicle.entries()) {
    records.sort((a, b) => {
      if (a.odometer !== b.odometer) return a.odometer - b.odometer;
      return a.date.localeCompare(b.date);
    });

    let lastFullOdometer: number | null = null;
    let accumulatedQuantity = 0;

    for (const item of records) {
      if (lastFullOdometer === null) {
        if (item.fullTank) {
          lastFullOdometer = item.odometer;
          accumulatedQuantity = 0;
        }
        result.push(item);
        continue;
      }

      accumulatedQuantity += item.quantity;

      if (item.fullTank) {
        const deltaKm = item.odometer - lastFullOdometer;
        if (deltaKm > 0 && accumulatedQuantity > 0) {
          item.calculatedAvg = Number((deltaKm / accumulatedQuantity).toFixed(2));
        }
        lastFullOdometer = item.odometer;
        accumulatedQuantity = 0;
      }

      result.push(item);
    }
  }

  return result.sort((a, b) => {
    const dateDiff = b.date.localeCompare(a.date);
    if (dateDiff !== 0) return dateDiff;
    return b.odometer - a.odometer;
  });
}

export interface ConsumptionAnomaly {
  fuelingId: string;
  vehicleId: string;
  date: string;
  odometer: number;
  actualAvg: number;
  baselineAvg: number;
  dropPercent: number;
  fuelType: FuelType;
}

/**
 * Detecta quedas de rendimento >= thresholdPercent (padrão 15%) em relação à média
 * histórica do próprio veículo.
 */
export function detectConsumptionAnomalies(
  fuelings: FuelingRecord[],
  vehicleFilter = 'TODOS',
  thresholdPercent = 15
): ConsumptionAnomaly[] {
  const byVehicle = new Map<string, FuelingRecord[]>();

  for (const f of fuelings) {
    if (vehicleFilter !== 'TODOS' && f.vehicleId !== vehicleFilter) continue;
    if (typeof f.calculatedAvg === 'number' && f.calculatedAvg > 0) {
      const list = byVehicle.get(f.vehicleId) ?? [];
      list.push(f);
      byVehicle.set(f.vehicleId, list);
    }
  }

  const anomalies: ConsumptionAnomaly[] = [];

  for (const [vehicleId, records] of byVehicle.entries()) {
    if (records.length < 2) continue;

    for (const current of records) {
      const others = records.filter((r) => r.id !== current.id && r.fuelType === current.fuelType);
      if (others.length === 0) continue;

      const baselineAvg =
        others.reduce((acc, r) => acc + (r.calculatedAvg ?? 0), 0) / others.length;
      if (baselineAvg <= 0 || !current.calculatedAvg) continue;

      const dropPercent = ((baselineAvg - current.calculatedAvg) / baselineAvg) * 100;
      if (dropPercent >= thresholdPercent) {
        anomalies.push({
          fuelingId: current.id,
          vehicleId,
          date: current.date,
          odometer: current.odometer,
          actualAvg: current.calculatedAvg,
          baselineAvg: Number(baselineAvg.toFixed(2)),
          dropPercent: Number(dropPercent.toFixed(1)),
          fuelType: current.fuelType,
        });
      }
    }
  }

  return anomalies.sort((a, b) => b.date.localeCompare(a.date));
}

export type PeriodFilter = '30D' | '90D' | 'ANO' | 'TODOS';

export function filterDateByPeriod(isoDate: string, period: PeriodFilter, refDate = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })): boolean {
  if (period === 'TODOS') return true;
  const target = new Date(`${isoDate}T12:00:00`);
  const ref = new Date(`${refDate}T12:00:00`);
  if (Number.isNaN(target.getTime())) return true;

  if (period === 'ANO') {
    return target.getFullYear() === ref.getFullYear();
  }
  const days = period === '30D' ? 30 : 90;
  const diffMs = ref.getTime() - target.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  return diffDays >= -7 && diffDays <= days;
}

export interface FleetKpiSummary {
  totalCost: number;
  fuelCost: number;
  maintenanceCost: number;
  otherExpenseCost: number;
  finesCost: number;
  totalRevenue: number;
  netBalance: number;
  totalDistanceKm: number;
  costPerKm: number;
  avgConsumption: number;
  activeVehiclesCount: number;
  maintenanceVehiclesCount: number;
}

export function computeFleetKpis(
  snapshot: FleetStateSnapshot,
  vehicleFilter: string,
  period: PeriodFilter
): FleetKpiSummary {
  const matchVehicle = (vId: string) => vehicleFilter === 'TODOS' || vId === vehicleFilter;

  const fuelings = snapshot.fuelings.filter(
    (f) => matchVehicle(f.vehicleId) && filterDateByPeriod(f.date, period)
  );
  const maintenances = snapshot.maintenances.filter(
    (m) => matchVehicle(m.vehicleId) && filterDateByPeriod(m.date, period)
  );
  const ledger = snapshot.ledger.filter(
    (l) => matchVehicle(l.vehicleId) && filterDateByPeriod(l.date, period)
  );
  const fines = (snapshot.fines ?? []).filter(
    (fn) => matchVehicle(fn.vehicleId) && filterDateByPeriod(fn.date, period) && fn.status !== 'RECORRIDA'
  );
  const routes = snapshot.routes.filter(
    (r) => matchVehicle(r.vehicleId) && filterDateByPeriod(r.date, period)
  );

  const fuelCost = fuelings.reduce((acc, f) => acc + f.totalCost, 0);
  const maintenanceCost = maintenances.reduce((acc, m) => acc + m.totalCost, 0);
  const finesCost = fines.reduce(
    (acc, fn) => acc + (fn.sneDiscountApplied ? fn.amount * 0.6 : fn.amount),
    0
  );
  const otherExpenseCost =
    ledger.filter((l) => l.kind === 'DESPESA').reduce((acc, l) => acc + l.amount, 0) + finesCost;
  const totalRevenue = ledger
    .filter((l) => l.kind === 'RECEITA')
    .reduce((acc, l) => acc + l.amount, 0);

  const totalCost = fuelCost + maintenanceCost + otherExpenseCost;
  const netBalance = totalRevenue - totalCost;

  const odometersByVehicle = new Map<string, number[]>();
  const pushOdometer = (vId: string, odo: number) => {
    if (odo <= 0) return;
    const arr = odometersByVehicle.get(vId) ?? [];
    arr.push(odo);
    odometersByVehicle.set(vId, arr);
  };

  fuelings.forEach((f) => pushOdometer(f.vehicleId, f.odometer));
  maintenances.forEach((m) => pushOdometer(m.vehicleId, m.odometer));
  routes.forEach((r) => {
    pushOdometer(r.vehicleId, r.startOdometer);
    pushOdometer(r.vehicleId, r.endOdometer);
  });

  let totalDistanceKm = 0;
  for (const [, odos] of odometersByVehicle.entries()) {
    if (odos.length >= 2) {
      totalDistanceKm += Math.max(...odos) - Math.min(...odos);
    }
  }
  if (totalDistanceKm === 0 && routes.length > 0) {
    totalDistanceKm = routes.reduce((acc, r) => acc + r.distanceKm, 0);
  }

  const costPerKm = totalDistanceKm > 0 ? totalCost / totalDistanceKm : 0;

  const validAvgs = fuelings
    .map((f) => f.calculatedAvg)
    .filter((v): v is number => typeof v === 'number' && v > 0);
  const avgConsumption =
    validAvgs.length > 0 ? validAvgs.reduce((a, b) => a + b, 0) / validAvgs.length : 0;

  const filteredVehicles = snapshot.vehicles.filter((v) => matchVehicle(v.id));

  return {
    totalCost,
    fuelCost,
    maintenanceCost,
    otherExpenseCost,
    finesCost,
    totalRevenue,
    netBalance,
    totalDistanceKm,
    costPerKm,
    avgConsumption,
    activeVehiclesCount: filteredVehicles.filter((v) => v.status === 'ATIVO').length,
    maintenanceVehiclesCount: filteredVehicles.filter((v) => v.status === 'MANUTENCAO').length,
  };
}

export interface VehicleTcoRow {
  vehicleId: string;
  plate: string;
  model: string;
  fuelType: FuelType;
  distanceKm: number;
  avgConsumption: number | null;
  fuelCost: number;
  maintenanceCost: number;
  otherCost: number;
  fixedAndDepreciationMonthly: number;
  totalOperationalCost: number;
  totalTcoCost: number;
  fuelCostPerKm: number | null;
  tcoPerKm: number | null;
  fipeValue?: number | undefined;
}

/**
 * Calcula TCO (Total Cost of Ownership) por veículo unindo custos variáveis
 * (combustível, manutenção, despesas, multas) + custo fixo/depreciação mensal estimada (1% a.m. FIPE se não informado).
 */
export function computeVehicleTcoSummary(
  snapshot: FleetStateSnapshot,
  vehicleFilter = 'TODOS'
): VehicleTcoRow[] {
  return snapshot.vehicles
    .filter((v) => vehicleFilter === 'TODOS' || v.id === vehicleFilter)
    .map((v) => {
      const vFuel = snapshot.fuelings.filter((f) => f.vehicleId === v.id);
      const vMaint = snapshot.maintenances.filter((m) => m.vehicleId === v.id);
      const vExp = snapshot.ledger.filter((l) => l.vehicleId === v.id && l.kind === 'DESPESA');
      const vFines = (snapshot.fines ?? []).filter(
        (fn) => fn.vehicleId === v.id && fn.status !== 'RECORRIDA'
      );
      const vRoutes = snapshot.routes.filter((r) => r.vehicleId === v.id);

      const fuelCost = vFuel.reduce((s, f) => s + f.totalCost, 0);
      const maintenanceCost = vMaint.reduce((s, m) => s + m.totalCost, 0);
      const finesCost = vFines.reduce(
        (s, fn) => s + (fn.sneDiscountApplied ? fn.amount * 0.6 : fn.amount),
        0
      );
      const otherCost = vExp.reduce((s, e) => s + e.amount, 0) + finesCost;

      const odos: number[] = [];
      vFuel.forEach((f) => odos.push(f.odometer));
      vMaint.forEach((m) => odos.push(m.odometer));
      vRoutes.forEach((r) => {
        odos.push(r.startOdometer, r.endOdometer);
      });

      let distanceKm = odos.length >= 2 ? Math.max(...odos) - Math.min(...odos) : 0;
      if (distanceKm === 0 && vRoutes.length > 0) {
        distanceKm = vRoutes.reduce((s, r) => s + r.distanceKm, 0);
      }

      const avgs = vFuel
        .map((f) => f.calculatedAvg)
        .filter((n): n is number => typeof n === 'number' && n > 0);
      const avgConsumption =
        avgs.length > 0 ? Number((avgs.reduce((a, b) => a + b, 0) / avgs.length).toFixed(2)) : null;

      const estimatedDepreciation = v.fipeValue ? v.fipeValue * 0.0085 : 0;
      const fixedAndDepreciationMonthly = Number(
        ((v.monthlyFixedCost ?? 0) + estimatedDepreciation).toFixed(2)
      );

      const totalOperationalCost = fuelCost + maintenanceCost + otherCost;
      const totalTcoCost = totalOperationalCost + fixedAndDepreciationMonthly;

      return {
        vehicleId: v.id,
        plate: v.plate,
        model: `${v.brand} ${v.model}`,
        fuelType: v.fuelType,
        distanceKm,
        avgConsumption,
        fuelCost,
        maintenanceCost,
        otherCost,
        fixedAndDepreciationMonthly,
        totalOperationalCost,
        totalTcoCost,
        fuelCostPerKm: distanceKm > 0 ? fuelCost / distanceKm : null,
        tcoPerKm: distanceKm > 0 ? totalTcoCost / distanceKm : null,
        fipeValue: v.fipeValue,
      };
    });
}

export interface MonthlyChartDatum {
  monthKey: string;
  label: string;
  abastecimento: number;
  manutencao: number;
  despesas: number;
  receitas: number;
}

const MONTH_NAMES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

export function buildMonthlyCostSeries(
  snapshot: FleetStateSnapshot,
  vehicleFilter: string
): MonthlyChartDatum[] {
  const matchVehicle = (vId: string) => vehicleFilter === 'TODOS' || vId === vehicleFilter;
  const buckets = new Map<string, MonthlyChartDatum>();

  const ensureBucket = (isoDate: string) => {
    const key = isoDate.slice(0, 7);
    const existing = buckets.get(key);
    if (existing) return existing;
    const [y = '0000', m = '01'] = key.split('-');
    const monthIdx = Math.max(0, Math.min(11, Number(m) - 1));
    const created: MonthlyChartDatum = {
      monthKey: key,
      label: `${MONTH_NAMES[monthIdx]}/${y.slice(2)}`,
      abastecimento: 0,
      manutencao: 0,
      despesas: 0,
      receitas: 0,
    };
    buckets.set(key, created);
    return created;
  };

  snapshot.fuelings
    .filter((f) => matchVehicle(f.vehicleId))
    .forEach((f) => {
      ensureBucket(f.date).abastecimento += f.totalCost;
    });

  snapshot.maintenances
    .filter((m) => matchVehicle(m.vehicleId))
    .forEach((m) => {
      ensureBucket(m.date).manutencao += m.totalCost;
    });

  snapshot.ledger
    .filter((l) => matchVehicle(l.vehicleId))
    .forEach((l) => {
      const b = ensureBucket(l.date);
      if (l.kind === 'DESPESA') b.despesas += l.amount;
      else b.receitas += l.amount;
    });

  (snapshot.fines ?? [])
    .filter((fn) => matchVehicle(fn.vehicleId) && fn.status !== 'RECORRIDA')
    .forEach((fn) => {
      const cost = fn.sneDiscountApplied ? fn.amount * 0.6 : fn.amount;
      ensureBucket(fn.date).despesas += cost;
    });

  return Array.from(buckets.values())
    .sort((a, b) => a.monthKey.localeCompare(b.monthKey))
    .slice(-6)
    .map((d) => ({
      ...d,
      abastecimento: Number(d.abastecimento.toFixed(2)),
      manutencao: Number(d.manutencao.toFixed(2)),
      despesas: Number(d.despesas.toFixed(2)),
      receitas: Number(d.receitas.toFixed(2)),
    }));
}

export interface TimelineEntry {
  id: string;
  date: string;
  vehicleId: string;
  kind: 'ABASTECIMENTO' | 'MANUTENCAO' | 'DESPESA' | 'RECEITA' | 'CHECKLIST' | 'PERCURSO' | 'MULTA';
  title: string;
  subtitle: string;
  amount?: number | undefined;
  isPositive?: boolean | undefined;
  odometer?: number | undefined;
}

export function buildUnifiedTimeline(
  snapshot: FleetStateSnapshot,
  vehicleFilter: string
): TimelineEntry[] {
  const matchVehicle = (vId: string) => vehicleFilter === 'TODOS' || vId === vehicleFilter;
  const items: TimelineEntry[] = [];

  snapshot.fuelings
    .filter((f) => matchVehicle(f.vehicleId))
    .forEach((f) => {
      items.push({
        id: `fuel-${f.id}`,
        date: f.date,
        vehicleId: f.vehicleId,
        kind: 'ABASTECIMENTO',
        title: `${fuelTypeLabel(f.fuelType)} · ${formatNumberBR(f.quantity, 1)} ${getFuelUnit(f.fuelType)}`,
        subtitle: f.stationName
          ? `${f.stationName}${f.calculatedAvg ? ` · ${formatNumberBR(f.calculatedAvg, 2)} km/${getFuelUnit(f.fuelType)}` : ''}`
          : 'Abastecimento registrado',
        amount: f.totalCost,
        isPositive: false,
        odometer: f.odometer,
      });
    });

  snapshot.maintenances
    .filter((m) => matchVehicle(m.vehicleId))
    .forEach((m) => {
      items.push({
        id: `maint-${m.id}`,
        date: m.date,
        vehicleId: m.vehicleId,
        kind: 'MANUTENCAO',
        title: `${m.category} (${m.type === 'PREVENTIVA' ? 'Preventiva' : 'Corretiva'})`,
        subtitle: m.providerName || 'Oficina credenciada',
        amount: m.totalCost,
        isPositive: false,
        odometer: m.odometer,
      });
    });

  snapshot.ledger
    .filter((l) => matchVehicle(l.vehicleId))
    .forEach((l) => {
      items.push({
        id: `led-${l.id}`,
        date: l.date,
        vehicleId: l.vehicleId,
        kind: l.kind,
        title: l.category,
        subtitle: l.description || (l.kind === 'RECEITA' ? 'Receita operacional' : 'Despesa lançada'),
        amount: l.amount,
        isPositive: l.kind === 'RECEITA',
      });
    });

  (snapshot.fines ?? [])
    .filter((fn) => matchVehicle(fn.vehicleId))
    .forEach((fn) => {
      const effectiveAmount = fn.sneDiscountApplied ? fn.amount * 0.6 : fn.amount;
      items.push({
        id: `fine-${fn.id}`,
        date: fn.date,
        vehicleId: fn.vehicleId,
        kind: 'MULTA',
        title: `Infração ${fn.infractionCode} (${fn.points} pts)`,
        subtitle: fn.description,
        amount: effectiveAmount,
        isPositive: false,
      });
    });

  snapshot.routes
    .filter((r) => matchVehicle(r.vehicleId))
    .forEach((r) => {
      items.push({
        id: `route-${r.id}`,
        date: r.date,
        vehicleId: r.vehicleId,
        kind: 'PERCURSO',
        title: `${r.origin} → ${r.destination}`,
        subtitle: `${formatNumberBR(r.distanceKm, 0)} km percorridos`,
        odometer: r.endOdometer,
      });
    });

  snapshot.checklists
    .filter((c) => matchVehicle(c.vehicleId))
    .forEach((c) => {
      items.push({
        id: `chk-${c.id}`,
        date: c.date,
        vehicleId: c.vehicleId,
        kind: 'CHECKLIST',
        title: c.hasIssues ? 'Checklist com não conformidade' : 'Checklist pré-viagem aprovado',
        subtitle: `${c.items.filter((i) => i.compliant).length}/${c.items.length} itens conformes`,
        odometer: c.odometer,
      });
    });

  return items.sort((a, b) => b.date.localeCompare(a.date));
}

export type AlertSeverity = 'VENCIDO' | 'ATENCAO' | 'EM_DIA' | 'CONCLUIDO';

export function evaluateReminderStatus(
  reminder: FleetReminder,
  vehicle: Vehicle | undefined,
  todayIso = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
): { status: AlertSeverity; reason: string } {
  if (reminder.completed) {
    return { status: 'CONCLUIDO', reason: 'Concluído' };
  }

  const todayMs = new Date(`${todayIso}T12:00:00`).getTime();
  let isOverdue = false;
  let isSoon = false;
  const reasons: string[] = [];

  if (reminder.dueDate) {
    const dueMs = new Date(`${reminder.dueDate}T12:00:00`).getTime();
    const diffDays = Math.ceil((dueMs - todayMs) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) {
      isOverdue = true;
      reasons.push(`Vencido há ${Math.abs(diffDays)} dias`);
    } else if (diffDays <= 20) {
      isSoon = true;
      reasons.push(`Vence em ${diffDays} dias`);
    } else {
      reasons.push(`Previsto ${formatDateBR(reminder.dueDate)}`);
    }
  }

  if (reminder.dueOdometer && vehicle) {
    const remainingKm = reminder.dueOdometer - vehicle.currentOdometer;
    if (remainingKm <= 0) {
      isOverdue = true;
      reasons.push(`Excedido em ${formatNumberBR(Math.abs(remainingKm), 0)} km`);
    } else if (remainingKm <= 1200) {
      isSoon = true;
      reasons.push(`Faltam ${formatNumberBR(remainingKm, 0)} km`);
    } else {
      reasons.push(`Aos ${formatKm(reminder.dueOdometer)}`);
    }
  }

  if (isOverdue) return { status: 'VENCIDO', reason: reasons.join(' · ') };
  if (isSoon) return { status: 'ATENCAO', reason: reasons.join(' · ') };
  return { status: 'EM_DIA', reason: reasons.join(' · ') || 'Programado' };
}

export function evaluateCnhStatus(
  driver: Driver,
  todayIso = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
): { status: AlertSeverity; label: string } {
  const todayMs = new Date(`${todayIso}T12:00:00`).getTime();
  const expMs = new Date(`${driver.cnhExpiry}T12:00:00`).getTime();
  const diffDays = Math.ceil((expMs - todayMs) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return { status: 'VENCIDO', label: `Vencida há ${Math.abs(diffDays)}d` };
  }
  if (diffDays <= 30) {
    return { status: 'ATENCAO', label: `Vence em ${diffDays}d` };
  }
  return { status: 'EM_DIA', label: `Válida até ${formatDateBR(driver.cnhExpiry)}` };
}

export interface ParsedNfceData {
  nfceKey: string;
  totalCost?: number | undefined;
  date?: string | undefined;
  stationName?: string | undefined;
}

/**
 * Extrai chave, data e valor de URLs/payloads QR Code de NFC-e (SEFAZ) ou chave de acesso de 44 dígitos.
 */
export function parseNfceQrPayload(rawInput: string): ParsedNfceData | null {
  const text = rawInput.trim();
  if (!text) return null;

  // Tenta extrair parâmetros de URL SEFAZ (ex: ?p=352611...|2|1|1|...&vNF=289.40&dhEmi=2026-11-17&xNome=Posto...)
  try {
    if (text.includes('?') || text.includes('=')) {
      const queryPart = text.includes('?') ? text.split('?')[1] : text;
      const params = new URLSearchParams(queryPart);
      const pParam = params.get('p') ?? '';
      const keyMatch = (pParam || text).match(/\b\d{44}\b/);
      const vNfRaw = params.get('vNF') ?? params.get('valor') ?? params.get('v');
      const dateRaw = params.get('dhEmi') ?? params.get('data');
      const stationRaw = params.get('xNome') ?? params.get('posto');

      const totalCost = vNfRaw ? Number(vNfRaw.replace(',', '.')) : undefined;
      const dateMatch = dateRaw?.match(/\d{4}-\d{2}-\d{2}/);

      if (keyMatch || (totalCost && !Number.isNaN(totalCost))) {
        return {
          nfceKey: keyMatch ? keyMatch[0] : pParam.split('|')[0] || text.slice(0, 44),
          totalCost: totalCost && totalCost > 0 ? totalCost : undefined,
          date: dateMatch ? dateMatch[0] : undefined,
          stationName: stationRaw ? decodeURIComponent(stationRaw) : undefined,
        };
      }
    }
  } catch {
    // Fallback para regex direta
  }

  const directKey = text.match(/\b\d{44}\b/);
  if (directKey) {
    return { nfceKey: directKey[0] };
  }

  return null;
}

/**
 * Cruza histórico de percursos, abastecimentos e titularidade para identificar
 * o condutor provável na data da infração.
 */
export function suggestDriverForDate(
  snapshot: FleetStateSnapshot,
  vehicleId: string,
  isoDate: string
): string | undefined {
  const routeMatch = snapshot.routes.find(
    (r) => r.vehicleId === vehicleId && r.date === isoDate
  );
  if (routeMatch) return routeMatch.driverId;

  const fuelingMatch = snapshot.fuelings.find(
    (f) => f.vehicleId === vehicleId && f.date === isoDate
  );
  if (fuelingMatch) return fuelingMatch.driverId;

  const vehicle = snapshot.vehicles.find((v) => v.id === vehicleId);
  return vehicle?.assignedDriverId;
}

export function computeRouteAudit(route: RouteTrip): {
  deltaKm: number;
  deltaPercent: number;
  flagged: boolean;
} | null {
  if (!route.estimatedKm || route.estimatedKm <= 0) return null;
  const deltaKm = Number((route.distanceKm - route.estimatedKm).toFixed(1));
  const deltaPercent = Number(((deltaKm / route.estimatedKm) * 100).toFixed(1));
  return {
    deltaKm,
    deltaPercent,
    flagged: Math.abs(deltaPercent) >= 15,
  };
}

export function getEffectiveFineAmount(fine: FineRecord): number {
  return fine.sneDiscountApplied ? Number((fine.amount * 0.6).toFixed(2)) : fine.amount;
}

export function exportRowsToCsv(filename: string, headers: string[], rows: (string | number)[][]): void {
  const escapeCell = (val: string | number) => {
    const str = String(val ?? '');
    if (str.includes(';') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const csvContent =
    '\uFEFF' +
    [headers.map(escapeCell).join(';'), ...rows.map((r) => r.map(escapeCell).join(';'))].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function documentTypeLabel(docType: DocumentType): string {
  const map: Record<DocumentType, string> = {
    CRLV: 'Licenciamento (CRLV-e)',
    IPVA: 'IPVA',
    SEGURO: 'Seguro',
    VISTORIA: 'Vistoria / ANTT',
  };
  return map[docType];
}

export interface PlateDueCalendarInfo {
  finalDigit: number;
  stateUf: string;
  crlvDueDate: string;
  crlvMonthLabel: string;
  ipvaDueDate: string;
  ipvaMonthLabel: string;
}

const MONTH_NAMES_PT = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

function lastDayOfMonthIso(year: number, month1To12: number): string {
  const dt = new Date(year, month1To12, 0);
  const mm = String(month1To12).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

/**
 * Calcula vencimento oficial de Licenciamento (CRLV-e) e IPVA a partir do último dígito da placa e UF.
 * Padrão SP (Portaria Detran-SP): finais 1-2 Jul, 3-4 Ago, 5-6 Set, 7-8 Out, 9 Nov, 0 Dez.
 * Outras UFs seguem calendário escalonado padrão nacional (Set–Dez) como referência operacional.
 */
export function getLicensePlateDueInfo(
  plate: string,
  stateUf = 'SP',
  exerciseYear = 2026
): PlateDueCalendarInfo {
  const digits = plate.replace(/\D/g, '');
  const finalDigit = digits.length > 0 ? Number(digits[digits.length - 1]) : 0;
  const uf = (stateUf || 'SP').toUpperCase();

  let crlvMonth = 12;
  if (uf === 'SP') {
    if (finalDigit === 1 || finalDigit === 2) crlvMonth = 7;
    else if (finalDigit === 3 || finalDigit === 4) crlvMonth = 8;
    else if (finalDigit === 5 || finalDigit === 6) crlvMonth = 9;
    else if (finalDigit === 7 || finalDigit === 8) crlvMonth = 10;
    else if (finalDigit === 9) crlvMonth = 11;
    else crlvMonth = 12;
  } else {
    if (finalDigit >= 1 && finalDigit <= 3) crlvMonth = 9;
    else if (finalDigit >= 4 && finalDigit <= 6) crlvMonth = 10;
    else if (finalDigit >= 7 && finalDigit <= 8) crlvMonth = 11;
    else crlvMonth = 12;
  }

  // IPVA Cota Única / Vencimento por final de placa (Jan/Fev)
  const ipvaMonth = finalDigit >= 1 && finalDigit <= 5 ? 1 : 2;
  const ipvaDay = finalDigit === 0 ? 24 : 10 + finalDigit;
  const ipvaDueDate = `${exerciseYear}-${String(ipvaMonth).padStart(2, '0')}-${String(ipvaDay).padStart(2, '0')}`;

  return {
    finalDigit,
    stateUf: uf,
    crlvDueDate: lastDayOfMonthIso(exerciseYear, crlvMonth),
    crlvMonthLabel: `${MONTH_NAMES_PT[crlvMonth - 1]}/${exerciseYear}`,
    ipvaDueDate,
    ipvaMonthLabel: `${MONTH_NAMES_PT[ipvaMonth - 1]}/${exerciseYear}`,
  };
}

export function evaluateDocumentStatus(
  doc: VehicleDocumentRecord,
  todayIso = new Date().toLocaleDateString('en-CA', {timeZone:'America/Sao_Paulo'})
): { status: 'PAGO' | AlertSeverity; daysDiff: number; label: string } {
  if (doc.status === 'PAGO' || doc.status === 'ISENTO') {
    return {
      status: 'PAGO',
      daysDiff: 999,
      label: doc.status === 'ISENTO' ? 'Isento' : 'Quitado',
    };
  }

  const todayMs = new Date(`${todayIso}T12:00:00`).getTime();
  const dueMs = new Date(`${doc.dueDate}T12:00:00`).getTime();
  const daysDiff = Math.ceil((dueMs - todayMs) / (1000 * 60 * 60 * 24));

  if (daysDiff < 0) {
    return {
      status: 'VENCIDO',
      daysDiff,
      label: `Vencido há ${Math.abs(daysDiff)}d`,
    };
  }
  if (daysDiff <= 30) {
    return {
      status: 'ATENCAO',
      daysDiff,
      label: daysDiff === 0 ? 'Vence hoje' : `Vence em ${daysDiff}d`,
    };
  }
  return {
    status: 'EM_DIA',
    daysDiff,
    label: `Vence ${formatDateBR(doc.dueDate)}`,
  };
}

export interface DriverCtbPointsSummary {
  driverId: string;
  points12m: number;
  gravissimaCount: number;
  maxAllowedPoints: 20 | 30 | 40;
  riskLevel: 'OK' | 'ATENCAO' | 'SUSPENSAO';
  activeFinesCount: number;
}

/**
 * Motor CTB Art. 261 (Pontuação em 12 meses):
 * - 0 infrações gravíssimas (7 pts): limite 40 pontos
 * - 1 infração gravíssima (7 pts): limite 30 pontos
 * - 2+ infrações gravíssimas: limite 20 pontos
 */
export function evaluateDriverCtbPoints(
  driver: Driver,
  fines: FineRecord[],
  todayIso = new Date().toLocaleDateString('en-CA', {timeZone:'America/Sao_Paulo'})
): DriverCtbPointsSummary {
  const todayMs = new Date(`${todayIso}T12:00:00`).getTime();
  const oneYearMs = 365 * 24 * 60 * 60 * 1000;

  const trailingFines = fines.filter((fn) => {
    if (fn.driverId !== driver.id || fn.status === 'RECORRIDA') return false;
    const fineMs = new Date(`${fn.date}T12:00:00`).getTime();
    return todayMs - fineMs <= oneYearMs && fineMs <= todayMs + 7 * 24 * 60 * 60 * 1000;
  });

  const points12m = trailingFines.reduce((sum, fn) => sum + (fn.points || 0), 0);
  const gravissimaCount = trailingFines.filter((fn) => fn.points >= 7).length;
  const maxAllowedPoints: 20 | 30 | 40 =
    gravissimaCount >= 2 ? 20 : gravissimaCount === 1 ? 30 : 40;

  let riskLevel: 'OK' | 'ATENCAO' | 'SUSPENSAO' = 'OK';
  if (points12m >= maxAllowedPoints) {
    riskLevel = 'SUSPENSAO';
  } else if (points12m >= maxAllowedPoints * 0.7) {
    riskLevel = 'ATENCAO';
  }

  return {
    driverId: driver.id,
    points12m,
    gravissimaCount,
    maxAllowedPoints,
    riskLevel,
    activeFinesCount: trailingFines.length,
  };
}

export type NicAlertTier = 'NONE' | 'NO_PRAZO' | 'D-10' | 'D-5' | 'D-2' | 'VENCIDO';

export function evaluateFineNicAlert(
  fine: FineRecord,
  todayIso = new Date().toLocaleDateString('en-CA', {timeZone:'America/Sao_Paulo'})
): { tier: NicAlertTier; daysLeft: number | null; label: string } {
  if (fine.status !== 'PENDENTE' || !fine.driverIndicationDeadline) {
    return { tier: 'NONE', daysLeft: null, label: 'Sem pendência FICI' };
  }

  const todayMs = new Date(`${todayIso}T12:00:00`).getTime();
  const deadlineMs = new Date(`${fine.driverIndicationDeadline}T12:00:00`).getTime();
  const daysLeft = Math.ceil((deadlineMs - todayMs) / (1000 * 60 * 60 * 24));

  if (daysLeft < 0) {
    return {
      tier: 'VENCIDO',
      daysLeft,
      label: `Prazo FICI vencido há ${Math.abs(daysLeft)}d (risco NIC)`,
    };
  }
  if (daysLeft <= 2) {
    return {
      tier: 'D-2',
      daysLeft,
      label: daysLeft === 0 ? 'FICI vence HOJE (D-2)' : `FICI em ${daysLeft}d (Crítico D-2)`,
    };
  }
  if (daysLeft <= 5) {
    return {
      tier: 'D-5',
      daysLeft,
      label: `FICI em ${daysLeft}d (Urgente D-5)`,
    };
  }
  if (daysLeft <= 10) {
    return {
      tier: 'D-10',
      daysLeft,
      label: `FICI em ${daysLeft}d (Atenção D-10)`,
    };
  }
  return {
    tier: 'NO_PRAZO',
    daysLeft,
    label: `Indicar até ${formatDateBR(fine.driverIndicationDeadline)}`,
  };
}

export function checkDriverAndVehicleOperationLock(
  vehicle: Vehicle | undefined,
  driver: Driver | undefined,
  snapshot: FleetStateSnapshot,
  todayIso = new Date().toLocaleDateString('en-CA', {timeZone:'America/Sao_Paulo'})
): { blocked: boolean; reasons: string[] } {
  const reasons: string[] = [];

  if (driver) {
    const cnh = evaluateCnhStatus(driver, todayIso);
    if (cnh.status === 'VENCIDO') {
      reasons.push(`CNH de ${driver.name} vencida (${cnh.label}).`);
    }
    const ctb = evaluateDriverCtbPoints(driver, snapshot.fines ?? [], todayIso);
    if (ctb.riskLevel === 'SUSPENSAO') {
      reasons.push(
        `Motorista atingiu ${ctb.points12m}/${ctb.maxAllowedPoints} pontos CTB nos últimos 12 meses.`
      );
    }
  }

  if (vehicle) {
    const crlvDocs = (snapshot.documents ?? []).filter(
      (d) => d.vehicleId === vehicle.id && d.docType === 'CRLV'
    );
    for (const doc of crlvDocs) {
      const ev = evaluateDocumentStatus(doc, todayIso);
      if (ev.status === 'VENCIDO') {
        reasons.push(
          `Licenciamento (CRLV-e ${doc.referenceYear}) de ${vehicle.plate} está vencido (${ev.label}).`
        );
      }
    }
  }

  return {
    blocked: reasons.length > 0,
    reasons,
  };
}

