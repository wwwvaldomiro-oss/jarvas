import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { useFleet } from '../context/FleetContext';
import { reminderSchema } from '../schemas/fleet.schemas';
import type { FleetReminder } from '../types/fleet.types';

interface ReminderFormModalProps {
  open: boolean;
  onClose: () => void;
}

export const ReminderFormModal: React.FC<ReminderFormModalProps> = ({ open, onClose }) => {
  const { snapshot, selectedVehicleFilter, addReminder } = useFleet();

  const [vehicleId, setVehicleId] = useState('');
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<FleetReminder['category']>('MANUTENCAO');
  const [dueDate, setDueDate] = useState('');
  const [dueOdometer, setDueOdometer] = useState('');
  const [notes, setNotes] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setErrorMsg(null);
      const defaultVeh =
        selectedVehicleFilter !== 'TODOS'
          ? selectedVehicleFilter
          : snapshot.vehicles[0]?.id ?? '';
      setVehicleId(defaultVeh);
      setTitle('');
      setCategory('MANUTENCAO');
      setDueDate('');
      setDueOdometer('');
      setNotes('');
    }
  }, [open, selectedVehicleFilter, snapshot.vehicles]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const parsed = reminderSchema.safeParse({
      vehicleId,
      title,
      category,
      dueDate: dueDate || undefined,
      dueOdometer: dueOdometer ? Number(dueOdometer) : undefined,
      notes: notes || undefined,
    });

    if (!parsed.success) {
      setErrorMsg(parsed.error.issues[0]?.message ?? 'Verifique os campos.');
      return;
    }

    await addReminder(parsed.data);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0C1928]/60 backdrop-blur-[1px]">
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-md bg-white border border-[#E7E1D5] rounded-[10px] shadow-xl overflow-hidden"
      >
        <div className="px-6 py-4 border-b border-[#E7E1D5] flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold text-[#0C1928]">
            Novo Lembrete Preventivo
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

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {errorMsg && (
            <div className="p-3 rounded-lg bg-[#9E3B3B]/10 border border-[#9E3B3B]/30 text-xs font-medium text-[#9E3B3B]">
              {errorMsg}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-[#0C1928] mb-1.5">Veículo</label>
            <select
              value={vehicleId}
              onChange={(e) => setVehicleId(e.target.value)}
              className="w-full h-10 rounded-lg border border-[#E7E1D5] px-3 text-sm"
            >
              {snapshot.vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.plate} — {v.model}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#0C1928] mb-1.5">
              Título do lembrete
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Revisão 60.000 km ou Renovação Seguro"
              className="w-full h-10 rounded-lg border border-[#E7E1D5] px-3 text-sm"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#0C1928] mb-1.5">Categoria</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as FleetReminder['category'])}
              className="w-full h-10 rounded-lg border border-[#E7E1D5] px-3 text-sm"
            >
              <option value="MANUTENCAO">Manutenção / Revisão</option>
              <option value="DOCUMENTACAO">Documentação / CRLV / IPVA</option>
              <option value="SEGURO">Seguro</option>
              <option value="OUTRO">Outro</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-[#0C1928] mb-1.5">
                Data limite (opcional)
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full h-10 rounded-lg border border-[#E7E1D5] px-3 text-sm font-mono-tabular"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#0C1928] mb-1.5">
                Odômetro alvo (km)
              </label>
              <input
                type="number"
                value={dueOdometer}
                onChange={(e) => setDueOdometer(e.target.value)}
                placeholder="Ex: 50000"
                className="w-full h-10 rounded-lg border border-[#E7E1D5] px-3 text-sm font-mono-tabular"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#0C1928] mb-1.5">Observações</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Instruções adicionais"
              className="w-full h-10 rounded-lg border border-[#E7E1D5] px-3 text-sm"
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
              Criar Lembrete
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
