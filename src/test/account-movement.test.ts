import { describe,it,expect,vi } from "vitest";
import { packMovementNote,unpackMovementNote,visibleMovementNote,movementDelta } from "@/lib/finance/account-movement";
vi.mock("@tanstack/react-start",()=>({createServerFn:()=>{const b={middleware:()=>b,inputValidator:()=>b,handler:(fn:unknown)=>fn};return b;}}));
vi.mock("@/integrations/supabase/auth-middleware",()=>({requireSupabaseAuth:{}}));
vi.mock("@/lib/pluggy.functions",()=>({assertUserFinanceAccount:vi.fn(),authorizedMovementAccount:vi.fn(async()=>({id:"bank",name:"BTG",type:"BANK"}))}));
vi.mock("@/lib/finance/finance.functions",()=>({recordBillPayment:vi.fn(async()=>undefined)}));
import { recordAccountSettlement,getLauncherState } from "@/lib/finance/launcher.functions";
import { recordBillPayment } from "@/lib/finance/finance.functions";
const move={version:1 as const,accountId:"bank",accountName:"BTG",direction:"credit" as const};
const payload={requestId:"c46061e2-e4e3-48d0-8760-d55157c2d37b",kind:"revenue",id:"entry",number:null,accountId:"bank",date:"2026-11-17",cents:162000,note:"BPC",reason:"",quits:true,revision:false};
const call=(fn:unknown,data:unknown,supabase:unknown)=>(fn as (v:any)=>Promise<any>)({data,context:{supabase,userId:"owner"}});
describe("registro e conta formam a mesma movimentação",()=>{
 it("mantém nota e conta juntas e calcula entrada/saída em centavos",()=>{
   const text=packMovementNote("Benefício",move,2000);expect(unpackMovementNote(text)).toEqual({note:"Benefício",movement:move});
   expect(visibleMovementNote(text)).toBe("Benefício · Entrada em: BTG");expect(movementDelta(162000,"credit")).toBe(162000);expect(movementDelta(26662,"debit")).toBe(-26662);
   expect(packMovementNote(text,move,2000)).toBe(text);expect(()=>packMovementNote("A".repeat(2000),move,2000)).toThrow();
 });
 it("conclui recebimento com conta mesmo sem ativação do novo lançador",async()=>{
   const rpc=vi.fn(async(name:string,_params:any)=>name==="finance_record_settlement"?{error:{code:"PGRST202",message:"Could not find finance_record_settlement"}}:{error:null});
   expect(await call(recordAccountSettlement,payload,{rpc})).toEqual({ok:true});
   expect(rpc).toHaveBeenLastCalledWith("revenue_receive",expect.objectContaining({p_id:"entry",p_cents:162000}));
   expect(unpackMovementNote(rpc.mock.calls[1]![1].p_note).movement).toEqual(move);
 });
 it("pagamento usa a baixa canônica e não cria outra obrigação",async()=>{
   const rpc=vi.fn(async()=>({error:{code:"PGRST202",message:"Could not find finance_record_settlement"}}));
   await call(recordAccountSettlement,{...payload,kind:"bill",id:"bill",cents:26662},{rpc});
   expect(recordBillPayment).toHaveBeenCalledWith(expect.anything(),expect.objectContaining({billId:"bill",paidCents:26662}),false);
   const args=vi.mocked(recordBillPayment).mock.calls.at(-1)!;expect(unpackMovementNote(args[1].note).movement?.direction).toBe("debit");
 });
 it("não usa o caminho anterior para encobrir erro de permissão",async()=>{
   const rpc=vi.fn(async()=>({error:{code:"42501",message:"permission denied"}}));
   await expect(call(recordAccountSettlement,payload,{rpc})).rejects.toThrow("permission denied");expect(rpc).toHaveBeenCalledTimes(1);
 });
 it("monta uma única linha por parcela, preservando a conta da correção",async()=>{
   const note=packMovementNote("",{...move,direction:"debit"},1000);
   const rows:Record<string,any[]>={finance_bills:[{id:"b",creditor:"Contrato",contract_id:"c",installment_number:1,paid_note:note,paid_date:"2026-11-17",paid_cents:10000}],installment_entries:[{contract_id:"c",number:1,note,paid_date:"2026-11-17",paid_cents:8000}],installment_contracts:[{id:"c",name:"Contrato"}],revenue_entries:[]};
   const db={rpc:async()=>({error:{code:"PGRST202",message:"Could not find finance_launcher_state"}}),from:(table:string)=>{const q:any={select:()=>q,eq:()=>q,not:()=>q,order:()=>q,limit:()=>q,then:(resolve:any)=>Promise.resolve({data:rows[table],error:null}).then(resolve)};return q;}};
   const result=await call(getLauncherState,null,db);expect(result.launches).toHaveLength(1);expect(result.launches[0]).toMatchObject({title:"Contrato",totalCents:8000,accountName:"BTG",direction:"debit"});
 });
});
