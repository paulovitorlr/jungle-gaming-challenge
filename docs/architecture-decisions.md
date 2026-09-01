# Decisões Arquiteturais

Este documento registra as principais decisões arquiteturais tomadas durante o desafio.

O objetivo não é prever todo o design final antecipadamente, mas tornar escolhas técnicas importantes explícitas, revisáveis e defensáveis.

---

## ADR-001 — Arquitetura Orientada ao Domínio

### Status

Aceita.

### Contexto

A principal complexidade do desafio está nas regras financeiras, consistência, idempotência, concorrência e processamento assíncrono.

Organizar o projeto principalmente em torno de conceitos do framework, como controllers, services e modelos de ORM, dificultaria o isolamento e o raciocínio sobre essas regras.

### Decisão

O sistema utilizará uma arquitetura orientada ao domínio, inspirada em Domain-Driven Design.

As responsabilidades serão separadas em conceitos próximos de:

- Domain;
- Application;
- Infrastructure;
- Presentation.

A estrutura exata de pastas poderá evoluir conforme fronteiras reais forem identificadas.

### Consequências

Benefícios:

- regras de domínio independentes do NestJS;
- lógica de negócio testável sem infraestrutura;
- persistência e mensageria tratadas como detalhes de implementação;
- invariantes mais fáceis de localizar e defender.

Trade-offs:

- maior quantidade de abstrações explícitas;
- custo inicial de design um pouco maior;
- necessidade de evitar camadas e interfaces sem responsabilidade real.

---

## ADR-002 — Arquitetura Orientada a Eventos

### Status

Aceita em princípio.

### Contexto

O desafio exige processamento assíncrono e comunicação baseada em filas.

O estado financeiro precisa continuar correto mesmo com mensagens duplicadas, atrasadas, reenviadas ou temporariamente indisponíveis.

### Decisão

Fluxos assíncronos serão modelados por eventos ou mensagens explícitos.

Será utilizada infraestrutura compatível com SQS como mecanismo de transporte.

O comportamento orientado a eventos será introduzido somente após o fluxo financeiro síncrono subjacente estar correto.

### Consequências

Consumidores devem ser idempotentes.

A entrega de mensagens não será tratada como exatamente uma vez.

Retry e tratamento de falhas precisarão ser projetados explicitamente.

---

## ADR-003 — PostgreSQL como Fonte de Verdade

### Status

Aceita.

### Contexto

Correção financeira exige transações fortes, constraints, índices e mecanismos de controle de concorrência.

### Decisão

PostgreSQL será a fonte durável principal de verdade para o estado financeiro.

### Consequências

Garantias importantes devem ser reforçadas tanto pela aplicação quanto pelo banco quando apropriado.

Transações de banco definirão fronteiras atômicas para alterações financeiras relacionadas.

---

## ADR-004 — Uso do MikroORM

### Status

Aceita.

### Contexto

O desafio recomenda MikroORM, e o projeto precisa integrar PostgreSQL sem comprometer a arquitetura orientada ao domínio.

### Decisão

MikroORM será utilizado como camada de ORM/data mapper.

Sua configuração será introduzida quando existir a primeira entidade persistente real, evitando criar entidades artificiais apenas para satisfazer o framework durante o bootstrap.

### Consequências

Mapeamentos de persistência não devem redefinir regras de domínio.

Migrations deverão permanecer explícitas, versionadas e reversíveis.

---

## ADR-005 — Representação de Dinheiro

### Status

Pendente da implementação final do domínio.

### Contexto

Números de ponto flutuante nativos do JavaScript não são adequados para operações financeiras em que determinismo e precisão são necessários.

### Direção Pretendida

Valores financeiros não utilizarão aritmética binária de ponto flutuante sem controle.

As alternativas principais são:

- unidades monetárias inteiras na menor unidade;
- numeric/decimal no PostgreSQL combinado com uma representação explícita na aplicação.

A escolha final priorizará aritmética determinística e semântica clara de domínio.

---

## ADR-006 — Idempotência Persistente

### Status

Aceita em princípio.

### Contexto

Clientes e brokers podem reenviar operações.

Deduplicação apenas em memória é insuficiente porque se perde após reinicialização e não coordena múltiplas instâncias.

### Decisão

A idempotência será persistente.

Um identificador de negócio ou chave de idempotência será armazenado e protegido por constraints de unicidade no banco.

Processar a mesma operação lógica múltiplas vezes deve resultar em apenas um efeito financeiro.

### Consequências

Idempotência passa a fazer parte do modelo de persistência e da estratégia transacional, não apenas de middleware.

---

## ADR-007 — Ledger como Trilha de Auditoria Financeira

### Status

Aceita em princípio.

### Contexto

Um saldo mutável isolado não explica como o estado financeiro atual foi alcançado.

### Decisão

Toda alteração relevante de saldo deverá produzir um lançamento imutável correspondente no ledger.

Alteração de saldo e persistência do lançamento correspondente deverão compartilhar a mesma fronteira transacional.

### Consequências

O ledger passa a ser um mecanismo central de auditabilidade e verificação de consistência.

Histórico financeiro concluído não deve ser apagado ou silenciosamente reescrito.

---

## ADR-008 — Estratégia de Concorrência

### Status

Pendente de testes de implementação.

### Contexto

Duas ou mais requisições podem tentar alterar o mesmo saldo simultaneamente.

Uma abordagem simples de leitura, modificação e escrita sem coordenação com o banco pode gerar lost updates ou estados inválidos.

### Decisão

O mecanismo final de concorrência será escolhido após a implementação do fluxo de persistência e validado por testes de integração determinísticos.

Estratégias candidatas:

- pessimistic locking;
- optimistic concurrency com versionamento;
- updates condicionais e atômicos no banco.

### Critérios de Escolha

A estratégia escolhida deve:

- proteger invariantes financeiras;
- se comportar de forma previsível sob contenção;
- permanecer compreensível;
- ser testável;
- evitar distributed locking desnecessário.

---

## ADR-009 — Transactional Outbox

### Status

Candidata.

### Contexto

Uma transação de banco e a publicação de uma mensagem normalmente não participam da mesma transação atômica.

Publicar diretamente após o commit cria uma janela de falha na qual o estado foi persistido, mas o evento pode nunca ser enviado.

### Direção Pretendida

Para eventos cuja entrega seja necessária após uma operação financeira bem-sucedida, será considerada a estratégia de transactional outbox.

O estado de negócio e o registro da outbox seriam persistidos na mesma transação PostgreSQL, enquanto um processo separado publicaria mensagens pendentes.

### Consequências

A estratégia adiciona complexidade de persistência e processamento em background, mas elimina uma falha crítica de dual write.

A decisão final será registrada após a implementação do fluxo transacional principal.
