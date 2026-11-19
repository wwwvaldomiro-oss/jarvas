import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell, useRequireUser } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { buildPortableBackup, parsePortableBackup, serializePortableBackup, type PortableBackup, type PortableCollection } from "@/lib/portable-backup";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

/** Explicit allowlist: exclude credentials, provider tokens and other secrets. */
const TABLES = [
  "agenda_records", "annual_years", "annual_expenses",
  "finance_bills", "finance_account_profiles",
  "finance_card_closed_invoices", "finance_card_debt_links",
  "finance_card_month_snapshots", "installment_contracts", "installment_entries",
  "revenue_contracts", "revenue_entries", "revenue_events", "revenue_sources",
  "fiscal_documents", "fiscal_document_items",
] as const;

export const Route = createFileRoute("/configuracoes/backup")({
  ssr: false,
  component: BackupPage,
});

function BackupPage() {
  const user = useRequireUser();
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<PortableBackup | null>(null);

  async function exportData() {
    setBusy(true);
    try {
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (authError || !auth.user) throw new Error("Faça login para exportar seus dados.");
      const collections: PortableCollection[] = [];
      for (const table of TABLES) {
        // Pagination is essential: Supabase commonly caps individual queries at 1,000 rows.
        const records: PortableCollection["records"] = [];
        for (let from = 0; ; from += 500) {
          const { data, error } = await supabase.from(table).select("*").eq("user_id", auth.user.id).range(from, from + 499);
          if (error) throw new Error(`Falha ao ler ${table}: ${error.message}`);
          const rows = (data ?? []) as Array<Record<string, unknown>>;
          for (const row of rows) {
            if (typeof row.id !== "string") {
              throw new Error(`Tabela ${table} exige um adaptador de chave antes da exportação.`);
            }
            records.push({ id: row.id, data: row });
          }
          if (rows.length < 500) break;
        }
        collections.push({ module: table, records });
      }
      const json = serializePortableBackup(buildPortableBackup("orion", collections));
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `orion-dados-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      toast.success("Exportação parcial concluída. Guarde o arquivo em local seguro.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível exportar.");
    } finally {
      setBusy(false);
    }
  }

  async function inspect(file: File | undefined) {
    if (!file) return;
    try {
      if (file.size > 50 * 1024 * 1024) throw new Error("Arquivo acima do limite de 50 MB para prévia.");
      setPreview(parsePortableBackup(await file.text()));
    } catch (error) {
      setPreview(null);
      toast.error(error instanceof Error ? error.message : "Arquivo inválido.");
    }
  }

  return (
    <AppShell active="perfil" user={user}>
      <section className="mx-auto max-w-3xl space-y-6 p-5 md:p-8">
        <div><h1 className="text-2xl font-semibold">Dados e Backup</h1>
          <p className="mt-2 text-sm text-muted-foreground">Transfira suas informações pessoais entre versões do Órion.</p></div>
        <div className="rounded-xl border bg-card p-5 space-y-3">
          <h2 className="font-semibold">Exportar dados</h2>
          <p className="text-sm text-muted-foreground">Exportação experimental de cadastros selecionados. Ainda não inclui todos os módulos, arquivos anexos ou conteúdo da Nuvem. Credenciais e tokens não são exportados. O JSON gerado não é criptografado.</p>
          <Button disabled={busy || !user} onClick={exportData}>{busy ? "Preparando arquivo..." : "Exportar dados disponíveis"}</Button>
        </div>
        <div className="rounded-xl border bg-card p-5 space-y-3">
          <h2 className="font-semibold">Conferir arquivo para importação</h2>
          <p className="text-sm text-muted-foreground">A importação real ficará disponível após a validação dos vínculos e a implementação de restauração segura. Nenhum registro será alterado nesta etapa.</p>
          <input aria-label="Selecionar backup" type="file" accept=".json,application/json" onChange={(event) => void inspect(event.target.files?.[0])} />
          {preview && <div className="text-sm space-y-1"><p>Origem: {preview.sourceApp}</p><p>Exportado em: {new Date(preview.exportedAt).toLocaleString("pt-BR")}</p>
            <p>{preview.collections.length} coleções, {preview.collections.reduce((sum, c) => sum + c.records.length, 0)} registros.</p>
            <p className="font-medium">Prévia apenas — nenhuma importação realizada.</p></div>}
        </div>
      </section>
    </AppShell>
  );
}
