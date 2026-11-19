import { AnnualTraceDisclosure } from "./launcher/TransactionTrace";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMonthExpenses } from "@/lib/finance/finance.functions";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { PayDialog, type PayTarget } from "./PayDialog";
import { formatBRL, formatDateBR } from "@/lib/finance/money";

export type ExpenseCell = { id: string; creditor: string; year: number; month: number; contractId?: string | null };
export function ExpenseCellPaymentDialog({ cell, onClose, onSaved }: {cell: ExpenseCell; onClose: () => void; onSaved: () => void}) {
  const fetch = useServerFn(getMonthExpenses);
  const period = `${cell.year}-${String(cell.month).padStart(2, "0")}`;
  const q = useQuery({queryKey: ["month-expenses", period], queryFn: () => fetch({data: {period}})});
  const [selected, setSelected] = useState<PayTarget | null>(null);
  const bills = (q.data?.bills ?? []).filter(b => b.source_annual_id === cell.id ||
    (cell.contractId && b.contract_id === cell.contractId));
  const target = (b: typeof bills[number]): PayTarget => ({
    ...(b.kind === "installment" ? {kind: "installment", contractId: b.contract_id, number: b.installment_number} : {kind: "bill", id: b.id}),
    annualCell: {annualId:cell.id,period}, creditor: b.creditor, due_date: b.due_date, expected_cents: b.expected_cents,
    paid_date: b.paid_date, paid_cents: b.paid_cents, note: b.paid_note, is_settled: b.is_settled,
  });
  const active = selected ?? (bills.length === 1 ? target(bills[0]!) : null);
  if (active) return <PayDialog target={active} onClose={onClose} onSaved={onSaved} />;
  return <Dialog open onOpenChange={o => !o && onClose()}><DialogContent aria-describedby={undefined}>
    <DialogHeader><DialogTitle>{cell.creditor} · {period}</DialogTitle></DialogHeader>
    <AnnualTraceDisclosure annualId={cell.id} period={period}/>
    {q.isLoading && <p>Carregando compromisso…</p>}
    {q.error && <p role="alert">{q.error.message}</p>}
    {!q.isLoading && !q.error && !bills.length && <p>Nenhum compromisso lançado nesta célula. Libere o cadeado para cadastrar o valor previsto antes de pagar.</p>}
    {bills.map(b => <Button variant="outline" key={b.id} onClick={() => setSelected(target(b))}>
      {formatDateBR(b.due_date)} · {formatBRL(b.expected_cents)}{b.installment_number ? ` · Parcela ${b.installment_number}` : ""}
    </Button>)}
  </DialogContent></Dialog>;
}
