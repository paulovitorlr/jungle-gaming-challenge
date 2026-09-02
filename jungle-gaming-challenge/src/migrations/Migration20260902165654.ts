import { Migration } from '@mikro-orm/migrations';

export class Migration20260902165654 extends Migration {
  override name = 'Migration20260902165654';

  override up(): void | Promise<void> {
    this.addSql(`
      create table "wager_transactions" (
        "id" varchar(100) not null,
        "provider_id" varchar(100) not null,
        "external_transaction_id" varchar(100) not null,
        "idempotency_key" varchar(200) not null,
        "payload_hash" varchar(128) not null,
        "wallet_id" varchar(100) not null,
        "player_id" varchar(100) not null,
        "round_id" varchar(100) not null,
        "game_id" varchar(100) not null,
        "kind" varchar(30) not null,
        "amount" numeric(20, 2) not null,
        "currency" varchar(3) not null,
        "reference_external_transaction_id" varchar(100) null,
        "reference_transaction_id" varchar(100) null,
        "status" varchar(30) not null,
        "failure_code" varchar(100) null,
        "created_at" timestamptz not null,
        "processed_at" timestamptz null,
        primary key ("id")
      );
    `);

    this.addSql(`
      alter table "wager_transactions"
      add constraint "wager_transactions_idempotency_key_unique"
      unique ("idempotency_key");
    `);

    this.addSql(`
      create index "wager_transactions_provider_id_external_transaction_id_index"
      on "wager_transactions" (
        "provider_id",
        "external_transaction_id"
      );
    `);

    this.addSql(`
      create index "wager_transactions_wallet_id_index"
      on "wager_transactions" ("wallet_id");
    `);

    this.addSql(`
      alter table "wager_transactions"
      add constraint "wager_transactions_provider_id_external_transaction_id_unique"
      unique (
        "provider_id",
        "external_transaction_id"
      );
    `);

    this.addSql(`
      alter table "wager_transactions"
      add constraint "wager_transactions_wallet_id_foreign"
      foreign key ("wallet_id")
      references "wallets" ("id")
      on update cascade
      on delete restrict;
    `);

    this.addSql(`
      alter table "wager_transactions"
      add constraint "wager_transactions_amount_positive_check"
      check ("amount" > 0);
    `);
  }

  override down(): void | Promise<void> {
    this.addSql(`
      drop table if exists "wager_transactions" cascade;
    `);
  }
}