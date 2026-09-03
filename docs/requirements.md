# Levantamento e Rastreabilidade de Requisitos

## 1. Objetivo

O sistema processa operações financeiras de apostas recebidas por HTTP e SQS, mantendo correção quando há duplicidade, concorrência, entrega fora de ordem, indisponibilidade temporária ou reinicialização.

A prioridade é garantir que o sistema nunca duplique débitos ou créditos, perca eventos confirmados, produza `lost update` ou permita saldo negativo.

## 2. Stack obrigatória

| Requisito                                           | Atendimento                       |
| --------------------------------------------------- | --------------------------------- |
| Bun 1.x como runtime, package manager e test runner | Implementado                      |
| TypeScript estrito e NestJS                         | Implementado                      |
| PostgreSQL                                          | Implementado com imagem 17-alpine |
| AWS SQS local                                       | Implementado com LocalStack       |
| MikroORM ou TypeORM                                 | MikroORM 7                        |
| Docker Compose                                      | PostgreSQL e LocalStack           |
| Migrations versionadas e reversíveis                | Implementado                      |

## 3. Requisitos funcionais

### 3.1 Wallet

- criar uma Wallet por `playerId + currency`;
- aceitar saldo inicial não negativo;
- criar `OPENING` e lançamento `CREDIT` quando o saldo inicial for positivo;
- consultar Wallet por id;
- listar ledger por cursor opaco e limite;
- reconciliar saldo materializado com o ledger.

### 3.2 Transações de aposta

- processar `BET`, `WIN`, `LOSS`, `REFUND` e `ROLLBACK`;
- impedir `OPENING` por HTTP ou SQS;
- consultar por id interno;
- consultar por `providerId + externalTransactionId`;
- retornar status, saldo resultante e `failureCode`;
- preservar o resultado histórico em replay.

### 3.3 Idempotência

- exigir `Idempotency-Key` no HTTP;
- receber `idempotencyKey` no contrato SQS;
- persistir SHA-256 de JSON canônico dos campos de negócio;
- retornar replay para chave e payload iguais;
- retornar conflito para a mesma chave com payload diferente;
- garantir unicidade no PostgreSQL.

### 3.4 Referências e reversões

- `REFUND` referencia somente `BET`;
- `ROLLBACK` referencia `BET`, `WIN` ou `REFUND`;
- referência deve estar `PROCESSED`;
- provider, player, wallet, moeda, rodada e valor devem coincidir;
- reversão parcial não é suportada;
- uma referência não pode ser revertida duas vezes pelo mesmo tipo;
- reversão que deixaria saldo negativo deve ser rejeitada com código próprio;
- referência ausente deve ficar em `PENDING_REFERENCE` e ser reprocessada.

### 3.5 Entrada e saída assíncronas

- consumir `WagerTransactionRequested` de SQS FIFO;
- reutilizar o mesmo caso de uso do HTTP;
- deduplicar mensagens em Inbox persistente;
- confirmar somente após commit;
- permitir retry e redrive para DLQ;
- gravar eventos de integração na transação financeira;
- publicar Outbox com múltiplos publishers e recuperação após crash.

### 3.6 Eventos mínimos

- `WagerTransactionProcessed`, inclusive para `LOSS`;
- `WagerTransactionRejected`;
- `WagerTransactionPendingReference`;
- `WalletBalanceChanged`, somente quando o saldo muda.

## 4. Requisitos não funcionais

### 4.1 Precisão monetária

- dinheiro nunca usa `number`, `float` ou `double`;
- entrada e saída usam string decimal com duas casas;
- moeda faz parte do value object;
- cálculos usam `decimal.js`;
- persistência usa `numeric(20,2)`.

### 4.2 Concorrência

- a unidade de concorrência é `walletId`;
- não existe lock global;
- optimistic locking impede `lost update`;
- retries são limitados;
- a solução funciona com três ou mais instâncias;
- FIFO é otimização, não garantia final.

### 4.3 Atomicidade e auditabilidade

- Wallet, Wager, Ledger, Inbox e Outbox confirmam atomicamente;
- toda mudança de saldo possui um lançamento, e vice-versa;
- ledger concluído é imutável;
- constraints reforçam invariantes no schema;
- reconciliação detecta e expõe divergências sem alterá-las.

### 4.4 Recuperação de falhas

- redelivery não duplica efeitos;
- commit antes da publicação é recuperável pelo Outbox;
- leases expirados podem ser assumidos por outra instância;
- publicação duplicada é aceita no contrato at-least-once;
- shutdown interrompe novos polls e aguarda o trabalho corrente.

