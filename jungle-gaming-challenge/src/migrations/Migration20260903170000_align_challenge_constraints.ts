import { Migration } from '@mikro-orm/migrations';

export class Migration20260903170000_align_challenge_constraints extends Migration {
  override name = 'Migration20260903170000_align_challenge_constraints';

  override up(): void | Promise<void> {
    this.addSql(`
      alter table "wallets"
      add constraint "uq_wallets_player_currency"
      unique ("player_id", "currency");
    `);

    this.addSql(`
      alter table "wager_transactions"
        add column "resulting_balance" numeric(20, 2) null,
        add column "resulting_balance_currency" varchar(3) null,
        add column "reference_attempts" integer not null default 0,
        add column "next_reference_attempt_at" timestamptz null,
        add column "reference_lock_id" varchar(100) null,
        add column "reference_locked_until" timestamptz null;
    `);

    this.addSql(`
      update "wager_transactions" as wager
      set
        "resulting_balance" = coalesce(
          (
            select ledger."balance_after"
            from "wallet_ledger_entries" as ledger
            where ledger."wallet_id" = wager."wallet_id"
              and ledger."transaction_id" = wager."id"
            limit 1
          ),
          (
            select wallet."balance"
            from "wallets" as wallet
            where wallet."id" = wager."wallet_id"
          )
        ),
        "resulting_balance_currency" = (
          select wallet."currency"
          from "wallets" as wallet
          where wallet."id" = wager."wallet_id"
        )
      where wager."status" in ('PROCESSED', 'REJECTED', 'PENDING_REFERENCE');
    `);

    this.addSql(`
      alter table "wager_transactions"
      add constraint "wager_resulting_balance_pair_check"
      check (
        ("resulting_balance" is null and "resulting_balance_currency" is null)
        or
        ("resulting_balance" is not null and "resulting_balance_currency" is not null)
      );
    `);

    this.addSql(`
      alter table "wallets"
      add constraint "wallets_currency_format_check"
      check ("currency" ~ '^[A-Z]{3}$');
    `);

    this.addSql(`
      alter table "wager_transactions"
      add constraint "wager_currency_and_result_check"
      check (
        "currency" ~ '^[A-Z]{3}$'
        and ("resulting_balance" is null or "resulting_balance" >= 0)
        and (
          "resulting_balance_currency" is null
          or "resulting_balance_currency" = "currency"
        )
      );
    `);

    this.addSql(`
      alter table "wager_transactions"
      add constraint "wager_reference_transaction_foreign"
      foreign key ("reference_transaction_id")
      references "wager_transactions" ("id")
      on update cascade
      on delete restrict;
    `);

    this.addSql(`
      alter table "wager_transactions"
      add constraint "wager_transactions_kind_check"
      check ("kind" in ('OPENING', 'BET', 'WIN', 'LOSS', 'REFUND', 'ROLLBACK'));
    `);

    this.addSql(`
      alter table "wager_transactions"
      add constraint "wager_transactions_status_check"
      check ("status" in ('PENDING', 'PENDING_REFERENCE', 'PROCESSED', 'REJECTED', 'FAILED'));
    `);

    this.addSql(`
      create unique index "uq_wager_processed_reversal"
      on "wager_transactions" ("reference_transaction_id", "kind")
      where "reference_transaction_id" is not null
        and "kind" in ('REFUND', 'ROLLBACK')
        and "status" = 'PROCESSED';
    `);

    this.addSql(`
      create index "wager_pending_reference_due_index"
      on "wager_transactions" (
        "status", "next_reference_attempt_at", "reference_locked_until", "created_at", "id"
      );
    `);

    this.addSql(`
      alter table "wager_transactions"
      add constraint "wager_reference_attempts_non_negative_check"
      check ("reference_attempts" >= 0);
    `);

    this.addSql(`
      create function prevent_wallet_ledger_mutation()
      returns trigger
      language plpgsql
      as $$
      begin
        raise exception 'wallet ledger entries are immutable';
      end;
      $$;
    `);

    this.addSql(`
      create trigger wallet_ledger_entries_immutable
      before update or delete on "wallet_ledger_entries"
      for each row execute function prevent_wallet_ledger_mutation();
    `);
  }

  override down(): void | Promise<void> {
    this.addSql(
      `drop trigger if exists wallet_ledger_entries_immutable on "wallet_ledger_entries";`,
    );
    this.addSql(`drop function if exists prevent_wallet_ledger_mutation();`);
    this.addSql(
      `alter table "wager_transactions" drop constraint if exists "wager_transactions_status_check";`,
    );
    this.addSql(
      `alter table "wager_transactions" drop constraint if exists "wager_resulting_balance_pair_check";`,
    );
    this.addSql(
      `alter table "wager_transactions" drop constraint if exists "wager_reference_transaction_foreign";`,
    );
    this.addSql(
      `alter table "wager_transactions" drop constraint if exists "wager_currency_and_result_check";`,
    );
    this.addSql(
      `alter table "wallets" drop constraint if exists "wallets_currency_format_check";`,
    );
    this.addSql(`drop index if exists "uq_wager_processed_reversal";`);
    this.addSql(`drop index if exists "wager_pending_reference_due_index";`);
    this.addSql(
      `alter table "wager_transactions" drop constraint if exists "wager_reference_attempts_non_negative_check";`,
    );
    this.addSql(
      `alter table "wager_transactions" drop column if exists "reference_locked_until";`,
    );
    this.addSql(
      `alter table "wager_transactions" drop column if exists "reference_lock_id";`,
    );
    this.addSql(
      `alter table "wager_transactions" drop column if exists "next_reference_attempt_at";`,
    );
    this.addSql(
      `alter table "wager_transactions" drop column if exists "reference_attempts";`,
    );
    this.addSql(
      `alter table "wager_transactions" drop constraint if exists "wager_transactions_kind_check";`,
    );
    this.addSql(
      `alter table "wager_transactions" drop column if exists "resulting_balance_currency";`,
    );
    this.addSql(
      `alter table "wager_transactions" drop column if exists "resulting_balance";`,
    );
    this.addSql(
      `alter table "wallets" drop constraint if exists "uq_wallets_player_currency";`,
    );
  }
}
