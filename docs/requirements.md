# Levantamento de Requisitos

## 1. Entendimento do Problema

O sistema deve processar operações financeiras relacionadas a transações de jogos de forma confiável, auditável e resistente a falhas.

A principal complexidade do desafio não está em expor endpoints CRUD, mas em garantir correção quando múltiplas requisições, retentativas, mensagens assíncronas e operações concorrentes afetam o mesmo estado financeiro.

Por isso, a implementação deve priorizar:

- consistência financeira;
- idempotência;
- controle de concorrência;
- rastreabilidade por meio de ledger;
- processamento assíncrono confiável;
- recuperação de falhas parciais;
- fronteiras de domínio bem definidas.

## 2. Requisitos Funcionais

O sistema deve suportar os principais fluxos exigidos pelo desafio, incluindo:

- receber solicitações de transações financeiras ou relacionadas a jogos;
- validar os dados de entrada;
- identificar requisições repetidas;
- aplicar alterações de saldo de forma consistente;
- registrar cada movimentação financeira em um ledger;
- publicar ou consumir eventos assíncronos quando necessário;
- disponibilizar o resultado ou status da operação para clientes ou componentes downstream.

Os contratos HTTP e detalhes exatos de cada fluxo serão refinados durante a implementação de acordo com a especificação oficial do desafio.

## 3. Requisitos Não Funcionais

### 3.1 Consistência Financeira

Uma alteração de saldo não pode existir sem o lançamento correspondente no ledger.

Da mesma forma, um lançamento no ledger que represente uma movimentação concluída deve corresponder à alteração financeira esperada.

Essa relação será tratada como uma invariante central do sistema.

### 3.2 Idempotência

A repetição da mesma operação lógica não pode produzir efeitos financeiros duplicados.

A idempotência deve ser persistente e continuar funcionando após:

- reinicialização da aplicação;
- retentativas do cliente;
- mensagens duplicadas;
- falhas de rede.

### 3.3 Segurança em Concorrência

Operações concorrentes sobre a mesma conta ou recurso financeiro não podem gerar:

- lost updates;
- saldos inválidos por condição de corrida;
- débitos ou créditos duplicados;
- divergência entre saldo e ledger.

A estratégia de concorrência deve ser explícita e validada por testes.

### 3.4 Auditabilidade

As operações financeiras devem ser rastreáveis.

O ledger deve fornecer um histórico durável das movimentações financeiras e permitir investigação de inconsistências e falhas.

### 3.5 Recuperação de Falhas

O sistema deve tolerar falhas entre operações síncronas no banco e comunicação assíncrona.

A arquitetura deve evitar situações em que uma transação no banco seja confirmada e o evento correspondente seja perdido de forma definitiva.

### 3.6 Testabilidade

Os comportamentos críticos do domínio devem ser testáveis sem depender diretamente da infraestrutura.

A suíte de testes deve priorizar:

- invariantes de domínio;
- comportamento transacional;
- idempotência;
- cenários de concorrência;
- integração com PostgreSQL;
- processamento assíncrono.

## 4. Invariantes Centrais

As seguintes invariantes devem orientar a implementação:

1. Toda alteração de saldo concluída com sucesso possui um lançamento correspondente no ledger.
2. Um lançamento financeiro concluído não pode ser aplicado mais de uma vez.
3. A mesma chave de idempotência não pode produzir múltiplos efeitos financeiros.
4. Um débito não pode deixar a conta em um estado inválido.
5. Alteração de saldo e criação do lançamento no ledger pertencentes à mesma operação devem ser persistidas atomicamente.
6. Retentativas assíncronas não podem alterar o resultado financeiro final.
7. As regras de domínio não devem depender diretamente de HTTP, PostgreSQL, SQS ou APIs específicas de framework.

## 5. Principais Riscos Técnicos

A implementação deve tratar explicitamente os seguintes riscos:

- requisições duplicadas;
- mensagens duplicadas na fila;
- atualizações concorrentes de saldo;
- falhas parciais no banco;
- falha na publicação de mensagens;
- leituras defasadas;
- excesso de retentativas;
- acoplamento indevido entre domínio e infraestrutura;
- baixa rastreabilidade para investigar inconsistências financeiras.

## 6. Critério Geral de Aceitação

A implementação será considerada bem-sucedida quando demonstrar que o sistema permanece correto tanto em cenários normais quanto em condições realistas de falha.

Correção financeira terá prioridade sobre quantidade de funcionalidades.
