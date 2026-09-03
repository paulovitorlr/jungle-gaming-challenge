# Distributed Wagering Processor

Serviço financeiro distribuído desenvolvido para o desafio técnico da Jungle Gaming. A aplicação processa transações de apostas recebidas por HTTP e SQS com precisão monetária, idempotência persistente, consistência entre saldo e ledger, concorrência entre múltiplas instâncias e publicação de eventos **at-least-once**.

As decisões de arquitetura, garantias, trade-offs e limitações estão detalhadas em [ARCHITECTURE.md](./docs/architecture-decisions.md).

## Estado da entrega

O escopo obrigatório do desafio está implementado.

| Área avaliada             | Implementação                                                       |
| ------------------------- | ------------------------------------------------------------------- |
| Correção financeira       | `Money` decimal imutável, Wallet e ledger reconciliável             |
| Operações                 | `OPENING`, `BET`, `WIN`, `LOSS`, `REFUND` e `ROLLBACK`              |
| Concorrência              | optimistic locking por wallet e retry limitado                      |
| Idempotência              | chave e hash persistidos; Inbox para mensagens SQS                  |
| Referências fora de ordem | `PENDING_REFERENCE`, lease, backoff e limite de tentativas          |
| Mensageria                | SQS FIFO, redelivery, DLQ, Inbox e Transactional Outbox             |
| Recuperação de falhas     | ack após commit, leases recuperáveis e shutdown gracioso            |
| Observabilidade           | logs JSON, métricas Prometheus, liveness e readiness                |
| Persistência              | PostgreSQL, constraints, trigger de ledger e migrations reversíveis |
| Testes                    | unidade, integração real e concorrência                             |

Autenticação não foi implementada porque não pontua no desafio e o próprio enunciado permite essa decisão. Os endpoints de negócio usam um `NoopAuthGuard` como ponto explícito de substituição por OIDC; health checks permanecem públicos.

## Stack

- Bun 1.x como runtime, package manager e test runner;
- NestJS 12 com TypeScript em modo estrito;
- PostgreSQL 17;
- MikroORM 7;
- AWS SQS FIFO via LocalStack e AWS SDK v3;
- Docker Compose;
- `decimal.js` para cálculos monetários exatos.

## Executando localmente

### Pré-requisitos

- Bun 1.x;
- Docker com Docker Compose;
- portas `3000`, `5432` e `4566` disponíveis.

### Instalação

Linux/macOS:

```bash
cp .env.example .env
bun install
docker compose up -d --force-recreate
bunx mikro-orm migration:up
bun run start:dev
```

PowerShell:

```powershell
Copy-Item .env.example .env
bun install
docker compose up -d --force-recreate
bunx mikro-orm migration:up
bun run start:dev
```

O `--force-recreate` faz o LocalStack executar novamente o script idempotente que configura as quatro filas FIFO e suas redrive policies. A API fica disponível em `http://localhost:3000`.

Verifique as dependências:

```bash
curl http://localhost:3000/health/live
curl http://localhost:3000/health/ready
```

Respostas esperadas:

```json
{ "status": "ok" }
```

```json
{ "status": "ok", "postgres": "up", "sqs": "up" }
```

### Migrations e infraestrutura

```bash
bunx mikro-orm migration:up
bunx mikro-orm migration:down
docker compose down
```

Para também remover o volume local do PostgreSQL:

```bash
docker compose down -v
```

Esse último comando apaga os dados locais do banco.

### Produção local

```bash
bun run build
bun run start:prod
```

## Configuração

Os valores completos estão em [`.env.example`](./.env.example).

