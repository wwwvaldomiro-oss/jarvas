import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Copy, Filter, Pencil, Printer, Settings, X } from "lucide-react";
import { toast } from "sonner";
import { AppShell, useRequireUser } from "@/components/AppShell";
import { PayDialog, type PayTarget } from "@/components/finance/PayDialog";
import { AttachmentButton } from "@/components/finance/AttachmentButton";
import { Button } from "@/components/ui/button";
import { displayNote, expensePaymentAdjustment, formatAdjustmentPercent, formatBRL, formatDateBR, monthOfDueDate } from "@/lib/finance/money";
import { getHistory } from "@/lib/finance/finance.functions";

export const Route = createFileRoute("/historico-pagamentos")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Histórico de Pagamentos — Órion" },
      { name: "description", content: "Todos os pagamentos confirmados, agrupados pelo mês de vencimento." },
      { property: "og:title", content: "Histórico de Pagamentos — Órion" },
      { property: "og:description", content: "Todos os pagamentos confirmados, agrupados pelo mês de vencimento." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: HistoricoPage,
});

type HistoryItem = {
  kind: "bill" | "installment";
  id: string;
  creditor: string;
  expectedCents: number;
  dueDate: string;
  paidDate: string;
  paidCents: number;
  is_settled: boolean;
  note: string | null;
  contractId: string | null;
  installmentNumber: number | null;
};

function HistoryDifference({ expected, paid, quits }: { expected: number; paid: number; quits: boolean }) {
  const adjustment = expensePaymentAdjustment(expected, paid, quits);
  if (adjustment.kind === "discount" || adjustment.kind === "surcharge") {
    return <div className={`flex flex-col font-semibold ${adjustment.kind === "discount" ? "text-blue-600 dark:text-blue-400" : "text-red-600 dark:text-red-400"}`}>
      <span>{adjustment.kind === "discount" ? "Desconto" : "Acréscimo"}</span>
      <span>{formatAdjustmentPercent(adjustment.percent)}</span>
      <span>{formatBRL(adjustment.differenceCents)}</span>
    </div>;
  }
  if (adjustment.kind === "settled") return <span className="text-success">Quitado</span>;
  return <span className="text-amber-700 dark:text-amber-300">
    {adjustment.openCents > 0 ? `Em aberto: ${formatBRL(adjustment.openCents)}` : "Aguardando quitação"}
  </span>;
}

function AccountingMoney({ cents, paid = false }: { cents: number; paid?: boolean }) {
  // Keep the currency marker fixed and align digits by their decimal separator.
  const amount = formatBRL(cents).replace(/^R\$\s*/, "");
  return (
    <span className={`inline-grid min-w-[106px] grid-cols-[auto_1fr] items-baseline gap-2 rounded-md px-2 py-1 tabular-nums ${paid ? "bg-emerald-50 font-bold text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300" : "text-foreground"}`}>
      <span className="text-xs">R$</span>
      <span className="text-right">{amount}</span>
    </span>
  );
}

