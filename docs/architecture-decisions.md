# Registro de Decisões Arquiteturais

Este documento registra as decisões efetivamente adotadas na implementação do desafio. Ele complementa a visão consolidada de [ARCHITECTURE.md](../ARCHITECTURE.md).

## ADR-001 — DDD pragmático e arquitetura em camadas

### Status

Aceita e implementada.

### Contexto

A dificuldade central está nas invariantes financeiras, idempotência, concorrência e recuperação de falhas, não em CRUD ou no framework.

### Decisão

O código foi organizado nos módulos `wallet`, `wagering` e `messaging`, com separação entre Domain, Application, Infrastructure e Presentation. O domínio não importa NestJS, MikroORM ou AWS. Casos de uso dependem de portas; a infraestrutura fornece adaptadores.

### Consequências

- regras financeiras podem ser testadas sem infraestrutura;
- entidades do ORM e contratos HTTP/SQS não contaminam o domínio;
- há mais mappers, portas e composição explícita;
- abstrações só são mantidas quando protegem uma fronteira real.

## ADR-002 — `Money` decimal e imutável

### Status

Aceita e implementada.

### Contexto

`number`, `float` e `double` não oferecem a precisão exigida para dinheiro e são proibidos pelo desafio.

### Decisão

`Money` encapsula `decimal.js`. Valores entram e saem como strings decimais, sempre com duas casas, acompanhados da moeda ISO-4217. O value object rejeita formato inválido, notação científica, excesso de casas e operações entre moedas diferentes. Soma, subtração e negação retornam novas instâncias.

Na persistência, valor e moeda ocupam colunas separadas; o valor usa `numeric(20,2)`.

### Consequências

- não há aritmética financeira binária de ponto flutuante;
- conversões entre contratos, domínio e banco são explícitas;
- `number` permanece restrito a versão, tentativas, duração, limite e métricas.

## ADR-003 — Wallet como Aggregate Root

### Status

Aceita e implementada.

### Contexto

Saldo, moeda, versão e lançamentos precisam evoluir juntos para impedir estados inválidos.

### Decisão

`Wallet` protege moeda, saldo não negativo, valores positivos e versionamento. `credit` e `debit` produzem o `WalletLedgerEntry` correspondente. `open` cria uma nova carteira; `rehydrate` apenas reconstrói estado persistido.

A versão começa em 1 e só incrementa quando o saldo muda. `LOSS` e operações rejeitadas não incrementam a versão.

### Consequências

- alterações financeiras legítimas passam pelo aggregate;
- controllers e repositórios não implementam regras de saldo;
- a aplicação persiste Wallet e ledger na mesma Unit of Work.

## ADR-004 — Ledger imutável e reconciliável

### Status

Aceita e implementada.

### Contexto

Um saldo materializado isolado não explica como o valor atual foi alcançado.

### Decisão

Toda alteração de saldo cria exatamente um lançamento `CREDIT` ou `DEBIT`, com valor, saldo anterior e saldo posterior. `LOSS` e rejeições não geram lançamento. O banco impõe:

- foreign key para a Wallet;
- unicidade por `walletId + transactionId`;
- valor positivo e saldos não negativos;
- coerência matemática entre direção, valor e saldos;
- trigger que impede `UPDATE` e `DELETE`.

A reconciliação soma o ledger desde zero e compara o resultado com `wallet.balance`. Divergências são retornadas, logadas e contabilizadas, nunca corrigidas silenciosamente.

### Consequências

- o histórico financeiro é auditável;
- corrupção ou regressão pode ser detectada;
- não foi adotado ledger de partidas dobradas, que é diferencial opcional.

## ADR-005 — PostgreSQL como fonte de verdade

### Status

Aceita e implementada.

### Contexto

As garantias precisam sobreviver a restart e coordenar múltiplas instâncias.

### Decisão

PostgreSQL é a fonte durável de Wallet, Wager, Ledger, Inbox e Outbox. Constraints e índices reforçam saldo não negativo, moeda, unicidade de wallet, idempotência, referências e reversões. As migrations são versionadas e possuem `down`.

