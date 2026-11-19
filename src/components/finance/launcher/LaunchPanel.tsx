import { TransactionTrace } from "./TransactionTrace";
import { RevenueSourceFlow, type IncomeChoice } from "./RevenueSourceFlow";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, ArrowRight, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { launchSchema, launchPlan, reconciliationCandidates, suggestedCardDue, type Launch } from "@/lib/finance/launcher";
import { getLauncherState, saveLaunch, undoLaunch } from "@/lib/finance/launcher.functions";
import { formatBRL, formatDateBR, parseBRL } from "@/lib/finance/money";
import { todayBR } from "@/lib/finance/revenue";
import type { FinanceAccount, FinanceTx } from "@/lib/pluggy.functions";

type Profile = {account_id:string;display_name:string|null};
const kinds = {expense:"Despesa",income:"Receita",contract:"Contrato parcelado",card_credit:"Pix Cartão Parcelado",invoice_baseline:"Fatura inicial"} as const;
function SelectField({label,children,value,onChange,required=false,disabled=false}:{label:string;children:React.ReactNode;value:string;onChange:(v:string)=>void;required?:boolean;disabled?:boolean}) {
  return <label className="space-y-1.5 text-sm font-medium"><span>{label}</span><select required={required} disabled={disabled} value={value} onChange={e=>onChange(e.target.value)} className="h-10 w-full rounded-md border bg-background px-3 text-sm">{children}</select></label>;
}
export function LaunchPanel({accounts,transactions,profiles,creditors,connectionError,ownerKey}:{ownerKey:string;accounts:FinanceAccount[];transactions:FinanceTx[];profiles:Profile[];creditors:Array<{id:string;creditor:string;year:number}>;connectionError:string|null}) {
  const qc=useQueryClient();
  const stateFn=useServerFn(getLauncherState),saveFn=useServerFn(saveLaunch),undoFn=useServerFn(undoLaunch);
  const [undoTarget,setUndoTarget]=useState<{id:string;title:string}|null>(null),[undoBusy,setUndoBusy]=useState(false);
  const state=useQuery({queryKey:["launcher-state",ownerKey],queryFn:()=>stateFn(),retry:false});
  const [open,setOpen]=useState(false),[preview,setPreview]=useState<Launch|null>(null),[busy,setBusy]=useState(false);
  const [requestId,setRequestId]=useState(()=>crypto.randomUUID());
  const [traceId,setTraceId]=useState<string|null>(null);
  const [merchant,setMerchant]=useState("");
  const [operation,setOperation]=useState<"expense"|"income">("expense");
  const [incomeChoice,setIncomeChoice]=useState<IncomeChoice|null>(null);
  const [kind,setKind]=useState<Launch["kind"]>("expense"),[medium,setMedium]=useState<Launch["medium"]>("bank");
  const [title,setTitle]=useState(""),[date,setDate]=useState(todayBR()),[due,setDue]=useState(todayBR());
  const [value,setValue]=useState(""),[net,setNet]=useState(""),[count,setCount]=useState("1"),[starting,setStarting]=useState("1");
  const [account,setAccount]=useState(""),[destination,setDestination]=useState(""),[source,setSource]=useState(""),[creditor,setCreditor]=useState("");
  const [note,setNote]=useState(""),[settled,setSettled]=useState(false),[included,setIncluded]=useState(false);
  const name=(a:FinanceAccount)=>`${profiles.find(p=>p.account_id===a.id)?.display_name || a.name}${a.number?` · ${a.number}`:""}`;
  const unique=[...new Map(accounts.map(a=>[a.id,a])).values()];
  const choices=unique.filter(a=>a.type===(medium==="card"?"CREDIT":"BANK"));
  function selectKind(v:Launch["kind"]) {
    setMerchant("");setKind(v);setMedium(v==="card_credit"||v==="invoice_baseline"?"card":v==="contract"?"creditor":"bank");
    setAccount("");setDestination("");setPreview(null);setCount("1");setStarting("1");setSettled(false);setIncluded(false);setCreditor("");
  }
  function chooseIncome(choice:IncomeChoice|null){
    setIncomeChoice(choice);setPreview(null);
    if(choice){selectKind(choice.kind);setSource(choice.sourceName);setTitle(choice.kind==="card_credit"?"Pix Cartão Parcelado":"");}
  }
  function selectOperation(next:"expense"|"income"){
    setOperation(next);setIncomeChoice(null);selectKind(next);setSource("");setTitle("");setNet("");setValue("");
  }
  const showFields=operation==="expense"||incomeChoice!==null;
  function selectAccount(id:string) {
    setAccount(id);const card=unique.find(a=>a.id===id);
    if(medium==="card"&&card?.closingDate&&card.dueDate){
      const suggested=suggestedCardDue(date,Number(card.closingDate.slice(8,10)),Number(card.dueDate.slice(8,10)));
      if(suggested)setDue(suggested);
    }
  }
  function makePreview(e:React.FormEvent) {
    if(e.target!==e.currentTarget)return;
    e.preventDefault();
    const draft={requestId,kind,...(kind==="expense"&&merchant.trim()?{merchant:merchant.trim()}:{}),title:kind==="card_credit"?"Pix Cartão Parcelado":title,sourceId:incomeChoice?.sourceId??null,date,totalCents:parseBRL(value),medium,accountId:medium==="creditor"?null:account||null,
      destinationAccountId:kind==="card_credit"?destination||null:null,creditorId:creditor||null,
      installments:kind==="income"||kind==="invoice_baseline"?1:Number(count),startingInstallment:medium==="card"?Number(starting):1,
      firstDue:due,receivedCents:kind==="card_credit"?parseBRL(net):null,source,note,alreadySettled:settled,baselineIncludesFirst:included};
    const parsed=launchSchema.safeParse(draft);
    if(!parsed.success){toast.error(parsed.error.issues[0]?.message??"Confira os campos.");return;}
    setPreview(parsed.data);
  }
  async function save() {
    if(!preview || !state.data?.available || busy)return;
    setBusy(true);
    try {
      const result=await saveFn({data:preview});
      await qc.invalidateQueries();setPreview(null);setOpen(false);setRequestId(crypto.randomUUID());setTitle("");setMerchant("");setValue("");setNet("");setNote("");
      toast.success(result.duplicate?"Este lançamento já estava salvo. Nenhuma duplicidade foi criada.":"Lançamento salvo.",{action:{label:"Desfazer",onClick:()=>setUndoTarget({id:result.id,title:preview.title})}});
    } catch(e){toast.error((e as Error).message);}finally{setBusy(false);}
  }
  async function undo(){
    if(!undoTarget||undoBusy)return;setUndoBusy(true);
    try{await undoFn({data:{launchId:undoTarget.id}});await qc.invalidateQueries();setUndoTarget(null);toast.success("Lançamento desfeito. O histórico foi preservado.");}
    catch(e){toast.error((e as Error).message);}finally{setUndoBusy(false);}
  }
  const plan=preview?launchPlan(preview):[];
  const candidates=preview&&preview.accountId&&preview.medium==="bank"?reconciliationCandidates({accountId:preview.accountId,date:preview.date,
    cents:preview.totalCents,direction:preview.kind==="income"?"credit":"debit"},transactions.map(t=>({id:t.id,accountId:t.accountId,date:t.date,
      amountCents:Math.round(t.amount*100),description:t.description})),new Set(state.data?.usedTransactionIds??[])):[];
  return <section className="rounded-2xl border bg-card p-4 shadow-soft sm:p-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-bold">Novo lançamento</h2><p className="mt-1 text-sm text-muted-foreground">Organize compras, receitas, contratos e previsões das faturas.</p></div><Button variant="brand" onClick={()=>{setPreview(null);setOpen(true);}}><Plus className="size-4"/>Lançar movimentação</Button></div>
    {state.data?.message && <p role="status" className="mt-3 rounded-lg border border-amber-400/40 bg-amber-50/40 p-3 text-sm dark:bg-amber-950/10">{state.data.message}</p>}
    {state.error && <div role="alert" className="mt-3 text-sm text-destructive">{state.error.message} <Button variant="ghost" onClick={()=>void state.refetch()}><RefreshCw className="size-3"/>Tentar novamente</Button></div>}
    {(state.data?.launches??[]).length>0 && <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[540px] text-sm"><caption className="sr-only">Últimos lançamentos</caption><thead className="bg-muted text-left"><tr>{["Data","Descrição","Tipo","Valor","Conta","Situação","Ação"].map(h=><th className="p-2" key={h}>{h}</th>)}</tr></thead><tbody>{state.data!.launches.map(l=><tr className="border-b" key={l.id}><td className="p-2">{formatDateBR(l.date)}</td><td className="p-2">{state.data!.available?<button type="button" className="text-left underline underline-offset-2" title="Ver origem, compromissos e baixas" onClick={()=>setTraceId(l.id)}>{l.title}</button>:l.title}</td><td className="p-2">{kinds[l.kind]}</td><td className="p-2">{l.direction==="debit"?"−":l.direction==="credit"?"+":""}{formatBRL(l.totalCents)}</td><td className="p-2">{l.accountName??"—"}</td><td className="p-2">{{forecast:"Previsto",settled:"Confirmado",reconciled:"Conciliado",undone:"Desfeito"}[l.status]}</td><td className="p-2">{l.canUndo&&<Button size="sm" variant="outline" onClick={()=>setUndoTarget({id:l.id,title:l.title})}>Desfazer</Button>}</td></tr>)}</tbody></table></div>}
    <Dialog open={open} onOpenChange={v=>!busy&&setOpen(v)}><DialogContent className="max-h-[92dvh] max-w-3xl overflow-y-auto"><DialogHeader><DialogTitle>{preview?"Conferir lançamento":"Lançar movimentação"}</DialogTitle><DialogDescription>{preview?"Confira os vínculos e o impacto em cada competência antes de salvar.":"Escolha a operação e indique de onde vem ou para onde vai o dinheiro."}</DialogDescription></DialogHeader>
      {!preview?<form onSubmit={makePreview} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2"><SelectField label="Operação" value={operation} onChange={v=>selectOperation(v as "expense"|"income")}><option value="income">Receita</option><option value="expense">Despesa</option></SelectField>
        {operation==="income"&&<RevenueSourceFlow ownerKey={ownerKey} onChoose={chooseIncome}/>}
        {operation==="expense"&&<SelectField label="Tipo de despesa" value={kind} onChange={v=>selectKind(v as Launch["kind"])}><option value="expense">Compra / compromisso</option><option value="contract">Contrato parcelado</option><option value="invoice_baseline">Fatura inicial</option></SelectField>}
        {showFields&&<>
        <label className="space-y-1.5 text-sm font-medium"><span>{kind==="card_credit"?"Credor":kind==="expense"?"O que foi comprado ou consumido?":"Descrição / credor"}</span><Input required readOnly={kind==="card_credit"} maxLength={200} value={title} onChange={e=>setTitle(e.target.value)} placeholder="Ex.: compra de celular"/></label>
        {kind==="expense"&&<label className="space-y-1.5 text-sm font-medium"><span>Estabelecimento ou fornecedor (opcional)</span><Input maxLength={200} value={merchant} onChange={e=>setMerchant(e.target.value)} /></label>}
        <label className="space-y-1.5 text-sm font-medium"><span>Data da operação</span><Input required type="date" value={date} onChange={e=>setDate(e.target.value)}/></label>
        <label className="space-y-1.5 text-sm font-medium"><span>{kind==="card_credit"?"Valor líquido recebido (R$)":kind==="invoice_baseline"?"Total da fatura inicial (R$)":"Valor total (R$)"}</span><Input required inputMode="decimal" value={kind==="card_credit"?net:value} onChange={e=>kind==="card_credit"?setNet(e.target.value):setValue(e.target.value)} placeholder="0,00"/></label>
        {kind==="expense"&&<SelectField label="Forma de pagamento" value={medium} onChange={v=>{setMedium(v as Launch["medium"]);setAccount("");setCreditor("");setStarting("1");setIncluded(false);setSettled(false);}}><option value="bank">Conta bancária</option><option value="card">Cartão de crédito</option><option value="creditor">Parcelado com o credor</option></SelectField>}
        {medium!=="creditor"&&<SelectField required label={medium==="card"?"Cartão de origem":kind==="income"?"Conta de destino":"Conta de origem"} value={account} onChange={selectAccount}><option value="">Selecione</option>{choices.map(a=><option key={a.id} value={a.id}>{name(a)}</option>)}</SelectField>}
        {kind==="card_credit"&&<><div className="space-y-1.5"><SelectField required label="Conta de destino" value={destination} onChange={setDestination}><option value="">Selecione</option>{unique.filter(a=>a.type==="BANK").map(a=><option key={a.id} value={a.id}>{name(a)}</option>)}</SelectField><p className="text-xs font-normal text-muted-foreground">A conta de destino recebe somente o valor líquido. A dívida parcelada será controlada pela fatura do cartão de origem.</p></div><label className="space-y-1.5 text-sm font-medium"><span>Total cobrado no cartão (R$)</span><Input required inputMode="decimal" value={value} onChange={e=>setValue(e.target.value)} placeholder="Total com taxas"/></label></>}
        {kind!=="income"&&kind!=="invoice_baseline"&&<label className="space-y-1.5 text-sm font-medium"><span>Quantidade total de parcelas</span><Input required type="number" min={1} max={120} value={count} onChange={e=>setCount(e.target.value)}/></label>}
        {medium==="card"&&kind!=="invoice_baseline"&&<label className="space-y-1.5 text-sm font-medium"><span>Primeira parcela a acompanhar</span><Input required type="number" min={1} max={Number(count)||1} value={starting} onChange={e=>setStarting(e.target.value)}/></label>}
        <label className="space-y-1.5 text-sm font-medium"><span>{kind==="income"?"Data prevista para receber":medium==="card"?"Vencimento da primeira fatura":"Primeiro vencimento"}</span><Input required type="date" value={due} onChange={e=>setDue(e.target.value)}/></label>
        {(kind==="expense"||kind==="contract")&&medium!=="card"&&<SelectField label="Vincular ao credor de Despesas Anuais" value={creditor} onChange={setCreditor}><option value="">Novo compromisso</option>{creditors.filter(c=>c.year===Number(due.slice(0,4))).map(c=><option key={c.id} value={c.id}>{c.creditor} · {c.year}</option>)}</SelectField>}
        </>}
        </div>
        {showFields&&<>
        {connectionError&&<p role="alert" className="text-sm text-amber-700">Alguns dados bancários estão indisponíveis. {connectionError}</p>}
        {medium==="card"&&<p className="text-xs text-muted-foreground">Confira a primeira fatura. O fechamento sugerido pode variar por cartão. Compras já parceladas usam o valor total original e o número da próxima parcela.</p>}
        {medium==="card"&&kind!=="invoice_baseline"&&<label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={included} onChange={e=>setIncluded(e.target.checked)}/>A primeira parcela acompanhada já está incluída no total da fatura inicial cadastrada.</label>}
        {kind!=="invoice_baseline"&&((medium==="bank"&&Number(count)===1)||kind==="card_credit")&&<label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={settled} onChange={e=>setSettled(e.target.checked)}/>{kind==="income"||kind==="card_credit"?"O dinheiro já entrou na conta":"Já foi pago pela conta selecionada"}</label>}
        {kind==="card_credit"&&<p className="rounded-lg bg-muted p-3 text-sm">A entrada será classificada como crédito recebido. O custo da operação e a dívida no cartão ficam vinculados, separados das rendas.</p>}
        {kind==="invoice_baseline"&&<p className="rounded-lg bg-muted p-3 text-sm">Cadastre o total atual da fatura. Para acompanhar o que continua nos próximos meses, cadastre também as compras parceladas e marque as parcelas já incluídas nesta base.</p>}
        <label className="block space-y-1.5 text-sm font-medium"><span>Nota / observação</span><Input maxLength={1000} value={note} onChange={e=>setNote(e.target.value)} placeholder="Referência da nota fiscal ou observação"/></label>
        </>}
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={()=>setOpen(false)}>Cancelar</Button><Button variant="brand" type="submit" disabled={!showFields}>Conferir prévia<ArrowRight className="size-4"/></Button></div>
      </form>:<div className="space-y-4">
        <div className="rounded-xl border p-4"><h3 className="font-bold">{preview.title}</h3><p className="mt-1 text-sm">{kinds[preview.kind]} · {formatDateBR(preview.date)}</p><p className="mt-2 text-xl font-bold">{formatBRL(preview.kind==="card_credit"?preview.receivedCents:preview.totalCents)}</p>
          {preview.merchant&&<p className="text-sm">Estabelecimento: {preview.merchant}</p>}
          {preview.accountId&&<p className="mt-2 text-sm">{preview.kind==="income"?"Destino":"Origem"}: {unique.find(a=>a.id===preview.accountId)?name(unique.find(a=>a.id===preview.accountId)!):preview.accountId}</p>}
          {preview.kind==="card_credit"&&<><p className="text-sm">Entrada: {formatBRL(preview.receivedCents)} · Total no cartão: {formatBRL(preview.totalCents)} · Custo: {formatBRL(preview.totalCents-preview.receivedCents!)}</p><p className="text-sm">Destino: {unique.find(a=>a.id===preview.destinationAccountId)?name(unique.find(a=>a.id===preview.destinationAccountId)!):preview.destinationAccountId}</p></>}
          <p className="mt-2 text-sm text-muted-foreground">{preview.kind==="invoice_baseline"?"Base da previsão; será conferida com a fatura fechada.":preview.alreadySettled?"A confirmação será registrada junto com a conta selecionada.":"Previsto: a confirmação de pagamento ou recebimento será feita depois."}</p>
        </div>
        <div className="max-h-64 overflow-auto rounded-lg border"><table className="w-full text-sm"><thead className="sticky top-0 bg-muted text-left"><tr><th className="p-2">Parcela</th><th className="p-2">Vencimento</th><th className="p-2">Valor</th><th className="p-2">Composição</th></tr></thead><tbody>{plan.map(p=><tr key={p.number} className="border-t"><td className="p-2">{p.number}/{preview.installments}</td><td className="p-2">{formatDateBR(p.dueDate)}</td><td className="p-2">{formatBRL(p.cents)}</td><td className="p-2">{p.includedInBaseline?"Já incluída na fatura inicial":"Adicionar à previsão"}</td></tr>)}</tbody></table></div>
        {preview.medium==="card"&&<p className="text-sm text-muted-foreground">As parcelas compõem a fatura do cartão. Despesas Anuais recebe o total da fatura uma única vez. Quando houver fatura fechada, o valor oficial prevalece e a diferença fica para conferência.</p>}
        {preview.medium==="bank"&&<div className="rounded-lg bg-muted p-3 text-sm"><p className="font-semibold">Conferência com o extrato</p><p>{candidates.length?`${candidates.length} possível(is) correspondência(s). A confirmação será feita na conciliação.`:"Nenhuma correspondência no extrato disponível. O lançamento permanecerá aguardando conciliação."}</p>{candidates.map(t=><p key={t.id} className="mt-1">{formatDateBR(t.date)} · {t.description} · {formatBRL(Math.abs(t.amountCents))}</p>)}</div>}
        {!state.data?.available&&<p role="status" className="rounded-lg border border-amber-400/40 p-3 text-sm">Prévia para análise. Nenhum lançamento foi salvo. A gravação aguarda a ativação no banco.</p>}
        <div className="flex justify-end gap-2"><Button variant="outline" disabled={busy} onClick={()=>setPreview(null)}>Ajustar</Button><Button variant="brand" disabled={busy||!state.data?.available} onClick={()=>void save()}>{busy?"Salvando…":"Salvar lançamento"}</Button></div>
      </div>}
    </DialogContent></Dialog>
    <Dialog open={!!traceId} onOpenChange={v=>!v&&setTraceId(null)}><DialogContent className="sm:max-w-2xl"><DialogHeader><DialogTitle>Histórico da transação</DialogTitle><DialogDescription>Origem, compromissos e movimentações de conta.</DialogDescription></DialogHeader>{traceId&&<TransactionTrace selector={{launchId:traceId}}/>}</DialogContent></Dialog>
    <Dialog open={!!undoTarget} onOpenChange={o=>!o&&!undoBusy&&setUndoTarget(null)}><DialogContent><DialogHeader><DialogTitle>Desfazer lançamento</DialogTitle><DialogDescription>{undoTarget?.title}</DialogDescription></DialogHeader><p className="text-sm">A operação e seus efeitos vinculados serão revertidos, preservando o histórico. Faturas fechadas ou pagamentos posteriores exigem conferência antes do estorno.</p><div className="flex justify-end gap-2"><Button variant="outline" disabled={undoBusy} onClick={()=>setUndoTarget(null)}>Cancelar</Button><Button variant="destructive" disabled={undoBusy} onClick={()=>void undo()}>{undoBusy?"Desfazendo…":"Confirmar desfazimento"}</Button></div></DialogContent></Dialog>
  </section>;
}
