import React, { useEffect, useState } from 'react';
import { RefreshCw, X } from 'lucide-react';
import { toast } from 'sonner';
import { useFleet } from '../context/FleetContext';
import { vehicleSchema } from '../schemas/fleet.schemas';
import type { FuelType, Vehicle, VehicleStatus } from '../types/fleet.types';

interface VehicleFormModalProps {
  open: boolean;
  editingVehicle: Vehicle | null;
  onClose: () => void;
}

export const VehicleFormModal: React.FC<VehicleFormModalProps> = ({
  open,
  editingVehicle,
  onClose,
}) => {
  const { snapshot, upsertVehicle } = useFleet();

  const [plate, setPlate] = useState('');
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [year, setYear] = useState('2025');
  const [fuelType, setFuelType] = useState<FuelType>('FLEX');
  const [currentOdometer, setCurrentOdometer] = useState('0');
  const [status, setStatus] = useState<VehicleStatus>('ATIVO');
  const [assignedDriverId, setAssignedDriverId] = useState('');
  const [renavam, setRenavam] = useState('');
  const [tankCapacityLiters, setTankCapacityLiters] = useState('55');
  const [fipeValue, setFipeValue] = useState('');
  const [monthlyFixedCost, setMonthlyFixedCost] = useState('');
  const [notes, setNotes] = useState('');
  const [fipeLoading, setFipeLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setErrorMsg(null);
      if (editingVehicle) {
        setPlate(editingVehicle.plate);
        setBrand(editingVehicle.brand);
        setModel(editingVehicle.model);
        setYear(String(editingVehicle.year));
        setFuelType(editingVehicle.fuelType);
        setCurrentOdometer(String(editingVehicle.currentOdometer));
        setStatus(editingVehicle.status);
        setAssignedDriverId(editingVehicle.assignedDriverId ?? '');
        setRenavam(editingVehicle.renavam ?? '');
        setTankCapacityLiters(String(editingVehicle.tankCapacityLiters ?? '55'));
        setFipeValue(editingVehicle.fipeValue ? String(editingVehicle.fipeValue) : '');
        setMonthlyFixedCost(
          editingVehicle.monthlyFixedCost ? String(editingVehicle.monthlyFixedCost) : ''
        );
        setNotes(editingVehicle.notes ?? '');
      } else {
        setPlate('');
        setBrand('');
        setModel('');
        setYear('2025');
        setFuelType('FLEX');
        setCurrentOdometer('0');
        setStatus('ATIVO');
        setAssignedDriverId('');
        setRenavam('');
        setTankCapacityLiters('55');
        setFipeValue('');
        setMonthlyFixedCost('');
        setNotes('');
      }
    }
  }, [open, editingVehicle]);

  if (!open) return null;

  const handleLookupFipeBrasilApi = async () => {
    if (!brand.trim()) {
      toast.error('Informe a marca do veículo para consultar a Tabela FIPE.');
      return;
    }
    setFipeLoading(true);
    try {
      const res = await fetch('https://brasilapi.com.br/api/fipe/marcas/v1/carros');
      if (!res.ok) throw new Error('BrasilAPI indisponível');
      const brands = (await res.json()) as { nome: string; valor: string }[];
      const match = brands.find((b) =>
        b.nome.toLowerCase().includes(brand.trim().toLowerCase())
      );
      if (match) {
        setBrand(match.nome);
        toast.success(`Marca localizada na Tabela FIPE (cód. ${match.valor}).`);
      } else {
        toast.info('Marca não localizada na lista automática; informe o valor FIPE manualmente.');
      }
    } catch {
      toast.info('Consulta externa indisponível neste ambiente; preencha o valor FIPE manualmente.');
    } finally {
      setFipeLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const parsed = vehicleSchema.safeParse({
      plate,
      brand,
      model,
      year,
      fuelType,
      currentOdometer,
      status,
      assignedDriverId: assignedDriverId || undefined,
      renavam: renavam || undefined,
      tankCapacityLiters: tankCapacityLiters ? Number(tankCapacityLiters) : undefined,
      fipeValue: fipeValue ? Number(fipeValue) : undefined,
      monthlyFixedCost: monthlyFixedCost ? Number(monthlyFixedCost) : undefined,
      notes: notes || undefined,
    });

    if (!parsed.success) {
      setErrorMsg(parsed.error.issues[0]?.message ?? 'Dados inválidos.');
      return;
    }

    await upsertVehicle({
      id: editingVehicle?.id,
      ...parsed.data,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0C1928]/60 backdrop-blur-[1px]">
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-lg bg-white border border-[#E7E1D5] rounded-[10px] shadow-xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        <div className="px-6 py-4 border-b border-[#E7E1D5] flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold text-[#0C1928]">
            {editingVehicle ? `Editar Veículo · ${editingVehicle.plate}` : 'Cadastrar Veículo'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#5C6B7A] hover:text-[#0C1928] hover:bg-[#F7F8FA]"
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
          {errorMsg && (
            <div className="p-3 rounded-lg bg-[#9E3B3B]/10 border border-[#9E3B3B]/30 text-xs font-medium text-[#9E3B3B]">
              {errorMsg}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-[#0C1928] mb-1.5">Placa</label>
              <input
                type="text"
                value={plate}
                onChange={(e) => setPlate(e.target.value.toUpperCase())}
                placeholder="ABC1D23"
                maxLength={8}
                className="w-full h-10 rounded-lg border border-[#E7E1D5] px-3 text-sm font-mono-tabular uppercase"
                required
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-medium text-[#0C1928]">Marca</label>
                <button
                  type="button"
                  onClick={handleLookupFipeBrasilApi}
                  disabled={fipeLoading}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-[#173D4A] hover:underline"
                >
                  <RefreshCw className={`h-3 w-3 ${fipeLoading ? 'animate-spin' : ''}`} />
                  <span>FIPE</span>
                </button>
              </div>
              <input
                type="text"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                placeholder="Toyota, Fiat..."
                className="w-full h-10 rounded-lg border border-[#E7E1D5] px-3 text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#0C1928] mb-1.5">Ano</label>
              <input
                type="number"
                value={year}
                onChange={(e) => setYear(e.target.value)}
                className="w-full h-10 rounded-lg border border-[#E7E1D5] px-3 text-sm font-mono-tabular"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-[#0C1928] mb-1.5">
                Modelo / Versão
              </label>
              <input
                type="text"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="Ex: Hilux CD SRX 2.8"
                className="w-full h-10 rounded-lg border border-[#E7E1D5] px-3 text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#0C1928] mb-1.5">
                Combustível Principal
              </label>
              <select
                value={fuelType}
                onChange={(e) => setFuelType(e.target.value as FuelType)}
                className="w-full h-10 rounded-lg border border-[#E7E1D5] px-3 text-sm"
              >
                <option value="FLEX">Flex (Gasolina / Etanol)</option>
                <option value="GASOLINA">Gasolina</option>
                <option value="ETANOL">Etanol</option>
                <option value="DIESEL">Diesel S10</option>
                <option value="ELETRICO">Elétrico (BEV)</option>
                <option value="GNV">GNV</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-[#0C1928] mb-1.5">
                Odômetro atual (km)
              </label>
              <input
                type="number"
                value={currentOdometer}
                onChange={(e) => setCurrentOdometer(e.target.value)}
                className="w-full h-10 rounded-lg border border-[#E7E1D5] px-3 text-sm font-mono-tabular"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#0C1928] mb-1.5">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as VehicleStatus)}
                className="w-full h-10 rounded-lg border border-[#E7E1D5] px-3 text-sm"
              >
                <option value="ATIVO">Em operação</option>
                <option value="MANUTENCAO">Em manutenção</option>
                <option value="INATIVO">Inativo</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-[#0C1928] mb-1.5">
                Tanque / Bateria
              </label>
              <input
                type="number"
                value={tankCapacityLiters}
                onChange={(e) => setTankCapacityLiters(e.target.value)}
                placeholder="Litros ou kWh"
                className="w-full h-10 rounded-lg border border-[#E7E1D5] px-3 text-sm font-mono-tabular"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-[#0C1928] mb-1.5">
                Valor FIPE (R$) — para TCO
              </label>
              <input
                type="number"
                step="100"
                value={fipeValue}
                onChange={(e) => setFipeValue(e.target.value)}
                placeholder="Ex: 145000"
                className="w-full h-10 rounded-lg border border-[#E7E1D5] px-3 text-sm font-mono-tabular"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#0C1928] mb-1.5">
                Custo fixo mensal (R$)
              </label>
              <input
                type="number"
                step="10"
                value={monthlyFixedCost}
                onChange={(e) => setMonthlyFixedCost(e.target.value)}
                placeholder="Seguro + IPVA rateado"
                className="w-full h-10 rounded-lg border border-[#E7E1D5] px-3 text-sm font-mono-tabular"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-[#0C1928] mb-1.5">
                Motorista titular
              </label>
              <select
                value={assignedDriverId}
                onChange={(e) => setAssignedDriverId(e.target.value)}
                className="w-full h-10 rounded-lg border border-[#E7E1D5] px-3 text-sm"
              >
                <option value="">Sem vínculo fixo</option>
                {snapshot.drivers.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-[#0C1928] mb-1.5">RENAVAM</label>
              <input
                type="text"
                value={renavam}
                onChange={(e) => setRenavam(e.target.value)}
                placeholder="Opcional"
                className="w-full h-10 rounded-lg border border-[#E7E1D5] px-3 text-sm font-mono-tabular"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#0C1928] mb-1.5">Observações</label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Centro de custo, apólice ou observações operacionais"
              className="w-full rounded-lg border border-[#E7E1D5] px-3 py-2 text-sm"
            />
          </div>

          <div className="pt-3 border-t border-[#E7E1D5] flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="h-10 px-4 rounded-lg border border-[#E7E1D5] text-sm font-medium text-[#0C1928] hover:bg-[#F7F8FA]"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="h-10 px-5 rounded-lg bg-[#173D4A] hover:bg-[#0C1928] text-white text-sm font-medium transition-colors cursor-pointer"
            >
              {editingVehicle ? 'Salvar Alterações' : 'Cadastrar Veículo'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
