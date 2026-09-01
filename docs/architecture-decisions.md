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

- consumidores devem ser idempotentes;
- a entrega de mensagens não será tratada como exatamente uma vez;
- retry e tratamento de falhas precisarão ser projetados explicitamente.

---

## ADR-003 — PostgreSQL como Fonte de Verdade

### Status

Aceita.

### Contexto

Correção financeira exige transações fortes, constraints, índices e mecanismos de controle de concorrência.

### Decisão

PostgreSQL será a fonte durável principal de verdade para o estado financeiro.

### Consequências

- garantias importantes devem ser reforçadas tanto pela aplicação quanto pelo banco quando apropriado;
- transações de banco definirão fronteiras atômicas para alterações financeiras relacionadas.

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

- mapeamentos de persistência não devem redefinir regras de domínio;
- migrations deverão permanecer explícitas, versionadas e reversíveis;
- entidades de domínio não devem depender do MikroORM para expressar suas invariantes.

---

## ADR-005 — Representação de Dinheiro

### Status

Aceita e implementada no domínio.

### Contexto

Números de ponto flutuante nativos do JavaScript não são adequados para operações financeiras em que determinismo e precisão são necessários.

O desafio também estabelece que valores monetários não devem ser representados com `number`, `float` ou `double`.

### Decisão

Valores monetários serão representados pelo Value Object `Money`.

A API de criação recebe o valor como `string` decimal, e a aritmética interna utiliza `decimal.js`.

Exemplo:

```ts
Money.from({
  amount: '25.00',
  currency: 'BRL',
});
```

O `Money` é responsável por:

- validar o formato decimal recebido;
- rejeitar notação científica;
- rejeitar valores com mais de duas casas decimais;
- manter a moeda associada ao valor;
- impedir operações entre moedas diferentes;
- realizar soma, subtração e negação sem aritmética binária de ponto flutuante;
- permanecer imutável durante as operações.

### Consequências

Benefícios:

- precisão decimal explícita;
- regras monetárias centralizadas;
- redução do risco de erros decorrentes de ponto flutuante;
- operações financeiras mais fáceis de testar e revisar.

Trade-offs:

- conversões entre banco, domínio e contratos HTTP precisam ser explícitas;
- valores monetários não devem escapar do domínio como `number`.

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

A idempotência passa a fazer parte do modelo de persistência e da estratégia transacional, não apenas de middleware.

---

## ADR-007 — Ledger como Trilha de Auditoria Financeira

### Status

Aceita e parcialmente implementada no domínio.

### Contexto

Um saldo mutável isolado não explica como o estado financeiro atual foi alcançado.

Além disso, alterar o saldo sem produzir um registro correspondente permitiria divergência entre o estado atual da carteira e seu histórico financeiro.

### Decisão

Toda alteração relevante de saldo deverá produzir um lançamento imutável correspondente no ledger.

No domínio, créditos e débitos da `Wallet` produzem um `WalletLedgerEntry`.

Exemplo conceitual:

```text
Wallet.credit(100.00)
        |
        |-- balance: 0.00 -> 100.00
        |
        `-- WalletLedgerEntry
                type: credit
                amount: 100.00
```

A invariante adotada é:

> Toda alteração de saldo deve possuir um lançamento correspondente no ledger.

A alteração da `Wallet` e a persistência do `WalletLedgerEntry` deverão compartilhar a mesma fronteira transacional no PostgreSQL.

### Consequências

- o ledger passa a ser um mecanismo central de auditabilidade;
- histórico financeiro concluído não deve ser apagado ou silenciosamente reescrito;
- a camada de aplicação deverá persistir carteira e lançamento de forma atômica;
- a infraestrutura não poderá tratar atualização de saldo e criação do ledger como duas operações independentes.

---

## ADR-008 — Estratégia de Concorrência

### Status

Aceita em princípio; persistência e testes de integração ainda pendentes.

### Contexto

Duas ou mais requisições podem tentar alterar o mesmo saldo simultaneamente.

Uma abordagem simples de leitura, modificação e escrita sem coordenação com o banco pode gerar `lost update` ou estados inválidos.

### Decisão

A estratégia principal será optimistic concurrency baseada em versionamento da `Wallet`.

Cada carteira possui um campo `version`:

- inicia em `1`;
- é incrementado somente quando o saldo é alterado com sucesso;
- não é incrementado quando uma operação é rejeitada.

Fluxo esperado:

```text
Processo A lê Wallet version 5
Processo B lê Wallet version 5

