import { Migration } from '@mikro-orm/migrations';

export class Migration20260903150000_add_outbox_publishing_lease extends Migration {
  override name = 'Migration20260903150000_add_outbox_publishing_lease';

  override up(): void | Promise<void> {
    this.addSql(`
      alter table "outbox_messages"
        add column "lock_id" varchar(100) null,
        add column "locked_until" timestamptz null;
    `);

    this.addSql(`
      drop index if exists "outbox_messages_pending_index";
    `);

    this.addSql(`
      create index "outbox_messages_pending_index"
      on "outbox_messages" (
        "published_at",
        "locked_until",
        "next_attempt_at",
        "occurred_at",
        "id"
      );
    `);
  }

  override down(): void | Promise<void> {
    this.addSql(`
      drop index if exists "outbox_messages_pending_index";
    `);

    this.addSql(`
      create index "outbox_messages_pending_index"
      on "outbox_messages" (
        "published_at",
        "next_attempt_at",
        "occurred_at"
      );
    `);

    this.addSql(`
      alter table "outbox_messages"
        drop column "lock_id",
        drop column "locked_until";
    `);
  }
}
