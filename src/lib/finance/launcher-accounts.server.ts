import {supabaseAdmin} from "@/integrations/supabase/client.server";
import {authorizedMovementAccount} from "@/lib/pluggy.functions";
export async function cacheVerifiedAccountDetails(userId:string,account:{id:string;name:string;type:"BANK"|"CREDIT"}){
 const {error}=await (supabaseAdmin as any).from("finance_launcher_accounts").upsert({user_id:userId,account_id:account.id,name:account.name.slice(0,300),account_type:account.type,verified_at:new Date().toISOString()},{onConflict:"user_id,account_id"});
 if(error)throw new Error("Não foi possível verificar a conta para o lançamento: "+error.message);
}
export async function verifyAndCacheAccount(userId:string,accountId:string){
 const account=await authorizedMovementAccount(userId,accountId);await cacheVerifiedAccountDetails(userId,account);return account;
}
export async function cacheProviderEvidence(userId:string,accountId:string,transactionId:string,from:string){
 const {authorizedBankMovementEvidence}=await import("@/lib/pluggy.functions");
 const evidence=await authorizedBankMovementEvidence(userId,accountId,transactionId,from);
 const {error}=await (supabaseAdmin as any).from("finance_launch_provider_evidence").upsert({user_id:userId,...evidence,verified_at:new Date().toISOString()},{onConflict:"user_id,transaction_id"});
 if(error)throw new Error(error.message);
}