Processo A persiste a alteração -> version 6
Processo B tenta persistir esperando version 5 -> conflito
```

A camada de persistência deverá realizar atualização condicionada à versão esperada.

A implementação final será validada com testes de integração determinísticos envolvendo concorrência real contra PostgreSQL.

### Critérios de Validação

A estratégia deve:

- proteger invariantes financeiras;
- impedir `lost update`;
- se comportar de forma previsível sob contenção;
- permanecer compreensível;
- ser testável;
- evitar distributed locking desnecessário.

### Consequências

Benefícios:

- ausência de lock distribuído no domínio;
- conflitos concorrentes tornam-se explícitos;
- a estratégia combina bem com o modelo de versão já existente na `Wallet`.

Trade-offs:

- conflitos precisarão ser tratados pela camada de aplicação;
- sob alta contenção, algumas operações poderão precisar ser repetidas;
- a garantia depende de atualização condicional correta no banco.

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

---

## ADR-010 — Wallet como Aggregate Root

### Status

Aceita e implementada no domínio.

### Contexto

As principais invariantes financeiras estão relacionadas ao estado da carteira.

Permitir que saldo, moeda, versionamento e criação de lançamentos fossem alterados diretamente por services, controllers ou repositórios espalharia regras críticas pelo sistema e facilitaria a criação de estados inválidos.

### Decisão

A `Wallet` será o Aggregate Root do contexto financeiro da carteira.

Ela é responsável por manter:

- `WalletId`;
- `playerId`;
- `currency`;
- `balance`;
- `version`;
- `createdAt`;
- `updatedAt`.

A `Wallet` protege as seguintes invariantes:

- a moeda da operação deve ser a mesma moeda da carteira;
- créditos e débitos devem possuir valor maior que zero;
- o saldo não pode ficar negativo;
- alterações de saldo incrementam a versão;
- operações rejeitadas não alteram a versão;
- alterações de saldo produzem um `WalletLedgerEntry`.

Novas carteiras são criadas por:

```ts
Wallet.open(playerId, currency);
```

Entidades previamente persistidas são reconstruídas por:

```ts
Wallet.rehydrate(props);
```

`open()` representa uma transição real de domínio e aplica regras de criação.

`rehydrate()` apenas recompõe um estado previamente persistido e evita tratar leitura do banco como uma nova operação de negócio.

### Consequências

Benefícios:

- invariantes financeiras ficam concentradas em um único ponto;
- controllers e use cases não precisam conhecer detalhes internos do saldo;
- o domínio continua independente de NestJS, PostgreSQL e MikroORM;
- testes unitários conseguem validar as regras sem infraestrutura.

Trade-offs:

- alterações financeiras legítimas precisam passar pela `Wallet`;
- a camada de persistência deverá respeitar o estado e o versionamento definidos pelo Aggregate Root;
- atomicidade entre `Wallet` e ledger ainda depende da fronteira transacional que será implementada na infraestrutura.

---

## Estado atual das decisões

As decisões deste documento possuem níveis diferentes de maturidade.

Atualmente:

- `Money`, `WalletId`, `WalletLedgerEntry` e `Wallet` já existem no domínio e possuem testes unitários;
- representação monetária com `decimal.js` já está definida;
- `Wallet` já utiliza versionamento de domínio;
- saldo e ledger já são relacionados pelas operações de crédito e débito;
- persistência transacional, optimistic locking no PostgreSQL, idempotência persistente, mensageria e outbox ainda serão validados durante as próximas etapas.

O documento deverá ser atualizado sempre que uma decisão inicialmente marcada como candidata ou aceita em princípio for confirmada, alterada ou descartada pela implementação.
