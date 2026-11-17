import { describe, it, expect, vi } from "vitest";
import { linkedInstallment, projectInstallmentPayment } from "@/lib/finance/linked-payment";

vi.mock("@tanstack/react-start", () => ({createServerFn: () => {
  const builder = {middleware: () => builder, inputValidator: () => builder, handler: (fn: unknown) => fn};
  return builder;
}}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({requireSupabaseAuth: {}}));
vi.mock("@/lib/pluggy.functions", () => ({assertUserCreditCard: vi.fn()}));
vi.mock("@/lib/finance/annual-projections.functions", () => ({extendFixedConsumptionsForNewContract: vi.fn()}));
import { payBillFn, reviseBillFn, getHistory, getContracts, getAnnualYear, deleteBillFn } from "@/lib/finance/finance.functions";

function fixture() {
  const entry = {id:"entry",user_id:"owner",contract_id:"contract",number:3,due_date:"2026-11-07",expected_cents:10000,paid_date:null as string|null,paid_cents:null as number|null,note:null,is_settled:false};
  const tables: Record<string, any[]> = {
    annual_expenses:[{id:"annual",user_id:"owner",year:2026,creditor:"Credor",source_contract_id:"contract",expense_source:"contract"}],
    annual_expense_months:[{annual_expense_id:"annual",month:11,expected_cents:10000}],
    annual_years:[{year:2026,archived_at:null}],finance_account_profiles:[],
    finance_bills:[{id:"bill",user_id:"owner",source_annual_id:"annual",source_period:"2026-11",creditor:"Credor",due_date:"2026-11-07",expected_cents:10000,paid_date:null,paid_cents:null,paid_note:null,contract_id:null,installment_number:null,is_settled:false}],
    installment_entries:[entry], installment_contracts:[{id:"contract",name:"Credor",archived_at:null}],
  };
  const rpc=vi.fn(async (_name:string,p:any) => {
    if(p.p_contract_id) Object.assign(entry,{paid_date:p.p_paid_date,paid_cents:p.p_paid_cents,note:p.p_note,is_settled:p.p_is_settled});
    return {error:null};
  });
  const supabase={rpc,from:(table:string)=>{
    const filters: Array<(r:any)=>boolean>=[];
    const q:any={select:()=>q,eq:(k:string,v:any)=>{filters.push(r=>r[k]===v);return q;},
      in:(k:string,v:any[])=>{filters.push(r=>v.includes(r[k]));return q;},
      gte:(k:string,v:any)=>{filters.push(r=>r[k]>=v);return q;},lt:(k:string,v:any)=>{filters.push(r=>r[k]<v);return q;},
      lte:(k:string,v:any)=>{filters.push(r=>r[k]<=v);return q;},is:(k:string,v:any)=>{filters.push(r=>r[k]===v);return q;},
      not:(k:string,_op:string,v:any)=>{filters.push(r=>r[k]!==v);return q;},order:()=>q,range:()=>q,limit:()=>q,
      single:async()=>({data:(tables[table]??[]).filter(r=>filters.every(f=>f(r)))[0]??null,error:null}),
      maybeSingle:async()=>q.single(),
      then:(resolve:any)=>Promise.resolve({data:(tables[table]??[]).filter(r=>filters.every(f=>f(r))),error:null}).then(resolve)};
    return q;
  }};
  return {entry,tables,rpc,context:{supabase,userId:"owner"}};
}
const call = (fn:unknown,data:unknown,context:unknown):Promise<any> => (fn as (args:any)=>Promise<any>)({data,context});

describe("pagamento canônico da parcela vinculada",()=>{
  it("paga pelo ID anual, atualiza contrato/grade e aparece uma única vez no histórico",async()=>{
    const f=fixture();
    await call(payBillFn,{billId:"bill",paidDate:"2026-11-17",paidCents:10000,note:"Pix",quits:true},f.context);
    expect(f.rpc).toHaveBeenCalledExactlyOnceWith("record_expense_payment",expect.objectContaining({p_bill_id:null,p_contract_id:"contract",p_number:3,p_revision:false,p_is_settled:true}));
    const history=await call(getHistory,{year:2026,creditor:null},f.context);
    expect(history.items).toHaveLength(1);
    expect(history.items[0]).toMatchObject({paidCents:10000,contractId:"contract",installmentNumber:3});
    const contracts=await call(getContracts,{includeArchived:false},f.context);
    expect(contracts[0].kpis).toMatchObject({paid:10000,remaining:0,paidCount:1});
    const annual=await call(getAnnualYear,{year:2026},f.context);
    expect(annual.monthPayments.annual[11]).toMatchObject({paidCents:10000,isSettled:true});
  });
  it("uma correção para valor menor prevalece sobre o espelho antigo e mantém quitação com desconto",async()=>{
    const f=fixture(); Object.assign(f.entry,{paid_date:"2026-11-17",paid_cents:10000,is_settled:true});
    Object.assign(f.tables["finance_bills"]![0],{paid_date:"2026-11-17",paid_cents:10000,is_settled:true});
    await call(reviseBillFn,{billId:"bill",paidDate:"2026-11-17",paidCents:8000,quits:true},f.context);
    expect(f.rpc).toHaveBeenCalledWith("record_expense_payment",expect.objectContaining({p_revision:true,p_paid_cents:8000}));
    const history=await call(getHistory,{year:null,creditor:null},f.context);
    expect(history.items).toHaveLength(1);expect(history.items[0].paidCents).toBe(8000);
    const annual=await call(getAnnualYear,{year:2026},f.context);
    expect(annual.monthPayments.annual[11].paidCents).toBe(8000);
    const contracts=await call(getContracts,{includeArchived:false},f.context);
    expect(contracts[0].kpis).toMatchObject({paid:8000,remaining:0,paidCount:1});
  });
  it("preserva saldo da parcela em um pagamento parcial",async()=>{
    const f=fixture();await call(payBillFn,{billId:"bill",paidDate:"2026-11-17",paidCents:4000,quits:false},f.context);
    const contracts=await call(getContracts,{includeArchived:false},f.context);
    expect(contracts[0].kpis).toMatchObject({paid:4000,remaining:6000,paidCount:0,pct:0});
  });
  it("recusa vínculo ambíguo sem gravar",async()=>{
    const f=fixture();f.tables["installment_entries"]!.push({...f.entry,number:4});
    await expect(call(payBillFn,{billId:"bill",paidDate:"2026-11-17",paidCents:10000,quits:true},f.context)).rejects.toThrow("mais de uma parcela");
    expect(f.rpc).not.toHaveBeenCalled();
  });
  it("impede excluir uma conta cujo pagamento está na parcela",async()=>{
    const f=fixture();Object.assign(f.entry,{paid_date:"2026-11-17",paid_cents:10000,is_settled:true});
    await expect(call(deleteBillFn,{billId:"bill"},f.context)).rejects.toThrow("Conta já paga não pode ser excluída");
  });
  it("não associa despesas independentes só porque têm o mesmo nome",()=>{
    const f=fixture();expect(linkedInstallment({due_date:"2026-11-07"},[f.entry])).toBeNull();
    expect(projectInstallmentPayment({paid_cents:1200},null)).toEqual({paid_cents:1200});
  });
});
