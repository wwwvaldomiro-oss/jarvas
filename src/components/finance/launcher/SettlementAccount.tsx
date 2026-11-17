import { useRequireUser } from "@/components/AppShell";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getFinances } from "@/lib/pluggy.functions";
import { unpackMovementNote } from "@/lib/finance/account-movement";
import { formatBRL } from "@/lib/finance/money";

export function useSettlementAccount(enabled=true,initialNote?:string|null) {
  const user=useRequireUser();
  const [accountId,setAccountId]=useState(()=>unpackMovementNote(initialNote).movement?.accountId??"");
  const walletFn=useServerFn(getFinances);
  const wallet=useQuery({queryKey:["finances"],queryFn:()=>walletFn(),enabled:enabled&&!!user});
  const accounts=[...new Map((wallet.data?.accounts??[]).filter(a=>a.type==="BANK").map(a=>[a.id,a])).values()];
  // Existing payments never depend on the launcher's unrelated activation request.
  return {accountId,setAccountId,available:accounts.length>0,legacy:true,accounts,error:wallet.error?.message??null};
}
export function SettlementAccountField({flow,value,onChange,available,accounts,error,amountCents}:{flow:"payment"|"receipt";value:string;onChange:(id:string)=>void;available:boolean;accounts:ReturnType<typeof useSettlementAccount>["accounts"];error:string|null;amountCents?:number|null}) {
  const selected=accounts.find(a=>a.id===value);
  return <div className="space-y-1.5 text-sm"><label className="block space-y-1.5 font-medium"><span>{flow==="payment"?"Conta de origem":"Conta de destino"}</span>
    <select aria-label={flow==="payment"?"Conta de origem":"Conta de destino"} disabled={!available} required={available} value={value} onChange={e=>onChange(e.target.value)} className="h-10 w-full rounded-md border bg-background px-3 text-sm disabled:opacity-60"><option value="">Selecione a conta</option>{accounts.map(a=><option key={a.id} value={a.id}>{a.name}{a.number?` · ${a.number}`:""}</option>)}</select></label>
    <p className="text-xs text-muted-foreground">{flow==="payment"?"O pagamento registra uma saída na conta de origem.":"O recebimento registra uma entrada na conta de destino."}{selected&&amountCents!=null?` ${flow==="payment"?"Saída":"Entrada"}: ${formatBRL(amountCents)} · ${selected.name}.`:""}</p>
    {!available&&<p className="text-xs text-muted-foreground">As contas ainda não estão disponíveis. Você pode concluir o registro atual e vincular a conta ao corrigir o registro.</p>}
    {error&&<p role="alert" className="text-xs text-destructive">{error}</p>}
  </div>;
}
