import { fleetRequest } from './fleet-request';
import { parseReceiptImageWithGemini } from './receipt-ocr.service';

export type GeminiDocumentKind = 'MULTA' | 'CNH' | 'CRLV' | 'SEGURO';

export interface ParsedDocumentResult {
  plate: string | null;
  infractionCode: string | null;
  description: string | null;
  date: string | null;
  time: string | null;
  location: string | null;
  points: number | null;
  amount: number | null;
  sneAmount: number | null;
  driverIndicationDeadline: string | null;
  driverName: string | null;
  cnhNumber: string | null;
  cnhCategory: string | null;
  cnhExpiry: string | null;
  renavam: string | null;
  chassis: string | null;
  stateUf: string | null;
  exerciseYear: number | null;
  dueDate: string | null;
  providerOrAuthority: string | null;
  policyOrCode: string | null;
  confidence: 'ALTA' | 'MEDIA' | 'BAIXA';
  previewDataUrl: string;
}

export interface PlateConsultationResponse {
  plate: string;
  stateUf: string;
  brasilApiReachable: boolean;
  fipeReferenceMonth: string | null;
  fipeBrandCount: number | null;
  fipePriceRecord: {
    valor?: string | undefined;
    marca?: string | undefined;
    modelo?: string | undefined;
    anoModelo?: number | undefined;
  } | null;
  detranProviderConnected: boolean;
  externalDebits: unknown[] | null;
  brasilApiNotice: string;
}

function readImageAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Falha ao carregar imagem selecionada.'));
      }
    };
    reader.onerror = () => reject(new Error('Erro na leitura do arquivo de imagem.'));
    reader.readAsDataURL(file);
  });
}

async function compressDocumentImage(file: File): Promise<{ dataUrl: string; mimeType: string }> {
  const originalDataUrl = await readImageAsDataUrl(file);
  const maxDimension = 1600;

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const { width, height } = img;
      if (width <= maxDimension && height <= maxDimension && file.size <= 2_000_000) {
        resolve({ dataUrl: originalDataUrl, mimeType: file.type || 'image/jpeg' });
        return;
      }
      const scale = Math.min(1, maxDimension / Math.max(width, height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve({ dataUrl: originalDataUrl, mimeType: file.type || 'image/jpeg' });
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve({ dataUrl: canvas.toDataURL('image/jpeg', 0.86), mimeType: 'image/jpeg' });
    };
    img.onerror = () => resolve({ dataUrl: originalDataUrl, mimeType: file.type || 'image/jpeg' });
    img.src = originalDataUrl;
  });
}

export async function parseDocumentImageWithGemini(
  file: File,
  docKind: GeminiDocumentKind,
  endpoint = '/api/fleet/parse-document'
): Promise<ParsedDocumentResult> {
  const { dataUrl, mimeType } = await compressDocumentImage(file);

  const response = await fleetRequest(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      imageBase64: dataUrl,
      mimeType,
      docKind,
    }),
  });

  const payload = (await response.json().catch(() => ({}))) as Partial<ParsedDocumentResult> & {
    error?: string | undefined;
  };

  if (!response.ok) {
    throw new Error(
      payload.error ?? 'Não foi possível analisar a foto do documento via Gemini.'
    );
  }

  return {
    plate: payload.plate ?? null,
    infractionCode: payload.infractionCode ?? null,
    description: payload.description ?? null,
    date: payload.date ?? null,
    time: payload.time ?? null,
    location: payload.location ?? null,
    points: typeof payload.points === 'number' ? payload.points : null,
    amount: typeof payload.amount === 'number' ? payload.amount : null,
    sneAmount: typeof payload.sneAmount === 'number' ? payload.sneAmount : null,
    driverIndicationDeadline: payload.driverIndicationDeadline ?? null,
    driverName: payload.driverName ?? null,
    cnhNumber: payload.cnhNumber ?? null,
    cnhCategory: payload.cnhCategory ?? null,
    cnhExpiry: payload.cnhExpiry ?? null,
    renavam: payload.renavam ?? null,
    chassis: payload.chassis ?? null,
    stateUf: payload.stateUf ?? null,
    exerciseYear: typeof payload.exerciseYear === 'number' ? payload.exerciseYear : null,
    dueDate: payload.dueDate ?? null,
    providerOrAuthority: payload.providerOrAuthority ?? null,
    policyOrCode: payload.policyOrCode ?? null,
    confidence: payload.confidence ?? 'MEDIA',
    previewDataUrl: dataUrl,
  };
}

export async function consultPlateCompliance(
  plate: string,
  stateUf = 'SP',
  fipeCode?: string,
  endpoint = '/api/fleet/plate-consultation'
): Promise<PlateConsultationResponse> {
  const response = await fleetRequest(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ plate, stateUf, fipeCode }),
  });

  const payload = (await response.json().catch(() => ({}))) as Partial<PlateConsultationResponse> & {
    error?: string | undefined;
  };

  if (!response.ok) {
    throw new Error(payload.error ?? 'Falha ao consultar placa no servidor.');
  }

  return payload as PlateConsultationResponse;
}

export { parseReceiptImageWithGemini };
