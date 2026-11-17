import { z } from "zod";
import { clampDueDate } from "./money";

const cents = z.number().int().positive().max(999999999999);
const date = z.string().date();
const id = z.string().min(1).max(200);
export const launchSchema = z.object({
  requestId: z.string().uuid(),
  kind: z.enum(["expense", "income", "card_credit", "contract", "invoice_baseline"]),
  title: z.string().trim().min(1).max(200),
  date, totalCents: cents,
  medium: z.enum(["bank", "card", "creditor"]),
  accountId: id.nullable(), destinationAccountId: id.nullable(),
  creditorId: z.string().uuid().nullable(),
  installments: z.number().int().min(1).max(120),
  startingInstallment: z.number().int().min(1).max(120),
  firstDue: date,
  receivedCents: cents.nullable(),
  source: z.string().trim().max(200),
  note: z.string().trim().max(1000),
  alreadySettled: z.boolean(),
  baselineIncludesFirst: z.boolean(),
}).superRefine((v, ctx) => {
  const fail = (path: keyof typeof v, message: string) => ctx.addIssue({code: "custom", path: [path], message});
  if (v.startingInstallment > v.installments) fail("startingInstallment", "A parcela inicial excede o total de parcelas.");
  if (v.totalCents < v.installments) fail("totalCents", "O valor deve permitir ao menos um centavo por parcela.");
  if ((v.medium === "card" || v.medium === "bank") && !v.accountId) fail("accountId", "Selecione a conta ou o cartão.");
  if(v.destinationAccountId && v.kind!=="card_credit")fail("destinationAccountId","Destino separado só se aplica ao crédito do cartão.");
  if(v.creditorId && (v.medium==="card" || !["expense","contract"].includes(v.kind)))fail("creditorId","Este tipo de lançamento usa sua própria origem.");
  if (v.kind === "card_credit") {
    if (v.medium !== "card") fail("medium", "Crédito deve ter um cartão como origem.");
    if (!v.destinationAccountId) fail("destinationAccountId", "Selecione a conta que receberá o dinheiro.");
    if (!v.receivedCents || v.receivedCents > v.totalCents) fail("receivedCents", "O valor recebido deve ser positivo e não exceder o total cobrado.");
    if (v.accountId === v.destinationAccountId) fail("destinationAccountId", "Origem e destino devem ser diferentes.");
  } else if (v.receivedCents !== null) fail("receivedCents", "Valor líquido só se aplica ao crédito do cartão.");
  if (v.kind === "income") {
    if (v.medium !== "bank") fail("medium", "Escolha uma conta de destino para a receita.");
    if (!v.source) fail("source", "Informe a fonte pagadora.");
    if (v.installments !== 1) fail("installments", "Cadastre uma receita por vencimento.");
  }
  if (v.kind === "invoice_baseline" && (v.medium !== "card" || v.installments !== 1 || v.alreadySettled))
    fail("kind", "A fatura inicial deve ter um cartão, uma competência e estar em aberto.");
  if (v.kind === "contract" && v.medium !== "creditor") fail("medium", "Use credor para um contrato parcelado.");
  if (v.medium !== "card" && (v.startingInstallment !== 1 || v.baselineIncludesFirst))
    fail("startingInstallment", "Parcelas já iniciadas só se aplicam ao cartão.");
  if (v.alreadySettled && v.kind !== "card_credit" && (v.medium !== "bank" || v.installments !== 1))
    fail("alreadySettled", "Confirme parcelas individualmente pelo registro de pagamento.");
  if (v.medium === "card" && v.kind !== "card_credit" && v.alreadySettled)
    fail("alreadySettled", "Uma compra no cartão será quitada no pagamento da fatura.");
  if (v.firstDue < v.date && v.kind !== "invoice_baseline") fail("firstDue", "O primeiro vencimento não pode anteceder o lançamento.");
});
export type Launch = z.infer<typeof launchSchema>;
export type LaunchPart = {number: number; period: string; dueDate: string; cents: number; includedInBaseline: boolean};
export function launchPlan(input: Launch): LaunchPart[] {
  const v = launchSchema.parse(input);
  const [year, month, day] = v.firstDue.split("-").map(Number) as [number, number, number];
  const base = Math.floor(v.totalCents / v.installments), remainder = v.totalCents % v.installments;
  return Array.from({length: v.installments - v.startingInstallment + 1}, (_, i) => {
    const number = v.startingInstallment + i;
    const offset = month - 1 + i;
    const dueDate = clampDueDate(year + Math.floor(offset / 12), offset % 12 + 1, day);
    return {number, period: dueDate.slice(0,7), dueDate,
      cents: base + (number <= remainder ? 1 : 0), includedInBaseline: v.baselineIncludesFirst && i === 0};
  });
}
export function suggestedCardDue(purchaseDate: string, closingDay: number, dueDay: number) {
  if (!Number.isInteger(closingDay) || closingDay < 1 || closingDay > 31 || !Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31) return null;
  const [y,m,d] = date.parse(purchaseDate).split("-").map(Number) as [number,number,number];
  const offset = m - 1 + (d >= closingDay ? 1 : 0) + (dueDay <= closingDay ? 1 : 0);
  return clampDueDate(y + Math.floor(offset / 12), offset % 12 + 1, dueDay);
}

export type ReconcileTransaction = {id:string;accountId:string;date:string;amountCents:number;description:string};
export function reconciliationCandidates(launch: {accountId:string;date:string;cents:number;direction:"debit"|"credit"}, transactions: ReconcileTransaction[], usedIds: Set<string>) {
  const day = Date.parse(launch.date);
  return transactions.filter(t => !usedIds.has(t.id) && t.accountId === launch.accountId &&
    t.amountCents === (launch.direction === "debit" ? -launch.cents : launch.cents) &&
    Math.abs(Date.parse(t.date.slice(0,10)) - day) <= 3 * 86400000);
}

export type InvoiceComponent = {key:string;cents:number;includedInBaseline:boolean};
// Provider aggregates cannot be added to manual aggregates: their composition may overlap.
export function reconcileInvoice(input: {baselineCents:number;manual:InvoiceComponent[];providerComponents:InvoiceComponent[];providerClosedCents:number|null;providerForecastCents:number|null}) {
  const unique = new Map<string, InvoiceComponent>();
  for (const c of [...input.manual,...input.providerComponents]) {
    if (!Number.isSafeInteger(c.cents) || c.cents < 0) throw new Error("Valor inválido na composição da fatura.");
    const prior = unique.get(c.key);
    unique.set(c.key,{...c,includedInBaseline:c.includedInBaseline || prior?.includedInBaseline === true});
  }
  if (!Number.isSafeInteger(input.baselineCents) || input.baselineCents < 0) throw new Error("Fatura inicial inválida.");
  for (const n of [input.providerClosedCents,input.providerForecastCents])
    if(n!==null && (!Number.isSafeInteger(n) || n<0))throw new Error("Fatura do provedor inválida.");
  const preview = input.baselineCents + [...unique.values()].filter(c=>!c.includedInBaseline).reduce((n,c)=>n+c.cents,0);
  return {previewCents:preview, amountCents:input.providerClosedCents ?? preview,
    status:input.providerClosedCents !== null ? "closed" as const : "forecast" as const,
    differenceCents:input.providerClosedCents !== null ? input.providerClosedCents-preview : null,
    providerForecastCents:input.providerForecastCents};
}
