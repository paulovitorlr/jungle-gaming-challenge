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

Será utilizada infraestrutura compatível com SQS como mecanismo de transporte, executada localmente por LocalStack, MiniStack ou alternativa compatível.

O sistema assumirá entrega *at-least-once*. Duplicidade, reenvio e processamento após falha serão tratados como condições normais, não excepcionais.

O comportamento orientado a eventos será introduzido somente após o fluxo financeiro síncrono subjacente estar correto.

### Consequências

- consumidores devem ser idempotentes;
- a entrega de mensagens não será tratada como exatamente uma vez;
- retry, DLQ e recuperação após crash precisarão ser projetados explicitamente;
- a ordem global de mensagens não será usada como garantia de consistência financeira.

---

## ADR-003 — PostgreSQL como Fonte de Verdade

### Status

Aceita e implementada no recorte de wallet e ledger.

### Contexto

Correção financeira exige transações fortes, constraints, índices e mecanismos de controle de concorrência.

### Decisão

PostgreSQL será a fonte durável principal de verdade para o estado financeiro.

No recorte já implementado, o banco armazena `Wallet` e `WalletLedgerEntry` por meio de migrations versionadas e reversíveis. As tabelas possuem foreign key, índices, unicidade e `CHECK constraints` para reforçar as invariantes que não podem depender somente do código da aplicação.

### Consequências

- garantias importantes devem ser reforçadas tanto pela aplicação quanto pelo banco quando apropriado;
- transações de banco definirão fronteiras atômicas para alterações financeiras relacionadas;
- o schema rejeita saldo negativo, versão inválida, lançamento com valor não positivo e lançamento incompatível com os saldos anterior e posterior;
- a foreign key impede que um lançamento do ledger exista sem uma wallet correspondente.

---

## ADR-004 — Uso do MikroORM

### Status

Aceita e implementada no primeiro recorte persistente.

### Contexto

O desafio recomenda MikroORM, e o projeto precisa integrar PostgreSQL sem comprometer a arquitetura orientada ao domínio.

### Decisão

MikroORM será utilizado como camada de ORM/data mapper.

As entidades de persistência são separadas das entidades de domínio. `WalletMapper` e `WalletLedgerMapper` realizam as conversões explicitamente, inclusive entre colunas `numeric(20, 2)` e o Value Object `Money`.

A configuração utiliza integração com NestJS, PostgreSQL, descoberta explícita das entidades e suporte a migrations pela CLI.

### Consequências

- mapeamentos de persistência não devem redefinir regras de domínio;
- migrations deverão permanecer explícitas, versionadas e reversíveis;
- entidades de domínio não devem depender do MikroORM para expressar suas invariantes;
- repositórios não executam `flush()` isoladamente quando participam de uma operação financeira composta;
- testes de integração usam o PostgreSQL real para validar o comportamento transacional.

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

Aceita.

### Contexto

Clientes e brokers podem reenviar operações.

Deduplicação apenas em memória é insuficiente porque se perde após reinicialização e não coordena múltiplas instâncias.

### Decisão

A idempotência será persistente.

O endpoint de transações exigirá o header `Idempotency-Key`. A requisição será normalizada para JSON canônico e terá um `payloadHash` persistido.

A `idempotencyKey` será persistida e protegida por constraint de unicidade no banco. Os identificadores do provedor e da transação externa também serão preservados para rastreabilidade e resolução de referências.

Processar a mesma operação lógica múltiplas vezes deve resultar em apenas um efeito financeiro.

O replay com a mesma chave e o mesmo payload deverá retornar o resultado anteriormente persistido. Reutilizar a chave com payload diferente deverá produzir conflito, sem novo efeito financeiro.

O resultado observado no primeiro processamento, incluindo o saldo resultante, é persistido junto à `WagerTransaction` para permitir replays determinísticos sem consultar o saldo atual da wallet.

### Consequências

- a idempotência passa a fazer parte do modelo de persistência e da estratégia transacional, não apenas de middleware;

- o primeiro processamento precisa persistir dados suficientes para reproduzir a resposta original;

- constraints de unicidade no PostgreSQL serão a garantia final contra duplicidade entre múltiplas instâncias;

- replays não causam novo débito, crédito ou lançamento no ledger.

---

## ADR-007 — Ledger como Trilha de Auditoria Financeira

### Status

