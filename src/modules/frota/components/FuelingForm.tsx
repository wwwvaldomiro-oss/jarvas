import React, { useEffect, useMemo, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { AlertTriangle, Camera, Loader2, QrCode, ScanLine } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod/v4';
import { useFleet } from '../context/FleetContext';
import {
  parseReceiptImageWithGemini,
  type ParsedReceiptResult,
} from '../services/receipt-ocr.service';
import type { FuelType } from '../types/fleet.types';
import {
  formatBRL,
  formatDateBR,
  formatKm,
  formatNumberBR,
  getFuelUnit,
  parseNfceQrPayload,
} from '../utils/fleet.calculations';

export const fuelingFormSchema = z.object({
  vehicleId: z.string().min(1, 'Selecione um veículo'),
  driverId: z.string().min(1, 'Selecione o motorista'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Informe uma data válida'),
  odometer: z
    .number({ error: 'Informe o odômetro atual em km' })
    .finite('Odômetro inválido')
    .positive('O odômetro deve ser maior que zero'),
  fuelType: z.enum(['GASOLINA', 'ETANOL', 'DIESEL', 'GNV', 'ELETRICO', 'FLEX']),
  quantity: z
    .number({ error: 'Informe o volume abastecido' })
    .finite('Volume inválido')
    .positive('O volume deve ser maior que zero')
    .max(2000, 'Volume acima do limite esperado'),
  unitPrice: z
    .number({ error: 'Informe o preço por unidade' })
    .finite('Preço unitário inválido')
    .positive('O preço unitário deve ser maior que zero'),
  totalCost: z
    .number({ error: 'Informe o valor total pago' })
    .finite('Valor total inválido')
    .positive('O valor total deve ser maior que zero'),
  fullTank: z.boolean(),
  stationName: z.string().trim().max(150).optional(),
  nfceKey: z.string().trim().max(120).optional(),
  odometerPhotoUrl: z.string().optional(),
  notes: z.string().trim().max(500).optional(),
});

export type FuelingFormValues = z.infer<typeof fuelingFormSchema>;

export interface FuelingFormProps {
  initialVehicleId?: string | undefined;
  onSuccess?: (() => void) | undefined;
  onCancel?: (() => void) | undefined;
  submitLabel?: string | undefined;
}

const TODAY_ISO = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

export const FuelingForm: React.FC<FuelingFormProps> = ({
  initialVehicleId,
  onSuccess,
  onCancel,
  submitLabel = 'Salvar Abastecimento',
}) => {
  const { snapshot, selectedVehicleFilter, addFueling } = useFleet();
  const [showNfceImporter, setShowNfceImporter] = useState(false);
  const [nfceRawInput, setNfceRawInput] = useState('');
  const [isScanningReceipt, setIsScanningReceipt] = useState(false);
  const [ocrStatus, setOcrStatus] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const defaultVehicleId =
    initialVehicleId ??
    (selectedVehicleFilter !== 'TODOS'
      ? selectedVehicleFilter
      : snapshot.vehicles[0]?.id ?? '');

  const defaultVehicle = snapshot.vehicles.find((v) => v.id === defaultVehicleId);

  const defaultValues: FuelingFormValues = {
    vehicleId: defaultVehicleId,
    driverId: defaultVehicle?.assignedDriverId ?? snapshot.drivers[0]?.id ?? '',
    date: TODAY_ISO,
    odometer: defaultVehicle?.currentOdometer ?? 0,
    fuelType:
      defaultVehicle?.fuelType === 'FLEX'
        ? 'GASOLINA'
        : defaultVehicle?.fuelType ?? 'DIESEL',
    quantity: 0,
    unitPrice: 0,
    totalCost: 0,
    fullTank: true,
    stationName: '',
    nfceKey: '',
    odometerPhotoUrl: undefined,
    notes: '',
  };

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FuelingFormValues>({
    resolver: zodResolver(fuelingFormSchema),
    defaultValues,
    mode: 'onBlur',
  });

  const watchedVehicleId = watch('vehicleId');
  const watchedFuelType = watch('fuelType');
  const watchedOdometer = watch('odometer');
  const watchedQuantity = watch('quantity');
  const watchedUnitPrice = watch('unitPrice');
  const watchedTotalCost = watch('totalCost');
  const watchedFullTank = watch('fullTank');
  const watchedPhotoUrl = watch('odometerPhotoUrl');

  const currentVehicle = useMemo(
    () => snapshot.vehicles.find((v) => v.id === watchedVehicleId),
    [snapshot.vehicles, watchedVehicleId]
  );

  useEffect(() => {
    if (!currentVehicle) return;
    const nextFuelType: FuelType =
      currentVehicle.fuelType === 'FLEX' ? 'GASOLINA' : currentVehicle.fuelType;
    setValue('fuelType', nextFuelType, { shouldValidate: true });
    if (currentVehicle.assignedDriverId) {
      setValue('driverId', currentVehicle.assignedDriverId, { shouldValidate: true });
    }
    setValue('odometer', currentVehicle.currentOdometer + 250, {
      shouldValidate: true,
    });
  }, [currentVehicle, setValue]);

  const unitLabel = getFuelUnit(watchedFuelType);

  /**
   * Prévia em tempo real da autonomia (km/L ou km/kWh) e alerta de anomalia >= 15%.
   */
  const autonomyPreview = useMemo(() => {
    if (!watchedVehicleId || !Number.isFinite(watchedOdometer) || !Number.isFinite(watchedQuantity)) {
      return null;
    }
    if (watchedQuantity <= 0 || watchedOdometer <= 0) return null;

    const allVehicleFuelings = snapshot.fuelings.filter((f) => f.vehicleId === watchedVehicleId);
    const vehicleRecords = allVehicleFuelings
      .filter((f) => f.odometer < watchedOdometer)
      .sort((a, b) => a.odometer - b.odometer);

    let lastFullIndex = -1;
    for (let i = vehicleRecords.length - 1; i >= 0; i -= 1) {
      if (vehicleRecords[i]!.fullTank) {
        lastFullIndex = i;
        break;
      }
    }

    if (lastFullIndex === -1) {
      return {
        status: 'NO_BASELINE' as const,
        distanceKm: 0,
        avg: null,
        anomalyDropPct: null,
      };
    }

    const baseRecord = vehicleRecords[lastFullIndex]!;
    const partialsQty = vehicleRecords
      .slice(lastFullIndex + 1)
      .reduce((sum, item) => sum + item.quantity, 0);

    const totalQtyInInterval = partialsQty + watchedQuantity;
    const distanceKm = watchedOdometer - baseRecord.odometer;

    if (distanceKm <= 0 || totalQtyInInterval <= 0) {
      return null;
    }

    const avg = Number((distanceKm / totalQtyInInterval).toFixed(2));

    // Compara contra a média histórica deste veículo no mesmo combustível
    const historicalAvgs = allVehicleFuelings
      .filter((f) => f.fuelType === watchedFuelType && typeof f.calculatedAvg === 'number' && f.calculatedAvg > 0)
      .map((f) => f.calculatedAvg as number);

    let anomalyDropPct: number | null = null;
    if (watchedFullTank && historicalAvgs.length > 0) {
      const baseline = historicalAvgs.reduce((a, b) => a + b, 0) / historicalAvgs.length;
      const drop = ((baseline - avg) / baseline) * 100;
      if (drop >= 15) {
        anomalyDropPct = Number(drop.toFixed(1));
      }
    }

    return {
      status: watchedFullTank ? ('CALCULATED' as const) : ('PARTIAL' as const),
      distanceKm,
      avg,
      baseOdometer: baseRecord.odometer,
      anomalyDropPct,
    };
  }, [
    snapshot.fuelings,
    watchedVehicleId,
    watchedOdometer,
    watchedQuantity,
    watchedFullTank,
    watchedFuelType,
  ]);

  const handleQuantityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.valueAsNumber;
    setValue('quantity', raw, { shouldValidate: true, shouldDirty: true });
    if (Number.isFinite(raw) && raw > 0 && Number.isFinite(watchedUnitPrice) && watchedUnitPrice > 0) {
      setValue('totalCost', Number((raw * watchedUnitPrice).toFixed(2)), {
        shouldValidate: true,
      });
    }
  };

  const handleUnitPriceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.valueAsNumber;
    setValue('unitPrice', raw, { shouldValidate: true, shouldDirty: true });
    if (Number.isFinite(raw) && raw > 0 && Number.isFinite(watchedQuantity) && watchedQuantity > 0) {
      setValue('totalCost', Number((watchedQuantity * raw).toFixed(2)), {
        shouldValidate: true,
      });
    }
  };

  const handleTotalCostChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.valueAsNumber;
    setValue('totalCost', raw, { shouldValidate: true, shouldDirty: true });
    if (Number.isFinite(raw) && raw > 0 && Number.isFinite(watchedQuantity) && watchedQuantity > 0) {
      setValue('unitPrice', Number((raw / watchedQuantity).toFixed(3)), {
        shouldValidate: true,
      });
    }
  };

  const handleApplyNfce = (payloadText: string) => {
    const parsed = parseNfceQrPayload(payloadText);
    if (!parsed) {
      toast.error('Não foi possível extrair dados válidos deste QR Code ou chave NFC-e.');
      return;
    }
    setValue('nfceKey', parsed.nfceKey);
    if (parsed.date) setValue('date', parsed.date, { shouldValidate: true });
    if (parsed.stationName) setValue('stationName', parsed.stationName);
    if (parsed.totalCost && parsed.totalCost > 0) {
      setValue('totalCost', parsed.totalCost, { shouldValidate: true });
      if (Number.isFinite(watchedQuantity) && watchedQuantity > 0) {
        setValue('unitPrice', Number((parsed.totalCost / watchedQuantity).toFixed(3)), {
          shouldValidate: true,
        });
      }
    }
    toast.success('Cupom NFC-e importado para o formulário.');
    setShowNfceImporter(false);
  };

  const handlePhotoUpload = (file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setValue('odometerPhotoUrl', reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleReceiptOcrUpload = async (file: File | undefined) => {
    if (!file) return;
    setIsScanningReceipt(true);
    setOcrStatus(null);

    try {
      const result: ParsedReceiptResult = await parseReceiptImageWithGemini(
        file,
        'ABASTECIMENTO'
      );

      setValue('odometerPhotoUrl', result.previewDataUrl);

      const filledFields: string[] = [];

      if (result.date) {
        setValue('date', result.date, { shouldValidate: true, shouldDirty: true });
        filledFields.push(`Data (${formatDateBR(result.date)})`);
      }

      if (result.quantity && result.quantity > 0) {
        setValue('quantity', result.quantity, { shouldValidate: true, shouldDirty: true });
      }

      if (result.totalCost && result.totalCost > 0) {
        setValue('totalCost', result.totalCost, { shouldValidate: true, shouldDirty: true });
        filledFields.push(`Valor total (${formatBRL(result.totalCost)})`);

        const effectiveQty =
          result.quantity && result.quantity > 0 ? result.quantity : watchedQuantity;
        if (result.unitPrice && result.unitPrice > 0) {
          setValue('unitPrice', result.unitPrice, { shouldValidate: true, shouldDirty: true });
        } else if (Number.isFinite(effectiveQty) && effectiveQty > 0) {
          setValue('unitPrice', Number((result.totalCost / effectiveQty).toFixed(3)), {
            shouldValidate: true,
            shouldDirty: true,
          });
        }
      } else if (result.unitPrice && result.unitPrice > 0) {
        setValue('unitPrice', result.unitPrice, { shouldValidate: true, shouldDirty: true });
      }

      if (result.supplierName) {
        setValue('stationName', result.supplierName, { shouldDirty: true });
      }
      if (result.invoiceNumber) {
        setValue('nfceKey', result.invoiceNumber, { shouldDirty: true });
      }

      if (filledFields.length > 0) {
        const msg = `Leitura concluída: ${filledFields.join(' e ')}.`;
        setOcrStatus({ type: 'success', message: msg });
        toast.success(msg);
      } else {
        const msg =
          'A foto foi anexada, mas valor total e data não estavam legíveis. Confira ou tente outra foto.';
        setOcrStatus({ type: 'error', message: msg });
        toast.error(msg);
      }
    } catch (error) {
      const msg =
        error instanceof Error
          ? error.message
          : 'Erro ao analisar a foto da nota fiscal.';
      setOcrStatus({ type: 'error', message: msg });
      toast.error(msg);
    } finally {
      setIsScanningReceipt(false);
    }
  };

  const onSubmit = async (values: FuelingFormValues) => {
    await addFueling({
      vehicleId: values.vehicleId,
      driverId: values.driverId,
      date: values.date,
      odometer: values.odometer,
      fuelType: values.fuelType,
      quantity: values.quantity,
      unitPrice: values.unitPrice,
      totalCost: values.totalCost,
      fullTank: values.fullTank,
      stationName: values.stationName || undefined,
      nfceKey: values.nfceKey || undefined,
      odometerPhotoUrl: values.odometerPhotoUrl || undefined,
      notes: values.notes || undefined,
    });
    reset(defaultValues);
    onSuccess?.();
  };

  const odometerBelowCurrent =
    currentVehicle &&
    Number.isFinite(watchedOdometer) &&
    watchedOdometer > 0 &&
    watchedOdometer < currentVehicle.currentOdometer;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      {/* Barra auxiliar: Leitura de NF por Foto (Gemini), Cupom NFC-e e Foto do Odômetro */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[#E7E1D5]">
        <div className="flex flex-wrap items-center gap-2">
          <label
            className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border text-xs font-medium transition-colors ${
              isScanningReceipt
                ? 'border-[#B99555] bg-[#B99555]/15 text-[#0C1928] cursor-wait'
                : 'border-[#173D4A] bg-[#173D4A] hover:bg-[#0C1928] text-white cursor-pointer'
            }`}
          >
            {isScanningReceipt ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <ScanLine className="h-3.5 w-3.5 text-[#B99555]" />
            )}
            <span>
              {isScanningReceipt ? 'Lendo nota fiscal...' : 'Ler Nota Fiscal (Foto)'}
            </span>
            <input
              type="file"
              accept="image/*"
              disabled={isScanningReceipt}
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                void handleReceiptOcrUpload(file);
              }}
            />
          </label>

          <button
            type="button"
            onClick={() => setShowNfceImporter((v) => !v)}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-[#E7E1D5] bg-[#F7F8FA] hover:bg-[#E7E1D5]/40 text-xs font-medium text-[#173D4A] transition-colors cursor-pointer"
          >
            <QrCode className="h-3.5 w-3.5" />
            <span>QR / Chave NFC-e</span>
          </button>
        </div>

        <label className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-[#E7E1D5] bg-[#F7F8FA] hover:bg-[#E7E1D5]/40 text-xs font-medium text-[#0C1928] cursor-pointer transition-colors">
          <Camera className="h-3.5 w-3.5 text-[#173D4A]" />
          <span>{watchedPhotoUrl ? 'Foto anexada' : 'Foto do painel'}</span>
          <input
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(e) => handlePhotoUpload(e.target.files?.[0])}
          />
        </label>
      </div>

      {ocrStatus && (
        <div
          className={`px-3.5 py-2.5 rounded-lg border text-xs font-medium ${
            ocrStatus.type === 'success'
              ? 'bg-[#2E6F5E]/10 border-[#2E6F5E]/30 text-[#2E6F5E]'
              : 'bg-[#9E3B3B]/10 border-[#9E3B3B]/30 text-[#9E3B3B]'
          }`}
        >
          {ocrStatus.message}
        </div>
      )}

      {showNfceImporter && (
        <div className="p-3.5 rounded-lg bg-[#F7F8FA] border border-[#E7E1D5] space-y-2.5">
          <p className="text-xs font-medium text-[#0C1928]">
            Cole a URL do QR Code da NFC-e (SEFAZ) ou chave de 44 dígitos
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={nfceRawInput}
              onChange={(e) => setNfceRawInput(e.target.value)}
              placeholder="https://www.nfce.fazenda.sp.gov.br/...?p=3526...&vNF=312.50"
              className="flex-1 h-9 rounded-lg border border-[#E7E1D5] bg-white px-3 text-xs font-mono-tabular"
            />
            <button
              type="button"
              onClick={() => handleApplyNfce(nfceRawInput)}
              className="h-9 px-3 rounded-lg bg-[#173D4A] text-white text-xs font-medium whitespace-nowrap"
            >
              Aplicar
            </button>
          </div>

        </div>
      )}

      {/* Veículo e Motorista */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="fueling-vehicle" className="block text-xs font-medium text-[#0C1928] mb-1.5">
            Veículo
          </label>
          <select
            id="fueling-vehicle"
            {...register('vehicleId')}
            className="w-full h-10 rounded-lg border border-[#E7E1D5] bg-white px-3 text-sm text-[#0C1928] focus:outline-none focus:ring-2 focus:ring-[#173D4A]"
          >
            {snapshot.vehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {v.plate} — {v.brand} {v.model}
              </option>
            ))}
          </select>
          {errors.vehicleId && (
            <p className="mt-1 text-[11px] font-medium text-[#9E3B3B]">{errors.vehicleId.message}</p>
          )}
          {currentVehicle && (
            <p className="mt-1 text-[11px] text-[#5C6B7A] font-mono-tabular">
              Odômetro atual: {formatKm(currentVehicle.currentOdometer)}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="fueling-driver" className="block text-xs font-medium text-[#0C1928] mb-1.5">
            Motorista
          </label>
          <select
            id="fueling-driver"
            {...register('driverId')}
            className="w-full h-10 rounded-lg border border-[#E7E1D5] bg-white px-3 text-sm text-[#0C1928] focus:outline-none focus:ring-2 focus:ring-[#173D4A]"
          >
            {snapshot.drivers.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          {errors.driverId && (
            <p className="mt-1 text-[11px] font-medium text-[#9E3B3B]">{errors.driverId.message}</p>
          )}
        </div>
      </div>

      {/* Data, Odômetro e Combustível */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label htmlFor="fueling-date" className="block text-xs font-medium text-[#0C1928] mb-1.5">
            Data
          </label>
          <input
            id="fueling-date"
            type="date"
            {...register('date')}
            className="w-full h-10 rounded-lg border border-[#E7E1D5] bg-white px-3 text-sm font-mono-tabular focus:outline-none focus:ring-2 focus:ring-[#173D4A]"
          />
          {errors.date && (
            <p className="mt-1 text-[11px] font-medium text-[#9E3B3B]">{errors.date.message}</p>
          )}
        </div>

        <div>
          <label htmlFor="fueling-odometer" className="block text-xs font-medium text-[#0C1928] mb-1.5">
            Odômetro (km)
          </label>
          <input
            id="fueling-odometer"
            type="number"
            step="1"
            {...register('odometer', { valueAsNumber: true })}
            className="w-full h-10 rounded-lg border border-[#E7E1D5] bg-white px-3 text-sm font-mono-tabular focus:outline-none focus:ring-2 focus:ring-[#173D4A]"
          />
          {errors.odometer && (
            <p className="mt-1 text-[11px] font-medium text-[#9E3B3B]">{errors.odometer.message}</p>
          )}
          {!errors.odometer && odometerBelowCurrent && (
            <p className="mt-1 text-[11px] text-[#A66E1E]">
              Abaixo do odômetro atual (lançamento retroativo).
            </p>
          )}
        </div>

        <div>
          <label htmlFor="fueling-type" className="block text-xs font-medium text-[#0C1928] mb-1.5">
            Combustível
          </label>
          <select
            id="fueling-type"
            {...register('fuelType')}
            className="w-full h-10 rounded-lg border border-[#E7E1D5] bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#173D4A]"
          >
            <option value="GASOLINA">Gasolina</option>
            <option value="ETANOL">Etanol</option>
            <option value="DIESEL">Diesel S10</option>
            <option value="ELETRICO">Elétrico (kWh)</option>
            <option value="GNV">GNV (m³)</option>
          </select>
        </div>
      </div>

      {/* Volume, Preço Unitário e Valor Total */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label htmlFor="fueling-quantity" className="block text-xs font-medium text-[#0C1928] mb-1.5">
            Volume ({unitLabel})
          </label>
          <input
            id="fueling-quantity"
            type="number"
            step="0.01"
            {...register('quantity', { valueAsNumber: true })}
            onChange={handleQuantityChange}
            className="w-full h-10 rounded-lg border border-[#E7E1D5] bg-white px-3 text-sm font-mono-tabular focus:outline-none focus:ring-2 focus:ring-[#173D4A]"
          />
          {errors.quantity && (
            <p className="mt-1 text-[11px] font-medium text-[#9E3B3B]">{errors.quantity.message}</p>
          )}
        </div>

        <div>
          <label htmlFor="fueling-unit-price" className="block text-xs font-medium text-[#0C1928] mb-1.5">
            Preço / {unitLabel} (R$)
          </label>
          <input
            id="fueling-unit-price"
            type="number"
            step="0.001"
            {...register('unitPrice', { valueAsNumber: true })}
            onChange={handleUnitPriceChange}
            className="w-full h-10 rounded-lg border border-[#E7E1D5] bg-white px-3 text-sm font-mono-tabular focus:outline-none focus:ring-2 focus:ring-[#173D4A]"
          />
          {errors.unitPrice && (
            <p className="mt-1 text-[11px] font-medium text-[#9E3B3B]">{errors.unitPrice.message}</p>
          )}
        </div>

        <div>
          <label htmlFor="fueling-total-cost" className="block text-xs font-medium text-[#0C1928] mb-1.5">
            Valor Total (R$)
          </label>
          <input
            id="fueling-total-cost"
            type="number"
            step="0.01"
            {...register('totalCost', { valueAsNumber: true })}
            onChange={handleTotalCostChange}
            className="w-full h-10 rounded-lg border border-[#E7E1D5] bg-white px-3 text-sm font-semibold font-mono-tabular text-[#173D4A] focus:outline-none focus:ring-2 focus:ring-[#173D4A]"
          />
          {errors.totalCost && (
            <p className="mt-1 text-[11px] font-medium text-[#9E3B3B]">{errors.totalCost.message}</p>
          )}
        </div>
      </div>

      {/* Posto e Tanque Cheio */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
        <div>
          <label htmlFor="fueling-station" className="block text-xs font-medium text-[#0C1928] mb-1.5">
            Posto / Eletroposto
          </label>
          <input
            id="fueling-station"
            type="text"
            placeholder="Ex: Posto Graal Bandeirantes"
            {...register('stationName')}
            className="w-full h-10 rounded-lg border border-[#E7E1D5] bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#173D4A]"
          />
        </div>

        <label className="flex items-center gap-2.5 sm:pt-5 cursor-pointer select-none">
          <input
            type="checkbox"
            {...register('fullTank')}
            className="h-4 w-4 rounded border-[#E7E1D5] text-[#173D4A] focus:ring-[#173D4A]"
          />
          <span className="text-xs font-medium text-[#0C1928]">
            Tanque cheio / Carga completa (calcula km/{unitLabel})
          </span>
        </label>
      </div>

      {watchedPhotoUrl && (
        <div className="flex items-center gap-3">
          <img
            src={watchedPhotoUrl}
            alt="Foto do painel / comprovante"
            className="h-14 w-20 object-cover rounded-lg border border-[#E7E1D5]"
          />
          <button
            type="button"
            onClick={() => setValue('odometerPhotoUrl', undefined)}
            className="text-xs font-medium text-[#9E3B3B] hover:underline"
          >
            Remover foto
          </button>
        </div>
      )}

      {/* Prévia em Tempo Real do Cálculo de km/L + Alerta de Anomalia */}
      <div className="px-4 py-3 rounded-lg bg-[#F7F8FA] border border-[#E7E1D5] space-y-1.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="text-xs text-[#5C6B7A]">
            {autonomyPreview?.status === 'CALCULATED' && (
              <span>
                Consumo apurado em{' '}
                <strong className="font-mono-tabular text-[#0C1928]">
                  {formatNumberBR(autonomyPreview.distanceKm, 0)} km
                </strong>{' '}
                (desde {formatKm(autonomyPreview.baseOdometer)})
              </span>
            )}
            {autonomyPreview?.status === 'PARTIAL' && (
              <span>
                Abastecimento parcial: este volume será somado ao próximo tanque cheio.
              </span>
            )}
            {autonomyPreview?.status === 'NO_BASELINE' && (
              <span>
                Primeiro marco de tanque cheio — servirá de referência para o próximo cálculo.
              </span>
            )}
            {!autonomyPreview && (
              <span>Informe odômetro e volume válidos para apurar a autonomia.</span>
            )}
          </div>

          <div className="flex items-center gap-4 shrink-0 font-mono-tabular">
            {Number.isFinite(watchedTotalCost) && watchedTotalCost > 0 && autonomyPreview?.distanceKm ? (
              <span className="text-xs text-[#5C6B7A]">
                {formatBRL(watchedTotalCost / autonomyPreview.distanceKm)}/km
              </span>
            ) : null}
            <span className="text-sm font-semibold text-[#173D4A]">
              {autonomyPreview?.status === 'CALCULATED' && autonomyPreview.avg
                ? `${formatNumberBR(autonomyPreview.avg, 2)} km/${unitLabel}`
                : '—'}
            </span>
          </div>
        </div>

        {autonomyPreview?.anomalyDropPct !== null && autonomyPreview?.anomalyDropPct !== undefined && (
          <div className="flex items-center gap-1.5 text-xs font-medium text-[#9E3B3B]">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            <span>
              Anomalia detectada: rendimento {formatNumberBR(autonomyPreview.anomalyDropPct, 1)}% abaixo da média histórica deste veículo.
            </span>
          </div>
        )}
      </div>

      {/* Ações */}
      <div className="pt-3 border-t border-[#E7E1D5] flex items-center justify-end gap-3">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="h-10 px-4 rounded-lg border border-[#E7E1D5] text-sm font-medium text-[#0C1928] hover:bg-[#F7F8FA] transition-colors"
          >
            Cancelar
          </button>
        )}
        <button
          type="submit"
          disabled={isSubmitting}
          className="h-10 px-5 rounded-lg bg-[#173D4A] hover:bg-[#0C1928] text-white text-sm font-medium transition-colors disabled:opacity-60 cursor-pointer"
        >
          {isSubmitting ? 'Salvando...' : submitLabel}
        </button>
      </div>
    </form>
  );
};
