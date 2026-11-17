import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  FileCheck2,
  FileDown,
  Loader2,
  Plus,
  ScanLine,
  Search,
  ShieldAlert,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { useFleet } from '../context/FleetContext';
import { documentObligationSchema } from '../schemas/fleet.schemas';
import {
  type GeminiDocumentKind,
  type ParsedDocumentResult,
  type PlateConsultationResponse,
  consultPlateCompliance,
  parseDocumentImageWithGemini,
} from '../services/document-compliance.service';
import type { DocumentType, VehicleDocumentRecord } from '../types/fleet.types';
import {
  documentTypeLabel,
  evaluateCnhStatus,
  evaluateDocumentStatus,
  evaluateDriverCtbPoints,
  evaluateFineNicAlert,
  formatBRL,
  formatDateBR,
  getEffectiveFineAmount,
  getLicensePlateDueInfo,
  suggestDriverForDate,
} from '../utils/fleet.calculations';
import { downloadFiciPdf } from '../utils/fleet.pdf';

export const DocumentsDebtsPage: React.FC = () => {
  const {
    snapshot,
    selectedVehicleFilter,
    addFine,
    updateFineStatus,
    upsertDriver,
    upsertVehicle,
    addDocumentObligation,
    markDocumentPaid,
    deleteDocumentObligation,
    generateCalendarForVehicles,
  } = useFleet();

  // Consulta por Placa + BrasilAPI FIPE
  const defaultVehicle =
    snapshot.vehicles.find((v) => v.id === selectedVehicleFilter) ?? snapshot.vehicles[0];
  const [plateInput, setPlateInput] = useState(defaultVehicle?.plate ?? 'FTR4A82');
  const [ufInput, setUfInput] = useState(defaultVehicle?.stateUf ?? 'SP');
  const [fipeCodeInput, setFipeCodeInput] = useState('');
  const [consultingPlate, setConsultingPlate] = useState(false);
  const [plateConsultResult, setPlateConsultResult] =
    useState<PlateConsultationResponse | null>(null);

  // Leitor OCR Gemini para Documentos / Multas
  const [ocrKind, setOcrKind] = useState<GeminiDocumentKind>('MULTA');
  const [isScanningDoc, setIsScanningDoc] = useState(false);
  const [ocrResult, setOcrResult] = useState<ParsedDocumentResult | null>(null);
  const [ocrError, setOcrError] = useState<string | null>(null);

  // Filtros e criação da Agenda Fiscal
  const [docTypeFilter, setDocTypeFilter] = useState<'TODOS' | DocumentType>('TODOS');
  const [docStatusFilter, setDocStatusFilter] = useState<'TODOS' | 'PENDENTE' | 'PAGO'>('TODOS');
  const [showNewDocForm, setShowNewDocForm] = useState(false);
  const [newDocVehicleId, setNewDocVehicleId] = useState(defaultVehicle?.id ?? '');
  const [newDocType, setNewDocType] = useState<DocumentType>('IPVA');
  const [newDocYear, setNewDocYear] = useState(String(new Date().getFullYear()));
  const [newDocDueDate, setNewDocDueDate] = useState('');
  const [newDocAmount, setNewDocAmount] = useState('');
  const [newDocProvider, setNewDocProvider] = useState('');
  const [newDocCode, setNewDocCode] = useState('');

  const vehicleMap = useMemo(
    () => new Map(snapshot.vehicles.map((v) => [v.id, v])),
    [snapshot.vehicles]
  );
  const driverMap = useMemo(
    () => new Map(snapshot.drivers.map((d) => [d.id, d])),
    [snapshot.drivers]
  );

  const documents = snapshot.documents ?? [];
  const fines = snapshot.fines ?? [];

  const filteredDocuments = useMemo(() => {
    return documents
      .filter((d) => selectedVehicleFilter === 'TODOS' || d.vehicleId === selectedVehicleFilter)
      .filter((d) => docTypeFilter === 'TODOS' || d.docType === docTypeFilter)
      .filter((d) =>
        docStatusFilter === 'TODOS'
          ? true
          : docStatusFilter === 'PENDENTE'
          ? d.status === 'PENDENTE'
          : d.status !== 'PENDENTE'
      )
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  }, [documents, selectedVehicleFilter, docTypeFilter, docStatusFilter]);

  const filteredFines = useMemo(() => {
    return fines
      .filter((f) => selectedVehicleFilter === 'TODOS' || f.vehicleId === selectedVehicleFilter)
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [fines, selectedVehicleFilter]);

  const complianceMetrics = useMemo(() => {
    let overdueDocs = 0;
    let soonDocs = 0;
    let pendingObligationsTotal = 0;

    for (const doc of documents) {
      if (selectedVehicleFilter !== 'TODOS' && doc.vehicleId !== selectedVehicleFilter) continue;
      const ev = evaluateDocumentStatus(doc);
      if (ev.status === 'VENCIDO') overdueDocs += 1;
      if (ev.status === 'ATENCAO') soonDocs += 1;
      if (doc.status === 'PENDENTE') pendingObligationsTotal += doc.amount;
    }

    for (const drv of snapshot.drivers) {
      const cnh = evaluateCnhStatus(drv);
      if (cnh.status === 'VENCIDO') overdueDocs += 1;
      if (cnh.status === 'ATENCAO') soonDocs += 1;
    }

    let nicAlertsCount = 0;
    let pendingFinesTotal = 0;
    for (const fn of filteredFines) {
      const nic = evaluateFineNicAlert(fn);
      if (nic.tier === 'VENCIDO' || nic.tier === 'D-2' || nic.tier === 'D-5' || nic.tier === 'D-10') {
        nicAlertsCount += 1;
      }
      if (fn.status === 'PENDENTE' || fn.status === 'INDICADO') {
        pendingFinesTotal += getEffectiveFineAmount(fn);
      }
    }

    const driversAtRisk = snapshot.drivers.filter((d) => {
      const ctb = evaluateDriverCtbPoints(d, fines);
      return ctb.riskLevel !== 'OK';
    }).length;

    return {
      overdueDocs,
      soonDocs,
      nicAlertsCount,
      pendingDebtTotal: pendingObligationsTotal + pendingFinesTotal,
      driversAtRisk,
    };
  }, [documents, fines, filteredFines, snapshot.drivers, selectedVehicleFilter]);

  const activePlateCalendar = useMemo(
    () => getLicensePlateDueInfo(plateInput || 'AAA0A00', ufInput || 'SP', new Date().getFullYear()),
    [plateInput, ufInput]
  );

  const matchedPlateVehicle = useMemo(
    () =>
      snapshot.vehicles.find(
        (v) => v.plate.replace(/[^A-Z0-9]/gi, '').toUpperCase() === plateInput.replace(/[^A-Z0-9]/gi, '').toUpperCase()
      ),
    [snapshot.vehicles, plateInput]
  );

  const handleConsultPlate = async (e: React.FormEvent) => {
    e.preventDefault();
    setConsultingPlate(true);
    try {
      const res = await consultPlateCompliance(plateInput, ufInput, fipeCodeInput);
      setPlateConsultResult(res);
      toast.success(`Referência consultada para ${res.plate}.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro na consulta de placa.');
    } finally {
      setConsultingPlate(false);
    }
  };

  const handleScanDocument = async (file: File | undefined) => {
    if (!file) return;
    setIsScanningDoc(true);
    setOcrError(null);
    try {
      const res = await parseDocumentImageWithGemini(file, ocrKind);
      setOcrResult(res);
      toast.success('Leitura do documento concluída via Gemini.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao analisar documento.';
      setOcrError(msg);
      toast.error(msg);
    } finally {
      setIsScanningDoc(false);
    }
  };

  const handleApplyOcrResult = async () => {
    if (!ocrResult) return;

    if (ocrKind === 'MULTA') {
      const matchedVeh =
        snapshot.vehicles.find(
          (v) =>
            ocrResult.plate &&
            v.plate.replace(/[^A-Z0-9]/gi, '').toUpperCase() === ocrResult.plate.toUpperCase()
        );

      if (!matchedVeh) {
        toast.error('Cadastre um veículo antes de lançar a multa.');
        return;
      }

      if (!ocrResult.date || !ocrResult.infractionCode || ocrResult.points === null || ocrResult.amount === null) { toast.error('A foto não contém todos os dados da multa. Complete o cadastro manualmente.'); return; }
      const fineDate = ocrResult.date;
      const suggestedDriver = suggestDriverForDate(snapshot, matchedVeh.id, fineDate);

      await addFine({
        vehicleId: matchedVeh.id,
        driverId: suggestedDriver,
        date: fineDate,
        time: ocrResult.time ?? undefined,
        infractionCode: ocrResult.infractionCode ?? '7455-0',
        description:
          ocrResult.description ?? 'Infração importada via leitura de notificação (Gemini)',
        location: ocrResult.location ?? undefined,
        points: ocrResult.points ?? 4,
        amount: ocrResult.amount ?? 0,
        sneDiscountApplied: Boolean(ocrResult.sneAmount),
        driverIndicationDeadline: ocrResult.driverIndicationDeadline ?? undefined,
        status: 'PENDENTE',
      });
      setOcrResult(null);
      return;
    }

    if (ocrKind === 'CNH') {
      const matchedDriver =
        snapshot.drivers.find(
          (d) =>
            (ocrResult.cnhNumber && d.cnhNumber === ocrResult.cnhNumber) ||
            (ocrResult.driverName &&
              d.name.toLowerCase().includes(ocrResult.driverName.toLowerCase().split(' ')[0] ?? ''))
        ) ?? null;

      if (!(ocrResult.driverName ?? matchedDriver?.name) || !(ocrResult.cnhNumber ?? matchedDriver?.cnhNumber) || !(ocrResult.cnhCategory ?? matchedDriver?.cnhCategory) || !(ocrResult.cnhExpiry ?? matchedDriver?.cnhExpiry)) {toast.error('CNH incompleta. Confira a foto ou cadastre os campos manualmente.');return;}
      await upsertDriver({
        id: matchedDriver?.id,
        userId: matchedDriver?.userId,
        name: ocrResult.driverName ?? matchedDriver?.name ?? 'Motorista importado',
        cnhNumber: ocrResult.cnhNumber ?? matchedDriver?.cnhNumber ?? '',
        cnhCategory: ocrResult.cnhCategory ?? matchedDriver?.cnhCategory ?? 'B',
        cnhExpiry: ocrResult.cnhExpiry ?? matchedDriver?.cnhExpiry ?? '',
        phone: matchedDriver?.phone,
        allowedVehicleIds: matchedDriver?.allowedVehicleIds ?? snapshot.vehicles.map((v) => v.id),
        active: true,
      });
      setOcrResult(null);
      return;
    }

    if (!ocrResult.dueDate || ocrResult.amount === null) {toast.error('Informe o vencimento e o valor manualmente: eles não foram identificados na foto.');return;}
    // CRLV ou SEGURO
    const matchedVeh =
      snapshot.vehicles.find(
        (v) =>
          ocrResult.plate &&
          v.plate.replace(/[^A-Z0-9]/gi, '').toUpperCase() === ocrResult.plate.toUpperCase()
      );

    if (!matchedVeh) {
      toast.error('Nenhum veículo encontrado para vincular o documento.');
      return;
    }

    if (ocrKind === 'CRLV' && (ocrResult.renavam || ocrResult.chassis || ocrResult.stateUf)) {
      await upsertVehicle({
        ...matchedVeh,
        renavam: ocrResult.renavam ?? matchedVeh.renavam,
        chassis: ocrResult.chassis ?? matchedVeh.chassis,
        stateUf: ocrResult.stateUf ?? matchedVeh.stateUf,
      });
    }

    const cal = getLicensePlateDueInfo(
      matchedVeh.plate,
      ocrResult.stateUf ?? matchedVeh.stateUf ?? 'SP',
      ocrResult.exerciseYear ?? new Date().getFullYear()
    );

    await addDocumentObligation({
      vehicleId: matchedVeh.id,
      docType: ocrKind === 'SEGURO' ? 'SEGURO' : 'CRLV',
      referenceYear: ocrResult.exerciseYear ?? new Date().getFullYear(),
      dueDate: ocrResult.dueDate ?? cal.crlvDueDate,
      amount: ocrResult.amount ?? 0,
      stateUf: ocrResult.stateUf ?? matchedVeh.stateUf ?? 'SP',
      providerOrAuthority:
        ocrResult.providerOrAuthority ??
        (ocrKind === 'SEGURO' ? 'Seguradora' : `Detran-${ocrResult.stateUf ?? matchedVeh.stateUf ?? 'SP'}`),
      policyOrCode: ocrResult.policyOrCode ?? ocrResult.renavam ?? undefined,
      status: 'PENDENTE',
    });
    setOcrResult(null);
  };

  const handleCreateDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = documentObligationSchema.safeParse({
      vehicleId: newDocVehicleId,
      docType: newDocType,
      referenceYear: newDocYear,
      dueDate: newDocDueDate,
      amount: newDocAmount || 0,
      stateUf: vehicleMap.get(newDocVehicleId)?.stateUf ?? 'SP',
      providerOrAuthority: newDocProvider,
      policyOrCode: newDocCode,
      status: 'PENDENTE',
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? 'Verifique os campos da obrigação.');
      return;
    }
    await addDocumentObligation(parsed.data);
    setShowNewDocForm(false);
    setNewDocAmount('');
    setNewDocProvider('');
    setNewDocCode('');
  };

  return (
    <div className="space-y-6">
      {/* 1. Faixa de Indicadores de Conformidade */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-[#E7E1D5] rounded-[10px] p-5 flex flex-col justify-between gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#5C6B7A]">Documentos Vencidos</span>
            <ShieldAlert className="h-4 w-4 text-[#9E3B3B]" />
          </div>
          <div>
            <p className="font-display text-2xl font-bold font-mono-tabular text-[#0C1928]">
              {complianceMetrics.overdueDocs}
            </p>
            <p className="text-xs text-[#5C6B7A] mt-1 font-mono-tabular">
              +{complianceMetrics.soonDocs} vencendo em até 30d
            </p>
          </div>
        </div>

        <div className="bg-white border border-[#E7E1D5] rounded-[10px] p-5 flex flex-col justify-between gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#5C6B7A]">Alertas Anti-NIC (FICI)</span>
            <CalendarClock className="h-4 w-4 text-[#B99555]" />
          </div>
          <div>
            <p className="font-display text-2xl font-bold font-mono-tabular text-[#0C1928]">
              {complianceMetrics.nicAlertsCount}
            </p>
            <p className="text-xs text-[#5C6B7A] mt-1">
              Multas exigindo indicação de condutor
            </p>
          </div>
        </div>

        <div className="bg-white border border-[#E7E1D5] rounded-[10px] p-5 flex flex-col justify-between gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#5C6B7A]">Débitos & Multas em Aberto</span>
            <FileCheck2 className="h-4 w-4 text-[#173D4A]" />
          </div>
          <div>
            <p className="font-display text-2xl font-bold font-mono-tabular text-[#173D4A]">
              {formatBRL(complianceMetrics.pendingDebtTotal)}
            </p>
            <p className="text-xs text-[#5C6B7A] mt-1">
              IPVA, CRLV, seguros e multas SNE
            </p>
          </div>
        </div>

        <div className="bg-white border border-[#E7E1D5] rounded-[10px] p-5 flex flex-col justify-between gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#5C6B7A]">Risco Pontuação CTB (12m)</span>
            <AlertTriangle className="h-4 w-4 text-[#B99555]" />
          </div>
          <div>
            <p className="font-display text-2xl font-bold font-mono-tabular text-[#0C1928]">
              {complianceMetrics.driversAtRisk}
            </p>
            <p className="text-xs text-[#5C6B7A] mt-1">
              Motorista(s) acima de 70% do teto CTB
            </p>
          </div>
        </div>
      </section>

      {/* 2. Consulta por Placa (BrasilAPI FIPE + Calendário UF) & Leitor OCR Gemini */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-6 bg-white border border-[#E7E1D5] rounded-[10px] p-6 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-base font-semibold text-[#0C1928]">
                Consulta por Placa, BrasilAPI FIPE & Calendário de Referência
              </h2>
              <p className="text-xs text-[#5C6B7A] mt-0.5">
                Calcula vencimentos por final de placa/UF, valida tabela FIPE na BrasilAPI e audita pendências da frota
              </p>
            </div>
            <button
              type="button"
              onClick={() => void generateCalendarForVehicles(new Date().getFullYear())}
              className="h-8 px-3 rounded-lg border border-[#E7E1D5] bg-[#F7F8FA] hover:bg-[#E7E1D5]/40 text-xs font-medium text-[#173D4A] whitespace-nowrap cursor-pointer"
            >
              Gerar Calendário de Referência
            </button>
          </div>

          <form onSubmit={handleConsultPlate} className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
            <div className="sm:col-span-4">
              <label className="block text-[11px] font-medium text-[#5C6B7A] mb-1">Placa</label>
              <input
                type="text"
                value={plateInput}
                onChange={(e) => setPlateInput(e.target.value.toUpperCase())}
                list="fleet-plates-list"
                placeholder="FTR4A82"
                className="w-full h-9 rounded-lg border border-[#E7E1D5] px-3 text-xs font-mono-tabular uppercase"
                required
              />
              <datalist id="fleet-plates-list">
                {snapshot.vehicles.map((v) => (
                  <option key={v.id} value={v.plate}>
                    {v.brand} {v.model}
                  </option>
                ))}
              </datalist>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-[11px] font-medium text-[#5C6B7A] mb-1">UF</label>
              <select
                value={ufInput}
                onChange={(e) => setUfInput(e.target.value)}
                className="w-full h-9 rounded-lg border border-[#E7E1D5] px-2 text-xs"
              >
                <option value="SP">SP</option>
                <option value="MG">MG</option>
                <option value="RJ">RJ</option>
                <option value="PR">PR</option>
                <option value="RS">RS</option>
                <option value="BR">Outra</option>
              </select>
            </div>
            <div className="sm:col-span-3">
              <label className="block text-[11px] font-medium text-[#5C6B7A] mb-1">
                Cód. FIPE (opc.)
              </label>
              <input
                type="text"
                value={fipeCodeInput}
                onChange={(e) => setFipeCodeInput(e.target.value)}
                placeholder="002190-5"
                className="w-full h-9 rounded-lg border border-[#E7E1D5] px-2.5 text-xs font-mono-tabular"
              />
            </div>
            <div className="sm:col-span-3 flex items-end">
              <button
                type="submit"
                disabled={consultingPlate}
                className="w-full h-9 inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#173D4A] hover:bg-[#0C1928] text-white text-xs font-medium transition-colors cursor-pointer disabled:opacity-60"
              >
                {consultingPlate ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Search className="h-3.5 w-3.5" />
                )}
                <span>Consultar</span>
              </button>
            </div>
          </form>

          <p className="text-xs text-amber-700">Datas de referência operacional. Confira as datas e valores na guia do órgão da UF antes de registrar ou pagar. A consulta FIPE não confirma débitos.</p>
          {/* Calendário Calculado pelo Final da Placa */}
          <div className="p-4 rounded-lg bg-[#F7F8FA] border border-[#E7E1D5] space-y-2.5 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold text-[#0C1928]">
                Regra Final de Placa {activePlateCalendar.finalDigit} ({activePlateCalendar.stateUf})
              </span>
              {matchedPlateVehicle && (
                <span className="text-[#173D4A] font-medium">
                  {matchedPlateVehicle.brand} {matchedPlateVehicle.model} · RENAVAM{' '}
                  <span className="font-mono-tabular">{matchedPlateVehicle.renavam ?? '—'}</span>
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div className="p-3 rounded-lg bg-white border border-[#E7E1D5]">
                <span className="text-[11px] text-[#5C6B7A]">Licenciamento CRLV-e</span>
                <p className="font-mono-tabular font-semibold text-[#0C1928] mt-0.5">
                  Até {formatDateBR(activePlateCalendar.crlvDueDate)}
                </p>
                <span className="text-[11px] text-[#5C6B7A]">
                  Mês referência: {activePlateCalendar.crlvMonthLabel}
                </span>
              </div>
              <div className="p-3 rounded-lg bg-white border border-[#E7E1D5]">
                <span className="text-[11px] text-[#5C6B7A]">IPVA Cota Única / Base FIPE</span>
                <p className="font-mono-tabular font-semibold text-[#0C1928] mt-0.5">
                  {formatDateBR(activePlateCalendar.ipvaDueDate)}
                </p>
                <span className="text-[11px] text-[#5C6B7A] font-mono-tabular">
                  {matchedPlateVehicle?.fipeValue
                    ? `Referência de 4% FIPE (confirme alíquota): ${formatBRL(matchedPlateVehicle.fipeValue * 0.04)}`
                    : 'Cadastre FIPE para estimar IPVA'}
                </span>
              </div>
            </div>

            {plateConsultResult && (
              <div className="pt-2 border-t border-[#E7E1D5] space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium text-[#173D4A]">
                    BrasilAPI FIPE:{' '}
                    {plateConsultResult.brasilApiReachable
                      ? `Online (${plateConsultResult.fipeReferenceMonth ?? 'Tabela ativa'} · ${plateConsultResult.fipeBrandCount ?? 0} marcas)`
                      : 'Indisponível no momento'}
                  </span>
                  {plateConsultResult.fipePriceRecord?.valor && (
                    <span className="font-mono-tabular font-semibold text-[#0C1928]">
                      FIPE {plateConsultResult.fipePriceRecord.modelo}: {plateConsultResult.fipePriceRecord.valor}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-[#5C6B7A] leading-relaxed">
                  {plateConsultResult.detranProviderConnected
                    ? `Integração Detran/SENATRAN ativa para ${plateConsultResult.plate}.`
                    : plateConsultResult.brasilApiNotice}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Leitor OCR Gemini para Multas, CNH, CRLV e Seguro */}
        <div className="lg:col-span-6 bg-white border border-[#E7E1D5] rounded-[10px] p-6 space-y-4">
          <div>
            <h2 className="font-display text-base font-semibold text-[#0C1928]">
              Leitor Automático de Documentos & Notificações (Gemini)
            </h2>
            <p className="text-xs text-[#5C6B7A] mt-0.5">
              Envie foto de Notificação de Multa, CNH, CRLV-e ou Apólice para extrair prazos, pontos e valores
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {(
              [
                { id: 'MULTA', label: 'Notificação de Multa' },
                { id: 'CNH', label: 'CNH Motorista' },
                { id: 'CRLV', label: 'CRLV-e Veículo' },
                { id: 'SEGURO', label: 'Apólice Seguro' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => {
                  setOcrKind(opt.id);
                  setOcrResult(null);
                  setOcrError(null);
                }}
                className={`h-8 px-3 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap cursor-pointer ${
                  ocrKind === opt.id
                    ? 'bg-[#173D4A] border-[#173D4A] text-white'
                    : 'bg-[#F7F8FA] border-[#E7E1D5] text-[#0C1928] hover:bg-[#E7E1D5]/40'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-lg bg-[#F7F8FA] border border-[#E7E1D5]">
            <div className="text-xs text-[#5C6B7A]">
              Selecione uma imagem legível (JPG/PNG/WebP) de{' '}
              <strong className="text-[#0C1928]">{ocrKind}</strong>.
            </div>
            <label
              className={`inline-flex items-center gap-1.5 h-9 px-4 rounded-lg text-xs font-medium transition-colors ${
                isScanningDoc
                  ? 'bg-[#B99555]/20 text-[#0C1928] cursor-wait'
                  : 'bg-[#B99555] hover:bg-[#a98648] text-[#0C1928] font-semibold cursor-pointer'
              }`}
            >
              {isScanningDoc ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <ScanLine className="h-3.5 w-3.5" />
              )}
              <span>{isScanningDoc ? 'Analisando imagem...' : 'Ler Foto via Gemini'}</span>
              <input
                type="file"
                accept="image/*"
                disabled={isScanningDoc}
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  void handleScanDocument(file);
                }}
              />
            </label>
          </div>

          {ocrError && (
            <div className="p-3 rounded-lg bg-[#9E3B3B]/10 border border-[#9E3B3B]/30 text-xs font-medium text-[#9E3B3B]">
              {ocrError}
            </div>
          )}

          {ocrResult && (
            <div className="p-4 rounded-lg border border-[#E7E1D5] bg-white space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <img
                    src={ocrResult.previewDataUrl}
                    alt="Documento digitalizado"
                    className="h-10 w-14 object-cover rounded border border-[#E7E1D5]"
                  />
                  <div>
                    <p className="text-xs font-semibold text-[#0C1928]">
                      Extração {ocrKind} · Confiança {ocrResult.confidence}
                    </p>
                    <p className="text-[11px] text-[#5C6B7A]">
                      Revise os dados capturados antes de gravar no sistema
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void handleApplyOcrResult()}
                  className="h-8 px-3.5 rounded-lg bg-[#173D4A] hover:bg-[#0C1928] text-white text-xs font-medium whitespace-nowrap cursor-pointer"
                >
                  Aplicar no Sistema
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs pt-2 border-t border-[#E7E1D5]">
                {ocrResult.plate && (
                  <div>
                    <span className="text-[11px] text-[#5C6B7A]">Placa</span>
                    <p className="font-mono-tabular font-semibold text-[#0C1928]">{ocrResult.plate}</p>
                  </div>
                )}
                {ocrResult.driverName && (
                  <div className="col-span-2">
                    <span className="text-[11px] text-[#5C6B7A]">Condutor</span>
                    <p className="font-medium text-[#0C1928]">{ocrResult.driverName}</p>
                  </div>
                )}
                {ocrResult.cnhNumber && (
                  <div>
                    <span className="text-[11px] text-[#5C6B7A]">Nº CNH / Cat.</span>
                    <p className="font-mono-tabular text-[#0C1928]">
                      {ocrResult.cnhNumber} ({ocrResult.cnhCategory ?? '—'})
                    </p>
                  </div>
                )}
                {ocrResult.cnhExpiry && (
                  <div>
                    <span className="text-[11px] text-[#5C6B7A]">Validade CNH</span>
                    <p className="font-mono-tabular text-[#0C1928]">{formatDateBR(ocrResult.cnhExpiry)}</p>
                  </div>
                )}
                {ocrResult.infractionCode && (
                  <div>
                    <span className="text-[11px] text-[#5C6B7A]">Código CTB</span>
                    <p className="font-mono-tabular text-[#0C1928]">{ocrResult.infractionCode}</p>
                  </div>
                )}
                {ocrResult.amount !== null && (
                  <div>
                    <span className="text-[11px] text-[#5C6B7A]">Valor</span>
                    <p className="font-mono-tabular font-semibold text-[#173D4A]">
                      {formatBRL(ocrResult.amount)}
                    </p>
                  </div>
                )}
                {(ocrResult.dueDate || ocrResult.driverIndicationDeadline || ocrResult.date) && (
                  <div>
                    <span className="text-[11px] text-[#5C6B7A]">
                      {ocrKind === 'MULTA' ? 'Prazo FICI / Data' : 'Vencimento'}
                    </span>
                    <p className="font-mono-tabular text-[#0C1928]">
                      {formatDateBR(
                        ocrResult.driverIndicationDeadline ?? ocrResult.dueDate ?? ocrResult.date ?? ''
                      )}
                    </p>
                  </div>
                )}
                {ocrResult.renavam && (
                  <div>
                    <span className="text-[11px] text-[#5C6B7A]">RENAVAM</span>
                    <p className="font-mono-tabular text-[#0C1928]">{ocrResult.renavam}</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* 3. Multas Anti-NIC (Gerador FICI PDF) & Motor de Pontuação CTB 12 Meses */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-7 bg-white border border-[#E7E1D5] rounded-[10px] overflow-hidden">
          <div className="px-6 py-4 border-b border-[#E7E1D5] flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-base font-semibold text-[#0C1928]">
                Controle Anti-NIC e Emissão de FICI ({filteredFines.length})
              </h2>
              <p className="text-xs text-[#5C6B7A] mt-0.5">
                Contagem regressiva D-10 / D-5 / D-2 para indicar condutor e gerar FICI em PDF
              </p>
            </div>
          </div>

          {filteredFines.length === 0 ? (
            <div className="p-10 text-center text-xs text-[#5C6B7A]">
              Nenhuma infração registrada para o filtro atual.
            </div>
          ) : (
            <div className="divide-y divide-[#E7E1D5]">
              {filteredFines.map((fn) => {
                const veh = vehicleMap.get(fn.vehicleId);
                const drv = fn.driverId ? driverMap.get(fn.driverId) : undefined;
                const nic = evaluateFineNicAlert(fn);
                const effectiveVal = getEffectiveFineAmount(fn);

                return (
                  <div
                    key={fn.id}
                    className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-[#F7F8FA] transition-colors"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="font-mono-tabular font-semibold text-[#173D4A]">
                          {veh?.plate ?? '—'}
                        </span>
                        <span className="text-[#5C6B7A] font-mono-tabular">
                          CTB {fn.infractionCode} · {fn.points} pts
                        </span>
                        <span
                          className={`font-semibold ${
                            nic.tier === 'VENCIDO' || nic.tier === 'D-2'
                              ? 'text-[#9E3B3B]'
                              : nic.tier === 'D-5' || nic.tier === 'D-10'
                              ? 'text-[#A66E1E]'
                              : 'text-[#5C6B7A]'
                          }`}
                        >
                          {nic.label}
                        </span>
                      </div>
                      <p className="text-sm font-medium text-[#0C1928]">{fn.description}</p>
                      <p className="text-xs text-[#5C6B7A]">
                        Condutor: <strong className="text-[#0C1928]">{drv?.name ?? 'Não identificado'}</strong>{' '}
                        · Infração {formatDateBR(fn.date)} ·{' '}
                        <span className="font-mono-tabular font-medium text-[#173D4A]">
                          {formatBRL(effectiveVal)}
                        </span>
                        {fn.sneDiscountApplied ? ' (SNE -40%)' : ''}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => void downloadFiciPdf(fn, veh, drv)}
                        className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-[#E7E1D5] bg-white hover:bg-[#F7F8FA] text-xs font-medium text-[#0C1928] whitespace-nowrap cursor-pointer"
                      >
                        <FileDown className="h-3.5 w-3.5 text-[#173D4A]" />
                        <span>FICI PDF</span>
                      </button>

                      {fn.status === 'PENDENTE' && (
                        <button
                          type="button"
                          onClick={() => void updateFineStatus(fn.id, 'INDICADO')}
                          className="h-8 px-3 rounded-lg bg-[#173D4A] hover:bg-[#0C1928] text-white text-xs font-medium whitespace-nowrap cursor-pointer"
                        >
                          Marcar Indicado
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Matriz CNH & Pontuação CTB 12 Meses */}
        <div className="lg:col-span-5 bg-white border border-[#E7E1D5] rounded-[10px] overflow-hidden">
          <div className="px-6 py-4 border-b border-[#E7E1D5]">
            <h2 className="font-display text-base font-semibold text-[#0C1928]">
              Pontuação CTB (12m) & Validade CNH
            </h2>
            <p className="text-xs text-[#5C6B7A] mt-0.5">
              Regra Art. 261 CTB (teto 40 / 30 / 20 pts conforme gravíssimas)
            </p>
          </div>

          <div className="divide-y divide-[#E7E1D5]">
            {snapshot.drivers.map((drv) => {
              const cnh = evaluateCnhStatus(drv);
              const ctb = evaluateDriverCtbPoints(drv, fines);
              const pct = Math.min(100, Math.round((ctb.points12m / ctb.maxAllowedPoints) * 100));

              return (
                <div key={drv.id} className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[#0C1928] truncate">{drv.name}</p>
                      <p className="text-xs text-[#5C6B7A] font-mono-tabular">
                        CNH {drv.cnhNumber} · Cat. {drv.cnhCategory}
                      </p>
                    </div>
                    <span
                      className={`text-xs font-semibold whitespace-nowrap ${
                        cnh.status === 'VENCIDO'
                          ? 'text-[#9E3B3B]'
                          : cnh.status === 'ATENCAO'
                          ? 'text-[#A66E1E]'
                          : 'text-[#2E6F5E]'
                      }`}
                    >
                      {cnh.label}
                    </span>
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[#5C6B7A]">
                        Pontos 12m ({ctb.gravissimaCount} gravíssima{ctb.gravissimaCount === 1 ? '' : 's'})
                      </span>
                      <span
                        className={`font-mono-tabular font-semibold ${
                          ctb.riskLevel === 'SUSPENSAO'
                            ? 'text-[#9E3B3B]'
                            : ctb.riskLevel === 'ATENCAO'
                            ? 'text-[#A66E1E]'
                            : 'text-[#0C1928]'
                        }`}
                      >
                        {ctb.points12m} / {ctb.maxAllowedPoints} pts
                      </span>
                    </div>
                    <div className="h-1.5 w-full bg-[#F7F8FA] border border-[#E7E1D5] rounded overflow-hidden">
                      <div
                        className={`h-full ${
                          ctb.riskLevel === 'SUSPENSAO'
                            ? 'bg-[#9E3B3B]'
                            : ctb.riskLevel === 'ATENCAO'
                            ? 'bg-[#B99555]'
                            : 'bg-[#173D4A]'
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* 4. Painel de Obrigações Fiscais & Documentação (CRLV, IPVA, Seguro, Vistoria) */}
      <section className="bg-white border border-[#E7E1D5] rounded-[10px] overflow-hidden">
        <div className="px-6 py-4 border-b border-[#E7E1D5] flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-semibold text-[#0C1928]">
              Agenda Fiscal & Documentos da Frota ({filteredDocuments.length})
            </h2>
            <p className="text-xs text-[#5C6B7A] mt-0.5">
              CRLV-e, IPVA, apólices de seguro e vistorias com baixa integrada ao financeiro
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={docTypeFilter}
              onChange={(e) => setDocTypeFilter(e.target.value as 'TODOS' | DocumentType)}
              className="h-9 rounded-lg border border-[#E7E1D5] bg-[#F7F8FA] px-3 text-xs text-[#0C1928]"
              aria-label="Filtrar tipo de documento"
            >
              <option value="TODOS">Todos os tipos</option>
              <option value="CRLV">CRLV-e / Licenciamento</option>
              <option value="IPVA">IPVA</option>
              <option value="SEGURO">Seguro</option>
              <option value="VISTORIA">Vistoria / ANTT</option>
            </select>

            <select
              value={docStatusFilter}
              onChange={(e) =>
                setDocStatusFilter(e.target.value as 'TODOS' | 'PENDENTE' | 'PAGO')
              }
              className="h-9 rounded-lg border border-[#E7E1D5] bg-[#F7F8FA] px-3 text-xs text-[#0C1928]"
              aria-label="Filtrar situação"
            >
              <option value="TODOS">Todas situações</option>
              <option value="PENDENTE">Em aberto / Vencido</option>
              <option value="PAGO">Quitados / Isentos</option>
            </select>

            <button
              type="button"
              onClick={() => setShowNewDocForm((v) => !v)}
              className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg bg-[#173D4A] hover:bg-[#0C1928] text-white text-xs font-medium whitespace-nowrap cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Nova Obrigação</span>
            </button>
          </div>
        </div>

        {showNewDocForm && (
          <form
            onSubmit={handleCreateDocument}
            className="p-6 bg-[#F7F8FA] border-b border-[#E7E1D5] grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 items-end"
          >
            <div>
              <label className="block text-[11px] font-medium text-[#0C1928] mb-1">Veículo</label>
              <select
                value={newDocVehicleId}
                onChange={(e) => setNewDocVehicleId(e.target.value)}
                className="w-full h-9 rounded-lg border border-[#E7E1D5] bg-white px-2.5 text-xs"
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
              <label className="block text-[11px] font-medium text-[#0C1928] mb-1">Documento</label>
              <select
                value={newDocType}
                onChange={(e) => setNewDocType(e.target.value as DocumentType)}
                className="w-full h-9 rounded-lg border border-[#E7E1D5] bg-white px-2.5 text-xs"
              >
                <option value="CRLV">CRLV-e</option>
                <option value="IPVA">IPVA</option>
                <option value="SEGURO">Seguro</option>
                <option value="VISTORIA">Vistoria</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-[#0C1928] mb-1">
                Vencimento
              </label>
              <input
                type="date"
                value={newDocDueDate}
                onChange={(e) => setNewDocDueDate(e.target.value)}
                className="w-full h-9 rounded-lg border border-[#E7E1D5] bg-white px-2.5 text-xs font-mono-tabular"
                required
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-[#0C1928] mb-1">Valor (R$)</label>
              <input
                type="number"
                step="0.01"
                value={newDocAmount}
                onChange={(e) => setNewDocAmount(e.target.value)}
                placeholder="0,00"
                className="w-full h-9 rounded-lg border border-[#E7E1D5] bg-white px-2.5 text-xs font-mono-tabular"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-[#0C1928] mb-1">
                Órgão / Seguradora
              </label>
              <input
                type="text"
                value={newDocProvider}
                onChange={(e) => setNewDocProvider(e.target.value)}
                placeholder="Ex: Sefaz-SP / Porto"
                className="w-full h-9 rounded-lg border border-[#E7E1D5] bg-white px-2.5 text-xs"
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="hidden"
                value={newDocYear}
                onChange={(e) => setNewDocYear(e.target.value)}
              />
              <button
                type="submit"
                className="w-full h-9 rounded-lg bg-[#173D4A] hover:bg-[#0C1928] text-white text-xs font-medium cursor-pointer"
              >
                Salvar
              </button>
            </div>
          </form>
        )}

        {filteredDocuments.length === 0 ? (
          <div className="p-10 text-center text-xs text-[#5C6B7A]">
            Nenhuma obrigação documental encontrada para os filtros selecionados.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#E7E1D5] bg-[#F7F8FA] text-[11px] font-semibold text-[#5C6B7A]">
                  <th className="py-3 px-4">Veículo</th>
                  <th className="py-3 px-4">Obrigação</th>
                  <th className="py-3 px-4">Órgão / Seguradora</th>
                  <th className="py-3 px-4">Vencimento</th>
                  <th className="py-3 px-4">Situação</th>
                  <th className="py-3 px-4 text-right">Valor</th>
                  <th className="py-3 px-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E7E1D5] text-xs">
                {filteredDocuments.map((doc: VehicleDocumentRecord) => {
                  const veh = vehicleMap.get(doc.vehicleId);
                  const ev = evaluateDocumentStatus(doc);

                  return (
                    <tr key={doc.id} className="hover:bg-[#F7F8FA] transition-colors">
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className="font-mono-tabular font-semibold text-[#173D4A]">
                          {veh?.plate ?? '—'}
                        </span>
                        <span className="text-[#5C6B7A] ml-2">{veh?.model ?? ''}</span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-medium text-[#0C1928]">
                          {documentTypeLabel(doc.docType)}
                        </span>
                        <span className="text-[#5C6B7A] ml-1.5 font-mono-tabular">
                          ({doc.referenceYear})
                        </span>
                        {doc.policyOrCode && (
                          <p className="text-[11px] text-[#5C6B7A]">{doc.policyOrCode}</p>
                        )}
                      </td>
                      <td className="py-3 px-4 text-[#5C6B7A]">
                        {doc.providerOrAuthority ?? `Detran-${doc.stateUf ?? 'SP'}`}
                      </td>
                      <td className="py-3 px-4 font-mono-tabular text-[#0C1928] whitespace-nowrap">
                        {formatDateBR(doc.dueDate)}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span
                          className={`font-semibold ${
                            ev.status === 'PAGO'
                              ? 'text-[#2E6F5E]'
                              : ev.status === 'VENCIDO'
                              ? 'text-[#9E3B3B]'
                              : ev.status === 'ATENCAO'
                              ? 'text-[#A66E1E]'
                              : 'text-[#0C1928]'
                          }`}
                        >
                          {ev.label}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-mono-tabular font-semibold text-[#0C1928] whitespace-nowrap">
                        {doc.amount > 0 ? formatBRL(doc.amount) : '—'}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-2">
                          {doc.status === 'PENDENTE' ? (
                            <button
                              type="button"
                              onClick={() => void markDocumentPaid(doc.id, true)}
                              className="inline-flex items-center gap-1 h-7 px-2.5 rounded border border-[#2E6F5E]/40 text-[11px] font-medium text-[#2E6F5E] hover:bg-[#2E6F5E]/10 cursor-pointer"
                            >
                              <CheckCircle2 className="h-3 w-3" />
                              <span>Quitar</span>
                            </button>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => void deleteDocumentObligation(doc.id)}
                            className="p-1 text-[#5C6B7A] hover:text-[#9E3B3B]"
                            aria-label="Excluir obrigação"
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
      </section>
    </div>
  );
};
