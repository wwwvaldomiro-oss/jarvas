import { FleetHandlers, GoogleGenAI, Type, type Request, type Response } from './server-runtime';
function getGeminiClient() { return new GoogleGenAI(); }
function normalizeIsoDate(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const brMatch = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (brMatch) {
    return `${brMatch[3]}-${brMatch[2]}-${brMatch[1]}`;
  }
  return null;
}

function parsePositiveNumber(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
    return Number(raw.toFixed(3));
  }
  if (typeof raw === 'string') {
    const cleaned = raw.replace(/[^\d,.-]/g, '').replace(',', '.');
    const num = Number(cleaned);
    if (Number.isFinite(num) && num > 0) {
      return Number(num.toFixed(3));
    }
  }
  return null;
}

async function generateWithRetry<T>(fn: () => Promise<T>, maxRetries = 2): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const msg = error instanceof Error ? error.message : String(error);
      const isTransient =
        msg.includes('503') ||
        msg.includes('500') ||
        msg.includes('UNAVAILABLE') ||
        msg.includes('DEADLINE_EXCEEDED');
      if (!isTransient || attempt === maxRetries) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 600 * (attempt + 1)));
    }
  }
  throw lastError;
}

export async function createFleetHandlers() {
  const app = new FleetHandlers();

  app.post('/api/fleet/parse-receipt', async (req: Request, res: Response) => {
    try {
      const { imageBase64, mimeType, kind } = (req.body ?? {}) as {
        imageBase64?: string;
        mimeType?: string;
        kind?: 'ABASTECIMENTO' | 'MANUTENCAO';
      };

      if (!imageBase64 || typeof imageBase64 !== 'string') {
        res.status(400).json({ error: 'Imagem da nota fiscal não enviada.' });
        return;
      }

      const cleanBase64 = imageBase64.includes(',')
        ? imageBase64.split(',').pop() ?? ''
        : imageBase64;
      const safeMimeType =
        typeof mimeType === 'string' && mimeType.startsWith('image/')
          ? mimeType
          : 'image/jpeg';
      const entryKind = kind === 'MANUTENCAO' ? 'MANUTENCAO' : 'ABASTECIMENTO';

      const ai = getGeminiClient();

      const prompt =
        entryKind === 'ABASTECIMENTO'
          ? 'Analise a foto deste cupom fiscal, NFC-e ou nota fiscal de abastecimento de veículo no Brasil. Extraia principalmente o valor total pago (totalCost em reais) e a data da emissão/abastecimento (date em YYYY-MM-DD). Se visíveis com clareza, extraia também o nome do posto (supplierName), chave ou número da nota (invoiceNumber), volume abastecido (quantity) e preço por litro/unidade (unitPrice). Se algum campo não estiver legível na imagem, retorne null.'
          : 'Analise a foto desta nota fiscal, NFS-e, NFC-e ou ordem de serviço de manutenção automotiva no Brasil. Extraia principalmente o valor total da nota/serviço (totalCost em reais) e a data de emissão/serviço (date em YYYY-MM-DD). Se visíveis com clareza, extraia também o nome da oficina/fornecedor (supplierName), número ou chave da NF (invoiceNumber), valor de peças (partsCost), valor de mão de obra (laborCost) e resumo curto do serviço (serviceSummary). Se algum campo não estiver legível na imagem, retorne null.';

      const response = await generateWithRetry(() =>
        ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: {
            parts: [
              {
                inlineData: {
                  mimeType: safeMimeType,
                  data: cleanBase64,
                },
              },
              { text: prompt },
            ],
          },
          config: {
            systemInstruction:
              'Você é um extrator preciso de dados de notas fiscais e cupons brasileiros (NFC-e, NF-e, NFS-e, SAT, recibos de posto e oficina). Nunca invente valores ou datas que não estejam visíveis na imagem. Converta datas brasileiras DD/MM/AAAA para YYYY-MM-DD e valores monetários para números decimais com ponto.',
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                totalCost: {
                  type: Type.NUMBER,
                  nullable: true,
                  description: 'Valor total pago na nota fiscal em reais (BRL).',
                },
                date: {
                  type: Type.STRING,
                  nullable: true,
                  description: 'Data de emissão ou operação no formato ISO YYYY-MM-DD.',
                },
                supplierName: {
                  type: Type.STRING,
                  nullable: true,
                  description: 'Nome do posto de combustível, oficina ou fornecedor.',
                },
                invoiceNumber: {
                  type: Type.STRING,
                  nullable: true,
                  description: 'Número da nota fiscal ou chave de acesso de 44 dígitos.',
                },
                quantity: {
                  type: Type.NUMBER,
                  nullable: true,
                  description: 'Quantidade abastecida (litros, kWh ou m3) quando aplicável.',
                },
                unitPrice: {
                  type: Type.NUMBER,
                  nullable: true,
                  description: 'Preço unitário por litro/kWh quando aplicável.',
                },
                partsCost: {
                  type: Type.NUMBER,
                  nullable: true,
                  description: 'Valor total de peças na manutenção quando discriminado.',
                },
                laborCost: {
                  type: Type.NUMBER,
                  nullable: true,
                  description: 'Valor total de mão de obra na manutenção quando discriminado.',
                },
                serviceSummary: {
                  type: Type.STRING,
                  nullable: true,
                  description: 'Descrição curta do serviço realizado ou produto principal.',
                },
                confidence: {
                  type: Type.STRING,
                  description: 'Nível de confiança da leitura: ALTA, MEDIA ou BAIXA.',
                },
              },
            },
          },
        })
      );

      const rawText = (response.text ?? '{}').trim();
      const parsed = JSON.parse(rawText) as Record<string, unknown>;

      const totalCost = parsePositiveNumber(parsed['totalCost']);
      const date = normalizeIsoDate(parsed['date']);

      res.json({
        totalCost: totalCost !== null ? Number(totalCost.toFixed(2)) : null,
        date,
        supplierName:
          typeof parsed['supplierName'] === 'string' && parsed['supplierName'].trim()
            ? parsed['supplierName'].trim()
            : null,
        invoiceNumber:
          typeof parsed['invoiceNumber'] === 'string' && parsed['invoiceNumber'].trim()
            ? parsed['invoiceNumber'].trim()
            : null,
        quantity: parsePositiveNumber(parsed['quantity']),
        unitPrice: parsePositiveNumber(parsed['unitPrice']),
        partsCost: parsePositiveNumber(parsed['partsCost']),
        laborCost: parsePositiveNumber(parsed['laborCost']),
        serviceSummary:
          typeof parsed['serviceSummary'] === 'string' && parsed['serviceSummary'].trim()
            ? parsed['serviceSummary'].trim()
            : null,
        confidence:
          parsed['confidence'] === 'ALTA' ||
          parsed['confidence'] === 'MEDIA' ||
          parsed['confidence'] === 'BAIXA'
            ? parsed['confidence']
            : 'MEDIA',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      if (message === 'GEMINI_API_KEY_MISSING') {
        res.status(500).json({
          error:
            'Leitura de imagens indisponível: configure o serviço de IA no servidor.',
        });
        return;
      }
      if (message.includes('PERMISSION_DENIED') || message.includes('API_KEY_INVALID') || message.includes('403') || message.includes('400')) {
        res.status(400).json({
          error:
            'Não foi possível autenticar com a API do Gemini. Verifique a configuração de IA do servidor.',
        });
        return;
      }
      if (message.includes('RESOURCE_EXHAUSTED') || message.includes('429')) {
        res.status(429).json({
          error:
            'Limite temporário de requisições da API do Gemini atingido. Tente novamente em instantes.',
        });
        return;
      }

      console.error('Erro ao analisar foto de nota fiscal via Gemini:', error);
      res.status(500).json({
        error: 'Falha ao ler a foto da nota fiscal. Tente uma imagem mais nítida.',
      });
    }
  });

  app.post('/api/fleet/parse-document', async (req: Request, res: Response) => {
    try {
      const { imageBase64, mimeType, docKind } = (req.body ?? {}) as {
        imageBase64?: string;
        mimeType?: string;
        docKind?: 'MULTA' | 'CNH' | 'CRLV' | 'SEGURO';
      };

      if (!imageBase64 || typeof imageBase64 !== 'string') {
        res.status(400).json({ error: 'Imagem do documento não enviada.' });
        return;
      }

      const cleanBase64 = imageBase64.includes(',')
        ? imageBase64.split(',').pop() ?? ''
        : imageBase64;
      const safeMimeType =
        typeof mimeType === 'string' && mimeType.startsWith('image/')
          ? mimeType
          : 'image/jpeg';
      const targetKind = docKind ?? 'MULTA';

      const ai = getGeminiClient();

      const promptByKind: Record<'MULTA' | 'CNH' | 'CRLV' | 'SEGURO', string> = {
        MULTA:
          'Analise a foto desta Notificação de Autuação / Penalidade de trânsito brasileira. Extraia placa (plate), código da infração CTB (infractionCode), descrição (description), data da infração YYYY-MM-DD (date), hora HH:mm (time), local (location), pontos (points), valor nominal em reais (amount), valor SNE com 40% se exibido (sneAmount), e data limite para indicação de condutor FICI YYYY-MM-DD (driverIndicationDeadline).',
        CNH:
          'Analise a foto desta CNH (Carteira Nacional de Habilitação) brasileira. Extraia nome completo (driverName), número de registro CNH (cnhNumber), categoria (cnhCategory, ex: AB, B, D) e data de validade YYYY-MM-DD (cnhExpiry).',
        CRLV:
          'Analise a foto deste CRLV-e / documento veicular brasileiro. Extraia placa (plate), RENAVAM (renavam), chassi (chassis), UF de registro (stateUf), ano de exercício (exerciseYear), data de vencimento se exibida YYYY-MM-DD (dueDate), valor/taxa se exibido (amount) e órgão emissor (providerOrAuthority).',
        SEGURO:
          'Analise a foto desta Apólice / Proposta de Seguro automotivo brasileiro. Extraia placa (plate), seguradora (providerOrAuthority), número da apólice (policyOrCode), fim de vigência YYYY-MM-DD (dueDate) e prêmio total em reais (amount).',
      };

      const response = await generateWithRetry(() =>
        ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: {
            parts: [
              {
                inlineData: {
                  mimeType: safeMimeType,
                  data: cleanBase64,
                },
              },
              { text: promptByKind[targetKind] },
            ],
          },
          config: {
            systemInstruction:
              'Você é um extrator de documentos brasileiros de frota (Notificação de Multa/FICI, CNH, CRLV-e e Apólice de Seguro). Converta datas DD/MM/AAAA para YYYY-MM-DD e valores monetários para números decimais. Retorne null para campos ilegíveis.',
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                plate: { type: Type.STRING, nullable: true },
                infractionCode: { type: Type.STRING, nullable: true },
                description: { type: Type.STRING, nullable: true },
                date: { type: Type.STRING, nullable: true },
                time: { type: Type.STRING, nullable: true },
                location: { type: Type.STRING, nullable: true },
                points: { type: Type.INTEGER, nullable: true },
                amount: { type: Type.NUMBER, nullable: true },
                sneAmount: { type: Type.NUMBER, nullable: true },
                driverIndicationDeadline: { type: Type.STRING, nullable: true },
                driverName: { type: Type.STRING, nullable: true },
                cnhNumber: { type: Type.STRING, nullable: true },
                cnhCategory: { type: Type.STRING, nullable: true },
                cnhExpiry: { type: Type.STRING, nullable: true },
                renavam: { type: Type.STRING, nullable: true },
                chassis: { type: Type.STRING, nullable: true },
                stateUf: { type: Type.STRING, nullable: true },
                exerciseYear: { type: Type.INTEGER, nullable: true },
                dueDate: { type: Type.STRING, nullable: true },
                providerOrAuthority: { type: Type.STRING, nullable: true },
                policyOrCode: { type: Type.STRING, nullable: true },
                confidence: { type: Type.STRING },
              },
            },
          },
        })
      );

      const rawText = (response.text ?? '{}').trim();
      const parsed = JSON.parse(rawText) as Record<string, unknown>;

      res.json({
        plate: typeof parsed['plate'] === 'string' ? parsed['plate'].toUpperCase().replace(/[^A-Z0-9]/g, '') : null,
        infractionCode: typeof parsed['infractionCode'] === 'string' ? parsed['infractionCode'].trim() : null,
        description: typeof parsed['description'] === 'string' ? parsed['description'].trim() : null,
        date: normalizeIsoDate(parsed['date']),
        time: typeof parsed['time'] === 'string' ? parsed['time'].trim().slice(0, 5) : null,
        location: typeof parsed['location'] === 'string' ? parsed['location'].trim() : null,
        points: typeof parsed['points'] === 'number' && Number.isFinite(parsed['points']) ? parsed['points'] : null,
        amount: parsePositiveNumber(parsed['amount']),
        sneAmount: parsePositiveNumber(parsed['sneAmount']),
        driverIndicationDeadline: normalizeIsoDate(parsed['driverIndicationDeadline']),
        driverName: typeof parsed['driverName'] === 'string' ? parsed['driverName'].trim() : null,
        cnhNumber: typeof parsed['cnhNumber'] === 'string' ? parsed['cnhNumber'].replace(/\D/g, '') : null,
        cnhCategory: typeof parsed['cnhCategory'] === 'string' ? parsed['cnhCategory'].trim().toUpperCase() : null,
        cnhExpiry: normalizeIsoDate(parsed['cnhExpiry']),
        renavam: typeof parsed['renavam'] === 'string' ? parsed['renavam'].replace(/\D/g, '') : null,
        chassis: typeof parsed['chassis'] === 'string' ? parsed['chassis'].trim().toUpperCase() : null,
        stateUf: typeof parsed['stateUf'] === 'string' ? parsed['stateUf'].trim().toUpperCase().slice(0, 2) : null,
        exerciseYear:
          typeof parsed['exerciseYear'] === 'number' && Number.isFinite(parsed['exerciseYear'])
            ? parsed['exerciseYear']
            : null,
        dueDate: normalizeIsoDate(parsed['dueDate']),
        providerOrAuthority:
          typeof parsed['providerOrAuthority'] === 'string' ? parsed['providerOrAuthority'].trim() : null,
        policyOrCode: typeof parsed['policyOrCode'] === 'string' ? parsed['policyOrCode'].trim() : null,
        confidence:
          parsed['confidence'] === 'ALTA' ||
          parsed['confidence'] === 'MEDIA' ||
          parsed['confidence'] === 'BAIXA'
            ? parsed['confidence']
            : 'MEDIA',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message === 'GEMINI_API_KEY_MISSING') {
        res.status(500).json({
          error:
            'Leitura de imagens indisponível: configure o serviço de IA no servidor.',
        });
        return;
      }
      if (message.includes('PERMISSION_DENIED') || message.includes('API_KEY_INVALID') || message.includes('403') || message.includes('400')) {
        res.status(400).json({
          error:
            'Não foi possível autenticar com a API do Gemini. Verifique a configuração de IA do servidor.',
        });
        return;
      }
      if (message.includes('RESOURCE_EXHAUSTED') || message.includes('429')) {
        res.status(429).json({
          error: 'Limite temporário de requisições da API do Gemini atingido.',
        });
        return;
      }
      console.error('Erro ao analisar documento via Gemini:', error);
      res.status(500).json({
        error: 'Falha ao ler a imagem do documento. Tente uma foto mais nítida.',
      });
    }
  });

  app.post('/api/fleet/plate-consultation', async (req: Request, res: Response) => {
    try {
      const { plate, stateUf, fipeCode } = (req.body ?? {}) as {
        plate?: string;
        stateUf?: string;
        fipeCode?: string;
      };

      const normalizedPlate = (plate ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (normalizedPlate.length < 7) {
        res.status(400).json({ error: 'Informe uma placa válida para consulta.' });
        return;
      }

      // Consulta real à BrasilAPI (tabelas FIPE e preço opcional por código FIPE)
      let fipeReferenceMonth: string | null = null;
      let fipeBrandCount: number | null = null;
      let fipePriceRecord: { valor?: string; marca?: string; modelo?: string; anoModelo?: number } | null = null;
      let brasilApiReachable = false;

      try {
        const [tablesRes, brandsRes] = await Promise.all([
          fetch('https://brasilapi.com.br/api/fipe/tabelas/v1'),
          fetch('https://brasilapi.com.br/api/fipe/marcas/v1/carros'),
        ]);
        if (tablesRes.ok) {
          const tables = (await tablesRes.json()) as { codigo?: number; mes?: string }[];
          fipeReferenceMonth = tables[0]?.mes ?? null;
          brasilApiReachable = true;
        }
        if (brandsRes.ok) {
          const brands = (await brandsRes.json()) as unknown[];
          fipeBrandCount = brands.length;
          brasilApiReachable = true;
        }
        if (fipeCode && fipeCode.trim()) {
          const priceRes = await fetch(
            `https://brasilapi.com.br/api/fipe/preco/v1/${encodeURIComponent(fipeCode.trim())}`
          );
          if (priceRes.ok) {
            const prices = (await priceRes.json()) as {
              valor?: string;
              marca?: string;
              modelo?: string;
              anoModelo?: number;
            }[];
            fipePriceRecord = prices[0] ?? null;
          }
        }
      } catch {
        brasilApiReachable = false;
      }

      // Verifica se há provedor externo homologado de Detran/SENATRAN configurado no ambiente
      const detranProviderUrl = process.env['DETRAN_API_URL'];
      const detranProviderKey = process.env['DETRAN_API_KEY'];
      let detranProviderConnected = false;
      let externalDebits: unknown[] | null = null;

      if (detranProviderUrl && detranProviderKey) {
        try {
          const detranRes = await fetch(
            `${detranProviderUrl.replace(/\/$/, '')}?plate=${encodeURIComponent(normalizedPlate)}&uf=${encodeURIComponent(stateUf || 'SP')}`,
            {
              headers: {
                Authorization: `Bearer ${detranProviderKey}`,
              },
            }
          );
          if (detranRes.ok) {
            detranProviderConnected = true;
            externalDebits = (await detranRes.json()) as unknown[];
          }
        } catch {
          detranProviderConnected = false;
        }
      }

      res.json({
        plate: normalizedPlate,
        stateUf: (stateUf || 'SP').toUpperCase(),
        brasilApiReachable,
        fipeReferenceMonth,
        fipeBrandCount,
        fipePriceRecord,
        detranProviderConnected,
        externalDebits,
        brasilApiNotice:
          'A BrasilAPI pública disponibiliza apenas consultas FIPE, CEP e CNPJ — ela não fornece consulta de débitos, IPVA ou multas por placa (restritos à SENATRAN/Sefaz/Detran ou integradores comerciais).',
      });
    } catch (error) {
      console.error('Erro na consulta de placa:', error);
      res.status(500).json({ error: 'Falha ao consultar referência da placa.' });
    }
  });

  return app;
}
