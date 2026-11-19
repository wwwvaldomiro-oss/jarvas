import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCheck } from "lucide-react";
import { useRequireUser } from "@/components/AppShell";
import { PayDialog, type PayTarget } from "@/components/finance/PayDialog";
import { AttachmentButton } from "@/components/finance/AttachmentButton";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { expensePaymentAdjustment, formatAdjustmentPercent, formatBRL, formatDateBR } from "@/lib/finance/money";
import { getMonthExpenses, getConsumptionForPeriod, addManualBill, previewBulkSettlement, confirmBulkSettlement } from "@/lib/finance/finance.functions";
import { MicroBar, MicroRing } from "@/components/finance/MicroChart";
import { getRevenue, createRevenue } from "@/lib/finance/revenue.functions";
import { ReceiveDialog } from "@/components/finance/RevenueForms";
import type { RevenueEntry } from "@/lib/finance/revenue";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

function Sparkline({values,label}: {values:number[];label:string}) {
  const nums=values.map(v=>Number.isFinite(v)?Math.max(0,v):0);
  if(!nums.length) return null;
  const max=Math.max(...nums,1);
  const coords=nums.map((v,i)=>({
    x:nums.length===1?50:4+i*92/(nums.length-1),
    y:27-23*v/max,
  }));
  const points=coords.map(p=>`${p.x},${p.y}`).join(" ");
  return <svg viewBox="0 0 100 32" className="mt-3 h-9 w-full text-current opacity-75"
    preserveAspectRatio="none" role="img" aria-label={`Evolução de ${label}`}>
    <path d="M4 29 H96" fill="none" stroke="currentColor" strokeOpacity=".18" strokeWidth=".8" />
    <polyline points={points} fill="none" stroke="currentColor" strokeWidth="1.7"
      strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    {coords.length===1 && <circle cx={coords[0]!.x} cy={coords[0]!.y} r="2" fill="currentColor" />}
  </svg>;
}

function Kpi({ label, value, emphasis, bar, ring, trend }: {
  label: string; value: string; emphasis?: boolean; bar?: number | undefined;
  ring?: number | undefined; trend?: number[] | undefined;
}) {
  return <div className={`axion-kpi rounded-2xl border p-3 ${emphasis ? "axion-kpi-featured bg-primary text-primary-foreground" : "bg-card"}`}>
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="axion-kpi-label">{label}</p>
        <p className="mt-2 text-lg font-extrabold tracking-tight xl:text-xl">{value}</p>
      </div>
      {ring != null && <MicroRing value={ring} />}
    </div>
    {bar != null && <MicroBar value={bar} tone={emphasis ? "light" : "gold"} />}
    {trend && <Sparkline values={trend} label={label} />}
  </div>;
}

function ExpenseDifference({ expected, paid, hasPayment, quits }: {
  expected: number; paid: number | null; hasPayment: boolean; quits: boolean;
}) {
  const result = expensePaymentAdjustment(expected, hasPayment ? paid : null, quits);
  if (result.kind === "discount" || result.kind === "surcharge") {
    const blue = result.kind === "discount";
    return (
      <div className={`flex flex-col gap-0.5 font-semibold ${blue ? "text-blue-600 dark:text-blue-400" : "text-red-600 dark:text-red-400"}`}>
        <span className="text-[11px]">{blue ? "Desconto" : "Acréscimo"}</span>
        <span>{formatAdjustmentPercent(result.percent)}</span>
        <span>{formatBRL(result.differenceCents)}</span>
      </div>
    );
  }
  if (result.kind === "settled") return <span className="text-success">Quitado</span>;
  if (result.kind === "unpaid") return <span className="text-muted-foreground">{formatBRL(result.openCents)}</span>;
  return (
    <div className="flex flex-col gap-0.5 text-amber-700 dark:text-amber-300">
      <span className="text-[11px]">{result.openCents ? "Em aberto" : "Aguardando quitação"}</span>
      <span>{formatBRL(result.openCents)}</span>
    </div>
  );
}