### Consequências

- correção não depende de cache em memória;
- o banco resolve disputas entre instâncias;
- testes de integração usam PostgreSQL real.

## ADR-006 — MikroORM com modelos de persistência separados

### Status

Aceita e implementada.

### Contexto

O ORM recomendado precisa participar das transações sem definir o domínio.

### Decisão

MikroORM fornece EntityManager, Unit of Work, migrations e locks. Entidades ORM são separadas das entidades de domínio; mappers chamam factories `rehydrate`. Repositórios utilizam o EntityManager contextual e não concluem isoladamente uma operação financeira composta.

### Consequências

- o domínio permanece independente;
- os mapeamentos são explícitos;
- operações fora de uma request usam Unit of Work ou EntityManager contextual, evitando o EntityManager global.

## ADR-007 — Unit of Work como fronteira transacional

### Status

Aceita e implementada.

### Contexto

Wallet, Wager, Ledger, Inbox e Outbox não podem ser confirmados parcialmente.

### Decisão

A porta `UnitOfWork` delimita operações atômicas. `MikroOrmUnitOfWork` usa `EntityManager.transactional()`. O commit ocorre quando o callback termina; exceções causam rollback.

Chamadas externas ao SQS nunca permanecem dentro da transação SQL.

### Consequências

- uma operação confirma todos os efeitos financeiros e registros de entrega juntos;
- falhas não deixam saldo sem ledger ou evento confirmado sem Outbox;
- publicação externa exige Transactional Outbox.

## ADR-008 — Idempotência persistente e replay histórico

### Status

Aceita e implementada.

### Contexto

HTTP e SQS podem reenviar a mesma operação, inclusive após restart e entre instâncias.

### Decisão

O header HTTP `Idempotency-Key` é obrigatório; no SQS a chave fica em `data`. Um JSON canônico com chaves ordenadas é submetido a SHA-256. Header e metadados do envelope ficam fora do hash.

O banco protege:

- `(providerId, idempotencyKey)`, para replay e conflito;
- `(providerId, externalTransactionId)`, para consulta e referências.

Mesmo hash retorna `transactionId`, status, `failureCode` e saldo resultante persistidos. Hash diferente com a mesma chave é conflito.

### Consequências

- replay não movimenta novamente a Wallet nem o ledger;
- a resposta repetida preserva o saldo observado no processamento original;
- constraints resolvem corridas entre instâncias.

## ADR-009 — Optimistic concurrency por Wallet

### Status

Aceita, implementada e validada.

### Contexto

Leitura seguida de escrita sem coordenação permitiria `lost update`.

### Decisão

A unidade de concorrência é `walletId`. O update usa versão esperada:

```sql
update wallets
set balance = :balance,
    version = :nextVersion,
    updated_at = :updatedAt
where id = :walletId
  and version = :expectedVersion;
```

Zero linhas atualizadas significa conflito. O caso de uso reinicia a transação com estado fresco até cinco vezes; após o limite, reporta falha transitória.

### Consequências

- não existe lock global;
- wallets diferentes processam em paralelo;
- hot wallets podem gerar retries limitados;
- o cenário de duas apostas de `80.00 BRL` contra `100.00 BRL` termina com uma processada, uma rejeitada e saldo `20.00 BRL`.

## ADR-010 — Inbox persistente para entrada SQS

### Status

Aceita, implementada e validada.

### Contexto

SQS oferece entrega at-least-once; uma mensagem pode reaparecer após timeout ou crash.

### Decisão

O consumidor registra `InboxMessage` por `(consumerName, messageId)`, valida o hash e chama o mesmo caso de uso da API. Inbox, operação financeira, ledger e Outbox participam da mesma transação. O ack ocorre somente depois do commit.

Rejeições de negócio são resultados terminais confirmados. Mensagens inválidas ou falhas transitórias não são removidas; a redrive policy as encaminha para DLQ após três recebimentos.

### Consequências

