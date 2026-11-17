import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getLauncherState } from "@/lib/finance/launcher.functions";
import { reconciliationCandidates } from "@/lib/finance/launcher";
import { formatBRL,formatDateBR } from "@/lib/finance/money";
import type { FinanceTx } from "@/lib/pluggy.functions";

export function AccountMovementSummary({ownerKey,transactions}:{ownerKey:string;transactions:FinanceTx[]}){
  const fn=useServerFn(getLauncherState);
  const q=useQuery({queryKey:["launcher-state",ownerKey],queryFn:()=>fn(),retry:false});
  const movements=(q.data?.launches??[]).filter(l=>l.accountId&&l.direction);
  if(q.isLoading)return <p className="text-sm text-muted-foreground">Carregando registros das contas…</p>;
  if(q.error)return <p role="alert" className="text-sm text-destructive">{q.error.message}</p>;
  if(!movements.length)return <p className="text-sm text-muted-foreground">Pagamentos e recebimentos confirmados com conta vinculada aparecerão aqui.</p>;
  const incoming=movements.filter(m=>m.direction==="credit").reduce((n,m)=>n+m.totalCents,0);
  const outgoing=movements.filter(m=>m.direction==="debit").reduce((n,m)=>n+m.totalCents,0);
  return <div className="space-y-3"><div className="grid grid-cols-2 gap-3 text-sm"><div>Entradas exibidas<strong className="block text-blue-600">{formatBRL(incoming)}</strong></div><div>Saídas exibidas<strong className="block text-red-600">{formatBRL(outgoing)}</strong></div></div>
    <p className="text-xs text-muted-foreground">Registros do sistema, separados do extrato bancário. Possíveis correspondências precisam de conferência; o saldo informado pelo banco é preservado.</p>
    <div className="max-h-96 divide-y overflow-auto">{movements.map(m=>{
      const candidates=reconciliationCandidates({accountId:m.accountId!,date:m.date,cents:m.totalCents,direction:m.direction!},transactions.map(t=>({id:t.id,accountId:t.accountId,date:t.date,amountCents:Math.round(t.amount*100),description:t.description})),new Set(q.data?.usedTransactionIds??[]));
      return <div key={m.id} className="flex justify-between gap-3 py-3 text-sm"><div><p className="font-semibold">{m.title}</p><p className="text-xs text-muted-foreground">{m.accountName} · {formatDateBR(m.date)}</p><p className="mt-1 text-xs text-muted-foreground">{candidates.length?`${candidates.length} possível(is) correspondência(s) no Pluggy — conferir` : "Aguardando correspondência no Pluggy"}</p></div><strong className={m.direction==="credit"?"text-blue-600":"text-red-600"}>{m.direction==="credit"?"+":"−"}{formatBRL(m.totalCents)}</strong></div>;
    })}</div>
  </div>;
}
