# Plano de Implementação

Este documento registra a estratégia incremental utilizada e o estado final de cada fase. O projeto priorizou correção financeira antes de adicionar transporte e operação distribuída.

## Visão dos checkpoints

| Fase | Objetivo                              | Estado final |
| ---- | ------------------------------------- | ------------ |
| 1    | Bootstrap e infraestrutura local      | Concluída    |
| 2    | Domínio financeiro                    | Concluída    |
| 3    | Persistência e constraints            | Concluída    |
| 4    | Fluxo transacional e idempotência     | Concluída    |
| 5    | Concorrência entre instâncias         | Concluída    |
| 6    | Inbox e consumidor SQS                | Concluída    |
| 7    | Outbox e publisher                    | Concluída    |
| 8    | Referências fora de ordem             | Concluída    |
| 9    | HTTP, reconciliação e observabilidade | Concluída    |
| 10   | Hardening, testes e documentação      | Concluída    |

## Fase 1 — Bootstrap e infraestrutura local

### Entregas

- NestJS com TypeScript estrito;
- Bun como runtime, package manager e test runner;
- PostgreSQL 17 e SQS FIFO via LocalStack;
- Docker Compose e configuração por variáveis de ambiente;
- MikroORM e migrations;
- liveness inicial.

### Evidência

`bun run build`, `bun run test`, containers saudáveis e aplicação configurável por `.env`.

## Fase 2 — Domínio financeiro

### Entregas

- `Money` imutável sobre `decimal.js`;
- `Wallet` como Aggregate Root;
- `WalletId`, `WagerTransactionId` e factories de reidratação;
- `WalletLedgerEntry` imutável;
- `WagerTransaction` com estados e transições explícitas;
- regras de `OPENING`, `BET`, `WIN`, `LOSS`, `REFUND` e `ROLLBACK`.

### Evidência

Testes unitários exercitam formato monetário, moedas, saldo, versionamento, referências, reversões e estados terminais sem infraestrutura.

## Fase 3 — Persistência e constraints

### Entregas

- entidades ORM separadas do domínio;
- mappers explícitos;
- repositórios PostgreSQL;
- migrations versionadas e reversíveis;
- constraints para saldo, moeda, idempotência, ledger e reversões;
- trigger de imutabilidade do ledger;
- `MikroOrmUnitOfWork`.

### Evidência

Testes de integração validam commit, rollback, constraints, reidratação e atualizações condicionadas contra PostgreSQL real.

## Fase 4 — Fluxo transacional e idempotência

### Entregas

- caso de uso único para processamento financeiro;
- `Idempotency-Key` e SHA-256 de JSON canônico;
- resultado histórico persistido;
- conflito quando a mesma chave recebe payload diferente;
- Wallet, Wager, Ledger e Outbox na mesma transação;
- criação de Wallet com `OPENING` e `CREDIT` atômicos.

### Evidência

Replay idêntico não duplica efeitos; falhas provocam rollback; respostas repetidas preservam o saldo original.

## Fase 5 — Concorrência entre instâncias

### Entregas

- optimistic concurrency por versão da Wallet;
- update SQL condicionado à versão esperada;
- retry limitado a cinco tentativas;
- constraints únicas para corridas de idempotência e reversão;
- ausência de lock global.

### Evidência

- 50 submissões paralelas produzem um único efeito;
- duas apostas de `80.00 BRL` contra `100.00 BRL` produzem um sucesso, uma rejeição e saldo `20.00 BRL`;
- wallets distintas processam em paralelo;
- três contextos Nest independentes compartilham o mesmo PostgreSQL.

## Fase 6 — Inbox e consumidor SQS

### Entregas

- filas `wager-transactions.fifo` e DLQ;
- contrato `WagerTransactionRequested`;
- consumidor reutilizando o caso de uso HTTP;
- Inbox persistente por `(consumerName, messageId)`;
- ack somente depois do commit;
- redelivery, limite de três recebimentos e DLQ;
- shutdown gracioso.

### Evidência

Testes no LocalStack cobrem mensagem válida, duplicidade, conflito, redelivery e DLQ sem substituir o broker por mocks.

## Fase 7 — Transactional Outbox

### Entregas

- eventos gravados junto da operação financeira;
- filas `integration-events.fifo` e DLQ;
- publisher com claim atômico, `FOR UPDATE SKIP LOCKED` e lease;
- retry exponencial;
- `MessageGroupId = aggregateId`;
- `MessageDeduplicationId = eventId`;
- recuperação após crash.

### Evidência

Testes de integração cobrem dois publishers concorrentes, lease expirado, publicação, retry e reinicialização.

## Fase 8 — Referências fora de ordem

### Entregas

- `REFUND` e `ROLLBACK` sem origem persistidos como `PENDING_REFERENCE`;
- worker com claim/lease;
- backoff exponencial;
- máximo de oito tentativas;
- rejeição final estável com `REFERENCE_NOT_FOUND`;
- eventos de pendência, processamento ou rejeição.

### Evidência

Teste E2E envia a reversão antes da referência e comprova reprocessamento e reconciliação final.

## Fase 9 — HTTP, reconciliação e observabilidade

### Entregas

- endpoints de Wallet, ledger, Wager e consultas;
- paginação com cursor opaco;
- mapeamento consistente de status HTTP;
- reconciliação sem correção silenciosa;
- logs JSON com identificadores;
- métricas Prometheus;
- liveness e readiness separados;
- `NoopAuthGuard` como ponto de extensão.

### Evidência

Testes HTTP validam contratos e erros; readiness verifica PostgreSQL e SQS reais.

## Fase 10 — Hardening, testes e documentação

### Entregas

- revisão das migrations e constraints;
- testes sequenciais de integração para isolamento;
- scripts Bun de teste, cobertura, lint e build;
- README de execução e contratos;
- arquitetura, ADRs, requisitos e limitações atualizados.

### Comandos finais

```bash
bun run test
bun run test:e2e
bun run test:cov
bun run lint
bun run build
```

## Resultado

O escopo obrigatório foi concluído. Permanecem fora da entrega apenas diferenciais opcionais: ledger de partidas dobradas, OpenTelemetry/dashboard e teste de carga com processos separados.

## Princípio adotado

Cada fase respondeu a três perguntas:

1. Qual problema este código resolve?
2. Qual requisito ou invariante ele protege?
3. Como a suíte demonstra que ele está correto?