| Variável                              |                        Padrão | Finalidade                      |
| ------------------------------------- | ----------------------------: | ------------------------------- |
| `APP_PORT`                            |                        `3000` | porta HTTP                      |
| `DATABASE_HOST`                       |                   `localhost` | host do PostgreSQL              |
| `DATABASE_PORT`                       |                        `5432` | porta do PostgreSQL             |
| `DATABASE_NAME`                       |               `jungle_gaming` | nome do banco                   |
| `SQS_ENDPOINT`                        |       `http://localhost:4566` | endpoint do LocalStack          |
| `SQS_WAGER_QUEUE_NAME`                |     `wager-transactions.fifo` | comandos de apostas             |
| `SQS_WAGER_DLQ_NAME`                  | `wager-transactions-dlq.fifo` | DLQ dos comandos                |
| `SQS_EVENTS_QUEUE_NAME`               |     `integration-events.fifo` | eventos do Outbox               |
| `SQS_EVENTS_DLQ_NAME`                 | `integration-events-dlq.fifo` | DLQ dos eventos                 |
| `SQS_WAGER_CONSUMER_ENABLED`          |                        `true` | habilita o consumidor           |
| `OUTBOX_PUBLISHER_ENABLED`            |                        `true` | habilita o publisher            |
| `OUTBOX_BATCH_SIZE`                   |                          `10` | tamanho do claim do Outbox      |
| `OUTBOX_LEASE_DURATION_MS`            |                       `60000` | duração do lease do Outbox      |
| `OUTBOX_POLL_INTERVAL_MS`             |                        `1000` | intervalo do publisher          |
| `PENDING_REFERENCE_WORKER_ENABLED`    |                        `true` | habilita o reprocessador        |
| `PENDING_REFERENCE_BATCH_SIZE`        |                          `10` | tamanho do claim de referências |
| `PENDING_REFERENCE_LEASE_DURATION_MS` |                       `60000` | duração do lease                |
| `PENDING_REFERENCE_POLL_INTERVAL_MS`  |                        `1000` | intervalo do worker             |

## API HTTP

| Método | Rota                                                                  | Resultado                            |
| ------ | --------------------------------------------------------------------- | ------------------------------------ |
| `POST` | `/wallets`                                                            | cria wallet e `OPENING` atômico      |
| `GET`  | `/wallets/:walletId`                                                  | consulta saldo materializado         |
| `GET`  | `/wallets/:walletId/ledger?cursor=&limit=50`                          | consulta ledger paginado             |
| `POST` | `/wallets/:walletId/reconciliation`                                   | compara saldo e ledger sem corrigir  |
| `POST` | `/wagering/transactions`                                              | processa uma operação idempotente    |
| `GET`  | `/wagering/transactions/:transactionId`                               | consulta pelo id interno             |
| `GET`  | `/providers/:providerId/wagering/transactions/:externalTransactionId` | consulta pela identidade do provedor |
| `GET`  | `/health/live`                                                        | liveness                             |
| `GET`  | `/health/ready`                                                       | readiness de PostgreSQL e SQS        |
| `GET`  | `/metrics`                                                            | métricas em texto Prometheus         |

### Criar uma wallet

```bash
curl -X POST http://localhost:3000/wallets \
  -H 'Content-Type: application/json' \
  -d '{
    "playerId":"0192f28f-5dc0-7d58-bdb2-814ad6a0f4a1",
    "initialBalance":{"amount":"100.00","currency":"BRL"}
  }'
```

Exemplo de resposta:

```json
{
  "id": "0192f291-27dd-7d3f-8071-5f8685deef37",
  "playerId": "0192f28f-5dc0-7d58-bdb2-814ad6a0f4a1",
  "balance": { "amount": "100.00", "currency": "BRL" },
  "version": 1
}
```

Saldo inicial positivo cria, na mesma transação SQL, uma transação interna `OPENING`, um lançamento `CREDIT` e os eventos do Outbox. A constraint `(playerId, currency)` impede wallets duplicadas.

### Submeter uma transação

```bash
curl -X POST http://localhost:3000/wagering/transactions \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: provider-a:bet-123' \
  -d '{
    "providerId":"provider-a",
    "externalTransactionId":"bet-123",
    "playerId":"0192f28f-5dc0-7d58-bdb2-814ad6a0f4a1",
    "walletId":"0192f291-27dd-7d3f-8071-5f8685deef37",
    "roundId":"round-987",
    "gameId":"fortune-chimp",
    "kind":"BET",
    "money":{"amount":"25.00","currency":"BRL"}
  }'
```

