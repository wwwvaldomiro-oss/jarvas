import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { ContractForm } from "../ContractForm";
import { NewRevenueDialog, ReceiveDialog } from "../RevenueForms";
import { getRevenue } from "@/lib/finance/revenue.functions";
import { formatBRL, formatDateBR } from "@/lib/finance/money";
import { todayBR, type RevenueEntry } from "@/lib/finance/revenue";
export type IncomeChoice = {kind:"income"|"card_credit";sourceId:string|null;sourceName:string};
export function RevenueSourceFlow({ownerKey,onChoose}:{ownerKey:string;onChoose:(choice:IncomeChoice|null)=>void}) {
  const qc=useQueryClient(),fn=useServerFn(getRevenue);
  const q=useQuery({queryKey:["revenue",ownerKey,"launcher-sources"],queryFn:()=>fn({data:{month:todayBR().slice(0,7)}})});
  const [value,setValue]=useState(""),[action,setAction]=useState<"choose"|"receive"|"new">("choose");
  const [contract,setContract]=useState(false),[newSource,setNewSource]=useState(false),[receiving,setReceiving]=useState<RevenueEntry|null>(null);
  const source=q.data?.sources.find(s=>s.id===value);
  const entries=(q.data?.entries??[]).filter(e=>e.source_id===value&&!e.received_date).sort((a,b)=>a.due_date.localeCompare(b.due_date));
  function select(next:string){
    setValue(next);setAction("choose");onChoose(null);
    if(next==="card")onChoose({kind:"card_credit",sourceId:null,sourceName:"Cartão de crédito"});
    if(next==="contracts")setContract(true);
    if(next==="new")setNewSource(true);
  }
  function saved(){void qc.invalidateQueries();setReceiving(null);setAction("choose");onChoose(null);}
  return <div className="space-y-3 sm:col-span-2">
    <label className="block space-y-1.5 text-sm font-medium"><span>Fonte pagadora</span><select aria-label="Fonte pagadora" value={value} onChange={e=>select(e.target.value)} className="h-10 w-full rounded-md border bg-background px-3"><option value="">Selecione a fonte pagadora</option><option value="contracts">Contratos parcelados</option><option value="card">Cartão de crédito</option><option value="new">Nova fonte pagadora</option>{(q.data?.sources??[]).map(s=><option key={s.id} value={s.id}>{s.title}</option>)}</select></label>
    {q.isLoading&&<p className="text-xs text-muted-foreground">Carregando fontes cadastradas…</p>}
    {q.error&&<p role="alert" className="text-sm text-destructive">{q.error.message}</p>}
    {value==="contracts"&&<Button type="button" variant="outline" onClick={()=>setContract(true)}>Abrir cadastro de contrato parcelado</Button>}
    {value==="new"&&<Button type="button" variant="outline" onClick={()=>setNewSource(true)}>Abrir cadastro de fonte pagadora</Button>}
    {source&&<div className="rounded-lg border p-3"><p className="mb-2 text-sm font-semibold">O que deseja registrar em {source.title}?</p><div className="flex flex-wrap gap-2"><Button type="button" variant={action==="receive"?"secondary":"outline"} onClick={()=>{setAction("receive");onChoose(null);}}>Registrar recebimento existente</Button><Button type="button" variant={action==="new"?"secondary":"outline"} onClick={()=>{setAction("new");onChoose({kind:"income",sourceId:source.id,sourceName:source.title});}}>Nova renda desta fonte</Button></div>
      {action==="receive"&&<div className="mt-3 space-y-2"><p className="text-xs text-muted-foreground">Selecione o compromisso. O recebimento será registrado nele, sem criar uma nova receita.</p>{entries.length?entries.map(e=><Button key={e.id} type="button" variant="outline" className="w-full justify-between" onClick={()=>setReceiving(e)}><span>{formatDateBR(e.due_date)}</span><span>{formatBRL(e.expected_cents)}</span></Button>):<p className="text-sm">Nenhum recebimento em aberto para esta fonte.</p>}</div>}
    </div>}
    {contract&&<ContractForm month={todayBR().slice(0,7)} onClose={()=>setContract(false)} onSaved={()=>{setContract(false);saved();}}/>}
    {newSource&&<NewRevenueDialog month={todayBR().slice(0,7)} onClose={()=>setNewSource(false)} onSaved={()=>{setNewSource(false);saved();}}/>}
    {receiving&&<ReceiveDialog entry={receiving} onClose={()=>setReceiving(null)} onSaved={saved}/>}
  </div>;
}
