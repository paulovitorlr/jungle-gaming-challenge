# Jungle Gaming Challenge

Backend financeiro orientado a eventos para processamento de transações de
apostas. O projeto prioriza precisão monetária, concorrência, idempotência e
entrega confiável de mensagens.

## Tecnologias

- NestJS 12 e TypeScript;
- Bun como runtime, gerenciador de pacotes e executor dos scripts;
- PostgreSQL 17;
- MikroORM 7;
- Amazon SQS via AWS SDK v3;
- LocalStack para desenvolvimento local;
- Vitest para testes unitários e E2E;
- Docker Compose.

## Arquitetura

O código está separado em três módulos principais:

- `wallet`: saldo e ledger financeiro;
- `wagering`: transações e regras de apostas;
- `messaging`: Inbox, Outbox, consumidor e publisher SQS.

Cada módulo separa domínio, aplicação e infraestrutura. A fronteira
transacional é representada por `UnitOfWork`.

## Garantias financeiras

- Valores monetários usam `decimal.js`, nunca `number` para cálculos;
- toda alteração de saldo produz uma entrada correspondente no ledger;
- saldo e ledger são persistidos na mesma transação SQL;
- a versão da Wallet protege contra atualizações concorrentes;
- chaves únicas protegem a idempotência mesmo em condições de corrida;
- a mesma aposta repetida não altera o saldo mais de uma vez;
- uma chave idempotente reutilizada com outro payload é rejeitada.

## Fluxo de entrada: SQS e Inbox

1. O consumidor recebe `WagerTransactionRequested` da fila
   `wager-transactions`;
2. o payload é validado e recebe um hash canônico;
3. a Inbox deduplica por `(consumerName, messageId)`;
4. Inbox, Wager, Wallet, Ledger e Outbox participam da mesma transação;
5. a mensagem SQS só é removida depois do commit;
6. falhas deixam a mensagem visível novamente;
7. depois do limite de recebimentos, a SQS move a mensagem para
   `wager-transactions-dlq`.

## Fluxo de saída: Outbox Publisher

Eventos de integração são gravados em `outbox_messages` dentro da mesma
transação das mudanças financeiras. O processo não chama o SQS durante a
transação SQL.

O publisher executa continuamente:

1. reivindica atomicamente um lote de mensagens vencidas;
2. usa `FOR UPDATE SKIP LOCKED` e grava `lock_id`/`locked_until`;
3. encerra a transação de claim;
4. publica os envelopes na fila `integration-events`;
5. preenche `published_at` quando o broker confirma o envio;
6. em caso de falha, incrementa `attempts` e agenda `next_attempt_at` com
   backoff exponencial;
7. se o processo morrer, outro publisher recupera a mensagem quando o lease
   expirar.

O sistema oferece entrega **at-least-once**. Um crash depois do envio ao SQS e
antes da atualização de `published_at` pode causar uma nova publicação. Por
isso, `eventId` é estável e os consumidores devem usar Inbox para deduplicação.

## Filas locais

O LocalStack cria quatro filas SQS Standard:

| Fila                     | Finalidade                                   |
| ------------------------ | -------------------------------------------- |
| `wager-transactions`     | comandos de entrada                          |
| `wager-transactions-dlq` | mensagens de entrada não processáveis        |
| `integration-events`     | eventos publicados pelo Outbox               |
| `integration-events-dlq` | redrive para futuros consumidores de eventos |

## Executando localmente

Copie as variáveis de ambiente:

```bash
cp .env.example .env
```

Suba PostgreSQL e LocalStack:

```bash
docker compose up -d
```

Se o LocalStack já estava ativo antes da inclusão da fila de eventos, recrie
somente esse container para executar novamente o script de inicialização:

```bash
docker compose up -d --force-recreate localstack
```

Instale as dependências:

```bash
bun install
```

Aplique as migrations:

```bash
bunx mikro-orm migration:up
```

Inicie a aplicação:

```bash
bun run start:dev
```

Verifique a aplicação:

```http
GET http://localhost:3000/health
```

Resposta esperada:

```json
{
  "status": "ok"
}
```

## Testes e qualidade

```bash
# testes unitários
bun run test

# testes de integração e E2E
bun run test:e2e

# cobertura
bun run test:cov

# análise estática
bun run lint

# compilação
bun run build
```

Os testes E2E exigem PostgreSQL e LocalStack ativos e as migrations aplicadas.
Entre os cenários cobertos estão rollback SQL, concorrência de Wallet,
idempotência paralela, redelivery, DLQ, dois publishers concorrentes e
recuperação de lease depois de crash.

## Configuração do publisher

| Variável                   | Padrão               | Descrição                        |
| -------------------------- | -------------------- | -------------------------------- |
| `OUTBOX_PUBLISHER_ENABLED` | `true`               | ativa o worker                   |
| `OUTBOX_BATCH_SIZE`        | `10`                 | mensagens reivindicadas por lote |
| `OUTBOX_LEASE_DURATION_MS` | `60000`              | duração do claim                 |
| `OUTBOX_POLL_INTERVAL_MS`  | `1000`               | espera quando não há mensagens   |
| `SQS_EVENTS_QUEUE_NAME`    | `integration-events` | fila de saída                    |

## Estado funcional

O domínio representa `OPENING`, `BET`, `WIN`, `LOSS`, `REFUND` e `ROLLBACK`.
Nesta etapa, o caso de uso conectado à entrada SQS processa `BET`; os demais
tipos ainda precisam ser conectados ao fluxo de aplicação.