Aceita e implementada no domínio e na persistência da wallet.

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

A alteração da `Wallet` e a persistência do `WalletLedgerEntry` compartilham a mesma fronteira transacional no PostgreSQL por meio de uma Unit of Work.

O schema reforça a consistência do ledger com:

- foreign key de `wallet_ledger_entries.wallet_id` para `wallets.id`;
- unicidade de `walletId + transactionId`;
- valor do lançamento obrigatoriamente maior que zero;
- saldos anterior e posterior não negativos;
- `CHECK` matemático para `CREDIT` e `DEBIT`;
- índice por `walletId + createdAt + id`, preparado para paginação estável.

### Consequências

- o ledger passa a ser um mecanismo central de auditabilidade;
- histórico financeiro concluído não deve ser apagado ou silenciosamente reescrito;
- a camada de aplicação deve executar carteira e lançamento dentro da Unit of Work;
- a infraestrutura não trata atualização de saldo e criação do ledger como commits independentes;
- testes de integração comprovam commit conjunto e rollback SQL conjunto.

---

## ADR-008 — Estratégia de Concorrência

### Status

Aceita e parcialmente implementada; teste concorrente determinístico ainda pendente.

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

A camada de persistência realiza atualização condicionada à versão esperada:

```sql
UPDATE wallets
SET balance = :balance,
    version = :nextVersion,
    updated_at = :updatedAt
WHERE id = :walletId
  AND version = :expectedVersion;
```

Uma linha afetada representa sucesso. Zero linhas afetadas representam conflito concorrente.

O repositório e os dois resultados possíveis da atualização condicional já possuem testes unitários. A implementação final ainda será validada com teste de integração determinístico envolvendo concorrência real contra PostgreSQL.

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
- a garantia depende de atualização condicional correta no banco;
- a estratégia só será considerada concluída após validar o cenário obrigatório de duas apostas simultâneas sobre a mesma wallet.

---

## ADR-009 — Transactional Outbox

### Status

Aceita em princípio; implementação pendente.

### Contexto

Uma transação de banco e a publicação de uma mensagem normalmente não participam da mesma transação atômica.

Publicar diretamente após o commit cria uma janela de falha na qual o estado foi persistido, mas o evento pode nunca ser enviado.

### Direção Pretendida

Para eventos cuja entrega seja necessária após uma operação financeira bem-sucedida, será adotada a estratégia de transactional outbox.

O estado de negócio e o registro da outbox serão persistidos na mesma transação PostgreSQL, enquanto um processo separado publicará mensagens pendentes no SQS.

### Consequências

- a estratégia adiciona complexidade de persistência e processamento em background;
- o banco e o broker não precisam participar de uma transação distribuída;
- falhas de publicação não perdem o evento, que permanece pendente na outbox;
- o publicador precisará de retry, marcação de entrega e recuperação após crash.

A decisão será atualizada com detalhes operacionais após a implementação do publicador.

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
- a camada de persistência deve respeitar o estado e o versionamento definidos pelo Aggregate Root;
- casos de uso financeiros precisam ser executados dentro da Unit of Work para preservar a atomicidade já oferecida pela infraestrutura.

---

## ADR-011 — Unit of Work como Fronteira Transacional

### Status

Aceita e implementada no recorte de wallet e ledger.

### Contexto

Persistir a wallet e o lançamento do ledger em operações independentes permitiria saldo sem histórico ou histórico sem saldo.

O mesmo problema será ampliado quando inbox, transação financeira e outbox precisarem participar da mesma operação SQL.

### Decisão

A aplicação utilizará uma abstração `UnitOfWork` para delimitar operações atômicas.

```ts
unitOfWork.execute(async () => {
  const updated = await walletRepository.update(
    wallet,
    expectedVersion,
  );

  if (!updated) {
    throw new Error('Wallet version conflict');
  }

  await walletLedgerRepository.add(entry);
});
```

A implementação `MikroOrmUnitOfWork` utiliza `EntityManager.transactional()`.

Os repositórios registram entidades ou executam comandos dentro do contexto transacional, mas não fazem `flush()` isolado para concluir parcialmente uma operação composta. O commit ocorre apenas quando o callback termina com sucesso; exceções provocam rollback.

### Validação

Testes de integração contra PostgreSQL real comprovam:

