import { extractFiscalAccessKey } from "./nfce-xml";

/**
 * Chave de acesso de NF-e / NFC-e: UF (0-1), AAMM (2-5),
 * CNPJ (6-19), modelo (20-21), série (22-24), número (25-33).
 * A identificação é LOCAL; não confirma autorização fiscal ou consulta XML.
 */
export const BRAZIL_UFS: Readonly<Record<string, { uf: string; name: string }>> = {
  "11": { uf: "RO", name: "Rondônia" },
  "12": { uf: "AC", name: "Acre" },
  "13": { uf: "AM", name: "Amazonas" },
  "14": { uf: "RR", name: "Roraima" },
  "15": { uf: "PA", name: "Pará" },
  "16": { uf: "AP", name: "Amapá" },
  "17": { uf: "TO", name: "Tocantins" },
  "21": { uf: "MA", name: "Maranhão" },
  "22": { uf: "PI", name: "Piauí" },
  "23": { uf: "CE", name: "Ceará" },
  "24": { uf: "RN", name: "Rio Grande do Norte" },
  "25": { uf: "PB", name: "Paraíba" },
  "26": { uf: "PE", name: "Pernambuco" },
  "27": { uf: "AL", name: "Alagoas" },
  "28": { uf: "SE", name: "Sergipe" },
  "29": { uf: "BA", name: "Bahia" },
  "31": { uf: "MG", name: "Minas Gerais" },
  "32": { uf: "ES", name: "Espírito Santo" },
  "33": { uf: "RJ", name: "Rio de Janeiro" },
  "35": { uf: "SP", name: "São Paulo" },
  "41": { uf: "PR", name: "Paraná" },
  "42": { uf: "SC", name: "Santa Catarina" },
  "43": { uf: "RS", name: "Rio Grande do Sul" },
  "50": { uf: "MS", name: "Mato Grosso do Sul" },
  "51": { uf: "MT", name: "Mato Grosso" },
  "52": { uf: "GO", name: "Goiás" },
  "53": { uf: "DF", name: "Distrito Federal" },
};

export const NATIONAL_NFE_PORTAL = "https://www.nfe.fazenda.gov.br/portal/consultaRecaptcha.aspx?tipoConsulta=resumo&tipoConteudo=7PhJ%2BgAVw2g%3D";

/**
 * Consultas públicas NFC-e confirmadas em documentação das respectivas SEFAZ.
 * Outros estados continuam identificáveis e o QR Code original é aceito quando
 * aponta para domínio governamental; não inventar endpoints estaduais.
 */
export const VERIFIED_NFCE_PORTALS: Readonly<Record<string, string>> = {
  DF: "https://www.fazenda.df.gov.br/nfce/consulta",
  SP: "https://www.nfce.fazenda.sp.gov.br/NFCeConsultaPublica",
  MG: "https://portalsped.fazenda.mg.gov.br/portalnfce/",
  RJ: "https://www.fazenda.rj.gov.br/nfce/consulta",
};

export type FiscalConsultation = {
  accessKey: string;
  model: "55" | "65";
  documentLabel: "NF-e" | "NFC-e";
  uf: string;
  stateName: string;
  issuerCnpj: string;
  documentNumber: string;
  series: string;
  /**
   * Portal para consulta HUMANA; não é download automático nem API de XML.
   * null = ainda não há um destino oficial validado para a UF informada.
   */
  consultationUrl: string | null;
  route: "nacional" | "qr-oficial" | "estadual" | "sem-portal-validado";
};

/** Somente usar o próprio QR escaneado, se estiver em HTTPS e domínio .gov.br. */
export function safeOfficialFiscalQrUrl(raw: string, key: string): string | null {
  try {
    const url = new URL(raw.trim());
    if (url.username || url.password || url.port) return null;
    const host = url.hostname.toLowerCase();
    // DANFEs do DF ainda imprimem URLs HTTP; somente este domínio/caminho
    // oficial pode ser atualizado para HTTPS, preservando os parâmetros do QR.
    if (url.protocol === "http:" && (host === "fazenda.df.gov.br" || host === "www.fazenda.df.gov.br") && /^\/nfce\/qrcode\/?$/i.test(url.pathname)) {
      url.protocol = "https:";
    }
    if (url.protocol !== "https:" || !host.endsWith(".gov.br")) return null;
    if (!/qrcode|qr-code|consulta/i.test(url.pathname)) return null;
    if (extractFiscalAccessKey(raw) !== key) return null;
    url.hash = "";
    return url.toString();
  } catch { return null; }
}

export function routeFiscalAccess(raw: string): FiscalConsultation | null {
  const accessKey = extractFiscalAccessKey(raw);
  if (!accessKey) return null;
  const state = BRAZIL_UFS[accessKey.slice(0, 2)];
  if (!state) return null;
  const model = accessKey.slice(20, 22) as "55" | "65";
  const common = {
    accessKey,
    model,
    documentLabel: model === "55" ? "NF-e" as const : "NFC-e" as const,
    uf: state.uf,
    stateName: state.name,
    issuerCnpj: accessKey.slice(6, 20),
    series: String(Number(accessKey.slice(22, 25))),
    documentNumber: String(Number(accessKey.slice(25, 34))),
  };
  if (model === "55") {
    return { ...common, consultationUrl: NATIONAL_NFE_PORTAL, route: "nacional" };
  }
  const qr = safeOfficialFiscalQrUrl(raw, accessKey);
  if (qr) return { ...common, consultationUrl: qr, route: "qr-oficial" };
  const portal = VERIFIED_NFCE_PORTALS[state.uf];
  return {
    ...common,
    consultationUrl: portal ?? null,
    route: portal ? "estadual" : "sem-portal-validado",
  };
}
