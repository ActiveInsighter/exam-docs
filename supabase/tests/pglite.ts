import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

// Real PostgreSQL SQL/PLpgSQL execution without Docker. Only the Supabase
// platform objects the migrations reference are stubbed: auth.users,
// auth.uid(), and the realtime.messages / topic() / send() broadcast surface.
const PLATFORM_STUBS = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable security invoker
    as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth, public to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;

  create schema realtime;
  create table realtime.messages (
    id bigserial primary key,
    topic text not null,
    extension text not null,
    event text,
    payload jsonb,
    private boolean
  );
  alter table realtime.messages enable row level security;
  grant usage on schema realtime to authenticated;
  grant select on realtime.messages to authenticated;
  create function realtime.topic() returns text language sql stable
    as $$ select nullif(current_setting('realtime.topic', true), '') $$;
  grant execute on function realtime.topic() to authenticated;
  create function realtime.send(payload jsonb, event text, topic text, private boolean default true)
    returns void language sql
    as $$ insert into realtime.messages(topic, extension, event, payload, private)
      values (topic, 'broadcast', event, payload, private) $$;
`;

const migrationsDirectory = new URL('../migrations/', import.meta.url);

export function migrationNames(): string[] {
  return readdirSync(migrationsDirectory).filter((name) => name.endsWith('.sql')).sort();
}

export function readMigration(name: string): string {
  return readFileSync(new URL(name, migrationsDirectory), 'utf8');
}

/** Creates a database with platform stubs and every migration up to `count` (default: all). */
export async function createSupabaseTestDatabase(count?: number): Promise<PGlite> {
  const db = await PGlite.create();
  await db.exec(PLATFORM_STUBS);
  for (const name of migrationNames().slice(0, count)) await db.exec(readMigration(name));
  return db;
}