- commit conjunto de wallet e ledger;
- rollback conjunto após os `INSERTs` terem sido enviados ao banco;
- ausência de `flush()` isolado nos repositórios.

### Consequências

Benefícios:

- fronteira transacional explícita para os casos de uso;
- infraestrutura reutilizável pelos futuros fluxos de inbox e outbox;
- falhas não deixam efeitos financeiros parcialmente persistidos.

Trade-offs:

- casos de uso precisam respeitar a fronteira da Unit of Work;
- operações externas, como publicação em SQS, não devem ocorrer dentro da transação SQL;
- a entrega de mensagens continuará exigindo transactional outbox.

---

## ADR-012 — Inbox Persistente para Consumo At-Least-Once

### Status

Aceita em princípio; implementação pendente.

### Contexto

O broker pode entregar a mesma mensagem mais de uma vez, reenviá-la após timeout ou entregá-la fora da ordem de negócio esperada.

Deduplicar apenas em memória não funciona após reinicialização e não coordena múltiplas instâncias do consumidor.

### Decisão

Mensagens consumidas serão registradas em uma inbox persistente antes de serem consideradas processadas.

Inbox, transação financeira, wallet, ledger e outbox participarão da mesma transação SQL quando fizerem parte da mesma operação.

Mensagens com referência de negócio ainda inexistente não serão descartadas. A transação ficará em estado `PENDING_REFERENCE` até que possa ser reprocessada de maneira segura.

### Consequências

- duplicidades serão reconhecidas por dados persistidos;
- ACK ao broker só deverá ocorrer após commit bem-sucedido;
- falhas temporárias poderão usar retry com política explícita;
- falhas não recuperáveis deverão ser encaminhadas para DLQ;
- o consumidor precisará recuperar registros incompletos após crash.

---

## ADR-013 — Reconciliação entre Wallet e Ledger

### Status

Aceita em princípio; implementação pendente.

### Contexto

Mesmo com invariantes de domínio, constraints e transações, o sistema precisa detectar divergências causadas por bugs, alterações operacionais indevidas ou falhas futuras de implementação.

### Decisão

Será implementado um processo de reconciliação que reconstrói o saldo a partir dos lançamentos do ledger e compara o resultado com `wallet.balance`.

```text
saldo reconstruído = soma(CREDIT) - soma(DEBIT)
```

A invariante verificada será:

```text
wallet.balance == saldo reconstruído pelo ledger
```

Divergências deverão ser reportadas de forma explícita. A reconciliação não corrigirá silenciosamente dados financeiros.

### Consequências

- o ledger precisa permanecer imutável e consultável;
- a consulta deve produzir resultado determinístico;
- divergências tornam-se observáveis e auditáveis;
- qualquer estratégia de correção exigirá decisão operacional separada.

---

## Estado atual das decisões

As decisões deste documento possuem níveis diferentes de maturidade.

Atualmente:

- `Money`, `WalletId`, `WalletLedgerEntry` e `Wallet` já existem no domínio e possuem testes unitários;
- representação monetária com `decimal.js` já está definida;
- `Wallet` já utiliza versionamento de domínio;
- saldo e ledger já são relacionados pelas operações de crédito e débito;
- `Wallet` e `WalletLedgerEntry` possuem modelos e mappers de persistência separados do domínio;
- PostgreSQL e MikroORM estão configurados com migration inicial versionada;
- constraints do banco reforçam as principais invariantes de wallet e ledger;
- Unit of Work, commit conjunto e rollback SQL conjunto foram validados por testes de integração;
- a atualização otimista condicionada por versão está implementada no repositório e coberta por testes unitários;
- ainda falta ligar a persistência aos casos de uso financeiros;
- o teste concorrente real obrigatório ainda está pendente;
- unicidade de wallet por `playerId + currency` e abertura com saldo inicial positivo, `OPENING` e `CREDIT` ainda precisam ser concluídas;
- endpoints HTTP, cursor opaco do ledger e consultas de transação ainda estão pendentes;
- idempotência persistente com `Idempotency-Key` e `payloadHash`, referências `PENDING_REFERENCE`, inbox, outbox, SQS, retry, DLQ, crash recovery e reconciliação ainda serão implementados.

O documento deverá ser atualizado sempre que uma decisão inicialmente marcada como candidata ou aceita em princípio for confirmada, alterada ou descartada pela implementação.
