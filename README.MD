# Jungle Gaming Backend Challenge

Implementação em andamento de um serviço financeiro distribuído para processar transações de apostas originadas por múltiplos provedores de jogos.

O projeto prioriza correção financeira, consistência entre saldo e ledger, idempotência persistente, concorrência e recuperação segura de falhas em um ambiente com entrega de mensagens *at-least-once*.

## Escopo do desafio

O fluxo financeiro previsto contempla:

```text
BET → WIN | LOSS | REFUND | ROLLBACK
```

O sistema deve permanecer correto diante de:

- mensagens duplicadas;
- mensagens recebidas fora de ordem;
- operações simultâneas sobre a mesma wallet;
- falhas entre a persistência no banco e a publicação de eventos;
- reprocessamento após falhas temporárias.

Autenticação não faz parte do núcleo avaliado e não está sendo implementada neste momento.

## Stack

- NestJS;
- TypeScript em modo estrito;
- Bun;
- PostgreSQL;
- MikroORM;
- `decimal.js`;
- Vitest;
- Docker Compose.

A integração com SQS por meio de LocalStack ou alternativa compatível será adicionada no bloco de mensageria.

## Decisões principais

- `Wallet` é o Aggregate Root responsável pelas invariantes de saldo, moeda e versão.
- Valores monetários são representados pelo Value Object imutável `Money`, criado a partir de uma `string` decimal e calculado com `decimal.js`.
- Valores financeiros não são representados por `number`, `float` ou `double`.
- Toda alteração de saldo produz um `WalletLedgerEntry` imutável.
- PostgreSQL é a fonte de verdade para o saldo e o ledger.
- Wallet e lançamento do ledger compartilham uma fronteira transacional por meio de Unit of Work.
- O controle de concorrência utiliza atualização otimista condicionada pela versão da wallet.
- Constraints do banco reforçam saldo não negativo, versão válida, valor positivo e consistência matemática do ledger.

As justificativas e os trade-offs estão registrados em [docs/architecture-decisions.md](docs/architecture-decisions.md).

## Pré-requisitos

Antes de executar o projeto, tenha instalado:

- Bun 1.x;
- Docker;
- Docker Compose.

## Configuração

Instale as dependências:

```bash
bun install
```

Crie o arquivo `.env` com base no `.env.example`:

```env
APP_PORT=3000

DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_NAME=jungle_gaming
DATABASE_USER=postgres
DATABASE_PASSWORD=postgres
```

O `.env` não deve ser versionado.

## Infraestrutura local

Suba o PostgreSQL:

```bash
docker compose up -d
```

Verifique se o container está em execução:

```bash
docker compose ps
```

## Migrations

Com o PostgreSQL em execução, aplique as migrations:

```bash
bunx mikro-orm migration:up
```

Consulte o estado das migrations:

```bash
bunx mikro-orm migration:list
```

As migrations são versionadas, reversíveis e executadas de forma transacional.

## Executando a aplicação

Modo de desenvolvimento:

```bash
bun run start:dev
```

A aplicação ficará disponível em:

```text
http://localhost:3000
```

## Health check

```http
GET /health
```

Resposta esperada:

```json
{
  "status": "ok"
}
```

## Testes

Execute os testes unitários:

```bash
bun test
```

Execute em modo watch:

```bash
bun run test:watch
```

Execute com cobertura:

```bash
bun run test:cov
```

Execute os testes e2e e de integração:

```bash
bun run test:e2e
```

Os testes de persistência utilizam o PostgreSQL real. Para executá-los, mantenha o container ativo e aplique as migrations previamente.

O bloco atual possui testes de integração que comprovam:

- commit conjunto da wallet e do lançamento no ledger;
- rollback SQL conjunto após os `INSERTs` chegarem ao PostgreSQL;
- persistência sem `flush()` isolado nos repositórios.

## Qualidade e build

Execute o lint:

```bash
bun run lint
```

Gere o build:

```bash
bun run build
```

## Requisitos funcionais acompanhados

| Requisito | Estado atual |
| --- | --- |
| Dinheiro com precisão decimal e sem `number` | Implementado no domínio |
| Wallet com saldo não negativo, moeda e versão | Implementado no domínio e na persistência |
| Ledger imutável para cada alteração de saldo | Implementado no domínio e na persistência |
| Atomicidade entre wallet e ledger | Implementada e validada por integração |
| Wallet única por `playerId + currency` | Pendente de conclusão na persistência |
| Saldo inicial positivo com `OPENING` + `CREDIT` na mesma transação | Pendente |
| `POST /wallets` | Pendente |
| `GET /wallets/:walletId` | Pendente |
| `GET /wallets/:walletId/ledger` com cursor opaco e estável | Pendente |
| Consulta de transações por identificador e provedor | Pendente |
| `POST /wagering/transactions` | Pendente |
| `Idempotency-Key`, JSON canônico e `payloadHash` | Domínio iniciado; persistência pendente |
| Referências ausentes com estado `PENDING_REFERENCE` | Pendente |
| Concorrência otimista por versão | Atualização condicional implementada; teste concorrente real pendente |
| Inbox e transactional outbox | Pendente |
| SQS, retry, DLQ e recuperação após crash | Pendente |
| Reconciliação entre saldo armazenado e ledger | Pendente |

O cenário concorrente obrigatório — saldo inicial de `100 BRL`, duas apostas simultâneas de `80 BRL`, apenas uma processada, uma rejeitada, saldo final de `20 BRL` e exatamente um débito no ledger — será usado como critério de validação do próximo bloco de concorrência.

## Documentação

- [Levantamento de requisitos](docs/requirements.md)
- [Plano de implementação](docs/implementation-plan.md)
- [Decisões arquiteturais](docs/architecture-decisions.md)

## Estado atual

O domínio de wallet e ledger, seus mapeamentos para o MikroORM, a migration inicial, os repositórios e a fronteira transacional já estão implementados.

O próximo passo é conectar essa persistência aos casos de uso financeiros e validar deterministicamente a concorrência real no PostgreSQL. Depois serão implementados idempotência persistente, inbox/outbox, mensageria e reconciliação.
