import { Migration } from '@mikro-orm/migrations';

export class Migration20260902123503_create_wallet_and_ledger extends Migration {

  override name = 'Migration20260902123503_create_wallet_and_ledger';

  override up(): void | Promise<void> {
    this.addSql(`create table "wallets" ("id" varchar(100) not null, "player_id" varchar(100) not null, "currency" varchar(3) not null, "balance" numeric(20, 2) not null, "version" integer not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`create index "wallets_player_id_index" on "wallets" ("player_id");`);

    this.addSql(`create table "wallet_ledger_entries" ("id" varchar(100) not null, "wallet_id" varchar(100) not null, "transaction_id" varchar(100) not null, "direction" text not null, "amount" numeric(20, 2) not null, "currency" varchar(3) not null, "balance_before" numeric(20, 2) not null, "balance_after" numeric(20, 2) not null, "created_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`create index "wallet_ledger_entries_wallet_id_created_at_id_index" on "wallet_ledger_entries" ("wallet_id", "created_at", "id");`);
    this.addSql(`alter table "wallet_ledger_entries" add constraint "wallet_ledger_entries_wallet_id_transaction_id_unique" unique ("wallet_id", "transaction_id");`);

    this.addSql(`alter table "wallets" add constraint "wallets_version_positive_check" check (version >= 1);`);
    this.addSql(`alter table "wallets" add constraint "wallets_balance_non_negative_check" check (balance >= 0);`);

    this.addSql(`alter table "wallet_ledger_entries" add constraint "wallet_ledger_entries_wallet_id_foreign" foreign key ("wallet_id") references "wallets" ("id") on update cascade on delete restrict;`);
    this.addSql(`alter table "wallet_ledger_entries" add constraint "wallet_ledger_balanced_check" check (
    (
      (
        direction = 'CREDIT'
        AND balance_after = balance_before + amount
      )
      OR
      (
        direction = 'DEBIT'
        AND balance_after = balance_before - amount
      )
    )
  );`);
    this.addSql(`alter table "wallet_ledger_entries" add constraint "wallet_ledger_balances_non_negative_check" check (balance_before >= 0 AND balance_after >= 0);`);
    this.addSql(`alter table "wallet_ledger_entries" add constraint "wallet_ledger_amount_positive_check" check (amount > 0);`);
    this.addSql(`alter table "wallet_ledger_entries" add constraint "wallet_ledger_entries_direction_check" check ("direction" in ('DEBIT', 'CREDIT'));`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "wallet_ledger_entries" drop constraint "wallet_ledger_entries_wallet_id_foreign";`);

    this.addSql(`drop table if exists "wallets" cascade;`);
    this.addSql(`drop table if exists "wallet_ledger_entries" cascade;`);
  }

}
