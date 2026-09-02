import { Migration } from '@mikro-orm/migrations';

export class Migration20260902201709_create_inbox_messages extends Migration {
  override name =
    'Migration20260902201709_create_inbox_messages';

  override up(): void | Promise<void> {
    this.addSql(`
      create table "inbox_messages" (
        "consumer_name" varchar(100) not null,
        "message_id" varchar(100) not null,
        "payload_hash" varchar(128) not null,
        "received_at" timestamptz not null,
        "processed_at" timestamptz null,
        primary key (
          "consumer_name",
          "message_id"
        )
      );
    `);
  }

  override down(): void | Promise<void> {
    this.addSql(`
      drop table if exists "inbox_messages";
    `);
  }
}