export function RegistrationWorkspace({ type, initialYear, onSaved }: {type: "despesas" | "receitas"; initialYear?: number; onSaved?: (() => void) | undefined}) {
  const user = useRequireUser();
  const client = useQueryClient();
  const now = new Date();
  const [year, setYear] = useState(initialYear ?? now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [target, setTarget] = useState<PayTarget | null>(null);
  const [receiving, setReceiving] = useState<RevenueEntry | null>(null);
  const registerType = type;
  const [oneOffOpen, setOneOffOpen] = useState(false);
  const [oneOffRequest,setOneOffRequest]=useState(()=>crypto.randomUUID());
  const [oneOffDetail,setOneOffDetail]=useState("");
  const [oneOffKind,setOneOffKind]=useState<"debt"|"consumption">("debt");
  const [oneOffName, setOneOffName] = useState("");
  const [oneOffAmount, setOneOffAmount] = useState("");
  const [oneOffDue, setOneOffDue] = useState(new Date().toISOString().slice(0, 10));
  const [oneOffSaving, setOneOffSaving] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkIncludePartial, setBulkIncludePartial] = useState(true);
  const [bulkSummary, setBulkSummary] = useState<{
    fullCount:number; partialCount:number; discountCents:number;
    billCount:number; installmentCount:number;
  } | null>(null);
  const period = `${year}-${String(month).padStart(2, "0")}`;
  const monthFn = useServerFn(getMonthExpenses);
  const consumptionPeriodFn = useServerFn(getConsumptionForPeriod);
  const bulkPreviewFn = useServerFn(previewBulkSettlement);
  const bulkConfirmFn = useServerFn(confirmBulkSettlement);
  const revenueFn = useServerFn(getRevenue);
  const createManualBillFn = useServerFn(addManualBill);
  const createRevenueFn = useServerFn(createRevenue);
  const createOneOff = async () => {
    const amount = Number(oneOffAmount.replace(",", "."));
    if (!oneOffName.trim() || !Number.isFinite(amount) || amount <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(oneOffDue)) {
      toast.error("Informe nome, valor positivo e data válida."); return;
    }
    setOneOffSaving(true);
    try {
      const cents = Math.round(amount * 100);
      if (registerType === "despesas") {
        await createManualBillFn({ data: { requestId:oneOffRequest,creditor: oneOffName.trim(),description:oneOffDetail.trim(),expenseKind:oneOffKind, dueDate: oneOffDue, expectedCents: cents } });
      } else {
        await createRevenueFn({ data: {
          title: oneOffName.trim(), category: "Outros Rendimentos", expected_cents: cents,
          first_due: oneOffDue, recurring: false, details: { axion_one_off: "true" },
        } });
      }
      setYear(Number(oneOffDue.slice(0,4))); setMonth(Number(oneOffDue.slice(5,7)));
      setOneOffRequest(crypto.randomUUID());setOneOffDetail("");setOneOffKind("debt");
      setOneOffOpen(false); setOneOffName(""); setOneOffAmount("");
      refresh();
      toast.success("Conta avulsa criada. Confirme o pagamento ou recebimento na lista; depois ficará no histórico.");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Não foi possível cadastrar a conta."); }
    finally { setOneOffSaving(false); }
  };
  const expenses = useQuery({ queryKey: ["month-expenses", period], queryFn: () => monthFn({ data: { period } }), enabled: !!user && type === "despesas" });
  const revenue = useQuery({ queryKey: ["revenue", user?.email, period], queryFn: () => revenueFn({ data: { month: period } }), enabled: !!user && type === "receitas" });
  const incomes = (revenue.data?.entries ?? []).filter(entry => entry.due_date.startsWith(period));
  const incomeExpected = incomes.reduce((sum, item) => sum + item.expected_cents, 0);
  const incomeReceived = incomes.reduce((sum, item) => sum + (item.received_cents ?? 0), 0);
  const consumptionPeriod = useQuery({
    queryKey: ["consumption-period", user?.email, period],
    queryFn: () => consumptionPeriodFn({ data: { year, month } }),
    enabled: !!user && registerType === "despesas",
  });
  const bills = expenses.data?.bills ?? [];
  const stats = expenses.data?.kpis ?? { expected: 0, paid: 0, covered: 0, open: 0, count: 0 };
  const paidCount = bills.filter(b => b.paid_date && (
    b.is_settled === true ||
    (b.is_settled == null && (b.paid_cents ?? 0) >= b.expected_cents)
  )).length;
  const incomePaidCount = incomes.filter(entry => entry.expected_cents > 0 && (entry.received_cents ?? 0) >= entry.expected_cents).length;
  const incomePct = incomeExpected > 0 ? Math.min(100, Math.round(incomeReceived / incomeExpected * 100)) : 0;
  const openBulkSettlement = async () => {
    setBulkLoading(true);
    try {
      const info = await bulkPreviewFn();
      setBulkSummary(info);
      setBulkIncludePartial(true);
      setBulkOpen(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível consultar as quitações pendentes.");
    } finally { setBulkLoading(false); }
  };
  const executeBulkSettlement = async () => {
    if (!bulkSummary || bulkSaving) return;
    const count = bulkSummary.fullCount + (bulkIncludePartial ? bulkSummary.partialCount : 0);
    if (count === 0) { setBulkOpen(false); return; }
    setBulkSaving(true);
    try {
      const result = await bulkConfirmFn({ data: {includePartial:bulkIncludePartial,expectedCount:count} });
      setBulkOpen(false);
      setBulkSummary(null);
      refresh();
      toast.success(`${result.updated} quitação(ões) registrada(s) sem alterar os valores pagos.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao registrar as quitações.");
    } finally { setBulkSaving(false); }
  };
  const refresh = () => { void client.invalidateQueries(); onSaved?.(); };
  return <>
      <section className="rounded-2xl border bg-card p-4 shadow-soft">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="text-lg font-bold">{type === "despesas" ? "Registro de pagamento" : "Registro de recebimento"}</h2>
            <p className="text-xs text-muted-foreground">Registre e confira as baixas deste módulo.</p></div>
          <div className="flex flex-wrap items-center gap-2">
            <select aria-label="Mês" className="rounded-md border bg-background p-2 text-sm" value={month} onChange={e => setMonth(Number(e.target.value))}>
              {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
            <select aria-label="Ano" className="rounded-md border bg-background p-2 text-sm" value={year} onChange={e => setYear(Number(e.target.value))}>
              {[...new Set([year, ...Array.from({ length: 11 }, (_, i) => now.getFullYear() - 5 + i)])].sort((a,b)=>a-b).map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            {registerType === "despesas" && <Button type="button" variant="outline" disabled={bulkLoading} onClick={() => void openBulkSettlement()} title="Confirme de uma só vez quitações de pagamentos já registrados, sem criar pagamentos novos">
              <CheckCheck className="size-4" /> {bulkLoading ? "Consultando…" : "Quitar pagamentos existentes"}
            </Button>}
            <Button type="button" variant="outline" onClick={() => setOneOffOpen(true)}>+ Nova conta avulsa</Button>
          </div>
        </div>
        {registerType === "despesas" ? <>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-[repeat(4,minmax(0,1fr))_minmax(0,1.5fr)]">
            <Kpi label="Valor previsto" value={formatBRL(stats.expected)} bar={100} />
            <Kpi label="Valor pago" value={formatBRL(stats.paid)} bar={stats.expected > 0 ? Math.min(100, Math.floor(stats.covered / stats.expected * 100)) : 0} />
            <Kpi label="Em aberto" value={formatBRL(stats.open)} bar={stats.expected > 0 ? Math.round(stats.open / stats.expected * 100) : 0} />
            <div className="rounded-2xl border bg-success-soft/30 p-3">
              <p className="axion-kpi-label">Consumo do mês selecionado</p>
              <p className="mt-2 text-lg font-extrabold tracking-tight xl:text-xl">
                {consumptionPeriod.data && !consumptionPeriod.error ? formatBRL(consumptionPeriod.data.total) : "—"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{MONTHS[month - 1]} de {year}</p>
              {!!consumptionPeriod.data?.missing.length && (
                <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                  Sem valor lançado: {consumptionPeriod.data.missing.join(", ")}
                </p>
              )}
              {consumptionPeriod.error && <p role="alert" className="mt-1 text-xs text-destructive">
                Falha ao consultar consumo: {consumptionPeriod.error.message}
              </p>}
            </div>
            <div className="rounded-2xl border bg-success-soft/20 p-3">
              <p className="text-sm font-bold">Resumo do mês — {MONTHS[month - 1]}/{year}</p>
              <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                <div><p className="text-xs text-muted-foreground">Contas</p><p className="text-lg font-bold">{stats.count}</p></div>
                <div><p className="text-xs text-muted-foreground">Pagas</p><p className="text-lg font-bold text-success">{paidCount}</p></div>
                <div><p className="text-xs text-muted-foreground">Em aberto</p><p className="text-lg font-bold text-destructive">{Math.max(0, stats.count - paidCount)}</p></div>
              </div>
              <p className="mt-2 text-center text-xs text-muted-foreground">{stats.expected ? Math.min(100, (stats.covered / stats.expected) * 100).toFixed(2).replace(".", ",") : "0,00"}% quitado em valor</p>
            </div>
          </div>
          {(expenses.data?.reviewFlags ?? []).map(message => <p className="mt-3 rounded-lg border border-amber-400/40 p-3 text-sm" key={message}>{message}</p>)}
          {expenses.error && <p role="alert" className="mt-4 text-destructive">Não foi possível carregar as contas: {expenses.error.message}</p>}
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[850px] text-sm">
              <thead className="bg-muted text-left text-xs uppercase text-muted-foreground"><tr>
                <th className="p-3">Credor</th><th className="p-3">Previsto</th><th className="p-3">Vencimento</th>
                <th className="p-3">Pagamento</th><th className="p-3">Valor pago</th><th className="p-3">Diferença</th><th className="p-3">Ação</th>
              </tr></thead>
              <tbody className="divide-y">
                {expenses.isLoading && <tr><td colSpan={7} className="p-6 text-center">Carregando pagamentos…</td></tr>}
                {!expenses.isLoading && !expenses.error && bills.length === 0 && <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">Nenhum lançamento neste mês.</td></tr>}
                {bills.map(b => <tr key={b.id} className={b.paid_date ? (b.is_settled ? "bg-success-soft/40" : "bg-warning-soft/20") : undefined}>
                  <td className="p-3 font-semibold">{b.creditor}</td><td className="p-3">{formatBRL(b.expected_cents)}</td>
                  <td className="p-3">{formatDateBR(b.due_date)}</td><td className="p-3">{formatDateBR(b.paid_date)}</td>
                  <td className="p-3">{b.paid_date ? formatBRL(b.paid_cents) : "—"}</td>
                  <td className="p-3"><ExpenseDifference expected={b.expected_cents} paid={b.paid_cents} hasPayment={!!b.paid_date} quits={b.is_settled === true} /></td>
                  <td className="p-3"><div className="flex items-center gap-2">
                    <Button size="sm" variant={b.paid_date ? "outline" : "brand"} onClick={() => setTarget({
                      ...(b.kind === "installment" ? { kind: "installment" as const, contractId: b.contract_id, number: b.installment_number } : { kind: "bill" as const, id: b.id }), creditor: b.creditor, due_date: b.due_date,
                      ...(b.source_annual_id ? {annualCell:{annualId:b.source_annual_id,period}} : {}),
                      expected_cents: b.expected_cents, paid_date: b.paid_date, paid_cents: b.paid_cents, note: b.paid_note, is_settled: b.is_settled,
                    })}>{b.paid_date ? "Corrigir" : "Confirmar pagamento"}</Button>
                    <AttachmentButton entityType={b.kind === "installment" ? "installment" : "bill"} entityId={b.kind === "installment" ? `${b.contract_id}:${b.installment_number}` : b.id} />
                  </div></td>
                </tr>)}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex flex-wrap gap-4 text-sm"><Link to="/despesas/anuais" className="text-primary underline">Despesas anuais</Link><Link to="/historico-pagamentos" className="text-primary underline">Histórico de pagamentos</Link></div>
        </> : <>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-[repeat(3,minmax(0,1fr))_minmax(0,1.5fr)]">
            <Kpi label="Previsto a receber" value={formatBRL(incomeExpected)} bar={100} />
            <Kpi label="Total recebido" value={formatBRL(incomeReceived)} bar={incomePct} />
            <Kpi label="A receber" value={formatBRL(Math.max(0, incomeExpected - incomeReceived))} bar={100 - incomePct} />
            <div className="rounded-2xl border bg-success-soft/20 p-3">
              <p className="text-sm font-bold">Resumo do mês — {MONTHS[month - 1]}/{year}</p>
              <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                <div><p className="text-xs text-muted-foreground">Receitas</p><p className="text-lg font-bold">{incomes.length}</p></div>
                <div><p className="text-xs text-muted-foreground">Recebidas</p><p className="text-lg font-bold text-success">{incomePaidCount}</p></div>
                <div><p className="text-xs text-muted-foreground">Em aberto</p><p className="text-lg font-bold text-destructive">{Math.max(0, incomes.length - incomePaidCount)}</p></div>
              </div>
              <p className="mt-2 text-center text-xs text-muted-foreground">{incomePct}% recebido em valor</p>
            </div>
          </div>
          {revenue.error && <p role="alert" className="mt-4 text-sm text-destructive">Não foi possível consultar as receitas: {revenue.error.message}</p>}
          <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[700px] text-sm">
            <thead className="bg-muted text-left text-xs uppercase text-muted-foreground"><tr>
              <th className="p-3">Fonte pagadora</th><th className="p-3">Previsão</th><th className="p-3">Vencimento</th><th className="p-3">Recebimento</th><th className="p-3">Valor recebido</th><th className="p-3">Ação</th>
            </tr></thead>
            <tbody className="divide-y">
              {revenue.isLoading && <tr><td colSpan={6} className="p-5 text-center">Carregando receitas…</td></tr>}
              {!revenue.isLoading && !revenue.error && incomes.length === 0 && <tr><td colSpan={6} className="p-5 text-center text-muted-foreground">Nenhuma receita nesta competência.</td></tr>}
              {incomes.map(entry => <tr key={entry.id}>
                <td className="p-3 font-semibold">{entry.title}</td><td className="p-3">{formatBRL(entry.expected_cents)}</td>
                <td className="p-3">{formatDateBR(entry.due_date)}</td><td className="p-3">{formatDateBR(entry.received_date)}</td>
                <td className="p-3">{entry.received_date ? formatBRL(entry.received_cents ?? 0) : "—"}</td>
                <td className="p-3"><Button size="sm" variant={entry.received_date ? "outline" : "brand"} onClick={() => setReceiving(entry)}>
                  {entry.received_date ? "Corrigir" : "Confirmar recebimento"}</Button></td>
              </tr>)}
            </tbody></table></div>
          <div className="mt-3 flex flex-wrap gap-4 text-sm"><Link to="/receitas" className="text-primary underline">Receitas</Link><Link to="/historico-receitas" className="text-primary underline">Histórico de receitas</Link></div>
        </>}
      </section>
    <Dialog open={oneOffOpen} onOpenChange={o => !oneOffSaving && setOneOffOpen(o)}><DialogContent aria-describedby={undefined}><DialogHeader><DialogTitle>{type === "despesas" ? "Nova despesa avulsa" : "Nova receita avulsa"}</DialogTitle></DialogHeader>
      <form aria-label={registerType === "despesas" ? "Nova despesa avulsa" : "Nova receita avulsa"} className="space-y-4" onSubmit={e => { e.preventDefault(); void createOneOff(); }}>
        <div><p className="text-xs text-muted-foreground">Sem recorrência e sem inclusão na tabela anual. O histórico será gerado após a confirmação da operação.</p></div>
        <label className="block text-sm font-semibold">Nome / {registerType === "despesas" ? "credor" : "fonte pagadora"}<input required maxLength={100} className="mt-1 w-full rounded-md border bg-background p-2" value={oneOffName} onChange={e => setOneOffName(e.target.value)} /></label>
        {registerType==="despesas"&&<><label className="block text-sm font-semibold">Descrição do gasto<input className="mt-1 w-full rounded-md border bg-background p-2" maxLength={200} value={oneOffDetail} onChange={e=>setOneOffDetail(e.target.value)}/></label>
        <label className="block text-sm font-semibold">Classificação<select className="mt-1 w-full rounded-md border bg-background p-2" value={oneOffKind} onChange={e=>setOneOffKind(e.target.value==="consumption"?"consumption":"debt")}><option value="debt">Dívida</option><option value="consumption">Consumo</option></select></label></>}
        <label className="block text-sm font-semibold">Valor (R$)<input required type="text" inputMode="decimal" className="mt-1 w-full rounded-md border bg-background p-2" placeholder="0,00" value={oneOffAmount} onChange={e => setOneOffAmount(e.target.value)} /></label>
        <label className="block text-sm font-semibold">Data de vencimento<input required type="date" className="mt-1 w-full rounded-md border bg-background p-2" value={oneOffDue} onChange={e => setOneOffDue(e.target.value)} /></label>
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={oneOffSaving} onClick={() => setOneOffOpen(false)}>Cancelar</Button><Button type="submit" disabled={oneOffSaving}>{oneOffSaving ? "Salvando…" : "Cadastrar"}</Button></div>
      </form>
    </DialogContent></Dialog>
    <AlertDialog open={bulkOpen} onOpenChange={value => { if (!bulkSaving) setBulkOpen(value); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Quitar pagamentos já registrados</AlertDialogTitle>
          <AlertDialogDescription>
            Esta ação vale para todas as competências e anos, não somente o mês selecionado.
            Somente contas e parcelas que já possuem data e valor pago positivo serão consideradas.
            Nenhum valor, vencimento ou histórico de pagamento será substituído.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {bulkSummary && <div className="space-y-3 text-sm">
          <div className="rounded-lg border bg-muted/30 p-3 space-y-1">
            <p><strong>{bulkSummary.fullCount}</strong> pagamento(s) integrais ou superiores ao previsto</p>
            <p><strong>{bulkSummary.partialCount}</strong> pagamento(s) abaixo do previsto</p>
            <p className="text-muted-foreground">
              Registros candidatos: {bulkSummary.billCount} conta(s) e {bulkSummary.installmentCount} parcela(s), incluindo eventuais espelhos entre módulos.
            </p>
          </div>
          {bulkSummary.partialCount > 0 && <label className="flex items-start gap-3 rounded-lg border border-amber-500/40 p-3 cursor-pointer">
            <Checkbox checked={bulkIncludePartial} onCheckedChange={v => setBulkIncludePartial(v === true)} />
            <span>
              <strong>Incluir os {bulkSummary.partialCount} pagamentos abaixo do previsto como quitados com desconto</strong>
              <span className="mt-1 block text-muted-foreground">
                Descontos totais potenciais: {formatBRL(bulkSummary.discountCents)}.
                Se algum pagamento foi apenas parcial e ainda há dívida, desmarque esta opção.
              </span>
            </span>
          </label>}
          <p className="text-xs text-muted-foreground">
            Serão marcados como quitados {bulkSummary.fullCount + (bulkIncludePartial ? bulkSummary.partialCount : 0)} registros.
            Contas sem pagamento continuarão em aberto. Uma auditoria será criada por registro.
          </p>
        </div>}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={bulkSaving}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            disabled={bulkSaving || !bulkSummary || bulkSummary.fullCount + (bulkIncludePartial ? bulkSummary.partialCount : 0) === 0}
            onClick={event => { event.preventDefault(); void executeBulkSettlement(); }}
          >
            {bulkSaving ? "Registrando…" : "Confirmar quitações em lote"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    <PayDialog target={target} onClose={() => setTarget(null)} onSaved={refresh} />
    {receiving && <ReceiveDialog entry={receiving} onClose={() => setReceiving(null)} onSaved={refresh} />}
  </>;
}
