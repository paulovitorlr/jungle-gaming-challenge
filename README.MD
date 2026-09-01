# Jungle Gaming Backend Challenge

Backend desenvolvido para o desafio técnico da Jungle Gaming.

## Stack

* NestJS
* TypeScript
* Bun
* PostgreSQL
* MikroORM
* Vitest
* Docker Compose

## Pré-requisitos

Antes de executar o projeto, tenha instalado:

* Bun
* Docker
* Docker Compose

## Configuração

Clone o repositório e instale as dependências:

```bash
bun install
```

Crie o arquivo `.env` com base no `.env.example`.

## Infraestrutura local

Suba os serviços locais:

```bash
docker compose up -d
```

Verifique se os containers estão em execução:

```bash
docker compose ps
```

## Executando a aplicação

Modo de desenvolvimento:

```bash
bun run start:dev
```

A aplicação ficará disponível em:

```text
http://localhost:3000
```

## Health Check

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

Executar os testes:

```bash
bun test
```

Executar em modo watch:

```bash
bun run test:watch
```

Executar com cobertura:

```bash
bun run test:cov
```

## Build

```bash
bun run build
```

## Status

O projeto está atualmente na fase inicial de bootstrap e definição arquitetural.

As decisões relacionadas a domínio, consistência financeira, concorrência, idempotência, persistência e arquitetura orientada a eventos serão documentadas conforme a implementação evoluir.