Exemplo de resposta:

```json
{
  "transactionId": "0192f298-345e-7e38-af88-e43f851a819d",
  "status": "PROCESSED",
  "balance": { "amount": "75.00", "currency": "BRL" },
  "idempotentReplay": false
}
```

`Idempotency-Key` é obrigatório. O hash SHA-256 é calculado sobre JSON canônico, com chaves ordenadas e apenas campos de negócio. Header e metadados de transporte não participam do hash.

- repetição com o mesmo payload retorna o resultado histórico original e `idempotentReplay: true`;
- reutilização da chave com payload diferente retorna conflito;
- `OPENING` não pode ser enviado externamente;
- `REFUND` e `ROLLBACK` recebem `referenceExternalTransactionId`.

Exemplo de refund:

```json
{
  "providerId": "provider-a",
  "externalTransactionId": "refund-123",
  "playerId": "0192f28f-5dc0-7d58-bdb2-814ad6a0f4a1",
  "walletId": "0192f291-27dd-7d3f-8071-5f8685deef37",
  "roundId": "round-987",
  "gameId": "fortune-chimp",
  "kind": "REFUND",
  "money": { "amount": "25.00", "currency": "BRL" },
  "referenceExternalTransactionId": "bet-123"
}
```

### Consultar ledger

```bash
curl 'http://localhost:3000/wallets/WALLET_ID/ledger?limit=50'
```

`nextCursor` é opaco e estável. O limite padrão é 50 e o máximo é 100.

### Reconciliar wallet

```bash
curl -X POST http://localhost:3000/wallets/WALLET_ID/reconciliation
```

```json
{
  "walletId": "0192f291-27dd-7d3f-8071-5f8685deef37",
  "storedBalance": { "amount": "75.00", "currency": "BRL" },
  "calculatedBalance": { "amount": "75.00", "currency": "BRL" },
  "difference": { "amount": "0.00", "currency": "BRL" },
  "consistent": true,
  "checkedEntries": 2
}
```

Divergências não são corrigidas silenciosamente: a resposta retorna `consistent: false`, um log estruturado é emitido e a métrica correspondente é incrementada.

### Status HTTP

| Situação                                |         Status |
| --------------------------------------- | -------------: |
| operação criada/processada ou rejeitada | `201` ou `422` |
| replay idempotente                      |          `200` |
| referência ainda pendente               |          `202` |
| payload/header inválido                 |          `400` |
| conflito de idempotência ou unicidade   |          `409` |
| conflito concorrente após os retries    |          `503` |
| recurso não encontrado                  |          `404` |

## Regras financeiras

Todo valor monetário entra e sai como string decimal com duas casas. O domínio não usa `number`, `float` ou `double` para dinheiro.

| Operação   | Saldo      | Ledger            | Regra                                    |
| ---------- | ---------- | ----------------- | ---------------------------------------- |
| `OPENING`  | crédito    | `CREDIT`          | somente criação interna da wallet        |
| `BET`      | débito     | `DEBIT`           | rejeita saldo insuficiente               |
| `WIN`      | crédito    | `CREDIT`          | referência opcional                      |
| `LOSS`     | inalterado | nenhum            | registra o resultado                     |
| `REFUND`   | crédito    | `CREDIT`          | reverte uma `BET` processada uma vez     |
| `ROLLBACK` | inverso    | direção invertida | reverte `BET`, `WIN` ou `REFUND` uma vez |

`REFUND` e `ROLLBACK` exigem o mesmo provider, player, wallet, moeda, rodada e valor da referência. Reversões parciais estão fora do escopo. Operações `REJECTED` e `LOSS` não geram ledger.

Estados persistidos:

- `PENDING`: criada e ainda não aplicada;
- `PENDING_REFERENCE`: aguarda a operação referenciada;
- `PROCESSED`: aplicada, terminal;
- `REJECTED`: violação de negócio, terminal;
- `FAILED`: falha permanente de infraestrutura, terminal.

