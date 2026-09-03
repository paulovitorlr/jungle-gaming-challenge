import { Migration } from '@mikro-orm/migrations';

export class Migration20260902230046_create_outbox_messages extends Migration {

  override name = 'Migration20260902230046_create_outbox_messages';

  override up(): void | Promise<void> {
    this.addSql(`create table "outbox_messages" ("id" varchar(100) not null, "aggregate_id" varchar(100) not null, "event_type" varchar(100) not null, "payload" jsonb not null, "occurred_at" timestamptz not null, "attempts" int not null default 0, "next_attempt_at" timestamptz null, "published_at" timestamptz null, primary key ("id"));`);
    this.addSql(`create index "outbox_messages_pending_index" on "outbox_messages" ("published_at", "next_attempt_at", "occurred_at");`);

    this.addSql(`alter table "outbox_messages" add constraint "outbox_messages_attempts_non_negative_check" check (attempts >= 0);`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "outbox_messages" cascade;`);
  }

}
