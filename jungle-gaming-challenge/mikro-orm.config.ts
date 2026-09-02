import 'dotenv/config';
import 'reflect-metadata';

import 'reflect-metadata';

import { Migrator } from '@mikro-orm/migrations';
import { defineConfig } from '@mikro-orm/postgresql';

function getRequiredEnvironment(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(
      `Environment variable ${name} is required`,
    );
  }

  return value;
}

export default defineConfig({
  host: getRequiredEnvironment('DATABASE_HOST'),
  port: Number(
    getRequiredEnvironment('DATABASE_PORT'),
  ),
  dbName: getRequiredEnvironment('DATABASE_NAME'),
  user: getRequiredEnvironment('DATABASE_USER'),
  password: getRequiredEnvironment('DATABASE_PASSWORD'),

  entities: [
    './dist/**/*.orm-entity.js',
  ],
  entitiesTs: [
    './src/**/*.orm-entity.ts',
  ],

  extensions: [
    Migrator,
  ],

  migrations: {
    path: './dist/migrations',
    pathTs: './src/migrations',
    transactional: true,
    allOrNothing: true,
  },
});