Referências ausentes ficam em `PENDING_REFERENCE`. O worker usa claim/lease e backoff exponencial; após oito tentativas, a transação termina como `REJECTED` com `REFERENCE_NOT_FOUND` e gera o evento correspondente.

### Códigos de falha

| Código                                  | Significado                                          |
| --------------------------------------- | ---------------------------------------------------- |
| `INSUFFICIENT_FUNDS`                    | saldo insuficiente para `BET`                        |
| `REVERSAL_WOULD_CAUSE_NEGATIVE_BALANCE` | reversão produziria saldo negativo                   |
| `REFERENCE_NOT_FOUND`                   | referência não encontrada após a política de retry   |
| `INVALID_REFERENCE_TYPE`                | tipo da referência incompatível                      |
| `REFERENCE_SCOPE_MISMATCH`              | provider, player, wallet, moeda ou rodada divergente |
| `REFERENCE_AMOUNT_MISMATCH`             | valor diferente do valor referenciado                |
| `REFERENCE_ALREADY_REVERSED`            | referência já revertida pelo mesmo tipo              |
| `REFERENCE_NOT_PROCESSED`               | referência não está processada                       |
| `CURRENCY_MISMATCH`                     | moeda da operação diferente da wallet                |
| `WALLET_NOT_FOUND`                      | wallet não encontrada no reprocessamento             |
| `WALLET_SCOPE_MISMATCH`                 | player da operação não pertence à wallet             |
| `PERMANENT_INFRASTRUCTURE_FAILURE`      | falha permanente auditável                           |

## Concorrência e invariantes no banco

A unidade de concorrência é `walletId`; não há lock global.

- a Wallet começa em `version = 1` e incrementa apenas quando o saldo muda;
- updates usam `WHERE id = ? AND version = ?`;
- conflito otimista reinicia a transação com estado novo, até cinco tentativas;
- wallets diferentes continuam processando em paralelo;
- constraints protegem saldo não negativo, moedas, unicidade, idempotência e reversões;
- um trigger PostgreSQL impede `UPDATE` e `DELETE` no ledger;
- Wallet, Wager, Ledger, Inbox e Outbox participam da mesma transação SQL.

No cenário obrigatório de duas apostas simultâneas de `80.00 BRL` contra saldo `100.00 BRL`, exatamente uma é processada, uma é rejeitada por saldo insuficiente, o saldo final é `20.00 BRL` e existe apenas um débito no ledger.

SQS FIFO reduz reordenação, mas não é a fonte de correção. As invariantes persistidas e as transações do PostgreSQL continuam sendo a garantia final.

## Processamento por SQS

O LocalStack cria:

| Fila FIFO                     | Uso                                             |
| ----------------------------- | ----------------------------------------------- |
| `wager-transactions.fifo`     | comandos de entrada                             |
| `wager-transactions-dlq.fifo` | mensagens inválidas ou que esgotaram tentativas |
| `integration-events.fifo`     | eventos publicados pelo Outbox                  |
| `integration-events-dlq.fifo` | redrive de eventos para futuros consumidores    |

Contrato de entrada:

```json
{
  "messageId": "msg-123",
  "type": "WagerTransactionRequested",
  "occurredAt": "2026-07-29T15:00:00.000Z",
  "data": {
    "providerId": "provider-a",
    "externalTransactionId": "bet-123",
    "idempotencyKey": "provider-a:bet-123",
    "playerId": "0192f28f-5dc0-7d58-bdb2-814ad6a0f4a1",
    "walletId": "0192f291-27dd-7d3f-8071-5f8685deef37",
    "roundId": "round-987",
    "gameId": "fortune-chimp",
    "kind": "BET",
    "money": { "amount": "25.00", "currency": "BRL" }
  }
}
```

O consumidor:

- reutiliza o mesmo caso de uso usado pelo endpoint HTTP;
- deduplica por `(consumerName, messageId)` em uma Inbox persistente;
- confirma a mensagem somente depois do commit;
- trata rejeições de negócio como resultado terminal confirmado;
- não remove mensagens inválidas ou com falha transitória, permitindo redelivery;
- usa `maxReceiveCount = 3` antes da DLQ;
- interrompe novos polls e aguarda o processamento corrente no shutdown.