function HistoricoPage() {
  const user = useRequireUser();
  const qc = useQueryClient();
  const [year, setYear] = useState<number | null>(null);
  const [creditor, setCreditor] = useState<string | null>(null);
  const [month, setMonth] = useState<number | null>(null);
  const [activeMenu, setActiveMenu] = useState<"filter" | "settings" | null>(null);
  const [payTarget, setPayTarget] = useState<PayTarget | null>(null);

  const historyFn = useServerFn(getHistory);
  const q = useQuery({
    queryKey: ["history", year, creditor],
    queryFn: () => historyFn({ data: { year, creditor } }),
    enabled: !!user,
  });

  const items = (q.data?.items ?? []) as HistoryItem[];
  const filteredItems = month === null ? items : items.filter((it) => Number(it.dueDate.slice(5, 7)) === month);
  const groups = new Map<string, HistoryItem[]>();
  for (const it of filteredItems) {
    const key = monthOfDueDate(it.dueDate);
    groups.set(key, [...(groups.get(key) ?? []), it]);
  }

  function groupLabel(key: string) {
    const [gy = 0, gm = 1] = key.split("-").map(Number);
    const label = new Date(gy, gm - 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
    return label.charAt(0).toUpperCase() + label.slice(1);
  }

  async function copyReport() {
    const lines: string[] = ["Histórico de Pagamentos — Órion", ""];
    for (const [key, list] of groups) {
      lines.push(groupLabel(key));
      lines.push(["Credor", "Valor Previsto", "Vencimento", "Pagamento", "Valor Pago", "Diferença", "Observação"].join("\t"));
      for (const it of list) {
        lines.push([
          it.creditor, formatBRL(it.expectedCents), formatDateBR(it.dueDate), formatDateBR(it.paidDate),
          formatBRL(it.paidCents), (() => {
            const adj = expensePaymentAdjustment(it.expectedCents, it.paidCents, it.is_settled);
            if (adj.kind === "discount" || adj.kind === "surcharge")
              return `${adj.kind === "discount" ? "Desconto" : "Acréscimo"} ${formatAdjustmentPercent(adj.percent)} — ${formatBRL(adj.differenceCents)}`;
            if (adj.kind === "settled") return "Quitado";
            return adj.openCents > 0 ? `Em aberto: ${formatBRL(adj.openCents)}` : "Aguardando quitação";
          })(),
          displayNote({ due_date: it.dueDate, paid_date: it.paidDate, expected_cents: it.expectedCents, paid_cents: it.paidCents, note: it.note, is_settled: it.is_settled }),
        ].join("\t"));
      }
      lines.push("");
    }
    await navigator.clipboard.writeText(lines.join("\n"));
    toast.success("Relatório copiado para a área de transferência.");
  }

  return (
    <AppShell active="historico" user={user}>
      <div className="p-6 lg:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Controle financeiro</div>
            <h1 className="text-3xl font-extrabold">Histórico de Pagamentos</h1>
            <p className="text-sm text-muted-foreground">Pagamentos confirmados</p>
          </div>
          <div className="no-print flex flex-wrap items-start gap-2">
            <div className="relative">
              <Button variant="outline" aria-expanded={activeMenu === "filter"} aria-label="Abrir filtros" onClick={() => setActiveMenu(activeMenu === "filter" ? null : "filter")}>
                <Filter className="size-4" /> Filtro {(year !== null || month !== null || creditor !== null) && "•"}
              </Button>
              {activeMenu === "filter" && (
                <div className="absolute right-0 z-30 mt-2 w-72 space-y-3 rounded-xl border bg-card p-4 shadow-lg">
                  <div className="flex items-center justify-between">
                    <strong className="text-sm">Filtrar pagamentos</strong>
                    <button aria-label="Fechar filtros" onClick={() => setActiveMenu(null)}><X className="size-4" /></button>
                  </div>
                  <label className="block text-xs font-semibold text-muted-foreground">Ano
                    <select aria-label="Filtrar por ano" className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm text-foreground" value={year ?? ""} onChange={(e) => setYear(e.target.value ? Number(e.target.value) : null)}>
                      <option value="">Todos os anos</option>
                      {(q.data?.years ?? []).map((yy) => <option key={yy} value={yy}>{yy}</option>)}
                    </select>
                  </label>
                  <label className="block text-xs font-semibold text-muted-foreground">Mês
                    <select aria-label="Filtrar por mês" className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm text-foreground" value={month ?? ""} onChange={(e) => setMonth(e.target.value ? Number(e.target.value) : null)}>
                      <option value="">Todos os meses</option>
                      {Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{new Date(2026, i).toLocaleDateString("pt-BR", { month: "long" })}</option>)}
                    </select>
                  </label>
                  <label className="block text-xs font-semibold text-muted-foreground">Credor
                    <select aria-label="Filtrar por credor" className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm text-foreground" value={creditor ?? ""} onChange={(e) => setCreditor(e.target.value || null)}>
                      <option value="">Todos os credores</option>
                      {(q.data?.creditors ?? []).map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </label>
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={() => { setYear(null); setMonth(null); setCreditor(null); }}>Limpar</Button>
                    <Button size="sm" onClick={() => setActiveMenu(null)}>Aplicar</Button>
                  </div>
                </div>
              )}
            </div>
            <div className="relative">
              <Button variant="outline" aria-expanded={activeMenu === "settings"} aria-label="Opções do histórico" onClick={() => setActiveMenu(activeMenu === "settings" ? null : "settings")}>
                <Settings className="size-4" /> Opções
              </Button>
              {activeMenu === "settings" && (
                <div className="absolute right-0 z-30 mt-2 min-w-48 space-y-1 rounded-xl border bg-card p-2 shadow-lg">
                  <button className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-accent" onClick={() => { setActiveMenu(null); void copyReport(); }}><Copy className="size-4" /> Copiar</button>
                  <button className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-accent" onClick={() => { setActiveMenu(null); window.print(); }}><Printer className="size-4" /> Imprimir / PDF</button>
                </div>
              )}
            </div>
          </div>
        </div>

        {q.isLoading && <p className="mt-10 text-center text-muted-foreground">Carregando histórico…</p>}
        {!q.isLoading && filteredItems.length === 0 && (
          <p className="mt-10 text-center text-muted-foreground">Nenhum pagamento confirmado encontrado.</p>
        )}

        {[...groups.entries()].map(([key, list]) => {
          const totalPaid = list.reduce((s, it) => s + it.paidCents, 0);
          return (
            <section key={key} className="mt-6 rounded-2xl border bg-card shadow-soft">
              <div className="flex items-center justify-between px-5 pt-4">
                <h2 className="text-lg font-bold">{groupLabel(key)}</h2>
                <span className="text-base font-bold text-success tabular-nums">{list.length} pagamentos · {formatBRL(totalPaid)}</span>
              </div>
              <div className="overflow-x-auto p-5 pt-3">
                <table className="w-full min-w-[1280px] table-fixed text-sm">
                  <colgroup>
                    <col style={{ width: "18%" }} />
                    <col style={{ width: "12%" }} />
                    <col style={{ width: "10%" }} />
                    <col style={{ width: "10%" }} />
                    <col style={{ width: "12%" }} />
                    <col style={{ width: "11%" }} />
                    <col style={{ width: "12%" }} />
                    <col style={{ width: "9%" }} />
                    <col style={{ width: "6%" }} />
                  </colgroup>
                  <thead>
                    <tr className="bg-muted text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="rounded-l-lg px-3 py-2 text-left">Credor</th>
                      <th className="px-3 py-2 text-right">Valor Previsto</th>
                      <th className="px-3 py-2">Vencimento</th>
                      <th className="px-3 py-2">Pagamento</th>
                      <th className="px-3 py-2 text-right">Valor Pago</th>
                      <th className="px-3 py-2">Diferença</th>
                      <th className="px-3 py-2 text-left">Observação</th>
                      <th className="whitespace-nowrap px-1 py-2 text-center text-[11px]">Comprovante</th>
                      <th className="no-print whitespace-nowrap rounded-r-lg px-1 py-2 text-center text-[11px]">Ajuste</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {list.map((it) => (
                      <tr key={`${it.kind}-${it.id}`}>
                        <td className="px-3 py-2">
                          <div className="font-semibold">{it.creditor}</div>
                          {it.kind === "installment" && it.installmentNumber && (
                            <div className="text-xs text-muted-foreground">Parcela {it.installmentNumber}</div>
                          )}
                        </td>
                        <td className="px-2 py-2 text-right"><AccountingMoney cents={it.expectedCents} /></td>
                        <td className="px-3 py-2 text-center">{formatDateBR(it.dueDate)}</td>
                        <td className="px-3 py-2 text-center">{formatDateBR(it.paidDate)}</td>
                        <td className="px-2 py-2 text-right"><AccountingMoney cents={it.paidCents} paid /></td>
                        <td className="px-3 py-2 text-center text-xs"><HistoryDifference expected={it.expectedCents} paid={it.paidCents} quits={it.is_settled} /></td>
                        <td className="break-words px-3 py-2 text-xs">
                          {displayNote({ due_date: it.dueDate, paid_date: it.paidDate, expected_cents: it.expectedCents, paid_cents: it.paidCents, note: it.note, is_settled: it.is_settled })}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex justify-center">
                            <AttachmentButton
                              entityType={it.kind === "bill" ? "bill" : "installment"}
                              entityId={it.kind === "bill" ? it.id : `${it.contractId}:${it.installmentNumber}`}
                            />
                          </div>
                        </td>
                        <td className="no-print px-3 py-2">
                          <div className="flex justify-center">
                            <button
                              aria-label="Corrigir pagamento"
                              className="grid size-8 place-items-center rounded-lg border bg-card text-muted-foreground hover:bg-accent"
                              onClick={() =>
                                setPayTarget(
                                  it.kind === "bill"
                                    ? { kind: "bill", id: it.id, creditor: it.creditor, due_date: it.dueDate, expected_cents: it.expectedCents, paid_date: it.paidDate, paid_cents: it.paidCents, note: it.note, is_settled: it.is_settled }
                                    : { kind: "installment", contractId: it.contractId!, number: it.installmentNumber!, creditor: it.creditor, due_date: it.dueDate, expected_cents: it.expectedCents, paid_date: it.paidDate, paid_cents: it.paidCents, note: it.note, is_settled: it.is_settled },
                                )
                              }
                            >
                              <Pencil className="size-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })}
      </div>

      <PayDialog
        target={payTarget}
        onClose={() => setPayTarget(null)}
        onSaved={() => qc.invalidateQueries({ queryKey: ["history"] })}
      />
    </AppShell>
  );
}
