import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

import * as schema from '../src/schema';

// in-process Postgres (WASM): the real migrations + views, no server to run.
// Each test file gets its own instance, wired in via vi.mock('../src/db').
export async function createTestDb() {
    const client = new PGlite();
    const db = drizzle({ client, schema });
    await migrate(db, { migrationsFolder: new URL('../drizzle', import.meta.url).pathname });
    // exec, not execute: views.sql is several statements in one string
    await client.exec(readFileSync(new URL('../drizzle/views.sql', import.meta.url), 'utf8'));
    return db;
}