- redelivery não duplica débito ou crédito;
- restart não apaga a deduplicação;
- mensagens conflitantes permanecem diagnosticáveis;
- no shutdown, novos polls param e o processamento corrente é aguardado.

## ADR-011 — Transactional Outbox e publicação at-least-once

### Status

Aceita, implementada e validada.

### Contexto

Não há transação distribuída entre PostgreSQL e SQS. Publicar diretamente antes ou depois do commit pode expor evento não confirmado ou perder evento confirmado.

### Decisão

Eventos são gravados na Outbox na mesma transação financeira. Publishers concorrentes fazem claim curto com `FOR UPDATE SKIP LOCKED`, `lock_id` e `locked_until`; a chamada ao SQS ocorre fora da transação.

Sucesso preenche `published_at`; falha incrementa tentativas e agenda backoff exponencial. Lease expirado permite recuperação. Em SQS FIFO, `MessageGroupId = aggregateId` e `MessageDeduplicationId = eventId`.

### Consequências

- commit antes da publicação é recuperável;
- o sistema não publica evento financeiro ainda não confirmado;
- crash após aceitação pelo SQS e antes de `published_at` pode duplicar o evento;
- consumidores downstream devem deduplicar pelo `eventId`.

## ADR-012 — Referências fora de ordem como estado de negócio

### Status

Aceita, implementada e validada.

### Contexto

`REFUND` ou `ROLLBACK` pode chegar antes da transação referenciada.

### Decisão

A operação é persistida como `PENDING_REFERENCE`. Um worker usa claim/lease e backoff exponencial para reprocessar sem manter transação aberta durante a espera. Após oito tentativas, termina em `REJECTED` com `REFERENCE_NOT_FOUND`.

### Consequências

- mensagens fora de ordem não são descartadas;
- o estado pendente permanece auditável;
- outra instância recupera o trabalho após expiração do lease;
- oito tentativas priorizam feedback rápido no desafio; em produção, o limite seria alinhado ao SLA dos provedores.

## ADR-013 — SQS FIFO como otimização, não garantia financeira

### Status

Aceita e implementada.

### Contexto

Ordenação do broker não cobre entradas HTTP, redelivery, múltiplos consumidores nem disputas no banco.

### Decisão

As filas são FIFO e agrupam mensagens por Wallet ou agregado. Contudo, idempotência, transações, optimistic locking e constraints do PostgreSQL continuam sendo as garantias de correção.

### Consequências

- ordenação reduz contenção e reordenação;
- a aplicação continua correta sem depender de ordem global;
- duplicidade continua sendo uma condição normal.

## ADR-014 — Observabilidade operacional simples

### Status

Aceita e implementada.

### Decisão

Logs operacionais são JSON com identificadores disponíveis e sem payload financeiro completo. Métricas em formato Prometheus cobrem status, duplicatas, retries, DLQ, conflitos, latência, lag do Outbox e reconciliação. Liveness verifica o processo; readiness verifica PostgreSQL e SQS.

### Consequências

- falhas distribuídas podem ser diagnosticadas localmente;
- métricas são mantidas em memória por instância e reiniciam com o processo;
- OpenTelemetry e dashboard permanecem evoluções opcionais.

## ADR-015 — Autenticação fora do escopo avaliado

### Status

Aceita e implementada como ponto de extensão.

### Decisão

Foi aplicado um `NoopAuthGuard` aos endpoints de negócio. Health checks são públicos e SQS é tratado como canal interno. Em produção, o guard seria substituído por OIDC com Keycloak ou Zitadel e a identidade autenticada seria comparada ao `providerId`.

### Consequências

- o timebox permanece concentrado na correção financeira;
- não há autenticação artesanal;
- o ponto de substituição está explícito no código.

## Limitações conscientes

- não há ledger de partidas dobradas;
- métricas não são duráveis nem agregadas entre processos;
- paginação do ledger é estável, mas ainda filtra em memória;
- o teste de três instâncias usa contextos Nest independentes no mesmo processo;
- não há OpenTelemetry, dashboard ou teste de carga, todos opcionais.
