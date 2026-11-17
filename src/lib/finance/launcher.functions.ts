import { packMovementNote, unpackMovementNote } from "./account-movement";
import { recordBillPayment } from "./finance.functions";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertUserFinanceAccount, authorizedMovementAccount } from "@/lib/pluggy.functions";
import { launchSchema, launchPlan } from "./launcher";

export const LAUNCHER_SETUP_MESSAGE = "Novas compras e Pix parcelado estão em modo de análise. Pagamentos e recebimentos confirmados com conta vinculada aparecem nos registros abaixo.";
const capabilities = ["atomic_launch", "settlement_accounts", "card_invoices", "reconciliation"] as const;
const savedSchema = z.object({id:z.string().min(1),title:z.string(),kind:launchSchema.innerType().shape.kind,
  date:z.string().date(),totalCents:z.number().int().nonnegative(),status:z.enum(["forecast","settled","reconciled"]),accountName:z.string().optional(),accountId:z.string().optional(),direction:z.enum(["debit","credit"]).optional()});
export type SavedLaunch = z.infer<typeof savedSchema>;
const stateSchema = z.object({version:z.literal(1),capabilities:z.array(z.string()),launches:z.array(savedSchema),
  usedTransactionIds:z.array(z.string())});
export function missingLauncher(error: {code?:string;message?:string}|null) {
  return !!error && error.code === "PGRST202" && /finance_launcher_state|finance_launch_transaction|finance_launch_reconcile|finance_record_settlement/.test(error.message??"");
}
export const getLauncherState = createServerFn({method:"GET"}).middleware([requireSupabaseAuth]).handler(async({context})=>{
  const {data,error}=await (context.supabase as any).rpc("finance_launcher_state",{p_version:1});
  if(missingLauncher(error)){
    const db=context.supabase as any;
    const [bills,installments,revenues,contracts]=await Promise.all([
      db.from("finance_bills").select("id,creditor,paid_date,paid_cents,paid_note,contract_id,installment_number").eq("user_id",context.userId).not("paid_date","is",null).order("paid_date",{ascending:false}).limit(200),
      db.from("installment_entries").select("contract_id,number,paid_date,paid_cents,note").eq("user_id",context.userId).not("paid_date","is",null).order("paid_date",{ascending:false}).limit(200),
      db.from("revenue_entries").select("id,title,received_date,received_cents,note").eq("user_id",context.userId).not("received_date","is",null).order("received_date",{ascending:false}).limit(200),
      db.from("installment_contracts").select("id,name").eq("user_id",context.userId),
    ]);
    for(const r of [bills,installments,revenues,contracts])if(r.error)throw new Error("Falha ao consultar lançamentos registrados: "+r.error.message);
    const names=new Map((contracts.data??[]).map((c:any)=>[c.id,c.name]));
    const entries=new Map<string,SavedLaunch>();
    for(const b of bills.data??[]){
      const m=unpackMovementNote(b.paid_note).movement;if(!m)continue;
      const key=b.contract_id&&b.installment_number!=null?`installment:${b.contract_id}:${b.installment_number}`:`bill:${b.id}`;
      entries.set(key,{id:key,title:b.creditor,kind:"expense",date:b.paid_date,totalCents:b.paid_cents??0,status:"settled",accountName:m.accountName,accountId:m.accountId,direction:m.direction});
    }
    for(const i of installments.data??[]){
      const m=unpackMovementNote(i.note).movement;if(!m)continue;
      const key=`installment:${i.contract_id}:${i.number}`;
      entries.set(key,{id:key,title:String(names.get(i.contract_id)??`Parcela ${i.number}`),kind:"expense",date:i.paid_date,totalCents:i.paid_cents??0,status:"settled",accountName:m.accountName,accountId:m.accountId,direction:m.direction});
    }
    for(const r of revenues.data??[]){const m=unpackMovementNote(r.note).movement;if(m)entries.set(`revenue:${r.id}`,{id:`revenue:${r.id}`,title:r.title,kind:"income",date:r.received_date,totalCents:r.received_cents??0,status:"settled",accountName:m.accountName,accountId:m.accountId,direction:m.direction});}
    return {available:false,launches:[...entries.values()].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,100),usedTransactionIds:[] as string[],message:LAUNCHER_SETUP_MESSAGE};
  }
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
    if(data.sourceId){
      const {data:source,error}=await db.from("revenue_sources").select("id").eq("id",data.sourceId).eq("user_id",context.userId).maybeSingle();
      if(error||!source)throw new Error("Fonte pagadora não pertence ao usuário.");
    }
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
    const account=await authorizedMovementAccount(context.userId,data.accountId);
    if(account.type!=="BANK")throw new Error("Selecione uma conta bancária. Para usar limite de cartão, use a fonte pagadora Cartão de crédito.");
    const db=context.supabase as any;
    const {data:result,error}=await db.rpc("finance_record_settlement",{p_version:1,p_settlement:data});
    if(!missingLauncher(error)){
      if(error)throw new Error(error.message);
      return z.object({ok:z.literal(true)}).parse(result);
    }
    // Existing canonical records can atomically retain the account inside the audited
    // note. This avoids requiring the new launcher schema to finish a payment.
    const note=packMovementNote(data.note,{version:1,accountId:account.id,accountName:account.name,
      direction:data.kind==="revenue"?"credit":"debit"},data.kind==="revenue"?2000:1000);
    if(data.kind==="revenue"){
      const {error:e}=await db.rpc("revenue_receive",{p_id:data.id,p_date:data.date,p_cents:data.cents,p_note:note,p_reason:data.reason});
      if(e)throw new Error(e.message);
    }else if(data.kind==="bill"){
      await recordBillPayment(db,{billId:data.id,paidDate:data.date,paidCents:data.cents,note,quits:data.quits},data.revision);
    }else{
      const {error:e}=await db.rpc("record_expense_payment",{p_bill_id:null,p_contract_id:data.id,p_number:data.number,p_paid_date:data.date,
        p_paid_cents:data.cents,p_note:note,p_is_settled:data.quits,p_revision:data.revision});
      if(e)throw new Error(e.message);
    }
    return {ok:true as const};
  });

export const getLauncherCreditors = createServerFn({method:"GET"}).middleware([requireSupabaseAuth]).handler(async({context})=>{
  const {data,error}=await (context.supabase as any).from("annual_expenses").select("id,creditor,year,expense_source")
    .eq("user_id",context.userId).or("expense_source.is.null,expense_source.neq.card").order("year").order("creditor");
  if(error)throw new Error(error.message);
  return (data??[]) as Array<{id:string;creditor:string;year:number}>;
});
