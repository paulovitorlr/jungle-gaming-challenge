# Distributed Wagering Processor

Serviço financeiro distribuído para processar transações de apostas com precisão monetária, idempotência persistente, concorrência entre instâncias e entrega de eventos **at-least-once**.

## Stack

- Bun 1.x como runtime, package manager e test runner;
- NestJS 12 e TypeScript estrito;
- PostgreSQL 17 e MikroORM 7;
- SQS FIFO via LocalStack e AWS SDK v3;
- Docker Compose.

As decisões, garantias, trade-offs e limitações estão detalhados em [ARCHITECTURE.md](./ARCHITECTURE.md).

## Início rápido

Requisitos: Bun 1.x e Docker com Compose.

### Desenvolvimento local: somente infraestrutura

```bash
cp .env.example .env
bun install
docker compose up -d
bunx mikro-orm migration:up
bun run start:dev
```

Esse comando sobe apenas PostgreSQL e LocalStack. As portas `5432` e `4566` ficam vinculadas a `127.0.0.1` para desenvolvimento e testes locais; não há aplicação HTTP em container nesse modo. O script idempotente do LocalStack cria as quatro filas FIFO e suas redrive policies.

### Stack completa: migrations + múltiplas instâncias + gateway

```bash
docker compose --profile app up -d --build
```

O profile `app` sobe PostgreSQL e LocalStack compartilhados, executa o serviço one-shot `migrate`, inicia três réplicas independentes de `app` e coloca um nginx na frente delas. Dentro da rede Compose, a aplicação usa `postgres` e `localstack` como hosts. As réplicas não publicam portas HTTP no host; todo tráfego da API passa pelo gateway em `http://localhost:3000`.

Verificação:

```bash
curl http://localhost:3000/health/live
curl http://localhost:3000/health/ready
```

Para aumentar horizontalmente o número de processos da aplicação:

```bash
docker compose --profile app up -d --scale app=5
```

O nginx resolve o serviço `app` pela rede interna do Docker e distribui as requisições em round-robin entre as réplicas disponíveis. Todas compartilham o mesmo PostgreSQL e as mesmas filas SQS; nenhuma garantia financeira depende de memória compartilhada entre processos.

Para encerrar a stack completa:

```bash
docker compose --profile app down
```

Para reverter a migration mais recente no fluxo local de desenvolvimento:

```bash
bunx mikro-orm migration:down
```

## API HTTP

| Método | Rota                                                       | Resultado                           |
| ------ | ---------------------------------------------------------- | ----------------------------------- |
| `POST` | `/wallets`                                                 | cria wallet e `OPENING` atômico     |
| `GET`  | `/wallets/:walletId`                                       | consulta saldo materializado        |
| `GET`  | `/wallets/:walletId/ledger?cursor=&limit=50`               | ledger com cursor opaco             |
| `POST` | `/wallets/:walletId/reconciliation`                        | compara saldo e ledger sem corrigir |
| `POST` | `/wagering/transactions`                                   | processa operação idempotente       |
| `GET`  | `/wagering/transactions/:transactionId`                    | consulta por id interno             |
| `GET`  | `/providers/:providerId/wagering/transactions/:externalId` | consulta por id externo             |
| `GET`  | `/health/live`                                             | liveness, aberto                    |
| `GET`  | `/health/ready`                                            | PostgreSQL + SQS, aberto            |
| `GET`  | `/metrics`                                                 | métricas em formato Prometheus      |

### Criar wallet

```bash
curl -X POST http://localhost:3000/wallets \
  -H 'Content-Type: application/json' \
  -d '{
    "playerId":"0192f28f-5dc0-7d58-bdb2-814ad6a0f4a1",
    "initialBalance":{"amount":"100.00","currency":"BRL"}
  }'
```

Saldo inicial positivo gera uma transação interna `OPENING`, um lançamento `CREDIT` e eventos de integração na mesma transação SQL. A unicidade `(playerId, currency)` é protegida no banco.

### Submeter transação

```bash
curl -X POST http://localhost:3000/wagering/transactions \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: provider-a:bet-123' \
  -d '{
    "providerId":"provider-a",
    "externalTransactionId":"bet-123",
    "playerId":"0192f28f-5dc0-7d58-bdb2-814ad6a0f4a1",
    "walletId":"WALLET_ID",
    "roundId":"round-987",
    "gameId":"fortune-chimp",
    "kind":"BET",
    "money":{"amount":"25.00","currency":"BRL"}
  }'
```

`Idempotency-Key` é obrigatório. O hash SHA-256 usa JSON canônico com chaves ordenadas e somente os campos de negócio; header e metadados de transporte ficam fora. Uma repetição idêntica retorna o `transactionId`, status e saldo histórico originais com `idempotentReplay: true`. Reutilizar a chave com payload diferente retorna conflito.

Mapeamento HTTP:

| Situação                           | Status |
| ---------------------------------- | ------ |
| criada/processada                  | `201`  |
| replay idempotente                 | `200`  |
| aguardando referência              | `202`  |
| payload inválido                   | `400`  |
| conflito de idempotência/unicidade | `409`  |
| rejeição de negócio                | `422`  |
| conflito concorrente após retries  | `503`  |

## Regras financeiras

| Operação   | Saldo      | Ledger            | Regra                                    |
| ---------- | ---------- | ----------------- | ---------------------------------------- |
| `OPENING`  | crédito    | `CREDIT`          | somente criação interna da wallet        |
| `BET`      | débito     | `DEBIT`           | rejeita saldo insuficiente               |
| `WIN`      | crédito    | `CREDIT`          | referência opcional                      |
| `LOSS`     | inalterado | nenhum            | registra resultado                       |
| `REFUND`   | crédito    | `CREDIT`          | reverte uma `BET` processada uma vez     |
| `ROLLBACK` | inverso    | direção invertida | reverte `BET`, `WIN` ou `REFUND` uma vez |

