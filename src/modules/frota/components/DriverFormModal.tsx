import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { useFleet } from '../context/FleetContext';
import { driverSchema } from '../schemas/fleet.schemas';
import type { Driver } from '../types/fleet.types';

interface DriverFormModalProps {
  open: boolean;
  editingDriver: Driver | null;
  onClose: () => void;
}

export const DriverFormModal: React.FC<DriverFormModalProps> = ({
  open,
  editingDriver,
  onClose,
}) => {
  const { snapshot, upsertDriver } = useFleet();

  const [name, setName] = useState('');
  const [cnhNumber, setCnhNumber] = useState('');
  const [cnhCategory, setCnhCategory] = useState('B');
  const [cnhExpiry, setCnhExpiry] = useState('2028-06-30');
  const [phone, setPhone] = useState('');
  const [allowedVehicleIds, setAllowedVehicleIds] = useState<string[]>([]);
  const [active, setActive] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setErrorMsg(null);
      if (editingDriver) {
        setName(editingDriver.name);
        setCnhNumber(editingDriver.cnhNumber);
        setCnhCategory(editingDriver.cnhCategory);
        setCnhExpiry(editingDriver.cnhExpiry);
        setPhone(editingDriver.phone ?? '');
        setAllowedVehicleIds(editingDriver.allowedVehicleIds ?? []);
        setActive(editingDriver.active);
      } else {
        setName('');
        setCnhNumber('');
        setCnhCategory('B');
        setCnhExpiry('2028-06-30');
        setPhone('');
        setAllowedVehicleIds(snapshot.vehicles.map((v) => v.id));
        setActive(true);
      }
    }
  }, [open, editingDriver, snapshot.vehicles]);

  if (!open) return null;

  const toggleVehicle = (id: string) => {
    setAllowedVehicleIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const parsed = driverSchema.safeParse({
      name,
      cnhNumber,
      cnhCategory,
      cnhExpiry,
      phone: phone || undefined,
      allowedVehicleIds,
      active,
    });

    if (!parsed.success) {
      setErrorMsg(parsed.error.issues[0]?.message ?? 'Dados inválidos.');
      return;
    }

    await upsertDriver({
      id: editingDriver?.id,
      userId: editingDriver?.userId,
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
            {editingDriver ? 'Editar Motorista' : 'Cadastrar Motorista'}
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

          <div>
            <label className="block text-xs font-medium text-[#0C1928] mb-1.5">
              Nome completo
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Carlos Eduardo Mendes"
              className="w-full h-10 rounded-lg border border-[#E7E1D5] px-3 text-sm"
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-[#0C1928] mb-1.5">Nº CNH</label>
              <input
                type="text"
                value={cnhNumber}
                onChange={(e) => setCnhNumber(e.target.value)}
                placeholder="04829104822"
                className="w-full h-10 rounded-lg border border-[#E7E1D5] px-3 text-sm font-mono-tabular"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#0C1928] mb-1.5">Categoria</label>
              <select
                value={cnhCategory}
                onChange={(e) => setCnhCategory(e.target.value)}
                className="w-full h-10 rounded-lg border border-[#E7E1D5] px-3 text-sm"
              >
                <option value="A">A</option>
                <option value="B">B</option>
                <option value="AB">AB</option>
                <option value="C">C</option>
                <option value="D">D</option>
                <option value="E">E</option>
                <option value="AE">AE</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-[#0C1928] mb-1.5">
                Validade CNH
              </label>
              <input
                type="date"
                value={cnhExpiry}
                onChange={(e) => setCnhExpiry(e.target.value)}
                className="w-full h-10 rounded-lg border border-[#E7E1D5] px-3 text-sm font-mono-tabular"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
            <div>
              <label className="block text-xs font-medium text-[#0C1928] mb-1.5">
                Telefone / WhatsApp
              </label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(11) 99999-0000"
                className="w-full h-10 rounded-lg border border-[#E7E1D5] px-3 text-sm"
              />
            </div>
            <label className="flex items-center gap-2.5 pt-5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
                className="h-4 w-4 rounded border-[#E7E1D5] text-[#173D4A]"
              />
              <span className="text-xs font-medium text-[#0C1928]">Motorista habilitado</span>
            </label>
          </div>

          <div>
            <span className="block text-xs font-medium text-[#0C1928] mb-2">
              Veículos autorizados para condução
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-40 overflow-y-auto p-3 rounded-lg bg-[#F7F8FA] border border-[#E7E1D5]">
              {snapshot.vehicles.map((v) => (
                <label
                  key={v.id}
                  className="flex items-center gap-2 text-xs text-[#0C1928] cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={allowedVehicleIds.includes(v.id)}
                    onChange={() => toggleVehicle(v.id)}
                    className="h-4 w-4 rounded border-[#E7E1D5] text-[#173D4A]"
                  />
                  <span className="font-mono-tabular font-medium">{v.plate}</span>
                  <span className="text-[#5C6B7A] truncate">{v.model}</span>
                </label>
              ))}
            </div>
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
              {editingDriver ? 'Salvar Alterações' : 'Cadastrar Motorista'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
