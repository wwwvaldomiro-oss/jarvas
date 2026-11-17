import { describe, expect, it, vi } from "vitest";
vi.mock("@tanstack/react-start",()=>({createServerFn:()=>{const b={middleware:()=>b,inputValidator:()=>b,handler:(fn:unknown)=>fn};return b;}}));
vi.mock("@/integrations/supabase/auth-middleware",()=>({requireSupabaseAuth:{}}));
vi.mock("@/lib/pluggy.functions",()=>({assertUserFinanceAccount:vi.fn(async()=>"CREDIT")}));
import { getLauncherState, saveLaunch, recordAccountSettlement } from "@/lib/finance/launcher.functions";
import { assertUserFinanceAccount } from "@/lib/pluggy.functions";
import type { Launch } from "@/lib/finance/launcher";
const call=(fn:unknown,data:unknown,rpc:any)=>(fn as (args:any)=>Promise<any>)({data,context:{supabase:{rpc},userId:"owner"}});
const launch:Launch={requestId:"c46061e2-e4e3-48d0-8760-d55157c2d37b",kind:"expense",title:"Compra",date:"2026-11-17",totalCents:100000,medium:"card",accountId:"card",destinationAccountId:null,creditorId:null,installments:10,startingInstallment:1,firstDue:"2026-12-10",receivedCents:null,source:"",note:"",alreadySettled:false,baselineIncludesFirst:false};
describe("ativação e gravação protegidas",()=>{
 it("habilita só a prévia quando a função do banco não existe",async()=>{
   const rpc=vi.fn(async()=>({data:null,error:{code:"PGRST202",message:"Could not find public.finance_launcher_state"}}));
   expect(await call(getLauncherState,null,rpc)).toMatchObject({available:false,launches:[]});
 });
 it("não disfarça erro de permissão como falta de ativação",async()=>{
   const rpc=vi.fn(async()=>({data:null,error:{code:"42501",message:"permission denied"}}));
   await expect(call(getLauncherState,null,rpc)).rejects.toThrow("permission denied");
 });
 it("recusa ativação incompleta e valida o protocolo de resposta",async()=>{
   expect(await call(getLauncherState,null,async()=>({data:{version:1,capabilities:["atomic_launch"],launches:[],usedTransactionIds:[]},error:null}))).toMatchObject({available:false});
   await expect(call(getLauncherState,null,async()=>({data:{version:2},error:null}))).rejects.toThrow();
 });
 it("envia uma operação e seu plano em uma única chamada transacional",async()=>{
   const rpc=vi.fn(async()=>({data:{id:launch.requestId,duplicate:false},error:null}));
   await call(saveLaunch,launch,rpc);
   expect(rpc).toHaveBeenCalledTimes(1);
   expect(rpc).toHaveBeenCalledWith("finance_launch_transaction",expect.objectContaining({p_launch:launch,p_plan:expect.arrayContaining([expect.objectContaining({number:10,cents:10000,period:"2027-09"})])}));
 });
 it("não tenta gravações alternativas se o backend está ausente",async()=>{
   const rpc=vi.fn(async()=>({data:null,error:{code:"PGRST202",message:"Could not find finance_launch_transaction"}}));
   await expect(call(saveLaunch,launch,rpc)).rejects.toThrow("Modo de análise");expect(rpc).toHaveBeenCalledTimes(1);
 });
 it("recusa usar cartão como conta de origem de pagamento bancário",async()=>{
   vi.mocked(assertUserFinanceAccount).mockResolvedValueOnce("CREDIT");const rpc=vi.fn();
   await expect(call(recordAccountSettlement,{accountId:"card"},rpc)).rejects.toThrow("Selecione uma conta bancária");expect(rpc).not.toHaveBeenCalled();
 });
});
