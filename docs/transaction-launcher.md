# Lançador financeiro — contrato de ativação

## Da compra à baixa

| Operação | Compromisso | Movimento da conta |
|---|---|---|
| Compra no cartão | Cada parcela compõe a fatura da competência em Despesas Anuais | A baixa da fatura identifica a conta que pagou o conjunto de compras |
| Compra ou conta avulsa a prazo | Valor devido ao credor em Despesas Anuais | O pagamento identifica conta, data e valor efetivo |
| Compra à vista já paga | A mesma obrigação nasce com a baixa | Uma saída na conta informada |
| Receita prevista | Valor a receber da fonte ou contrato | A confirmação identifica a conta de destino |
| Pix Cartão Parcelado | O valor bruto é distribuído nas faturas do cartão | O valor líquido entra na conta indicada na confirmação |

No Painel Financeiro, selecionar a descrição de um lançamento abre seu histórico. Na Carteira, selecionar uma entrada ou saída mostra a mesma origem. Em Despesas Anuais, selecionar a célula com o cadeado fechado e abrir **Origem do compromisso e pagamentos** mostra a composição do mês. A consulta usa identificadores do lançamento, da linha anual, da competência e da parcela. Uma fatura antiga pode ter total conhecido e composição desconhecida. A conta de pagamento também pode estar ausente nos registros antigos.

## Estado deste lote

A persistência e o desfazimento estão implementados na migração aditiva `0011_finance_launcher_persistence.sql`, versionada pelo Git mediante autorização do proprietário, sem solicitação à IA do Lovable. A aplicação do SQL utiliza acesso administrativo direto ao banco. Não há transferência bancária: os registros representam o controle do aplicativo.

A ativação é verificada por `finance_launcher_state` e suas capacidades. Os testes SQL em `tests/database/launcher-persistence.sql` são executados em uma transação com ROLLBACK: validam gravação real PostgreSQL, centavos, idempotência, composição da fatura, fatura oficial, pagamento/recebimento, desfazimento, adulteração de plano e isolamento de usuário. A definição anterior da função de fatura fechada está preservada em `docs/database/apply_closed_card_invoice-before-launcher.sql`.

O botão Desfazer aparece no histórico e na confirmação do salvamento. Ele preserva auditoria e bloqueia alterações incompatíveis com faturas fechadas, exercícios arquivados ou pagamentos posteriores. A leitura de saldo bancário não é alterada pelo lançamento manual. A conciliação só aceita evidência do provedor revalidada no servidor; não significa que todos os cartões forneçam composição futura completa. Upload fiscal continua fora do lote.

## Operações e contrato HTTP/RPC

As funções de servidor em `src/lib/finance/launcher.functions.ts` validam o usuário, formato, plano monetário e posse das contas. As funções transacionais abaixo são criadas pela migração. As políticas devem verificar auth.uid() independentemente das validações da aplicação. Não aceitar IDs de outro usuário nem chaves de fornecedor enviadas pelo navegador como evidência.

- `finance_launcher_state(p_version: 1)` retorna `{version:1,capabilities:["atomic_launch","settlement_accounts","card_invoices","reconciliation"],launches:[{id,title,kind,date,totalCents,status}],usedTransactionIds:[]}`. kinds: expense, income, contract, card_credit, invoice_baseline. status: forecast, settled, reconciled. Anunciar capacidades somente depois que todas estiverem instaladas e operacionais. Retornar lançamentos recentes do usuário por ordem decrescente de criação, sem informações de outros usuários. usedTransactionIds precisa ser completo para os extratos considerados, ou a API de propostas precisa paginar de maneira explícita.
- `finance_launch_transaction(p_version:1,p_launch,p_plan)` retorna `{id,duplicate}`. Payload e plano seguem os tipos Launch/LaunchPart de `launcher.ts`. O banco deve recalcular o plano independentemente de p_plan, comparar cada item, validar os relacionamentos e salvar todos os efeitos na MESMA transação. `requestId` é uma chave única por usuário com hash do payload: a mesma solicitação devolve o ID existente, outra carga com a mesma chave é recusada. Falhas de rede podem ser repetidas com a mesma chave, sem duplicar obrigações ou recebimentos.
- `finance_launch_reconcile(p_version:1,p_launch_id,p_transaction_id)` retorna `{id,reconciled:true}`. Verificar a movimentação em dados confiáveis sincronizados no servidor, bem como conta, conexão, valor, direção, data e vínculo prévio. Recusar reutilizar uma movimentação para dois lançamentos. Confirmações ambíguas exigem a escolha explícita do usuário; não conciliar automaticamente só por texto ou valor. A interface apresenta propostas; a seleção de correspondências adicionais pode ser ampliada sem tratar valores do navegador como evidência.
- `finance_record_settlement(p_version:1,p_settlement)` retorna `{ok:true}`. Payload: requestId, kind bill/installment/revenue, id, number|null, accountId, date, cents, note, reason, quits, revision. Gravar a baixa canônica e o vínculo bancário na mesma transação, com auditoria. Para bill ligado à parcela, atualizar a parcela canônica e não duplicar o pagamento. Rever é corrigir o mesmo registro e preservar eventos anteriores. Garantir idempotência por requestId e payload; recusar uma nova confirmação se o registro já estiver pago. Para receitas preservar motivos de revisão e validações de zero do fluxo anterior (o novo vínculo só recebe valores positivos).

## Persistência e regras implementadas

A estrutura modela lançamentos do usuário com identidade própria, chave idempotente, plano e vínculos com credor, contrato, conta de origem/destino, movimentos externos e documentos. Guardar a composição das faturas por cartão/competência, as bases manuais e os IDs dos componentes já incluídos. Conciliações precisam de restrição única para não reutilizar um mesmo evento externo, incluindo conexão/conta/ID do provedor. Contas vêm das conexões autorizadas do usuário; não presumir vínculos por nome.

