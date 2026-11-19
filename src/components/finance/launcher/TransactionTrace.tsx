import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { getTransactionTrace, type TraceSelector } from "@/lib/finance/transaction-trace.functions";
import { formatBRL, formatDateBR } from "@/lib/finance/money";

export function TransactionTrace({selector}:{selector:TraceSelector}) {
  const fetchTrace=useServerFn(getTransactionTrace);
  const query=useQuery({queryKey:["transaction-trace",selector], queryFn:()=>fetchTrace({data:selector})});
  if(query.isPending) return <p role="status">Consultando origem e baixas…</p>;
  if(query.isError) return <p role="alert">{query.error.message} <Button variant="link" onClick={()=>void query.refetch()}>Tentar novamente</Button></p>;
  const {event,obligations}=query.data;
  return <div className="space-y-4 text-sm">
    {event && <div className="space-y-1">
      <p className="font-semibold">{event.title} · {formatDateBR(event.date)}</p>
      {event.status==="undone" && <p>Lançamento desfeito</p>}
      {event.merchant && <p>Estabelecimento: {event.merchant}</p>}
      {event.payer && <p>Fonte pagadora: {event.payer}</p>}
      {event.note && <p>Nota / observação: {event.note}</p>}
      {event.settlement && <p>{event.direction==="credit"?"Registro de recebimento":"Registro de pagamento"}</p>}
      {event.medium==="payable" && <p>Compromisso cadastrado · {formatBRL(event.total)}</p>}
      {!event.settlement && event.medium!=="payable" && <p>{event.medium==="card"?"Cartão":event.kind==="income"?"Conta prevista de destino":"Forma de pagamento"}: {event.instrument || "Parcelado com o credor"} · {formatBRL(event.total)}</p>}
      {event.net!==null && <p>Crédito líquido de {formatBRL(event.net)} para {event.destination || "conta de destino"} · Custo de {formatBRL(event.total-event.net)}</p>}
      {event.cash!==null && <p className="font-medium">{event.direction==="credit"?"Entrada em":"Saída de"} {event.cash_account || "conta não informada"} · {formatBRL(event.cash)} em {formatDateBR(event.cash_date)}</p>}
      {event.cash===null && event.status!=="undone" && <p>{event.kind==="income" || event.kind==="card_credit"?"Entrada em conta ainda não confirmada.":event.medium==="card"?"A saída bancária ocorre no pagamento da fatura.":"Consulte a baixa do compromisso abaixo."}</p>}
    </div>}
    {obligations.map(o=><section key={o.period+o.creditor} className="space-y-2 rounded-lg border p-3">
      <h4 className="font-semibold">{o.creditor} · {o.period.slice(5)}/{o.period.slice(0,4)}</h4>
      <p>Contas a pagar · {o.closed_total!==null?"Fatura fechada":"Valor da competência"}: {o.expected===null?"Sem valor informado":formatBRL(o.expected)}</p>
      {o.items?.length ? <ul className="divide-y">{o.items.map((i,index)=><li key={index} className="py-1">
        {i.title}{i.merchant && " · "+i.merchant}{i.date && " · "+formatDateBR(i.date)} · {i.number}/{i.count} · {formatBRL(i.cents)}
        {i.instrument && <span className="block text-muted-foreground">{i.instrument}{i.included?" · Já incluída na fatura inicial":""}</span>}
      </li>)}</ul> : <p className="text-muted-foreground">Sem compras detalhadas vinculadas a esta competência.</p>}
      {o.payments?.length ? o.payments.map((p,index)=><p key={index} className="font-medium">Pagamento {p.settled?"com quitação":"registrado"} · {formatDateBR(p.date)} · {p.cents===null?"Valor não informado":formatBRL(p.cents)} · {p.account?"Saída de "+p.account:"Conta de origem não informada"}</p>) : <p>Sem pagamento registrado nesta competência.</p>}
    </section>)}
    {!event && !obligations.length && <p>Nenhum vínculo disponível.</p>}
  </div>;
}

export function AnnualTraceDisclosure({annualId,period}:{annualId:string;period:string}) {
  const [open,setOpen]=useState(false);
  return <details className="rounded-lg border p-3" onToggle={e=>setOpen(e.currentTarget.open)}>
    <summary className="cursor-pointer text-sm font-semibold">Origem do compromisso e pagamentos</summary>
    {open && <div className="pt-3"><TransactionTrace selector={{annualId,period}}/></div>}
  </details>;
}
