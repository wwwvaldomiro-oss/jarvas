import { describe, it, expect } from "vitest";
import { launchSchema, launchPlan, reconcileInvoice, reconciliationCandidates, suggestedCardDue, type Launch } from "@/lib/finance/launcher";
const base:Launch={requestId:"c46061e2-e4e3-48d0-8760-d55157c2d37b",kind:"expense",title:"Celular",date:"2026-11-17",firstDue:"2026-12-10",totalCents:100000,medium:"card",accountId:"caixa",destinationAccountId:null,creditorId:null,installments:10,startingInstallment:1,receivedCents:null,source:"",note:"",alreadySettled:false,baselineIncludesFirst:false};
describe("prévia do lançador",()=>{
 it("distribui R$1.000 em dez parcelas exatas sem perda na virada de ano",()=>{
   const plan=launchPlan(base);expect(plan).toHaveLength(10);expect(plan[0]).toMatchObject({period:"2026-12",cents:10000});expect(plan[9]).toMatchObject({period:"2027-09",cents:10000});expect(plan.reduce((s,p)=>s+p.cents,0)).toBe(100000);
 });
 it("separa R$1.000 recebidos de R$1.200 de dívida em 12 vezes",()=>{
   const credit={...base,kind:"card_credit" as const,totalCents:120000,receivedCents:100000,destinationAccountId:"bank",installments:12};
   expect(launchSchema.parse(credit).totalCents-credit.receivedCents).toBe(20000);expect(launchPlan(credit).every(p=>p.cents===10000)).toBe(true);
 });
 it("acompanha somente parcelas restantes e mantém centavos e dia do vencimento",()=>{
   const plan=launchPlan({...base,totalCents:100001,installments:3,startingInstallment:2,firstDue:"2027-01-31",baselineIncludesFirst:true});
   expect(plan.map(p=>p.cents)).toEqual([33334,33333]);expect(plan[0]?.includedInBaseline).toBe(true);expect(plan[1]).toMatchObject({dueDate:"2027-02-28",includedInBaseline:false});
 });
 it("não aceita destino ausente, principal maior que a dívida ou compra marcada como paga",()=>{
   expect(launchSchema.safeParse({...base,kind:"card_credit",receivedCents:120000}).success).toBe(false);
   expect(launchSchema.safeParse({...base,alreadySettled:true}).success).toBe(false);
   expect(launchSchema.safeParse({...base,medium:"creditor",alreadySettled:true}).success).toBe(false);
 });
 it("sugere vencimento após fechamento e atravessa dezembro",()=>{
   expect(suggestedCardDue("2026-12-26",25,5)).toBe("2027-02-05");expect(suggestedCardDue("2026-11-17",25,5)).toBe("2026-12-05");
 });
});
describe("faturas sem duplicidade",()=>{
 const input={baselineCents:50000,manual:[{key:"purchase1",cents:10000,includedInBaseline:true},{key:"purchase2",cents:20000,includedInBaseline:false}],providerComponents:[{key:"purchase2",cents:20000,includedInBaseline:false}],providerClosedCents:null,providerForecastCents:70000};
 it("preserva a base manual e conta uma compra conciliada uma vez",()=>expect(reconcileInvoice(input)).toMatchObject({previewCents:70000,amountCents:70000,status:"forecast"}));
 it("não soma um total agregado do provedor à previsão manual",()=>expect(reconcileInvoice({...input,providerForecastCents:80000}).amountCents).toBe(70000));
 it("fatura fechada oficial prevalece e registra diferença, inclusive zero",()=>{
   expect(reconcileInvoice({...input,providerClosedCents:71500})).toMatchObject({amountCents:71500,differenceCents:1500,status:"closed"});
   expect(reconcileInvoice({...input,providerClosedCents:0}).amountCents).toBe(0);
 });
 it("recusa valores negativos e não reutiliza uma conciliação já ocupada",()=>{
   expect(()=>reconcileInvoice({...input,baselineCents:-1})).toThrow();
   const txs=[{id:"one",accountId:"bank",date:"2026-11-17",amountCents:-10000,description:"Compra"},{id:"two",accountId:"other",date:"2026-11-17",amountCents:-10000,description:"Compra"},{id:"three",accountId:"bank",date:"2026-11-17",amountCents:10000,description:"Estorno"}];
   expect(reconciliationCandidates({accountId:"bank",date:"2026-11-17",cents:10000,direction:"debit"},txs,new Set(["one"]))).toHaveLength(0);
 });
});