Despesa pela conta cria/vincula uma obrigação; confirmação cria a baixa do mesmo compromisso. Crédito do cartão gera a entrada de principal na conta de destino e a dívida total parcelada, vinculadas por uma única operação, sem classificar o principal como renda ordinária. Custos são a diferença entre dívida e principal. Contratos com credor alimentam seus próprios registros e parcelas anuais; não criar um contrato duplicado ao informar credor existente. Quando o credor tiver mais de um compromisso compatível, pedir a escolha do contrato antes de gravar.

Compra no cartão compõe somente a fatura do cartão em Despesas Anuais, sem segunda linha de dívida por compra. Acompanhar parcelas restantes sem redividir o valor original pelo número de parcelas restantes. Dividir valores em centavos inteiros, mantendo a soma exata. No cadastro da base de uma fatura, preservar total informado e identificar explicitamente quais parcelas já estão incluídas. Esta base não é uma fatura oficialmente fechada. Guardar versões e impedir alteração silenciosa após pagamento/arquivamento.

Ao chegar uma compra do provedor, vincular ao componente manual correspondente e preservar nota/documentos; nunca somar novamente o evento conciliado. Um total agregado do provedor e um total manual não podem ser somados sem conhecer a composição. As funções puras de `launcher.ts` demonstram essa regra; não substituem a verificação persistente do provedor.

A fatura oficialmente fechada passa pelo mecanismo existente `apply_closed_card_invoice` e prevalece sobre a previsão da mesma competência, mantendo a diferença para conferência e a composição futura. Não substituir valores pagos ou exercícios arquivados. A gravação da fatura inicial precisa alimentar a mesma previsão lida por Despesas Anuais; não criar fontes de total paralelas.

Documentos neste lote: campo de referência/observação da nota. Upload e vínculo de arquivo fiscal ao lançamento ainda exigem a estrutura de documentos do backend e o fluxo de envio correspondente; não apresentar referência textual como arquivo anexado.

## Roteiro de aceite após ativação

1. R$1.000 em 10x no CAIXA SIM MASTERCARD: dez parcelas de R$100, inclusive virada de ano; repetir requestId não duplica.
2. Base de R$500 já inclui parcela de R$100; compra nova R$200; previsão final R$700. Evento correspondente do Pluggy não eleva para R$900. Fatura fechada R$715 substitui a competência e mostra diferença R$15.
3. Sem informação futura do provedor: preservar previsão manual e continuar aguardando fechamento.
4. Crédito C6: principal R$1.000 na conta de destino; dívida R$1.200 em 12x100; custo R$200; renda ordinária inalterada. Falha em qualquer gravação desfaz toda a operação.
5. Pagamento/recebimento exige conta bancária autorizada quando a capacidade estiver ativa. Revisar preserva vínculo/histórico e atualiza contrato/tabela/indicadores.
6. Mesmos valor e data em duas contas: sugerir somente a conta escolhida. Duas correspondências na mesma conta exigem escolha. Evento já conciliado não pode ser reutilizado.
7. Negar acesso cruzado entre usuários; cliente adulterando p_plan/cents/accountId deve ser recusado pelo banco.
8. Após ativar backend, testar importação de fatura fechada real, divergência, parcela parcial, anexo, correção para valor menor e concorrência entre abas. Não afirmar conciliação concluída com base apenas nos testes simulados.

## Atualização: fontes pagadoras e registros existentes

A operação visível passa a ter somente Receita/Despesa. Em Receita, a fonte Cartão de crédito abre Pix Cartão Parcelado, com nome fixo e valor líquido em destaque. Condições da dívida permanecem separadas. Contratos parcelados abre ContractForm, sem duplicar seu cadastro. Fonte cadastrada pergunta entre baixa de recebimento existente (ReceiveDialog, ID do compromisso) e nova renda da mesma fonte (sourceId validado no servidor). O backend de novas rendas deve conservar sourceId em vez de criar outra fonte com o mesmo nome.

Pagamentos/recebimentos existentes deixam de depender da ativação do lançador. A conta bancária é validada via conexão do usuário. Caso finance_record_settlement ainda não exista, a baixa canônica existente guarda a conta e a direção em um envelope versionado da observação, dentro da MESMA transação de pagamento/recebimento/auditoria. O texto da observação fica separado na edição; históricos e impressões apresentam o nome da conta legível. Correções usam o mesmo compromisso. Não há criação de segunda obrigação nem alteração de esquema.

O estado do lançador e o quadro de contas na Carteira conseguem exibir até 100 registros recentes derivados das baixas com esse envelope. Espelhos da mesma parcela são substituídos pela parcela canônica. Entradas/saídas exibidas são totais desses registros e NÃO são somadas aos movimentos do provedor nem subtraídas novamente do saldo bancário. Possíveis correspondências com o Pluggy são apenas sugestões. Reconciliação persistente e classificação de eventos antigos sem conta ainda dependem da estrutura nova. Ao ativar o novo backend, migrar/ler esse envelope e preservar os IDs das entidades para evitar duplicar o histórico existente.

## Desfazer

`finance_launch_undo(p_version:1,p_launch_id)` retorna `{id,undone:true}`. Repetir o desfazimento não aplica a reversão novamente. O lançamento e sua auditoria permanecem. Para um compromisso pago após sua criação, desfaça primeiro o pagamento, depois o compromisso. Fatura fechada requer estorno identificado em vez de apagar a cobrança oficial. Registros cancelados saem das apurações ativas. O principal de crédito do cartão tem categoria Crédito recebido e fica fora da renda ordinária anual.