## Transactional Outbox

Eventos financeiros são gravados na mesma transação SQL da Wallet, Wager, Ledger e Inbox. O broker nunca recebe um evento antes do commit.

Publishers concorrentes reivindicam lotes com `FOR UPDATE SKIP LOCKED`, gravam `lock_id` e `locked_until`, encerram a transação curta e somente então chamam o SQS. Sucesso preenche `published_at`; falha incrementa tentativas e agenda retry exponencial. Um lease expirado permite que outra instância recupere a mensagem.

Na fila FIFO:

- `MessageGroupId` recebe o `aggregateId` do evento;
- `MessageDeduplicationId` recebe o `eventId`.

Se o processo morrer depois de o SQS aceitar e antes de `published_at`, o evento pode ser publicado novamente. Essa janela é intencional no contrato **at-least-once**: o `eventId` permanece estável e consumidores devem manter Inbox persistente.

Eventos publicados:

- `WagerTransactionProcessed`, inclusive para `LOSS`;
- `WagerTransactionRejected`;
- `WagerTransactionPendingReference`;
- `WalletBalanceChanged`, somente quando o saldo muda.

## Observabilidade

Logs operacionais são JSON e incluem, quando disponíveis, `correlationId`, `messageId`, `transactionId`, `walletId` e `providerId`, sem registrar o payload financeiro completo.

`GET /metrics` expõe:

- transações por status;
- duplicatas;
- retries e mensagens destinadas à DLQ;
- conflitos de concorrência;
- divergências de reconciliação;
- latência de processamento;
- lag do Outbox.

`GET /health/live` verifica o processo. `GET /health/ready` consulta PostgreSQL e resolve as filas de entrada e eventos no SQS.

## Testes e qualidade

Com PostgreSQL e LocalStack ativos e as migrations aplicadas:

```bash
bun run test
bun run test:e2e
bun run test:cov
bun run lint
bun run build
```

O runner é o Bun. Os arquivos E2E seguem o padrão `*.e2e.spec.ts` reconhecido por `bun test`, e o script executa a suíte de integração sequencialmente entre arquivos.

Cobertura relevante:

- validação, escala e operações de `Money`;
- invariantes de Wallet e ledger;
- todas as operações financeiras e conflitos de moeda;
- replay idempotente histórico e chave com payload divergente;
- constraints e rollback atômico no PostgreSQL real;
- 50 submissões paralelas da mesma aposta;
- duas apostas de `80.00` contra saldo `100.00`;
- wallets distintas em paralelo;
- três contextos Nest independentes sobre o mesmo banco;
- Inbox, redelivery e DLQ no LocalStack;
- publishers concorrentes, leases e retry do Outbox;
- referência entregue antes da operação original;
- recuperação após restart;
- reconciliação final entre saldo e ledger.

## Estrutura

```text
src/
├── modules/
│   ├── wallet/       # aggregate, ledger, casos de uso e persistência
│   ├── wagering/     # transações, regras, eventos e pending references
│   └── messaging/    # Inbox, Outbox, consumidor e publisher SQS
├── shared/           # Money, UnitOfWork, observabilidade e HTTP
└── migrations/       # schema, constraints, índices e trigger
test/
└── integration/      # PostgreSQL e LocalStack reais
```

## Decisões e limitações

[ARCHITECTURE.md](./docs/architecture-decisions.md) documenta:

- boundaries e dependências entre as camadas;
- representação de dinheiro;
- estratégia transacional e de concorrência;
- idempotência e replay;
- referências fora de ordem;
- janelas de falha da Inbox e do Outbox;
- reconciliação, observabilidade e autenticação;
- limitações conscientes e evoluções para produção.

Os diferenciais opcionais não implementados são ledger de partidas dobradas, OpenTelemetry/dashboard e teste de carga com processos separados. Eles não fazem parte do escopo obrigatório do desafio.
