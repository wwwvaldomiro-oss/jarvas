import { fleetRequest } from './fleet-request';
export type ReceiptEntryKind = 'ABASTECIMENTO' | 'MANUTENCAO';

export interface ParsedReceiptResult {
  totalCost: number | null;
  date: string | null;
  supplierName: string | null;
  invoiceNumber: string | null;
  quantity: number | null;
  unitPrice: number | null;
  partsCost: number | null;
  laborCost: number | null;
  serviceSummary: string | null;
  confidence: 'ALTA' | 'MEDIA' | 'BAIXA';
  previewDataUrl: string;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Não foi possível ler o arquivo de imagem.'));
      }
    };
    reader.onerror = () => reject(new Error('Erro ao carregar a imagem selecionada.'));
    reader.readAsDataURL(file);
  });
}

async function prepareImageForUpload(
  file: File
): Promise<{ dataUrl: string; mimeType: string }> {
  const originalDataUrl = await readFileAsDataUrl(file);
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
      const compressed = canvas.toDataURL('image/jpeg', 0.86);
      resolve({ dataUrl: compressed, mimeType: 'image/jpeg' });
    };
    img.onerror = () => {
      resolve({ dataUrl: originalDataUrl, mimeType: file.type || 'image/jpeg' });
    };
    img.src = originalDataUrl;
  });
}

export async function parseReceiptImageWithGemini(
  file: File,
  kind: ReceiptEntryKind,
  endpoint = '/api/fleet/parse-receipt'
): Promise<ParsedReceiptResult> {
  const { dataUrl, mimeType } = await prepareImageForUpload(file);

  const response = await fleetRequest(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      imageBase64: dataUrl,
      mimeType,
      kind,
    }),
  });

  const payload = (await response.json().catch(() => ({}))) as Partial<ParsedReceiptResult> & {
    error?: string | undefined;
  };

  if (!response.ok) {
    throw new Error(
      payload.error ?? 'Não foi possível extrair os dados desta foto de nota fiscal.'
    );
  }

  return {
    totalCost: typeof payload.totalCost === 'number' ? payload.totalCost : null,
    date: typeof payload.date === 'string' ? payload.date : null,
    supplierName: payload.supplierName ?? null,
    invoiceNumber: payload.invoiceNumber ?? null,
    quantity: typeof payload.quantity === 'number' ? payload.quantity : null,
    unitPrice: typeof payload.unitPrice === 'number' ? payload.unitPrice : null,
    partsCost: typeof payload.partsCost === 'number' ? payload.partsCost : null,
    laborCost: typeof payload.laborCost === 'number' ? payload.laborCost : null,
    serviceSummary: payload.serviceSummary ?? null,
    confidence: payload.confidence ?? 'MEDIA',
    previewDataUrl: dataUrl,
  };
}
