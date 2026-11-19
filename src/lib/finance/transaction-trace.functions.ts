import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const selector = z.union([
  z.object({ launchId: z.string().uuid() }),
  z.object({ annualId: z.string().uuid(), period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/) }),
]);
export type TraceSelector = z.infer<typeof selector>;
const optionalText = z.string().nullable();
const amount = z.number().int().nullable();
const trace = z.object({
  event: z.object({
    title: z.string(), date: z.string(), kind: z.string(), status: z.string(), settlement: z.boolean(),
    medium: optionalText, direction: optionalText, instrument: optionalText, destination: optionalText,
    payer: optionalText, merchant: optionalText, note: optionalText, total: z.number(), net: amount,
    cash: amount, cash_date: z.string(), cash_account: optionalText,
  }).nullable(),
  obligations: z.array(z.object({
    creditor: z.string(), period: z.string(), expected: amount, closed_total: amount,
    items: z.array(z.object({ title:z.string(), date:optionalText, merchant:optionalText, instrument:optionalText,
      number:z.number(), count:amount, cents:z.number(), included:z.boolean() })).nullable(),
    payments:z.array(z.object({date:z.string(), cents:amount, settled:z.boolean().nullable(), account:optionalText})).nullable(),
  })),
});
export const getTransactionTrace = createServerFn({method:"GET"}).middleware([requireSupabaseAuth])
  .inputValidator((input:unknown)=>selector.parse(input))
  .handler(async ({data,context})=>{
    const args = "launchId" in data ? {p_launch_id:data.launchId} : {p_annual_id:data.annualId,p_period:data.period};
    const result = await (context.supabase as any).rpc("finance_transaction_trace",args);
    if(result.error) throw new Error("Não foi possível consultar o histórico desta operação.");
    return trace.parse(result.data);
  });