`REFUND` e `ROLLBACK` exigem mesmo provider, player, wallet, moeda, rodada e valor da referência. Uma reversão que deixaria saldo negativo é rejeitada com código distinto de aposta sem saldo.

Referências ainda inexistentes ficam em `PENDING_REFERENCE`. Um worker usa claim/lease e backoff exponencial; após 8 tentativas sem referência a transação termina como `REJECTED` com `REFERENCE_NOT_FOUND` e produz o evento correspondente.

## Mensageria

O LocalStack cria:

| Fila FIFO                     | Uso                               |
| ----------------------------- | --------------------------------- |
| `wager-transactions.fifo`     | comandos de entrada               |
| `wager-transactions-dlq.fifo` | redrive de comandos               |
| `integration-events.fifo`     | eventos do Outbox                 |
| `integration-events-dlq.fifo` | redrive para consumidores futuros |

O consumidor SQS reutiliza o mesmo caso de uso da API. A Inbox deduplica por `(consumerName, messageId)` e o ack ocorre somente após commit. Erros de negócio são terminais, erros transitórios voltam à fila e mensagens que excedem `maxReceiveCount` seguem para a DLQ.

O Outbox Publisher reivindica lotes com `FOR UPDATE SKIP LOCKED`, persiste `lock_id`/`locked_until`, encerra a transação e só depois publica. Sucesso preenche `published_at`; falha agenda retry exponencial. Lease expirado permite recuperação por outra instância. Na FIFO, `MessageGroupId` é o aggregate/wallet e `MessageDeduplicationId` é o `eventId`.

Um crash depois de o SQS aceitar o evento e antes de `published_at` pode republicá-lo. Isso é deliberadamente **at-least-once**: o `eventId` permanece estável e consumidores devem manter Inbox persistente.

Eventos emitidos:

- `WagerTransactionProcessed`, inclusive para `LOSS`;
- `WagerTransactionRejected`;
- `WagerTransactionPendingReference`;
- `WalletBalanceChanged`, somente se o saldo mudou.

## Concorrência e persistência

- `Money` usa `decimal.js`, recebe/serializa string decimal com duas casas e nunca calcula dinheiro com `number`;
- a Wallet usa optimistic concurrency por `version` e retry limitado a 5 tentativas;
- o banco impõe saldo não negativo, moedas válidas, unicidade de wallet, idempotência, uma reversão por tipo e um ledger por transação/wallet;
- um trigger PostgreSQL impede `UPDATE` ou `DELETE` de lançamentos;
- Wallet, Wager, Ledger, Inbox e Outbox compartilham a mesma transação SQL;
- a FIFO reduz reordenação, mas as constraints e transações do PostgreSQL são a garantia final.

## Observabilidade

Os logs são JSON e carregam identificadores de correlação, mensagem, transação, wallet e provider quando disponíveis, sem registrar o payload financeiro completo. `/metrics` expõe contadores de status, duplicatas, retries, DLQ, conflitos de concorrência, lag do Outbox, latência e divergências de reconciliação.

## Configuração dos workers

| Variável                              | Padrão  | Descrição                    |
| ------------------------------------- | ------- | ---------------------------- |
| `SQS_WAGER_CONSUMER_ENABLED`          | `true`  | consumidor de comandos       |
| `OUTBOX_PUBLISHER_ENABLED`            | `true`  | publisher do Outbox          |
| `OUTBOX_BATCH_SIZE`                   | `10`    | tamanho do claim             |
| `OUTBOX_LEASE_DURATION_MS`            | `60000` | duração do lease             |
| `OUTBOX_POLL_INTERVAL_MS`             | `1000`  | intervalo do publisher       |
| `PENDING_REFERENCE_WORKER_ENABLED`    | `true`  | reprocessador de referências |
| `PENDING_REFERENCE_BATCH_SIZE`        | `10`    | tamanho do claim             |
| `PENDING_REFERENCE_LEASE_DURATION_MS` | `60000` | duração do lease             |
| `PENDING_REFERENCE_POLL_MS`           | `1000`  | intervalo do worker          |

Veja todos os valores em `.env.example`.

## Testes e qualidade

Com PostgreSQL e LocalStack ativos e migrations aplicadas:

```bash
bun run test              # unidade
bun run test:e2e          # integração real, sequencial entre arquivos
bun run test:concurrency  # três processos Bun/Nest independentes
bun run test:cov          # cobertura unitária
bun run lint
bun run build
```

A suíte de integração continua cobrindo contextos Nest independentes no mesmo processo, constraints, migrations, rollback atômico, Inbox/redelivery/DLQ, Outbox/leases/restart, referência fora de ordem e duplicatas paralelas. A prova dedicada `test:concurrency` sobe três processos do sistema operacional, cada um com seu próprio runtime Nest/MikroORM, contra o mesmo PostgreSQL. Ela disputa uma hot wallet de `100.00` com duas apostas concorrentes de `80.00`, exige exatamente uma aposta processada, saldo final `20.00`, um único `DEBIT` e reconciliação consistente; também comprova que wallets distintas avançam em paralelo.

## Autenticação

Autenticação não foi implementada, conforme permitido pelo enunciado. Os endpoints de negócio passam por um `NoopAuthGuard`, ponto explícito de substituição por OIDC/Keycloak; health checks permanecem públicos. A decisão e o desenho futuro estão em `ARCHITECTURE.md`.
