import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFleetHandlers } from '../integration/fleet.server';
import { Response } from '../integration/server-runtime';
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
async function request(path:string,body:Record<string,unknown>) {
 const app = await createFleetHandlers();
 const response = new Response();
 await app.handlers.get(path)!({body},response);
 return response;
}
describe('Serviços de frota adaptados ao Jarvas',()=>{
 it('rejeita fotos ausentes sem chamar IA',async()=>{
  const network = vi.fn();vi.stubGlobal('fetch',network);
  expect((await request('/api/fleet/parse-receipt',{})).code).toBe(400);
  expect((await request('/api/fleet/parse-document',{})).code).toBe(400);
  expect(network).not.toHaveBeenCalled();
 });
 it('extrai recibo pelo gateway com chave apenas no servidor',async()=>{
  vi.stubEnv('LOVABLE_API_KEY','test-only');
  const network = vi.fn(async(_url:string,_init?:RequestInit)=>new globalThis.Response(JSON.stringify({choices:[{message:{content:JSON.stringify({totalCost:123.45,date:'17/11/2026',supplierName:'Posto',confidence:'ALTA'})}}]}),{status:200}));
  vi.stubGlobal('fetch',network);
  const response = await request('/api/fleet/parse-receipt',{imageBase64:'YWJj',mimeType:'image/jpeg',kind:'ABASTECIMENTO'});
  expect(response.code).toBe(200);
  expect(response.body).toMatchObject({totalCost:123.45,date:'2026-11-17',supplierName:'Posto'});
  expect(network.mock.calls[0]?.[0]).toBe('https://ai.gateway.lovable.dev/v1/chat/completions');
 });
 it('não inventa dados que o OCR não encontrou',async()=>{
  vi.stubEnv('LOVABLE_API_KEY','test-only');
  vi.stubGlobal('fetch',vi.fn(async()=>new globalThis.Response(JSON.stringify({choices:[{message:{content:'{}'}}]}),{status:200})));
  const response = await request('/api/fleet/parse-document',{imageBase64:'YWJj',mimeType:'image/png',docKind:'CNH'});
  expect(response.body).toMatchObject({cnhNumber:null,cnhExpiry:null,amount:null,date:null});
 });
});
