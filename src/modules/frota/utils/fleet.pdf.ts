import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { Driver, FineRecord, FleetStateSnapshot, Vehicle } from '../types/fleet.types';
import {
  type PeriodFilter,
  computeFleetKpis,
  computeVehicleTcoSummary,
  detectConsumptionAnomalies,
  formatBRL,
  formatDateBR,
  formatKm,
  formatNumberBR,
  getEffectiveFineAmount,
  getFuelUnit,
} from './fleet.calculations';

const PERIOD_LABELS: Record<PeriodFilter, string> = {
  '30D': 'Ultimos 30 dias',
  '90D': 'Ultimos 90 dias',
  ANO: `Exercicio ${new Date().getFullYear()}`,
  TODOS: 'Historico completo',
};

function sanitizePdfText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, ' ');
}

export async function generateFleetReportPdf(
  snapshot: FleetStateSnapshot,
  vehicleFilter: string,
  period: PeriodFilter
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]); // A4
  const { width, height } = page.getSize();

  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const navy = rgb(12 / 255, 25 / 255, 40 / 255);
  const petrol = rgb(23 / 255, 61 / 255, 74 / 255);
  const gold = rgb(185 / 255, 149 / 255, 85 / 255);
  const muted = rgb(92 / 255, 107 / 255, 122 / 255);
  const ivory = rgb(231 / 255, 225 / 255, 213 / 255);
  const white = rgb(1, 1, 1);

  // Cabeçalho executivo em Azul-noite
  page.drawRectangle({ x: 0, y: height - 92, width, height: 92, color: navy });
  page.drawRectangle({ x: 0, y: height - 95, width, height: 3, color: gold });

  page.drawText('RELATORIO GERENCIAL DE FROTA', {
    x: 40,
    y: height - 42,
    size: 16,
    font: fontBold,
    color: white,
  });

  const selectedVeh = snapshot.vehicles.find((v) => v.id === vehicleFilter);
  const scopeText = selectedVeh
    ? `${selectedVeh.plate} - ${selectedVeh.brand} ${selectedVeh.model}`
    : `Toda a frota (${snapshot.vehicles.length} veiculos)`;

  page.drawText(
    sanitizePdfText(`Escopo: ${scopeText}  |  Periodo: ${PERIOD_LABELS[period]}  |  Emissao: ${new Date().toLocaleDateString('pt-BR', {timeZone:'America/Sao_Paulo'})}`),
    {
      x: 40,
      y: height - 66,
      size: 9.5,
      font: fontRegular,
      color: rgb(225 / 255, 230 / 255, 235 / 255),
    }
  );

  let y = height - 130;

  // Bloco de KPIs Consolidados
  const kpis = computeFleetKpis(snapshot, vehicleFilter, period);
  page.drawText('1. INDICADORES CONSOLIDADOS', {
    x: 40,
    y,
    size: 11,
    font: fontBold,
    color: petrol,
  });
  y -= 18;

  const kpiRows: [string, string][] = [
    ['Custo Operacional Total', formatBRL(kpis.totalCost)],
    ['Combustivel / Energia', formatBRL(kpis.fuelCost)],
    ['Manutencoes (Prev. + Corr.)', formatBRL(kpis.maintenanceCost)],
    ['Outras Despesas e Multas', formatBRL(kpis.otherExpenseCost)],
    ['Receitas Operacionais', formatBRL(kpis.totalRevenue)],
    ['Resultado Liquido', formatBRL(kpis.netBalance)],
    ['Distancia Apurada', formatKm(kpis.totalDistanceKm)],
    ['Custo por Quilometro', kpis.costPerKm > 0 ? `${formatBRL(kpis.costPerKm)}/km` : '-'],
  ];

  kpiRows.forEach(([label, val], idx) => {
    const colX = idx % 2 === 0 ? 40 : 310;
    const rowY = y - Math.floor(idx / 2) * 20;
    page.drawText(sanitizePdfText(label), {
      x: colX,
      y: rowY,
      size: 9.5,
      font: fontRegular,
      color: muted,
    });
    page.drawText(sanitizePdfText(val), {
      x: colX + 145,
      y: rowY,
      size: 9.5,
      font: fontBold,
      color: navy,
    });
  });

  y -= Math.ceil(kpiRows.length / 2) * 20 + 22;
  page.drawLine({ start: { x: 40, y }, end: { x: width - 40, y }, thickness: 1, color: ivory });
  y -= 24;

  // Tabela TCO por Veículo
  page.drawText('2. DESEMPENHO E TCO POR VEICULO', {
    x: 40,
    y,
    size: 11,
    font: fontBold,
    color: petrol,
  });
  y -= 20;

  const headers = ['Placa', 'Modelo', 'Media', 'Var. + Multas', 'TCO Mensal', 'TCO / km'];
  const colPositions = [40, 105, 245, 320, 415, 495];

  headers.forEach((h, i) => {
    page.drawText(h, { x: colPositions[i]!, y, size: 8.5, font: fontBold, color: muted });
  });
  y -= 8;
  page.drawLine({ start: { x: 40, y }, end: { x: width - 40, y }, thickness: 0.75, color: ivory });
  y -= 16;

  const tcoRows = computeVehicleTcoSummary(snapshot, vehicleFilter);
  for (const row of tcoRows) {
    if (y < 110) break;
    const unit = getFuelUnit(row.fuelType);
    const cells = [
      row.plate,
      row.model.slice(0, 22),
      row.avgConsumption ? `${formatNumberBR(row.avgConsumption, 1)} km/${unit}` : '-',
      formatBRL(row.totalOperationalCost),
      formatBRL(row.totalTcoCost),
      row.tcoPerKm ? `${formatBRL(row.tcoPerKm)}` : '-',
    ];
    cells.forEach((cell, i) => {
      page.drawText(sanitizePdfText(cell), {
        x: colPositions[i]!,
        y,
        size: 8.5,
        font: i === 0 ? fontBold : fontRegular,
        color: navy,
      });
    });
    y -= 18;
  }

  y -= 14;
  page.drawLine({ start: { x: 40, y }, end: { x: width - 40, y }, thickness: 1, color: ivory });
  y -= 24;

  // Anomalias e Pendências
  const anomalies = detectConsumptionAnomalies(snapshot.fuelings, vehicleFilter);
  page.drawText('3. ANOMALIAS DE CONSUMO E PONTOS DE ATENCAO', {
    x: 40,
    y,
    size: 11,
    font: fontBold,
    color: petrol,
  });
  y -= 18;

  if (anomalies.length === 0) {
    page.drawText('Nenhuma queda anomala de consumo (>= 15%) identificada no escopo atual.', {
      x: 40,
      y,
      size: 9,
      font: fontRegular,
      color: muted,
    });
    y -= 16;
  } else {
    for (const anom of anomalies.slice(0, 5)) {
      const veh = snapshot.vehicles.find((v) => v.id === anom.vehicleId);
      const line = `${veh?.plate ?? ''} (${formatDateBR(anom.date)}): ${formatNumberBR(anom.actualAvg, 2)} vs media ${formatNumberBR(anom.baselineAvg, 2)} (-${anom.dropPercent}%)`;
      page.drawText(sanitizePdfText(line), {
        x: 40,
        y,
        size: 9,
        font: fontRegular,
        color: navy,
      });
      y -= 15;
    }
  }

  // Rodapé
  page.drawText('Modulo de Gestao de Frota - Orion / Conecta', {
    x: 40,
    y: 32,
    size: 8,
    font: fontRegular,
    color: muted,
  });

  return pdfDoc.save();
}

