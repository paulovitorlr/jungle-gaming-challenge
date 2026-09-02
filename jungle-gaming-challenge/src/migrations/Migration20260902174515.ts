import { Migration } from '@mikro-orm/migrations';

export class Migration20260902174515 extends Migration {

  override name = 'Migration20260902174515';

  override up(): void | Promise<void> {
  this.addSql(
    `alter table "wager_transactions" drop constraint "wager_transactions_idempotency_key_unique";`,
  );

  this.addSql(
    `drop index "wager_transactions_provider_id_external_transaction_id_index";`,
  );

  this.addSql(
    `alter table "wager_transactions" add constraint "uq_wager_transactions_provider_idempotency_key" unique ("provider_id", "idempotency_key");`,
  );

  this.addSql(
    `alter table "wager_transactions" drop constraint "wager_transactions_provider_id_external_transaction_id_unique";`,
  );

  this.addSql(
    `alter table "wager_transactions" add constraint "uq_wager_transactions_provider_external_transaction" unique ("provider_id", "external_transaction_id");`,
  );
}

  override down(): void | Promise<void> {
  this.addSql(
    `alter table "wager_transactions" drop constraint "uq_wager_transactions_provider_idempotency_key";`,
  );

  this.addSql(
    `alter table "wager_transactions" add constraint "wager_transactions_idempotency_key_unique" unique ("idempotency_key");`,
  );

  this.addSql(
    `alter table "wager_transactions" drop constraint "uq_wager_transactions_provider_external_transaction";`,
  );

  this.addSql(
    `alter table "wager_transactions" add constraint "wager_transactions_provider_id_external_transaction_id_unique" unique ("provider_id", "external_transaction_id");`,
  );

  this.addSql(
    `create index "wager_transactions_provider_id_external_transaction_id_index" on "wager_transactions" ("provider_id", "external_transaction_id");`,
  );
}

}
