# Plano de Implementação

## 1. Objetivo

A implementação será desenvolvida de forma incremental, introduzindo complexidade apenas quando ela for necessária para resolver um problema real.

A prioridade será garantir correção primeiro e só depois adicionar infraestrutura ao redor de um domínio estável, em vez de desenhar o sistema a partir de controllers, entidades de ORM ou APIs de mensageria.

## 2. Fase 1 — Bootstrap e Infraestrutura Local

Estabelecer uma base mínima executável:

- NestJS com TypeScript;
- Bun como runtime e package manager;
- Vitest;
- configuração por variáveis de ambiente;
- PostgreSQL via Docker Compose;
- endpoint de health check;
- dependências do MikroORM;
- documentação inicial do projeto.

Critério de saída:

- aplicação builda;
- testes executam;
- PostgreSQL está saudável;
- endpoint de health responde;
- o projeto pode ser clonado e iniciado seguindo o README.

## 3. Fase 2 — Modelagem de Domínio

Traduzir o desafio em conceitos explícitos de domínio.

Atividades:

- identificar agregados e entidades;
- definir value objects;
- definir invariantes financeiras;
- definir erros de domínio;
- definir abstrações de repositório;
- definir domain events quando representarem fatos relevantes do negócio.

O domínio deve permanecer independente de NestJS, MikroORM, PostgreSQL e SQS.

Critério de saída:

- regras centrais de negócio estão representadas em código;
- invariantes importantes possuem testes unitários;
- testes de domínio executam sem infraestrutura.

## 4. Fase 3 — Persistência

Introduzir persistência em PostgreSQL após a modelagem principal do domínio.

Atividades:

- configurar MikroORM;
- mapear entidades persistentes;
- implementar repositórios;
- criar migrations versionadas;
- definir índices e constraints;
- estabelecer fronteiras transacionais.

Atenção especial para:

- constraints de idempotência;
- consistência do ledger;
- comportamento sob concorrência.

Critério de saída:

- migrations podem ser aplicadas e revertidas;
- repositórios atendem às necessidades da aplicação;
- garantias importantes são reforçadas pelo banco quando apropriado.

## 5. Fase 4 — Fluxo Transacional Principal

Implementar a principal operação financeira como uma vertical slice.

O caso de uso deverá coordenar:

1. validação da requisição;
2. verificação de idempotência;
3. carregamento da conta ou recurso;
4. execução das regras de domínio;
5. criação do lançamento no ledger;
6. alteração do saldo;
7. persistência dentro da mesma transação;
8. retorno do resultado da aplicação.

Critério de saída:

- operação funciona corretamente;
- requisições duplicadas são seguras;
- falhas não deixam estado financeiro parcial;
- testes de integração validam o fluxo completo.

## 6. Fase 5 — Concorrência

Validar explicitamente o comportamento quando múltiplas operações afetam o mesmo recurso financeiro.

Estratégias candidatas:

- pessimistic locking;
- optimistic concurrency/versionamento;
- updates SQL atômicos;
- constraints de banco.

A estratégia final será escolhida com base no modelo implementado e em testes determinísticos.

Critério de saída:

- débitos concorrentes não produzem saldos inválidos;
- não existem lost updates;
- não existem efeitos financeiros duplicados;
- testes automatizados reproduzem cenários concorrentes.

## 7. Fase 6 — Processamento Orientado a Eventos

Introduzir comunicação assíncrona somente depois de o fluxo financeiro síncrono estar correto.

Atividades:

- configurar infraestrutura local compatível com SQS;
- definir contratos de eventos;
- implementar produtores e consumidores;
- tornar consumidores idempotentes;
- definir comportamento de retry e erro.

Quando estado em banco e publicação de evento precisarem permanecer consistentes, será considerada uma estratégia de transactional outbox.

Critério de saída:

- eventos podem ser entregues mais de uma vez sem corromper o estado;
- falhas podem ser retomadas;
- processamento assíncrono não viola invariantes financeiras.

## 8. Fase 7 — Camada de Aplicação e HTTP

Expor as capacidades necessárias pela aplicação NestJS.

Responsabilidades dessa camada:

- validação de transporte;
- autenticação e autorização quando necessário;
- transformação de contratos HTTP em comandos/casos de uso;
- mapeamento de erros da aplicação para respostas HTTP.

Regras de negócio não devem permanecer nos controllers.

## 9. Fase 8 — Estratégia de Testes

Os testes serão organizados de acordo com o risco.

### Testes Unitários

Foco em:

- value objects;
- entidades e agregados;
- invariantes;
- domain services;
- comportamentos puros da aplicação.

### Testes de Integração

Foco em:

- repositórios PostgreSQL;
- migrations;
- fronteiras transacionais;
- idempotência;
- locking e concorrência;
- persistência de outbox e eventos.

### Testes End-to-End

Foco em poucos fluxos críticos atravessando a aplicação real via HTTP.

A prioridade será cobertura de comportamento relevante, e não apenas porcentagem de cobertura.

## 10. Fase 9 — Hardening e Documentação Final

Antes da entrega:

- revisar tratamento de erros;
- remover complexidade acidental;
- validar setup a partir de ambiente limpo;
- revisar migrations;
- validar testes de concorrência;
- consolidar decisões arquiteturais;
- atualizar README;
- documentar trade-offs e possíveis melhorias.

## 11. Princípio de Desenvolvimento

Cada etapa de implementação deve responder:

1. Qual problema este código resolve?
2. Qual requisito ou invariante ele protege?
3. Como podemos demonstrar que ele está correto?

Código não deve ser introduzido apenas porque uma convenção de framework permite.
