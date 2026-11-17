import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
export const fleetRequestServer = createServerFn({method:'POST'}).middleware([requireSupabaseAuth])
  .inputValidator((value:unknown)=>z.object({endpoint:z.enum(['/api/fleet/parse-receipt','/api/fleet/parse-document','/api/fleet/plate-consultation']),body:z.string().max(8_000_000)}).parse(value))
  .handler(async ({data})=>{
    const {createFleetHandlers} = await import('./fleet.server');
    const {Response} = await import('./server-runtime');
    const body: unknown = JSON.parse(data.body);
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Requisição inválida.');
    const app = await createFleetHandlers();
    const handler = app.handlers.get(data.endpoint);
    if (!handler) throw new Error('Serviço indisponível.');
    const response = new Response();
    await handler({body:body as Record<string,unknown>},response);
    return {status:response.code,body:JSON.stringify(response.body)};
  });
