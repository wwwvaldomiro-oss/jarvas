import { useRequireUser } from "@/components/AppShell";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getFinances } from "@/lib/pluggy.functions";
import { getLauncherState } from "@/lib/finance/launcher.functions";

export function useSettlementAccount(enabled=true) {
  const user=useRequireUser();
  const [accountId,setAccountId]=useState("");
  const fn=useServerFn(getLauncherState);
  const state=useQuery({queryKey:["launcher-state",user?.email],queryFn:()=>fn(),retry:false,enabled:enabled&&!!user});
  const walletFn=useServerFn(getFinances);
  const wallet=useQuery({queryKey:["finances"],queryFn:()=>walletFn(),enabled:enabled&&!!user});
  const available=state.data?.available===true;
  const accounts=[...new Map((wallet.data?.accounts??[]).filter(a=>a.type==="BANK").map(a=>[a.id,a])).values()];
  return {accountId,setAccountId,available,legacy:state.data?.available===false,accounts,error:state.error?.message??wallet.error?.message??null};
}
export function SettlementAccountField({flow,value,onChange,available,accounts,error}:{flow:"payment"|"receipt";value:string;onChange:(id:string)=>void;available:boolean;accounts:ReturnType<typeof useSettlementAccount>["accounts"];error:string|null}) {
  return <label className="block space-y-1.5 text-sm font-medium"><span>{flow==="payment"?"Conta de origem":"Conta de destino"}</span>
    <select aria-label={flow==="payment"?"Conta de origem":"Conta de destino"} disabled={!available} required={available} value={value} onChange={e=>onChange(e.target.value)} className="h-10 w-full rounded-md border bg-background px-3 text-sm disabled:opacity-60"><option value="">Selecione a conta</option>{accounts.map(a=><option key={a.id} value={a.id}>{a.name}{a.number?` · ${a.number}`:""}</option>)}</select>
    {!available&&<span className="block text-xs font-normal text-muted-foreground">O vínculo da conta aguarda a ativação do novo lançador. O registro atual continua disponível.</span>}
    {error&&<span role="alert" className="block text-xs font-normal text-destructive">{error}</span>}
  </label>;
}
