import { fleetRequestServer } from '../integration/fleet.functions';
export async function fleetRequest(endpoint:string,options:{body:string;method:string;headers:Record<string,string>}) {
  const result = await fleetRequestServer({data:{endpoint:endpoint as '/api/fleet/parse-receipt'|'/api/fleet/parse-document'|'/api/fleet/plate-consultation',body:options.body}});
  return new Response(result.body,{status:result.status,headers:{'Content-Type':'application/json'}});
}
