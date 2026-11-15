// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { BRAZIL_UFS, NATIONAL_NFE_PORTAL, routeFiscalAccess, safeOfficialFiscalQrUrl } from "./fiscal-routing";

function makeKey(uf: string, model: "55" | "65"): string {
  // cUF AAMM CNPJ modelo série número tpEmis código numérico
  const prefix = uf + "2611" + "27427009000130" + model + "001" + "000031958" + "1" + "12345678";
  if(prefix.length!==43)throw new Error("Prefixo inválido: "+prefix.length);
  let weight=2,sum=0;
  for(let i=42;i>=0;i--){sum+=Number(prefix[i])*weight;weight=weight===9?2:weight+1;}
  const d=11-sum%11;
  return prefix+String(d>=10?0:d);
}

describe("roteamento de documentos fiscais - Brasil", () => {
  it("reconhece os 27 estados/DF pela chave",()=>{
    expect(Object.keys(BRAZIL_UFS)).toHaveLength(27);
    for(const ufCode of Object.keys(BRAZIL_UFS)){
      const info=routeFiscalAccess(makeKey(ufCode,"65"));
      expect(info?.uf).toBe(BRAZIL_UFS[ufCode]?.uf);
      expect(info?.documentLabel).toBe("NFC-e");
      expect(info?.documentNumber).toBe("31958");
    }
  });
  it("envia modelo 55 para o portal nacional independentemente da UF",()=>{
    for(const uf of ["53","35","31","33","41"]){
      const key=makeKey(uf,"55");
      expect(routeFiscalAccess(key)).toMatchObject({route:"nacional",consultationUrl:NATIONAL_NFE_PORTAL,documentLabel:"NF-e"});
    }
  });
  it("direciona modelo 65 aos portais estaduais documentados",()=>{
    expect(routeFiscalAccess(makeKey("53","65"))).toMatchObject({uf:"DF",route:"estadual",consultationUrl:"https://www.fazenda.df.gov.br/nfce/consulta"});
    expect(routeFiscalAccess(makeKey("35","65"))).toMatchObject({uf:"SP",route:"estadual"});
    expect(routeFiscalAccess(makeKey("31","65"))).toMatchObject({uf:"MG",route:"estadual"});
    expect(routeFiscalAccess(makeKey("33","65"))).toMatchObject({uf:"RJ",route:"estadual"});
  });
  it("aceita QR impresso HTTP do DF apenas atualizando endereço oficial para HTTPS",()=>{
    const key=makeKey("53","65");
    const raw="http://www.fazenda.df.gov.br/nfce/qrcode?p="+key+"%7C2%7C1";
    const result=routeFiscalAccess(raw);
    expect(result).toMatchObject({uf:"DF",model:"65",route:"qr-oficial"});
    expect(result?.consultationUrl).toBe("https://www.fazenda.df.gov.br/nfce/qrcode?p="+key+"%7C2%7C1");
    expect(routeFiscalAccess("http://consulta.sefaz.ro.gov.br/nfce/qrcode?p="+makeKey("11","65")+"%7C2%7C1")?.route).toBe("sem-portal-validado");
  });
  it("sem URL confiável, identifica a UF mas não inventa portal",()=>{
    expect(routeFiscalAccess(makeKey("11","65"))).toMatchObject({uf:"RO",consultationUrl:null,route:"sem-portal-validado"});
  });
  it("reutiliza URL governamental do QR somente se HTTPS, chave e caminho combinarem",()=>{
    const key=makeKey("11","65");
    const url="https://consulta.sefaz.ro.gov.br/nfce/qrcode?p="+key+"%7C3%7C1";
    expect(safeOfficialFiscalQrUrl(url,key)).toBe(url);
    expect(routeFiscalAccess(url)).toMatchObject({uf:"RO",route:"qr-oficial",consultationUrl:url});
    expect(safeOfficialFiscalQrUrl("https://notafalsa.example/nfce/qrcode?p="+key,key)).toBeNull();
    expect(safeOfficialFiscalQrUrl("http://consulta.sefaz.ro.gov.br/nfce/qrcode?p="+key,key)).toBeNull();
    expect(safeOfficialFiscalQrUrl("https://consulta.sefaz.ro.gov.br/nfce/qrcode?p="+makeKey("53","65"),key)).toBeNull();
  });
  it("recusa chave com dígito verificador inválido, modelo não fiscal ou UF não reconhecida",()=>{
    const key=makeKey("53","65");
    expect(routeFiscalAccess(key.slice(0,43)+(key[43]==="0"?"1":"0"))).toBeNull();
    expect(routeFiscalAccess(makeKey("53","65").replace(/^53/,"99"))).toBeNull();
    expect(routeFiscalAccess("7891000123456")).toBeNull();
  });
});
