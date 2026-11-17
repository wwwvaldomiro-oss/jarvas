import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertUserFinanceAccount } from "@/lib/pluggy.functions";
import { launchSchema, launchPlan } from "./launcher";

export const LAUNCHER_SETUP_MESSAGE = "Modo de análise: a gravação e a conciliação aguardam a ativação do lançador no banco. Você já pode preencher e conferir as prévias.";
const capabilities = ["atomic_launch", "settlement_accounts", "card_invoices", "reconciliation"] as const;
const savedSchema = z.object({id:z.string().uuid(),title:z.string(),kind:launchSchema.innerType().shape.kind,
  date:z.string().date(),totalCents:z.number().int().nonnegative(),status:z.enum(["forecast","settled","reconciled"])});
export type SavedLaunch = z.infer<typeof savedSchema>;
const stateSchema = z.object({version:z.literal(1),capabilities:z.array(z.string()),launches:z.array(savedSchema),
  usedTransactionIds:z.array(z.string())});
export function missingLauncher(error: {code?:string;message?:string}|null) {
  return !!error && error.code === "PGRST202" && /finance_launcher_state|finance_launch_transaction|finance_launch_reconcile|finance_record_settlement/.test(error.message??"");
}
export const getLauncherState = createServerFn({method:"GET"}).middleware([requireSupabaseAuth]).handler(async({context})=>{
  const {data,error}=await (context.supabase as any).rpc("finance_launcher_state",{p_version:1});
  if(missingLauncher(error))return {available:false,launches:[] as SavedLaunch[],usedTransactionIds:[] as string[],message:LAUNCHER_SETUP_MESSAGE};
  if(error)throw new Error("Falha ao consultar lançador: "+error.message);
  const parsed=stateSchema.parse(data);
  const available=capabilities.every(c=>parsed.capabilities.includes(c));
  return {available,launches:parsed.launches,usedTransactionIds:parsed.usedTransactionIds,message:available?null:LAUNCHER_SETUP_MESSAGE};
});

export const saveLaunch = createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
  .inputValidator((v:unknown)=>launchSchema.parse(v)).handler(async({data,context})=>{
    const db=context.supabase as any;
    if(data.accountId){
      const type=await assertUserFinanceAccount(db,context.userId,data.accountId);
      if(type !== (data.medium === "card"?"CREDIT":"BANK"))throw new Error("A conta escolhida não corresponde à forma de pagamento.");
    }
    if(data.destinationAccountId && await assertUserFinanceAccount(db,context.userId,data.destinationAccountId)!=="BANK")
      throw new Error("O destino deve ser uma conta bancária autorizada.");
    if(data.creditorId){
      const {data:row,error}=await db.from("annual_expenses").select("id").eq("user_id",context.userId).eq("id",data.creditorId).maybeSingle();
      if(error || !row)throw new Error("Credor não pertence ao usuário.");
    }
    // The database must independently revalidate the plan, ownership and requestId.
    // No fallbacks to multiple independent writes: a credit operation is all or nothing.
    const {data:result,error}=await db.rpc("finance_launch_transaction",{p_version:1,p_launch:data,p_plan:launchPlan(data)});
    if(missingLauncher(error))throw new Error(LAUNCHER_SETUP_MESSAGE);
    if(error)throw new Error("Lançamento não salvo: "+error.message);
    return z.object({id:z.string().uuid(),duplicate:z.boolean()}).parse(result);
  });

export const reconcileLaunch = createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
  .inputValidator((v:unknown)=>z.object({launchId:z.string().uuid(),transactionId:z.string().min(1).max(200)}).parse(v))
  .handler(async({data,context})=>{
    // Candidate selection is a proposal. The server-side RPC must verify the provider
    // transaction against a trusted synced record; browser values are never evidence.
    const {data:result,error}=await (context.supabase as any).rpc("finance_launch_reconcile",{
      p_version:1,p_launch_id:data.launchId,p_transaction_id:data.transactionId,
    });
    if(missingLauncher(error))throw new Error(LAUNCHER_SETUP_MESSAGE);
    if(error)throw new Error("Conciliação não realizada: "+error.message);
    return z.object({id:z.string().uuid(),reconciled:z.literal(true)}).parse(result);
  });

export const recordAccountSettlement = createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
  .inputValidator((v:unknown)=>z.object({requestId:z.string().uuid(),kind:z.enum(["bill","installment","revenue"]),id:z.string().min(1).max(200),
    number:z.number().int().positive().nullable(),accountId:z.string().min(1).max(200),date:z.string().date(),cents:z.number().int().positive(),
    note:z.string().max(2000),reason:z.string().max(1000),quits:z.boolean(),revision:z.boolean()}).parse(v))
  .handler(async({data,context})=>{
    if(await assertUserFinanceAccount(context.supabase,context.userId,data.accountId)!=="BANK")
      throw new Error("Selecione uma conta bancária. Para usar limite de cartão, registre uma operação de crédito no lançador.");
    const {data:result,error}=await (context.supabase as any).rpc("finance_record_settlement",{p_version:1,p_settlement:data});
    if(missingLauncher(error))throw new Error(LAUNCHER_SETUP_MESSAGE);
    if(error)throw new Error(error.message);
    return z.object({ok:z.literal(true)}).parse(result);
  });

export const getLauncherCreditors = createServerFn({method:"GET"}).middleware([requireSupabaseAuth]).handler(async({context})=>{
  const {data,error}=await (context.supabase as any).from("annual_expenses").select("id,creditor,year,expense_source")
    .eq("user_id",context.userId).or("expense_source.is.null,expense_source.neq.card").order("year").order("creditor");
  if(error)throw new Error(error.message);
  return (data??[]) as Array<{id:string;creditor:string;year:number}>;
});
