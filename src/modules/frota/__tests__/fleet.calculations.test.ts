import { describe, expect, it } from 'vitest';
import { fuelingFormSchema } from '../components/FuelingForm';
import { documentObligationSchema, maintenanceSchema } from '../schemas/fleet.schemas';
import { createSeedSnapshot } from './fixtures/fleet.seed';
import type { FineRecord, FuelingRecord, VehicleDocumentRecord } from '../types/fleet.types';
import {
  checkDriverAndVehicleOperationLock,
  computeFleetKpis,
  computeRouteAudit,
  computeVehicleTcoSummary,
  detectConsumptionAnomalies,
  evaluateCnhStatus,
  evaluateDocumentStatus,
  evaluateDriverCtbPoints,
  evaluateFineNicAlert,
  evaluateReminderStatus,
  getEffectiveFineAmount,
  getLicensePlateDueInfo,
  parseNfceQrPayload,
  recalculateFuelingAverages,
  suggestDriverForDate,
} from '../utils/fleet.calculations';
import { generateFiciPdf } from '../utils/fleet.pdf';

describe('Fleet Calculations Engine', () => {
  it('calculates full-tank-to-full-tank km/L accurately including intermediate partial fills', () => {
    const records: FuelingRecord[] = [
      {
        id: 'f1',
        vehicleId: 'v1',
        driverId: 'd1',
        date: '2026-10-01',
        odometer: 10000,
        fuelType: 'GASOLINA',
        quantity: 40,
        unitPrice: 6.0,
        totalCost: 240,
        fullTank: true,
      },
      {
        id: 'f2',
        vehicleId: 'v1',
        driverId: 'd1',
        date: '2026-10-05',
        odometer: 10200,
        fuelType: 'GASOLINA',
        quantity: 15,
        unitPrice: 6.0,
        totalCost: 90,
        fullTank: false,
      },
      {
        id: 'f3',
        vehicleId: 'v1',
        driverId: 'd1',
        date: '2026-10-12',
        odometer: 10550,
        fuelType: 'GASOLINA',
        quantity: 35,
        unitPrice: 6.0,
        totalCost: 210,
        fullTank: true,
      },
    ];

    const calculated = recalculateFuelingAverages(records);
    const f1 = calculated.find((r) => r.id === 'f1');
    const f2 = calculated.find((r) => r.id === 'f2');
    const f3 = calculated.find((r) => r.id === 'f3');

    expect(f1?.calculatedAvg).toBeUndefined();
    expect(f2?.calculatedAvg).toBeUndefined();
    // 550 km / (15 + 35) L = 11.00 km/L
    expect(f3?.calculatedAvg).toBe(11);
  });

  it('detects consumption anomalies when efficiency drops >= 15% below vehicle baseline', () => {
    const seed = createSeedSnapshot();
    const anomalies = detectConsumptionAnomalies(seed.fuelings, 'TODOS', 15);
    // veh-3 tem uma queda acentuada em 2026-11-05 (850 km / 118 L = 7.20 vs ~9.42 km/L)
    expect(anomalies.length).toBeGreaterThanOrEqual(1);
    expect(anomalies[0]!.vehicleId).toBe('veh-3');
    expect(anomalies[0]!.dropPercent).toBeGreaterThanOrEqual(15);
  });

  it('computes KPIs and TCO summary including FIPE depreciation and SNE-discounted fines', () => {
    const seed = createSeedSnapshot();
    const kpis = computeFleetKpis(seed, 'TODOS', '90D');
    expect(kpis.totalCost).toBeGreaterThan(0);
    expect(kpis.finesCost).toBeGreaterThan(0);
    expect(kpis.costPerKm).toBeGreaterThan(0);

    const tco = computeVehicleTcoSummary(seed, 'veh-1');
    expect(tco).toHaveLength(1);
    expect(tco[0]!.fixedAndDepreciationMonthly).toBeGreaterThan(1180);
    expect(tco[0]!.totalTcoCost).toBeGreaterThan(tco[0]!.totalOperationalCost);
  });

  it('evaluates reminder and CNH statuses correctly', () => {
    const seed = createSeedSnapshot();
    const v3 = seed.vehicles.find((v) => v.id === 'veh-3');
    const overdueRem = seed.reminders.find((r) => r.id === 'rem-4')!;
    const evalOverdue = evaluateReminderStatus(overdueRem, v3, '2026-11-17');
    expect(evalOverdue.status).toBe('VENCIDO');

    const expiringDriver = seed.drivers.find((d) => d.id === 'drv-2')!;
    const cnhStatus = evaluateCnhStatus(expiringDriver, '2026-11-17');
    expect(cnhStatus.status).toBe('ATENCAO');
  });

  it('parses SEFAZ NFC-e QR payloads and suggests driver for fine date', () => {
    const parsed = parseNfceQrPayload(
      'https://www.nfce.fazenda.sp.gov.br/consulta?p=35261144221100001999650010001245121004512349|2|1|1|A1B2&vNF=286.40&dhEmi=2026-11-17&xNome=Posto%20Ipiranga'
    );
    expect(parsed).not.toBeNull();
    expect(parsed?.nfceKey).toBe('35261144221100001999650010001245121004512349');
    expect(parsed?.totalCost).toBe(286.4);
    expect(parsed?.date).toBe('2026-11-17');
    expect(parsed?.stationName).toBe('Posto Ipiranga');

    const seed = createSeedSnapshot();
    const driver = suggestDriverForDate(seed, 'veh-2', '2026-11-14');
    expect(driver).toBe('drv-2');

    const fineWithSne = seed.fines[0]!;
    expect(getEffectiveFineAmount(fineWithSne)).toBeCloseTo(fineWithSne.amount * 0.6, 2);
  });

  it('flags route distance deviations >= 15% vs Maps estimate', () => {
    const seed = createSeedSnapshot();
    const flaggedRoute = seed.routes.find((r) => r.id === 'rt-2')!;
    const audit = computeRouteAudit(flaggedRoute);
    expect(audit?.flagged).toBe(true);
    expect(audit?.deltaPercent).toBeGreaterThan(15);
  });

  it('validates FuelingForm, Maintenance, and DocumentObligation schemas via Zod', () => {
    const valid = fuelingFormSchema.safeParse({
      vehicleId: 'veh-1',
      driverId: 'drv-1',
      date: '2026-11-17',
      odometer: 49000,
      fuelType: 'DIESEL',
      quantity: 50,
      unitPrice: 6.2,
      totalCost: 310,
      fullTank: true,
    });
    expect(valid.success).toBe(true);

    const invalid = fuelingFormSchema.safeParse({
      vehicleId: 'veh-1',
      driverId: 'drv-1',
      date: '2026-11-17',
      odometer: -10,
      fuelType: 'DIESEL',
      quantity: 0,
      unitPrice: 6.2,
      totalCost: 0,
      fullTank: true,
    });
    expect(invalid.success).toBe(false);

    const validMaint = maintenanceSchema.safeParse({
      vehicleId: 'veh-1',
      type: 'PREVENTIVA',
      date: '2026-11-17',
      odometer: 48620,
      category: 'Revisão 50 mil km',
      partsCost: 0,
      laborCost: 0,
      totalCost: 1450.9,
      attachmentUrl: 'data:image/jpeg;base64,/9j/4AAQ',
    });
    expect(validMaint.success).toBe(true);

    const validDoc = documentObligationSchema.safeParse({
      vehicleId: 'veh-1',
      docType: 'CRLV',
      referenceYear: 2026,
      dueDate: '2026-12-31',
      amount: 160.22,
      stateUf: 'SP',
      providerOrAuthority: 'Detran-SP',
      status: 'PENDENTE',
    });
    expect(validDoc.success).toBe(true);
  });

  it('computes SP plate-digit calendar and evaluates document statuses', () => {
    const calDigit2 = getLicensePlateDueInfo('FTR4A82', 'SP', 2026);
    expect(calDigit2.finalDigit).toBe(2);
    expect(calDigit2.crlvDueDate).toBe('2026-07-31');

    const calDigit9 = getLicensePlateDueInfo('KLM7E19', 'SP', 2026);
    expect(calDigit9.finalDigit).toBe(9);
    expect(calDigit9.crlvDueDate).toBe('2026-11-30');

    const paidDoc: VehicleDocumentRecord = {
      id: 'd1',
      vehicleId: 'veh-1',
      docType: 'IPVA',
      referenceYear: 2026,
      dueDate: '2026-01-15',
      amount: 2400,
      status: 'PAGO',
    };
    expect(evaluateDocumentStatus(paidDoc, '2026-11-17').status).toBe('PAGO');

    const overdueDoc: VehicleDocumentRecord = {
      ...paidDoc,
      id: 'd2',
      docType: 'CRLV',
      dueDate: '2026-10-31',
      status: 'PENDENTE',
    };
    expect(evaluateDocumentStatus(overdueDoc, '2026-11-17').status).toBe('VENCIDO');

    const dueSoonDoc: VehicleDocumentRecord = {
      ...paidDoc,
      id: 'd3',
      docType: 'SEGURO',
      dueDate: '2026-11-28',
      status: 'PENDENTE',
    };
    expect(evaluateDocumentStatus(dueSoonDoc, '2026-11-17').status).toBe('ATENCAO');
  });

  it('applies CTB Art. 261 trailing 12-month point thresholds (40 / 30 / 20 pts)', () => {
    const seed = createSeedSnapshot();
    const driver = seed.drivers[0]!;

    const noGravissima: FineRecord[] = [
      {
        id: 'm1',
        vehicleId: 'veh-1',
        driverId: driver.id,
        date: '2026-10-01',
        infractionCode: '7455-0',
        description: 'Média',
        points: 4,
        amount: 130.16,
        sneDiscountApplied: false,
        status: 'PAGA',
      },
    ];
    const res40 = evaluateDriverCtbPoints(driver, noGravissima, '2026-11-17');
    expect(res40.maxAllowedPoints).toBe(40);
    expect(res40.riskLevel).toBe('OK');

    const oneGravissima: FineRecord[] = [
      { ...noGravissima[0]!, id: 'g1', points: 7, amount: 293.47 },
      { ...noGravissima[0]!, id: 'g2', points: 5, amount: 195.23 },
      { ...noGravissima[0]!, id: 'g3', points: 5, amount: 195.23 },
      { ...noGravissima[0]!, id: 'g4', points: 5, amount: 195.23 },
    ];
    const res30 = evaluateDriverCtbPoints(driver, oneGravissima, '2026-11-17');
    expect(res30.maxAllowedPoints).toBe(30);
    expect(res30.points12m).toBe(22);
    expect(res30.riskLevel).toBe('ATENCAO');

    const twoGravissimas: FineRecord[] = [
      { ...noGravissima[0]!, id: 'gg1', points: 7, amount: 293.47 },
      { ...noGravissima[0]!, id: 'gg2', points: 7, amount: 293.47 },
      { ...noGravissima[0]!, id: 'gg3', points: 6, amount: 293.47 },
    ];
    const res20 = evaluateDriverCtbPoints(driver, twoGravissimas, '2026-11-17');
    expect(res20.maxAllowedPoints).toBe(20);
    expect(res20.points12m).toBe(20);
    expect(res20.riskLevel).toBe('SUSPENSAO');
  });

  it('triggers anti-NIC countdown tiers (D-2, D-5, D-10, VENCIDO) and pre-trip operation locks', () => {
    const baseFine: FineRecord = {
      id: 'nic-1',
      vehicleId: 'veh-1',
      date: '2026-11-01',
      infractionCode: '7463-0',
      description: 'Excesso velocidade',
      points: 5,
      amount: 195.23,
      sneDiscountApplied: true,
      status: 'PENDENTE',
      driverIndicationDeadline: '2026-11-19',
    };

    expect(evaluateFineNicAlert(baseFine, '2026-11-17').tier).toBe('D-2');
    expect(
      evaluateFineNicAlert({ ...baseFine, driverIndicationDeadline: '2026-11-21' }, '2026-11-17').tier
    ).toBe('D-5');
    expect(
      evaluateFineNicAlert({ ...baseFine, driverIndicationDeadline: '2026-11-25' }, '2026-11-17').tier
    ).toBe('D-10');
    expect(
      evaluateFineNicAlert({ ...baseFine, driverIndicationDeadline: '2026-11-15' }, '2026-11-17').tier
    ).toBe('VENCIDO');

    const seed = createSeedSnapshot();
    const expiredDriver = { ...seed.drivers[0]!, cnhExpiry: '2026-10-01' };
    const overdueVehicle = seed.vehicles.find((v) => v.id === 'veh-3')!;
    const lock = checkDriverAndVehicleOperationLock(overdueVehicle, expiredDriver, seed, '2026-11-17');
    expect(lock.blocked).toBe(true);
    expect(lock.reasons.length).toBeGreaterThanOrEqual(2);
  });

  it('generates a valid FICI PDF document using pdf-lib', async () => {
    const seed = createSeedSnapshot();
    const fine = seed.fines[0]!;
    const vehicle = seed.vehicles.find((v) => v.id === fine.vehicleId);
    const driver = seed.drivers.find((d) => d.id === fine.driverId);

    const bytes = await generateFiciPdf(fine, vehicle, driver);
    expect(bytes.length).toBeGreaterThan(500);
    const header = new TextDecoder().decode(bytes.slice(0, 4));
    expect(header).toBe('%PDF');
  });
});