export async function downloadFleetReportPdf(
  snapshot: FleetStateSnapshot,
  vehicleFilter: string,
  period: PeriodFilter
): Promise<void> {
  const bytes = await generateFleetReportPdf(snapshot, vehicleFilter, period);
  const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `relatorio-frota-${period.toLowerCase()}.pdf`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Gera o Formulário de Identificação do Condutor Infrator (FICI) e Termo de Ciência
 * pronto para assinatura e protocolo evitando a multa NIC em frota CNPJ.
 */
export async function generateFiciPdf(
  fine: FineRecord,
  vehicle?: Vehicle,
  driver?: Driver
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]); // A4
  const { width, height } = page.getSize();

  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const navy = rgb(12 / 255, 25 / 255, 40 / 255);
  const petrol = rgb(23 / 255, 61 / 255, 74 / 255);
  const gold = rgb(185 / 255, 149 / 255, 85 / 255);
  const muted = rgb(92 / 255, 107 / 255, 122 / 255);
  const ivory = rgb(231 / 255, 225 / 255, 213 / 255);
  const white = rgb(1, 1, 1);

  page.drawRectangle({ x: 0, y: height - 92, width, height: 92, color: navy });
  page.drawRectangle({ x: 0, y: height - 95, width, height: 3, color: gold });

  page.drawText('FICI - INDICACAO DO CONDUTOR INFRATOR', {
    x: 40,
    y: height - 42,
    size: 15,
    font: fontBold,
    color: white,
  });
  page.drawText('Formulario de Protocolo e Termo de Ciencia / Responsabilidade (Art. 257 CTB)', {
    x: 40,
    y: height - 66,
    size: 9.5,
    font: fontRegular,
    color: rgb(225 / 255, 230 / 255, 235 / 255),
  });

  let y = height - 130;

  const drawFieldRow = (label: string, value: string) => {
    page.drawText(sanitizePdfText(label), {
      x: 40,
      y,
      size: 9.5,
      font: fontBold,
      color: muted,
    });
    page.drawText(sanitizePdfText(value || '-'), {
      x: 210,
      y,
      size: 10,
      font: fontRegular,
      color: navy,
    });
    y -= 20;
  };

  page.drawText('1. DADOS DA INFRACAO E PRAZO ANTI-NIC', {
    x: 40,
    y,
    size: 11,
    font: fontBold,
    color: petrol,
  });
  y -= 20;

  drawFieldRow('Codigo CTB / Enquadramento:', fine.infractionCode);
  drawFieldRow('Descricao:', fine.description.slice(0, 62));
  drawFieldRow('Data / Hora:', `${formatDateBR(fine.date)} ${fine.time ? `as ${fine.time}` : ''}`);
  drawFieldRow('Local:', (fine.location ?? 'Nao informado').slice(0, 58));
  drawFieldRow('Pontuacao:', `${fine.points} ponto(s)`);
  drawFieldRow(
    'Valor Nominal / SNE:',
    `${formatBRL(fine.amount)} (Com SNE -40%: ${formatBRL(getEffectiveFineAmount(fine))})`
  );
  drawFieldRow(
    'Prazo Limite Indicacao (FICI):',
    fine.driverIndicationDeadline ? formatDateBR(fine.driverIndicationDeadline) : 'Verificar notificacao'
  );

  y -= 10;
  page.drawLine({ start: { x: 40, y }, end: { x: width - 40, y }, thickness: 1, color: ivory });
  y -= 24;

  page.drawText('2. DADOS DO VEICULO PROPRIETARIO (PESSOA JURIDICA)', {
    x: 40,
    y,
    size: 11,
    font: fontBold,
    color: petrol,
  });
  y -= 20;

  drawFieldRow('Placa:', vehicle?.plate ?? '-');
  drawFieldRow('Marca / Modelo:', vehicle ? `${vehicle.brand} ${vehicle.model} (${vehicle.year})` : '-');
  drawFieldRow('RENAVAM / UF:', `${vehicle?.renavam ?? '-'} / ${vehicle?.stateUf ?? 'SP'}`);

  y -= 10;
  page.drawLine({ start: { x: 40, y }, end: { x: width - 40, y }, thickness: 1, color: ivory });
  y -= 24;

  page.drawText('3. CONDUTOR INFRATOR IDENTIFICADO', {
    x: 40,
    y,
    size: 11,
    font: fontBold,
    color: petrol,
  });
  y -= 20;

  drawFieldRow('Nome Completo:', driver?.name ?? 'A preencher manualmente');
  drawFieldRow('Registro CNH / Categoria:', driver ? `${driver.cnhNumber} (Cat. ${driver.cnhCategory})` : '-');
  drawFieldRow('Validade CNH:', driver ? formatDateBR(driver.cnhExpiry) : '-');
  drawFieldRow('Telefone / Vinculo:', driver?.phone ?? driver?.userId ?? '-');

  y -= 14;
  page.drawLine({ start: { x: 40, y }, end: { x: width - 40, y }, thickness: 1, color: ivory });
  y -= 24;

  page.drawText('4. DECLARACAO DE VERACIDADE E ASSINATURAS', {
    x: 40,
    y,
    size: 11,
    font: fontBold,
    color: petrol,
  });
  y -= 18;

  const declarationLines = [
    'Declaramos, sob as penas da lei (Art. 299 do Codigo Penal e Art. 257 par. 7o e 8o do CTB), que o condutor',
    'acima identificado era o efetivo responsavel pela conducao do veiculo na data e hora da autuacao.',
    'Este documento acompanha copia da CNH do condutor e documento do representante legal da frota.',
  ];
  for (const line of declarationLines) {
    page.drawText(line, { x: 40, y, size: 9, font: fontRegular, color: muted });
    y -= 14;
  }

  y -= 36;
  page.drawLine({ start: { x: 40, y }, end: { x: 265, y }, thickness: 1, color: navy });
  page.drawLine({ start: { x: 315, y }, end: { x: 550, y }, thickness: 1, color: navy });
  y -= 14;
  page.drawText('Representante Legal / Gestor da Frota', {
    x: 40,
    y,
    size: 8.5,
    font: fontBold,
    color: navy,
  });
  page.drawText(sanitizePdfText(driver?.name ?? 'Condutor Infrator'), {
    x: 315,
    y,
    size: 8.5,
    font: fontBold,
    color: navy,
  });

  page.drawText('Gestao de Frota - Orion / Conecta | Protocolo Anti-NIC', {
    x: 40,
    y: 32,
    size: 8,
    font: fontRegular,
    color: muted,
  });

  return pdfDoc.save();
}

export async function downloadFiciPdf(
  fine: FineRecord,
  vehicle?: Vehicle,
  driver?: Driver
): Promise<void> {
  const bytes = await generateFiciPdf(fine, vehicle, driver);
  const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  const platePart = vehicle?.plate ?? 'veiculo';
  link.setAttribute('download', `FICI-${platePart}-${fine.infractionCode}.pdf`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

