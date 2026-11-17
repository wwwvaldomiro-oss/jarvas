import React, { useState } from 'react';
import { Check, Copy, Download, RotateCcw, X } from 'lucide-react';
import { toast } from 'sonner';
import { useFleet } from '../context/FleetContext';
import {
  GIT_SUBTREE_COMMANDS,
  TANSTACK_BRIDGE_SNIPPET,
} from '../integration/tanstack-start-bridge';

interface ExportIntegrationDrawerProps {
  open: boolean;
  onClose: () => void;
}

const POSTGRES_SQL_PREVIEW = `-- Tabelas com isolamento multi-tenant via Row Level Security (RLS)
-- public.fleet_vehicles
-- public.fleet_drivers
-- public.fleet_fuelings
-- public.fleet_maintenances
-- public.fleet_ledger
-- public.fleet_checklists
-- public.fleet_routes
-- public.fleet_reminders

ALTER TABLE public.fleet_vehicles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_vehicles" ON public.fleet_vehicles
  USING (organization_id = (auth.jwt() ->> 'organization_id')::uuid)
  WITH CHECK (organization_id = (auth.jwt() ->> 'organization_id')::uuid);`;

export const ExportIntegrationDrawer: React.FC<ExportIntegrationDrawerProps> = ({
  open,
  onClose,
}) => {
  const { snapshot, resetDemoData } = useFleet();
  const [copiedBlock, setCopiedBlock] = useState<string | null>(null);

  if (!open) return null;

  const copyText = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedBlock(id);
      toast.success('Código copiado para a área de transferência.');
      setTimeout(() => setCopiedBlock(null), 2000);
    } catch {
      toast.error('Não foi possível copiar automaticamente.');
    }
  };

  const handleDownloadJson = () => {
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'modulo-frota-snapshot.json');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success('Backup JSON exportado.');
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-[#0C1928]/60 backdrop-blur-[1px]">
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-2xl bg-white h-full border-l border-[#E7E1D5] shadow-2xl flex flex-col"
      >
        <div className="px-6 py-4 border-b border-[#E7E1D5] flex items-center justify-between">
          <div>
            <h2 className="font-display text-lg font-semibold text-[#0C1928]">
              Integração Git & Lovable Cloud
            </h2>
            <p className="text-xs text-[#5C6B7A] mt-0.5">
              Arquitetura desacoplada em src/modules/frota pronta para acoplamento no Órion / Conecta
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#5C6B7A] hover:text-[#0C1928] hover:bg-[#F7F8FA]"
            aria-label="Fechar painel"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-sm font-semibold text-[#0C1928]">
                01. Transmissão via Git Subtree
              </h3>
              <button
                type="button"
                onClick={() => copyText('git', GIT_SUBTREE_COMMANDS)}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-[#173D4A] hover:text-[#0C1928]"
              >
                {copiedBlock === 'git' ? (
                  <Check className="h-3.5 w-3.5" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
                <span>{copiedBlock === 'git' ? 'Copiado' : 'Copiar comandos'}</span>
              </button>
            </div>
            <pre className="p-4 rounded-lg bg-[#0C1928] text-[#F7F8FA] text-xs font-mono-tabular overflow-x-auto leading-relaxed">
              {GIT_SUBTREE_COMMANDS}
            </pre>
          </section>

          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-sm font-semibold text-[#0C1928]">
                02. Ponte TanStack Start (Server Functions + TanStack Query)
              </h3>
              <button
                type="button"
                onClick={() => copyText('tanstack', TANSTACK_BRIDGE_SNIPPET)}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-[#173D4A] hover:text-[#0C1928]"
              >
                {copiedBlock === 'tanstack' ? (
                  <Check className="h-3.5 w-3.5" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
                <span>{copiedBlock === 'tanstack' ? 'Copiado' : 'Copiar código'}</span>
              </button>
            </div>
            <pre className="p-4 rounded-lg bg-[#0C1928] text-[#F7F8FA] text-xs font-mono-tabular overflow-x-auto leading-relaxed">
              {TANSTACK_BRIDGE_SNIPPET}
            </pre>
          </section>

          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-sm font-semibold text-[#0C1928]">
                03. Schema PostgreSQL + RLS (arquivo integration/postgres-rls.sql)
              </h3>
              <button
                type="button"
                onClick={() => copyText('sql', POSTGRES_SQL_PREVIEW)}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-[#173D4A] hover:text-[#0C1928]"
              >
                {copiedBlock === 'sql' ? (
                  <Check className="h-3.5 w-3.5" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
                <span>{copiedBlock === 'sql' ? 'Copiado' : 'Copiar SQL'}</span>
              </button>
            </div>
            <pre className="p-4 rounded-lg bg-[#F7F8FA] border border-[#E7E1D5] text-[#0C1928] text-xs font-mono-tabular overflow-x-auto leading-relaxed">
              {POSTGRES_SQL_PREVIEW}
            </pre>
          </section>

          <section className="pt-4 border-t border-[#E7E1D5] flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-display text-sm font-semibold text-[#0C1928]">
                Dados do Ambiente Local
              </h3>
              <p className="text-xs text-[#5C6B7A]">
                Exporte os registros cadastrados na sua conta.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleDownloadJson}
                className="inline-flex items-center gap-2 h-9 px-3.5 rounded-lg border border-[#E7E1D5] text-xs font-medium text-[#0C1928] hover:bg-[#F7F8FA]"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Exportar JSON</span>
              </button>

            </div>
          </section>
        </div>
      </div>
    </div>
  );
};
