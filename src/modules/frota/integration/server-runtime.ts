/** Bridge the imported handlers to TanStack Start and the server-only AI gateway. */
export type Request = {body: Record<string, unknown>};
export class Response {
  code = 200;
  body: unknown = null;
  status(code:number) {this.code = code;return this;}
  json(body:unknown) {this.body = body;return this;}
}
export class FleetHandlers {
  handlers = new Map<string,(req:Request,res:Response)=>Promise<void>>();
  post(path:string,handler:(req:Request,res:Response)=>Promise<void>) {this.handlers.set(path,handler);}
}
export const Type = {OBJECT:'object',STRING:'string',NUMBER:'number',INTEGER:'integer'} as const;
type ContentPart = {text?:string;inlineData?:{mimeType:string;data:string}};
type GenerateRequest = {model:string;contents:{parts:ContentPart[]};config:{systemInstruction:string;responseMimeType:string;responseSchema:unknown}};
export class GoogleGenAI {
  models = {generateContent: async (request:GenerateRequest) => {
    const key = process.env['LOVABLE_API_KEY'];
    if (!key) throw new Error('GEMINI_API_KEY_MISSING');
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method:'POST',signal:AbortSignal.timeout(45000),
      headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},
      body:JSON.stringify({
        model:process.env['FLEET_OCR_MODEL'] || 'google/gemini-2.5-flash',
        messages:[{role:'system',content:request.config.systemInstruction+' Retorne apenas JSON conforme este esquema: '+JSON.stringify(request.config.responseSchema)},
          {role:'user',content:request.contents.parts.map(part=>part.inlineData ? {type:'image_url',image_url:{url:`data:${part.inlineData.mimeType};base64,${part.inlineData.data}`}} : {type:'text',text:part.text})}],
        response_format:{type:'json_object'},max_tokens:1800,
      }),
    });
    if (!response.ok) throw new Error(String(response.status));
    const payload = await response.json() as {choices?:{message?:{content?:string}}[]};
    return {text:payload.choices?.[0]?.message?.content ?? '{}'};
  }};
}
