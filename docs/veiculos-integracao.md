# Módulo Veículos

Importado de `wwwvaldomiro-oss/carros`, commit `6cdb281`, em 17/11/2026.
Acesso: menu Veículos, rota `/veiculos`, com autenticação do Jarvas.

## Escopo da origem

Visão geral, veículos e motoristas, abastecimentos, manutenção, receitas/despesas,
multas, checklists, percursos, lembretes, relatórios PDF/CSV e importação/exportação JSON.
Paleta, componentes e regras de cálculo da origem foram preservados.
O menu global é o do Jarvas; o módulo usa o modo incorporado.

## Dados

O adaptador do Jarvas grava um snapshot JSON no bucket privado `cloud-docs`,
no caminho `<auth.user.id>/fleet/snapshot.json`. Reutiliza as políticas existentes
por proprietário; não cria tabelas nem altera o esquema. É necessário o bucket
permitir leitura, inserção e atualização do proprietário nesse caminho.
Não há fallback silencioso para dados locais ou exemplos se o servidor falhar.
A instalação começa vazia. Os dados de demonstração permanecem apenas no código
original e nos testes, sem serem carregados no adaptador de produção.
Snapshots não fazem conciliação automática com as tabelas financeiras do Jarvas.
A gaveta Open Finance não apresenta as transações fictícias da origem.

As gravações na mesma sessão são sequenciais e só atualizam a tela depois do
sucesso do servidor. Falha de carregamento bloqueia a edição. Uma importação JSON
também aguarda confirmação. Edição simultânea em vários dispositivos ainda usa
última gravação; o adaptador de snapshot não oferece resolução de conflitos.
Validar leitura e gravação com a conta real antes de usar em produção.

## Documentos e OCR

Inclui a versão atualizada publicada no Studio/GitHub: documentos e débitos,
OCR de recibos/documentos, FICI PDF, alertas de indicação, pontuação e checklist.
Os handlers Express foram adaptados a server functions autenticadas do TanStack
Start. Chamadas de IA usam apenas o gateway no servidor com LOVABLE_API_KEY;
o modelo é configurável via FLEET_OCR_MODEL (padrão google/gemini-2.5-flash).
O identificador gemini-4-hydrogen do ambiente Studio não é usado na hospedagem.
OCR só executa por ação do usuário; requer configuração e pode ter custo de uso.
Nenhuma solicitação de IA real foi feita durante a integração/testes.

BrasilAPI fornece a referência FIPE; consulta de débitos depende do provedor
DETRAN_API_URL/DETRAN_API_KEY configurado no servidor. O calendário nativo é
uma referência operacional, não validação oficial de datas/valores. A interface
informa isso e as obrigações geradas não recebem taxas/IPVA presumidos. Valores
ilegíveis de OCR não são substituídos por multas, números de CNH ou datas fictícias.
O QR NFC-e interpreta os dados do texto/URL; não consulta a SEFAZ pela chave.

## Verificação

Build de produção, suíte de cálculos da origem e testes de gravações consecutivas,
falha de gravação e falha de carregamento. Testes locais não validam permissões do
bucket da conta real nem a publicação automática da hospedagem conectada.

Suíte geral: falha preexistente em annual-indicators.test.ts (virada do exercício),
reproduzida no commit original antes da integração. TypeScript do módulo sem
erros; o projeto tem erros prévios nos arquivos de Agenda.

Validação final: build aprovado; 17 testes de frota aprovados. Suíte geral: 254
aprovados e a mesma falha preexistente dos indicadores anuais.
