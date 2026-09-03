import 'dotenv/config';
import 'reflect-metadata';

import { Migrator } from '@mikro-orm/migrations';
import { defineConfig, MikroORM } from '@mikro-orm/postgresql';

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Environment variable ${name} is required`);
  return value;
}

const orm = await MikroORM.init(
  defineConfig({
    host: required('DATABASE_HOST'),
    port: Number(required('DATABASE_PORT')),
    dbName: required('DATABASE_NAME'),
    user: required('DATABASE_USER'),
    password: required('DATABASE_PASSWORD'),
    entities: ['./dist/**/*.orm-entity.js'],
    extensions: [Migrator],
    migrations: {
      path: './dist/migrations',
      transactional: true,
      allOrNothing: true,
    },
  }),
);

try {
  await orm.migrator.up();
} finally {
  await orm.close(true);
}