### 4.5 Observabilidade

- logs estruturados em JSON;
- identificadores de correlação, mensagem, transação, Wallet e provider;
- ausência de payload financeiro completo nos logs;
- métricas de status, duplicidade, retry, DLQ, lock, lag, latência e reconciliação;
- liveness e readiness separados.

## 5. Invariantes centrais

1. O saldo da Wallet nunca é negativo.
2. Toda alteração de saldo tem exatamente um lançamento correspondente no ledger.
3. `LOSS` e transações rejeitadas não alteram saldo nem geram ledger.
4. Um lançamento do ledger não pode ser atualizado ou removido.
5. A mesma operação lógica não pode causar mais de um efeito financeiro.
6. O replay retorna o resultado original, não o saldo atual.
7. A mesma referência não pode ser revertida duas vezes pelo mesmo tipo.
8. Nenhum evento financeiro é publicado antes do commit.
9. `wallet.balance` deve ser igual ao saldo reconstruído pelo ledger.
10. As garantias permanecem válidas com múltiplas instâncias.

## 6. Códigos estáveis de falha

| Código                                  | Classificação     |
| --------------------------------------- | ----------------- |
| `INSUFFICIENT_FUNDS`                    | regra de saldo    |
| `REVERSAL_WOULD_CAUSE_NEGATIVE_BALANCE` | regra de reversão |
| `REFERENCE_NOT_FOUND`                   | referência        |
| `INVALID_REFERENCE_TYPE`                | referência        |
| `REFERENCE_SCOPE_MISMATCH`              | referência        |
| `REFERENCE_AMOUNT_MISMATCH`             | referência        |
| `REFERENCE_ALREADY_REVERSED`            | referência        |
| `REFERENCE_NOT_PROCESSED`               | referência        |
| `CURRENCY_MISMATCH`                     | escopo monetário  |
| `WALLET_NOT_FOUND`                      | Wallet            |
| `WALLET_SCOPE_MISMATCH`                 | Wallet/player     |
| `PERMANENT_INFRASTRUCTURE_FAILURE`      | infraestrutura    |

## 7. Critérios de aceitação e evidências

| Critério do desafio                 | Evidência na solução                                              |
| ----------------------------------- | ----------------------------------------------------------------- |
| duas apostas de 80 contra saldo 100 | teste concorrente: um sucesso, uma rejeição, saldo 20 e um débito |
| mesma aposta 50 vezes               | teste paralelo com um único débito                                |
| wallets distintas em paralelo       | teste de paralelismo sem lock global                              |
| três ou mais instâncias             | três contextos Nest independentes e PostgreSQL compartilhado      |
| worker morto após commit            | Inbox/Outbox persistentes e teste de recuperação                  |
| dois publishers concorrentes        | claim/lease e teste no PostgreSQL/LocalStack                      |
| reversão antes da referência        | `PENDING_REFERENCE` e teste E2E                                   |
| restart com consistência final      | teste de restart e reconciliação                                  |
| PostgreSQL e SQS reais              | suíte E2E usa containers do Compose                               |

## 8. Matriz de rastreabilidade

| Área              | Domínio/aplicação           | Persistência/infraestrutura | Testes                 |
| ----------------- | --------------------------- | --------------------------- | ---------------------- |
| dinheiro          | `Money`                     | `numeric(20,2)`             | Money e moeda          |
| saldo             | `Wallet`                    | versão e checks             | Wallet e hot wallet    |
| auditoria         | `WalletLedgerEntry`         | trigger e constraints       | ledger e reconciliação |
| idempotência HTTP | caso de uso e hash canônico | unique indexes              | replay e corrida       |
| idempotência SQS  | `InboxMessage`              | Inbox persistente           | redelivery             |
| eventos           | Integration Events          | Outbox e SQS FIFO           | publisher e restart    |
| referências       | `WagerTransaction`          | lease e próxima tentativa   | fora de ordem          |
| operação          | métricas e health           | PostgreSQL e LocalStack     | HTTP e E2E             |

## 9. Decisões de escopo

Autenticação não foi implementada, conforme permitido pelo desafio. Um `NoopAuthGuard` marca o ponto de extensão para OIDC.

Ficam fora apenas diferenciais opcionais:

- ledger de partidas dobradas;
- OpenTelemetry e dashboard;
- teste de carga com processos separados.

## 10. Critério final

A entrega é aceita quando as migrations sobem, os serviços ficam prontos, as suítes unitária e E2E passam e a invariante abaixo permanece verdadeira após operações, duplicidades, concorrência e restart:

```text
wallet.balance == saldo reconstruído pelo ledger
```
